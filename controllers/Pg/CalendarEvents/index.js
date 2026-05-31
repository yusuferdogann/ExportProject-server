/**
 * /api/pg/calendar — Prisma/PostgreSQL CalendarEvent controller.
 *
 * Mongo karsiligi: server/controllers/Calendar/index.js
 * - POST   /addevent              event olustur (assignedTo opsiyonel = self)
 * - GET    /                       admin: tum sirket | calisan: kendine atananlar
 * - GET    /assignable-users       takvimde atanabilecek kullanicilar
 * - DELETE /:id                    event sil
 *
 * NOT: Mongo'da customerId=userId yaziliyordu (legacy). PG schema'sinda
 * customerId nullable hale getirildi; bu controller customerId verilmezse
 * null birakir.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const { isCalendarCompanyAdmin } = require("../../../constants/roles");

function shape(e) {
  if (!e) return e;
  return {
    _id: e.id,
    id: e.id,
    title: e.title,
    description: e.description,
    date: e.date,
    startDate: e.startDate,
    endDate: e.endDate,
    tenantId: e.tenantId,
    customerId: e.customerId,
    assignedTo: e.assignedToId,
    assignedToName: e.assignedToName,
    creatorName: e.creatorName,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** POST /api/pg/calendar/addevent */
const createEvent = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const username = req.userPg?.username || req.user?.username || "Yonetici";

  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const {
    title,
    description,
    date,
    startDate,
    endDate,
    assignedTo,
    assignedToName,
    customerId,
  } = req.body || {};

  if (!title) {
    return res.status(400).json({ success: false, message: "title zorunlu" });
  }

  const start = startDate
    ? new Date(startDate)
    : date
      ? new Date(date)
      : new Date();
  const end = endDate ? new Date(endDate) : null;
  const targetId = assignedTo || userId;
  const targetName = assignedToName ?? "Ben";

  // assignedTo'nun bu sirkette oldugunu dogrula
  if (targetId) {
    const t = await prisma.user.findFirst({
      where: { id: targetId, companyId },
      select: { id: true },
    });
    if (!t) {
      return res
        .status(400)
        .json({ success: false, message: "Gecersiz assignedTo" });
    }
  }

  // customerId verilirse dogrula
  let validCustomerId = null;
  if (customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!c) {
      return res
        .status(400)
        .json({ success: false, message: "Gecersiz customerId" });
    }
    validCustomerId = c.id;
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      description: description || null,
      date: start,
      startDate: start,
      endDate: end,
      tenantId: companyId,
      customerId: validCustomerId,
      assignedToId: targetId || null,
      assignedToName: targetName,
      creatorName: username,
    },
  });

  res.status(201).json({ success: true, data: shape(event) });
});

/** GET /api/pg/calendar */
const getEvents = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const role = req.userPg?.role || req.user?.role;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const isAdmin = isCalendarCompanyAdmin(role);
  const where = { tenantId: companyId };
  if (!isAdmin) where.assignedToId = userId;

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { date: "asc" },
  });

  res.status(200).json({ success: true, data: events.map(shape) });
});

/** GET /api/pg/calendar/assignable-users */
const getAssignableUsers = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const currentUserId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, username: true, email: true },
  });
  const list = users
    .filter((u) => u.id !== currentUserId)
    .map((u) => ({
      _id: u.id,
      name: u.username || u.email || "Isimsiz",
      email: u.email || "",
    }));

  res.status(200).json({ success: true, data: list });
});

/** DELETE /api/pg/calendar/:id */
const deleteEvent = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const r = await prisma.calendarEvent.deleteMany({
    where: { id, tenantId: companyId },
  });
  if (r.count === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Event bulunamadi" });
  }
  res.status(200).json({ success: true, message: "Event silindi" });
});

module.exports = {
  createEvent,
  getEvents,
  deleteEvent,
  getAssignableUsers,
};
