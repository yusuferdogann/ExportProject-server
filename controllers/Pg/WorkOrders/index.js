/**
 * /api/pg/workorders — Prisma/PostgreSQL WorkOrder controller.
 *
 * Mongo karsiligi: server/controllers/WorkOrder/index.js
 *  GET  /?type=sent|inbox       company + opsiyonel sender/receiver filter
 *  POST /                         workorder olustur
 *
 * NOT: Mongo'da Worker route altinda /work-orders ile expose ediliyordu.
 * PG'de daha temiz yapi icin ayri /api/pg/workorders altina alindi.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");

const userPick = { id: true, username: true, email: true };

function shape(o) {
  if (!o) return o;
  return {
    _id: o.id,
    id: o.id,
    title: o.title,
    content: o.content,
    status: o.status,
    companyId: o.companyId,
    senderId: o.sender
      ? { _id: o.sender.id, id: o.sender.id, username: o.sender.username, email: o.sender.email }
      : o.senderId,
    receiverId: o.receiver
      ? { _id: o.receiver.id, id: o.receiver.id, username: o.receiver.username, email: o.receiver.email }
      : o.receiverId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/** POST /api/pg/workorders */
const createWorkOrder = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { receiverId, title, content } = req.body || {};

  if (!receiverId || !title?.trim() || !content?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Alici, baslik ve icerik zorunludur",
    });
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

  const created = await prisma.workOrder.create({
    data: {
      companyId,
      senderId: userId,
      receiverId: receiverIdStr,
      title: title.trim(),
      content: content.trim(),
    },
    include: { sender: { select: userPick }, receiver: { select: userPick } },
  });

  res.status(201).json({ success: true, data: shape(created) });
});

/** GET /api/pg/workorders?type=sent|inbox */
const getWorkOrders = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { type } = req.query;

  const where = { companyId };
  if (type === "sent") where.senderId = userId;
  else if (type === "inbox") where.receiverId = userId;

  const orders = await prisma.workOrder.findMany({
    where,
    include: { sender: { select: userPick }, receiver: { select: userPick } },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: orders.map(shape) });
});

module.exports = { createWorkOrder, getWorkOrders };
