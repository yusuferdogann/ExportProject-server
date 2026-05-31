const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const MailTemplate = require("../models/MailTemplate");

const toOid = (v) => {
  if (!v) return v;
  if (v instanceof mongoose.Types.ObjectId) return v;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return v;
  }
};

exports.list = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  if (!companyId) {
    return res.status(400).json({ success: false, message: "Şirket bilgisi eksik" });
  }
  const cid = toOid(companyId);
  const data = await MailTemplate.find({ companyId: cid }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ success: true, data });
});

exports.update = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name, subject, body, order } = req.body;
  if (!companyId || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, message: "Geçersiz istek" });
  }
  const cid = toOid(companyId);
  const doc = await MailTemplate.findOne({ _id: id, companyId: cid });
  if (!doc) {
    return res.status(404).json({ success: false, message: "Şablon bulunamadı" });
  }
  if (name !== undefined) doc.name = String(name).trim() || doc.name;
  if (subject !== undefined) doc.subject = String(subject);
  if (body !== undefined) doc.body = String(body);
  if (order !== undefined && Number.isFinite(Number(order))) doc.order = Number(order);
  await doc.save();
  res.json({ success: true, data: doc.toObject() });
});

exports.create = asyncHandler(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { name, subject = "", body = "" } = req.body;
  if (!companyId) {
    return res.status(400).json({ success: false, message: "Şirket bilgisi eksik" });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: "Şablon adı gerekli" });
  }
  const cid = toOid(companyId);
  const maxOrder = await MailTemplate.findOne({ companyId: cid }).sort({ order: -1 }).select("order").lean();
  const order = (maxOrder?.order ?? -1) + 1;
  const created = await MailTemplate.create({
    companyId: cid,
    name: String(name).trim(),
    subject: String(subject),
    body: String(body),
    order,
    createdBy: userId ? toOid(userId) : undefined,
  });
  res.status(201).json({ success: true, data: created.toObject() });
});

exports.remove = asyncHandler(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;
  if (!companyId || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, message: "Geçersiz istek" });
  }
  const cid = toOid(companyId);
  const r = await MailTemplate.deleteOne({ _id: id, companyId: cid });
  if (r.deletedCount === 0) {
    return res.status(404).json({ success: false, message: "Şablon bulunamadı" });
  }
  res.json({ success: true, message: "Şablon silindi" });
});
