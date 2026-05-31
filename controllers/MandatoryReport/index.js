const asyncErrorWrapper = require("express-async-handler");
const mongoose = require("mongoose");
const MandatoryReport = require("../../models/MandatoryReport");
const Report = require("../../models/Report");
const Worker = require("../../models/Worker");

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
};

// GET /api/mandatory-reports - Admin: listele
const list = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const list = await MandatoryReport.find({ companyId })
    .populate("workerId", "username email")
    .sort({ periodYear: -1, periodMonth: -1 })
    .lean();
  return res.json({ success: true, data: list });
});

// POST /api/mandatory-reports - Admin: ekle/güncelle
const createOrUpdate = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { workerIds, deadlineDate, periodType = "aylık" } = req.body;

  if (!workerIds?.length || !deadlineDate) {
    return res.status(400).json({ success: false, message: "workerIds ve deadlineDate gerekli" });
  }

  const d = new Date(deadlineDate);
  let periodMonth = d.getMonth() + 1;
  let periodYear = d.getFullYear();
  if (periodType === "günlük") periodMonth = 0;
  if (periodType === "haftalık") periodMonth = 13;

  const results = [];
  for (const wid of workerIds) {
    const woid = toObjectId(wid);
    if (!woid) continue;
    const existing = await MandatoryReport.findOne({
      companyId,
      workerId: woid,
      periodYear,
      periodMonth,
    });
    const payload = {
      companyId,
      workerId: woid,
      deadlineDate: d,
      periodMonth,
      periodYear,
      periodType,
    };
    const doc = existing
      ? await MandatoryReport.findByIdAndUpdate(existing._id, payload, { new: true })
      : await MandatoryReport.create(payload);
    results.push(doc);
  }
  return res.json({ success: true, data: results });
});

// GET /api/mandatory-reports/check - Çalışan: benim için bekleyen zorunlu rapor var mı?
const checkPending = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const uid = toObjectId(userId);
  if (!uid) {
    return res.json({ success: true, data: { hasPending: false, pending: [], daysLeft: null, deadlineDate: null } });
  }
  const cid = toObjectId(companyId);
  const now = new Date();

  // workerId veya companyId farklı olabilir (companyId bazen req.user.companyId yerine id olabilir)
  const mandatories = await MandatoryReport.find({
    $or: [
      { companyId: cid || companyId, workerId: uid },
      { workerId: uid },
    ],
  })
    .sort({ deadlineDate: 1 })
    .lean();

  const pending = [];
  const debugItems = [];
  const reportCompanyId = cid || toObjectId(companyId);
  const pt = (m) => m.periodType || "aylık";

  for (const m of mandatories) {
    let periodStart, periodEnd;
    const type = pt(m);
    if (type === "günlük") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    } else if (type === "haftalık") {
      const d = new Date(now);
      const day = d.getDay();
      const toMonday = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + toMonday);
      periodStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      const y = m.periodYear ?? now.getFullYear();
      const mn = m.periodMonth ?? now.getMonth() + 1;
      periodStart = new Date(y, mn - 1, 1);
      periodEnd = new Date(y, mn, 1);
    }

    const sent = await Report.findOne({
      companyId: reportCompanyId,
      senderId: uid,
      type: "employee",
      createdAt: { $gte: periodStart, $lt: periodEnd },
    });
    if (req.query.debug === "1") {
      debugItems.push({
        periodYear: m.periodYear,
        periodMonth: m.periodMonth,
        periodRange: [periodStart.toISOString(), periodEnd.toISOString()],
        sentFound: !!sent,
        sentReportId: sent?._id?.toString(),
        sentCreatedAt: sent?.createdAt?.toISOString?.(),
      });
    }
    if (!sent) {
      const daysLeft = Math.ceil((new Date(m.deadlineDate) - now) / (24 * 60 * 60 * 1000));
      pending.push({
        ...m,
        daysLeft,
        deadlineDate: m.deadlineDate,
      });
    }
  }

  // Fallback: zorunlu kayıt atanmamış olsa bile çalışan bu ay employee raporu
  // göndermediyse girişte hatırlatma overlay'i gösterilsin.
  if (pending.length === 0) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sentThisMonth = await Report.findOne({
      companyId: reportCompanyId,
      senderId: uid,
      type: "employee",
      createdAt: { $gte: monthStart, $lt: monthEnd },
    }).lean();

    if (!sentThisMonth) {
      // Ay sonuna kadar kalan gün
      const deadline = new Date(monthEnd.getTime() - 1);
      const daysLeft = Math.max(
        0,
        Math.ceil((deadline - now) / (24 * 60 * 60 * 1000)),
      );
      pending.push({
        _id: null,
        periodType: "aylık",
        periodYear: now.getFullYear(),
        periodMonth: now.getMonth() + 1,
        deadlineDate: deadline,
        daysLeft,
        _fallback: true,
      });
    }
  }

  const hasPending = pending.length > 0;
  const nearest = pending[0];

  const data = {
    hasPending,
    pending,
    daysLeft: nearest?.daysLeft ?? null,
    deadlineDate: nearest?.deadlineDate ?? null,
  };
  if (req.query.debug === "1") {
    data._debug = {
      userId: String(userId),
      uid: uid?.toString(),
      companyId: String(companyId),
      cid: cid?.toString(),
      mandatoriesFound: mandatories.length,
      mandateWorkerIds: mandatories.map((m) => m.workerId?.toString()),
      perPeriod: debugItems,
    };
  }
  return res.json({ success: true, data });
});

// DELETE /api/mandatory-reports/:id
const remove = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  await MandatoryReport.findOneAndDelete({ _id: req.params.id, companyId });
  return res.json({ success: true });
});

// GET /api/mandatory-reports/workers - Admin: company workers list
// ÖNEMLİ: workerId olarak User._id kullanılmalı (Worker.userId)
const getWorkers = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const workers = await Worker.find({ companyId })
    .populate("userId", "username email _id")
    .lean();
  return res.json({
    success: true,
    data: workers.filter((w) => w.userId).map((w) => ({
      _id: w.userId._id.toString(),
      name: w.userId?.username ?? w.name,
      email: w.userId?.email ?? w.email,
    })),
  });
});

module.exports = { list, createOrUpdate, checkPending, remove, getWorkers };
