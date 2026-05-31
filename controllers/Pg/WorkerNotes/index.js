/**
 * /api/pg/workernotes — Prisma/PostgreSQL WorkerNote controller.
 *
 * Mongo karsiligi: server/controllers/WorkerNote/index.js
 * - POST   /addworkernote          yeni worker note olustur
 * - GET    /                        ?tenantId= veya kullanicinin companyId'si
 * - GET    /:id                     tek note (companyId filtreli)
 * - PUT    /:id                     guncelle
 * - DELETE /:id                     sil
 *
 * NOT: Prisma'da `tenantId` companyId'yi tutuyor (FK -> companies.id).
 * Mongo'da tenantId free-form ObjectId idi; PG'de UUID.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const VALID_STATUS = new Set(["open", "in_progress", "completed"]);

function shape(n) {
  if (!n) return n;
  return {
    _id: n.id,
    id: n.id,
    title: n.title,
    description: n.description,
    status: n.status,
    read: n.read,
    tenantId: n.tenantId,
    userId: n.userId,
    customerId: n.customerId,
    createdDate: n.createdDate,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/** POST /api/pg/workernotes/addworkernote */
const createWorkerNote = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));
  if (!userId) return next(new CustomError("Kullanici bilgisi yok", 400));

  const {
    title,
    description,
    status,
    tenantId,
    customerId,
  } = req.body || {};

  if (!title || !String(title).trim()) {
    return res.status(400).json({
      success: false,
      message: "title zorunlu",
    });
  }
  const desc = description != null ? String(description) : "";

  const effectiveTenant = tenantId || companyId;
  if (effectiveTenant !== companyId) {
    return res
      .status(403)
      .json({ success: false, message: "Bu tenant'a erisim yok" });
  }

  const cleanStatus = VALID_STATUS.has(status) ? status : "open";
  const data = {
    title: String(title).trim(),
    description: desc,
    status: cleanStatus,
    tenantId: effectiveTenant,
    userId,
  };

  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId: effectiveTenant },
      select: { id: true },
    });
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Musteri bulunamadi" });
    }
    data.customerId = customer.id;
  }

  const note = await prisma.workerNote.create({ data });

  return res.status(201).json({ success: true, data: shape(note) });
});

/** GET /api/pg/workernotes */
const getWorkerNotes = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));
  if (!userId) return next(new CustomError("Kullanici bilgisi yok", 400));

  const tenantId = String(req.query.tenantId || "").trim() || companyId;
  if (tenantId !== companyId) {
    return res
      .status(403)
      .json({ success: false, message: "Bu tenant'a erisim yok" });
  }

  const notes = await prisma.workerNote.findMany({
    where: { tenantId, userId },
    orderBy: { createdDate: "desc" },
  });
  res.status(200).json({ success: true, data: notes.map(shape) });
});

/** GET /api/pg/workernotes/:id */
const getWorkerNoteById = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const userId = req.userPg?.id || req.user?.id;
  const note = await prisma.workerNote.findFirst({
    where: { id, tenantId: companyId, userId },
  });
  if (!note) {
    return res
      .status(404)
      .json({ success: false, message: "Worker note bulunamadi" });
  }
  res.status(200).json({ success: true, data: shape(note) });
});

/** PUT /api/pg/workernotes/:id */
const updateWorkerNote = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const userId = req.userPg?.id || req.user?.id;
  const target = await prisma.workerNote.findFirst({
    where: { id, tenantId: companyId, userId },
  });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Worker note bulunamadi" });
  }

  const { title, description, status, read, customerId } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (status !== undefined && VALID_STATUS.has(status)) data.status = status;
  if (read !== undefined) data.read = Boolean(read);
  if (customerId !== undefined) data.customerId = customerId;

  const note = await prisma.workerNote.update({ where: { id }, data });
  res.status(200).json({ success: true, data: shape(note) });
});

/** DELETE /api/pg/workernotes/:id */
const deleteWorkerNote = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const userId = req.userPg?.id || req.user?.id;
  const r = await prisma.workerNote.deleteMany({
    where: { id, tenantId: companyId, userId },
  });
  if (r.count === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Worker note bulunamadi" });
  }
  res.status(200).json({ success: true, message: "Worker note silindi" });
});

module.exports = {
  createWorkerNote,
  getWorkerNotes,
  getWorkerNoteById,
  updateWorkerNote,
  deleteWorkerNote,
};
