/**
 * /api/pg/notifications — Prisma/PostgreSQL Notification controller.
 *
 * Mongo karsiligi: server/controllers/NotificationController.js
 * - GET   /                       son 100 bildirim (kullanici + sirket)
 * - PATCH /:id/read               tek bildirimi okundu yap
 * - PATCH /read-all               tum bildirimleri okundu yap
 *
 * Ek API'ler (mongo'da yoktu, internal kullanim icin opsiyonel):
 * - POST  /                       yeni bildirim olustur (admin/sistem)
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
    isRead: n.isRead,
    type: n.type,
    userId: n.userId,
    companyId: n.companyId,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/** GET /api/pg/notifications */
const getList = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!userId || !companyId) {
    return next(new CustomError("Kimlik bilgisi eksik", 400));
  }

  const items = await prisma.notification.findMany({
    where: { companyId, userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json({ success: true, data: items.map(shape) });
});

/** PATCH /api/pg/notifications/:id/read */
const markAsRead = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.notification.findFirst({
    where: { id, companyId, userId },
  });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Bildirim bulunamadi" });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({ success: true, data: shape(updated) });
});

/** PATCH /api/pg/notifications/read-all */
const markAllAsRead = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!userId || !companyId) {
    return next(new CustomError("Kimlik bilgisi eksik", 400));
  }

  const r = await prisma.notification.updateMany({
    where: { companyId, userId, isRead: false },
    data: { isRead: true },
  });

  res.json({
    success: true,
    message: "Tum bildirimler okundu olarak isaretlendi",
    updatedCount: r.count,
  });
});

/** POST /api/pg/notifications (admin/sistem) */
const createNotification = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const callerRole = req.userPg?.role || req.user?.role;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  if (
    !["owner", "general_manager", "administrator"].includes(callerRole)
  ) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }

  const { title, description, userId, type } = req.body || {};
  if (!title || !description || !userId) {
    return next(new CustomError("title/description/userId zorunlu", 400));
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  });
  if (!target) {
    return next(new CustomError("Hedef kullanici bu sirkette yok", 404));
  }

  const created = await prisma.notification.create({
    data: {
      companyId,
      userId,
      title: String(title),
      description: String(description),
      type: type || "info",
    },
  });

  res.status(201).json({ success: true, data: shape(created) });
});

module.exports = {
  getList,
  markAsRead,
  markAllAsRead,
  createNotification,
};
