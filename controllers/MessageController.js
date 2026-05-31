const asyncErrorWrapper = require("express-async-handler");
const mongoose = require("mongoose");
const Message = require("../models/Message");
const Worker = require("../models/Worker");
const User = require("../models/User");

const toOid = (v) => {
  if (!v) return v;
  if (v instanceof mongoose.Types.ObjectId) return v;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return v;
  }
};

const getInbox = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;

  if (!userId || !companyId) {
    return res.json({ success: true, data: [] });
  }

  const cid = toOid(companyId);
  const uid = toOid(userId);

  let messages = await Message.find({
    companyId: cid,
    receiverId: uid
  })
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .sort({ createdAt: -1 })
    .lean();

  if (messages.length === 0) {
    const workers = await Worker.find({ companyId: cid, userId: uid }).select("_id").lean();
    const workerIds = workers.map((w) => w._id);
    if (workerIds.length > 0) {
      messages = await Message.find({
        companyId: cid,
        receiverId: { $in: workerIds }
      })
        .populate("senderId", "username email")
        .populate("receiverId", "username email")
        .sort({ createdAt: -1 })
        .lean();
    }
  }

  res.json({ success: true, data: messages });
});

const getSent = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  if (!userId || !companyId) {
    return res.json({ success: true, data: [] });
  }

  const messages = await Message.find({
    companyId: toOid(companyId),
    senderId: toOid(userId)
  })
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: messages });
});

const sendMessage = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { receiverId, content, label } = req.body;

  if (!userId || !companyId) {
    return res.status(400).json({
      success: false,
      message: "Oturum bilgisi eksik"
    });
  }

  if (!receiverId || !content) {
    return res.status(400).json({
      success: false,
      message: "Alıcı ve mesaj içeriği zorunludur"
    });
  }

  const receiverIdStr = typeof receiverId === "object" && receiverId?.$oid ? receiverId.$oid : String(receiverId);

  console.log("[sendMessage] ÇAĞRILDI - Gönderen:", String(userId), "Alıcı:", receiverIdStr, "companyId:", String(companyId));

  try {
    const message = await Message.create({
      companyId,
      senderId: userId,
      receiverId: receiverIdStr,
      content: content.trim(),
      ...(label && { label })
    });

    const populated = await Message.findById(message._id)
      .populate("senderId", "username email")
      .populate("receiverId", "username email")
      .lean();

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("sendMessage error:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message || "Geçersiz veri" });
    }
    if (err.name === "CastError" || (err.message && err.message.includes("Cast to ObjectId"))) {
      return res.status(400).json({ success: false, message: "Geçersiz alıcı" });
    }
    return res.status(500).json({ success: false, message: err.message || "Mesaj kaydedilemedi" });
  }
});

const markAsRead = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { id } = req.params;

  const message = await Message.findOneAndUpdate(
    { _id: id, companyId, receiverId: userId },
    { isRead: true },
    { new: true }
  )
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .lean();

  if (!message) {
    return res.status(404).json({ success: false, message: "Mesaj bulunamadı" });
  }

  res.json({ success: true, data: message });
});

const getConversation = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { userId: otherUserId } = req.params;

  const messages = await Message.find({
    companyId,
    $or: [
      { senderId: userId, receiverId: otherUserId },
      { senderId: otherUserId, receiverId: userId }
    ]
  })
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .sort({ createdAt: 1 })
    .lean();

  await Message.updateMany(
    { companyId, receiverId: userId, senderId: otherUserId, isRead: false },
    { isRead: true }
  );

  res.json({ success: true, data: messages });
});

const deleteMessage = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { id } = req.params;

  if (!userId || !companyId) {
    return res.status(400).json({ success: false, message: "Oturum bilgisi eksik" });
  }

  if (!id || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, message: "Geçersiz mesaj kimliği" });
  }

  const cid = toOid(companyId);
  const uid = toOid(userId);
  const mid = toOid(id);

  // findOne({ companyId }) bazen ObjectId/string uyumsuzluğunda boş döner; önce kaydı bul, şirketi string ile doğrula.
  const msg = await Message.findById(mid).lean();
  if (!msg) {
    return res.status(404).json({ success: false, message: "Mesaj bulunamadı" });
  }
  if (String(msg.companyId) !== String(cid)) {
    return res.status(404).json({ success: false, message: "Mesaj bulunamadı" });
  }

  const isSender = String(msg.senderId) === String(uid);
  let isReceiver = String(msg.receiverId) === String(uid);

  if (!isReceiver && !isSender) {
    const workers = await Worker.find({ companyId: cid, userId: uid }).select("_id").lean();
    isReceiver = workers.some((w) => String(msg.receiverId) === String(w._id));
  }

  if (!isSender && !isReceiver) {
    return res.status(403).json({ success: false, message: "Bu mesajı silme yetkiniz yok" });
  }

  await Message.deleteOne({ _id: mid });
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
