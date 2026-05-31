const asyncErrorWrapper = require("express-async-handler");
const mongoose = require("mongoose");
const MonthlyUsageMinute = require("../../models/MonthlyUsageMinute");
const UsageLastPing = require("../../models/UsageLastPing");

function toOid(v) {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

function currentYearMonth(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeCustomerKey(raw) {
  if (!raw || raw === "_" || raw === "null") return "_";
  const oid = toOid(raw);
  return oid ? String(oid) : "_";
}

const MIN_GAP_MS = 45 * 1000;

/**
 * POST /api/usage/heartbeat — istemciden ~60 sn'de bir; dakika kullanımını güvenli birikim.
 */
exports.postHeartbeat = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const customerScopeKey = normalizeCustomerKey(req.body?.customerId);

  const cid = toOid(companyId);
  const uid = toOid(userId);
  if (!cid || !uid) {
    return res.status(400).json({ success: false, message: "Oturum bilgisi eksik" });
  }

  const now = Date.now();
  let prev = await UsageLastPing.findOne({ userId: uid }).lean();
  if (prev?.lastBeatAt && now - new Date(prev.lastBeatAt).getTime() < MIN_GAP_MS) {
    return res.json({ success: true, data: { skipped: true } });
  }

  await UsageLastPing.findOneAndUpdate(
    { userId: uid },
    { $set: { lastBeatAt: new Date(now) } },
    { upsert: true, new: true }
  );

  const yearMonth = currentYearMonth();
  await MonthlyUsageMinute.findOneAndUpdate(
    { companyId: cid, userId: uid, yearMonth, customerScopeKey },
    { $inc: { minutes: 1 } },
    { upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, data: { yearMonth, credited: true } });
});
