const asyncErrorWrapper = require("express-async-handler");
const mongoose = require("mongoose");
const PotentialCustomerPackage = require("../../models/PotentialCustomerPackage");

function toOid(v) {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

exports.list = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  const rows = await PotentialCustomerPackage.find({ companyId: cid })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: rows });
});

exports.create = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  const uid = toOid(req.user.id);
  const { sourceCatalogId, catalogSnapshot, displayName = "", managerNotes = "" } =
    req.body || {};

  if (!sourceCatalogId || typeof sourceCatalogId !== "string") {
    return res.status(400).json({ success: false, message: "sourceCatalogId gerekli" });
  }
  if (!catalogSnapshot || typeof catalogSnapshot !== "object") {
    return res
      .status(400)
      .json({ success: false, message: "catalogSnapshot (nesne) gerekli" });
  }

  const doc = await PotentialCustomerPackage.create({
    companyId: cid,
    createdBy: uid,
    sourceCatalogId: sourceCatalogId.trim(),
    catalogSnapshot,
    displayName: String(displayName || "").trim(),
    managerNotes: String(managerNotes || "").trim(),
    isActive: true,
  });

  res.status(201).json({ success: true, data: doc });
});

exports.getOne = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  const id = toOid(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Geçersiz id" });

  const row = await PotentialCustomerPackage.findOne({ _id: id, companyId: cid }).lean();
  if (!row) return res.status(404).json({ success: false, message: "Bulunamadı" });

  res.json({ success: true, data: row });
});

exports.update = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  const id = toOid(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Geçersiz id" });

  const body = req.body || {};
  const patch = {};

  if (typeof body.displayName === "string") patch.displayName = body.displayName.trim();
  if (typeof body.managerNotes === "string") patch.managerNotes = body.managerNotes.trim();
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  /** İçerik güncelleme: katalog anlık görüntüsü */
  if (body.catalogSnapshot && typeof body.catalogSnapshot === "object") {
    patch.catalogSnapshot = body.catalogSnapshot;
  }

  const row = await PotentialCustomerPackage.findOneAndUpdate(
    { _id: id, companyId: cid },
    { $set: patch },
    { new: true, runValidators: true }
  );

  if (!row) return res.status(404).json({ success: false, message: "Bulunamadı" });

  res.json({ success: true, data: row });
});

exports.remove = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  const id = toOid(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: "Geçersiz id" });

  const deleted = await PotentialCustomerPackage.findOneAndDelete({
    _id: id,
    companyId: cid,
  });

  if (!deleted) return res.status(404).json({ success: false, message: "Bulunamadı" });

  res.json({ success: true, data: { id: String(id) } });
});
