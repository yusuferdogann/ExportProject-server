/**
 * /api/pg/mail-templates — Prisma/PostgreSQL MailTemplate controller.
 *
 * Mongo karsiligi: server/controllers/MailTemplateController.js
 * - GET    /          companyId scoped, order ASC, createdAt ASC
 * - POST   /          yeni sablon (otomatik order = max+1)
 * - PUT    /:id       sablon guncelle
 * - DELETE /:id       sablon sil
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function shape(t) {
  if (!t) return t;
  return {
    _id: t.id,
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    order: t.order,
    companyId: t.companyId,
    createdBy: t.createdById,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** GET /api/pg/mail-templates */
const list = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi eksik" });
  }

  const data = await prisma.mailTemplate.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  res.json({ success: true, data: data.map(shape) });
});

/** POST /api/pg/mail-templates */
const create = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi eksik" });
  }

  const { name, subject = "", body = "" } = req.body || {};
  if (!name || !String(name).trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Sablon adi gerekli" });
  }

  const maxRow = await prisma.mailTemplate.findFirst({
    where: { companyId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (maxRow?.order ?? -1) + 1;

  const created = await prisma.mailTemplate.create({
    data: {
      companyId,
      createdById: userId || null,
      name: String(name).trim(),
      subject: String(subject),
      body: String(body),
      order,
    },
  });

  res.status(201).json({ success: true, data: shape(created) });
});

/** PUT /api/pg/mail-templates/:id */
const update = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!companyId || !id) {
    return res.status(400).json({ success: false, message: "Gecersiz istek" });
  }

  const doc = await prisma.mailTemplate.findFirst({
    where: { id, companyId },
  });
  if (!doc) {
    return res
      .status(404)
      .json({ success: false, message: "Sablon bulunamadi" });
  }

  const { name, subject, body, order } = req.body || {};
  const data = {};
  if (name !== undefined && String(name).trim()) data.name = String(name).trim();
  if (subject !== undefined) data.subject = String(subject);
  if (body !== undefined) data.body = String(body);
  if (order !== undefined && Number.isFinite(Number(order)))
    data.order = Number(order);

  if (!Object.keys(data).length) {
    return next(new CustomError("Guncellenecek alan yok", 400));
  }

  const updated = await prisma.mailTemplate.update({
    where: { id },
    data,
  });
  res.json({ success: true, data: shape(updated) });
});

/** DELETE /api/pg/mail-templates/:id */
const remove = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!companyId || !id) {
    return res.status(400).json({ success: false, message: "Gecersiz istek" });
  }

  const r = await prisma.mailTemplate.deleteMany({
    where: { id, companyId },
  });
  if (r.count === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Sablon bulunamadi" });
  }

  res.json({ success: true, message: "Sablon silindi" });
});

module.exports = {
  list,
  create,
  update,
  remove,
};
