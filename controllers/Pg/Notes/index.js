/**
 * /api/pg/note — Prisma/PostgreSQL Note controller.
 *
 * Mongo karsiligi: server/controllers/Notes/index.js
 * - POST /addnote        customer + company scoped
 * - GET  /                ?customerId= opsiyonel, createdAt DESC
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function shape(n) {
  if (!n) return n;
  return {
    _id: n.id,
    id: n.id,
    title: n.title,
    description: n.description,
    date: n.date,
    companyId: n.companyId,
    customerId: n.customerId,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/** POST /api/pg/note/addnote */
const createNote = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;

  const { customerId, title, description, date } = req.body || {};
  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunlu" });
  }
  if (!title || !description) {
    return res
      .status(400)
      .json({ success: false, message: "title ve description zorunlu" });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: "Musteri bulunamadi" });
  }

  const note = await prisma.note.create({
    data: {
      companyId: customer.companyId,
      customerId: customer.id,
      title,
      description,
      date: date ? new Date(date) : new Date(),
    },
  });

  res.status(201).json({ success: true, data: shape(note) });
});

/** GET /api/pg/note */
const getNotes = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const customerId = String(req.query.customerId || "").trim();
  const where = { companyId };
  if (customerId) where.customerId = customerId;

  const notes = await prisma.note.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({ success: true, data: notes.map(shape) });
});

module.exports = { createNote, getNotes };
