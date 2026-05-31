/**
 * /api/pg/reminder — Prisma/PostgreSQL Reminder controller.
 *
 * Mongo karsiligi: server/controllers/Reminder/index.js
 * - POST /addreminder         yeni hatirlatma
 * - GET  /                     ?customerId= opsiyonel, date+time ASC
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function shape(r) {
  if (!r) return r;
  return {
    _id: r.id,
    id: r.id,
    title: r.title,
    description: r.description,
    date: r.date,
    time: r.time,
    notificationSent: r.notificationSent,
    companyId: r.companyId,
    customerId: r.customerId,
    createdBy: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** POST /api/pg/reminder/addreminder */
const createReminder = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;

  const { customerId, title, description, date, time } = req.body || {};
  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunlu" });
  }
  if (!title || !time) {
    return res
      .status(400)
      .json({ success: false, message: "title ve time zorunlu" });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: "Musteri bulunamadi" });
  }

  const reminder = await prisma.reminder.create({
    data: {
      companyId,
      customerId: customer.id,
      createdById: userId || null,
      title,
      description: description || "",
      date: date ? new Date(date) : new Date(),
      time,
    },
  });

  res.status(201).json({ success: true, data: shape(reminder) });
});

/** GET /api/pg/reminder */
const getReminders = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const customerId = String(req.query.customerId || "").trim();
  const where = { companyId };
  if (customerId) where.customerId = customerId;

  const reminders = await prisma.reminder.findMany({
    where,
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });

  res.status(200).json({ success: true, data: reminders.map(shape) });
});

module.exports = {
  createReminder,
  getReminders,
};
