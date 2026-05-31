/**
 * /api/pg/messages — Prisma/PostgreSQL Message controller.
 *
 * Mongo karsiligi: server/controllers/MessageController.js
 * - GET    /inbox                      gelen kutusu
 * - GET    /sent                       gonderilenler
 * - POST   /                           mesaj gonder
 * - PATCH  /:id/read                   okundu yap
 * - DELETE /:id                        mesaj sil (sender veya receiver)
 * - GET    /conversation/:userId       iki kullanici arasi sohbet
 *
 * NOT: PG'de senderId/receiverId User FK (UUID). Worker hack'i (receiverId Worker._id olabilirdi)
 * kaldirildi cunku ilgili UI muhtemelen worker.userId uzerinden mesaj gonderiyor.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const userPick = { id: true, username: true, email: true };

function shape(m) {
  if (!m) return m;
  return {
    _id: m.id,
    id: m.id,
    content: m.content,
    isRead: m.isRead,
    label: m.label,
    companyId: m.companyId,
    senderId: m.sender
      ? { _id: m.sender.id, id: m.sender.id, username: m.sender.username, email: m.sender.email }
      : m.senderId,
    receiverId: m.receiver
      ? { _id: m.receiver.id, id: m.receiver.id, username: m.receiver.username, email: m.receiver.email }
      : m.receiverId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/** GET /api/pg/messages/inbox */
const getInbox = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!userId || !companyId) return res.json({ success: true, data: [] });

  const messages = await prisma.message.findMany({
    where: { companyId, receiverId: userId },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  res.json({ success: true, data: messages.map(shape) });
});

/** GET /api/pg/messages/sent */
const getSent = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!userId || !companyId) return res.json({ success: true, data: [] });

  const messages = await prisma.message.findMany({
    where: { companyId, senderId: userId },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  res.json({ success: true, data: messages.map(shape) });
});

/** POST /api/pg/messages */
const sendMessage = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { receiverId, content, label } = req.body || {};

  if (!userId || !companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Oturum bilgisi eksik" });
  }
  if (!receiverId || !content) {
    return res
      .status(400)
      .json({ success: false, message: "Alici ve mesaj icerigi zorunludur" });
  }

  const receiverIdStr =
    typeof receiverId === "object" && receiverId?.$oid
      ? receiverId.$oid
      : String(receiverId);

  const receiver = await prisma.user.findFirst({
    where: { id: receiverIdStr, companyId },
    select: { id: true },
  });
  if (!receiver) {
    return res
      .status(400)
      .json({ success: false, message: "Gecersiz alici" });
  }

  const created = await prisma.message.create({
    data: {
      companyId,
      senderId: userId,
      receiverId: receiverIdStr,
      content: String(content).trim(),
      ...(label && { label: String(label) }),
    },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  res.status(201).json({ success: true, data: shape(created) });
});

/** PATCH /api/pg/messages/:id/read */
const markAsRead = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.message.findFirst({
    where: { id, companyId, receiverId: userId },
  });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Mesaj bulunamadi" });
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { isRead: true },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  res.json({ success: true, data: shape(updated) });
});

/** GET /api/pg/messages/conversation/:userId */
const getConversation = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const otherUserId = String(req.params.userId || "").trim();
  if (!userId || !companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Oturum bilgisi eksik" });
  }
  if (!otherUserId) {
    return res
      .status(400)
      .json({ success: false, message: "Karsi taraf userId zorunlu" });
  }

  const messages = await prisma.message.findMany({
    where: {
      companyId,
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  await prisma.message.updateMany({
    where: { companyId, receiverId: userId, senderId: otherUserId, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true, data: messages.map(shape) });
});

/** DELETE /api/pg/messages/:id */
const deleteMessage = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!userId || !companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Oturum bilgisi eksik" });
  }
  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Gecersiz mesaj kimligi" });
  }

  const msg = await prisma.message.findFirst({
    where: { id, companyId },
  });
  if (!msg) {
    return res
      .status(404)
      .json({ success: false, message: "Mesaj bulunamadi" });
  }

  const isSender = msg.senderId === userId;
  const isReceiver = msg.receiverId === userId;
  if (!isSender && !isReceiver) {
    return res
      .status(403)
      .json({ success: false, message: "Bu mesaji silme yetkiniz yok" });
  }

  await prisma.message.delete({ where: { id } });
  res.json({ success: true, message: "Mesaj silindi" });
});

module.exports = {
  getInbox,
  getSent,
  sendMessage,
  markAsRead,
  deleteMessage,
  getConversation,
};
