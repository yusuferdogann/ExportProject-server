const asyncErrorWrapper = require("express-async-handler");
const Notification = require("../models/Notification");

const getList = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;

  const notifications = await Notification.find({
    companyId,
    userId
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, data: notifications });
});

const markAsRead = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { id } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, companyId, userId },
    { isRead: true },
    { new: true }
  ).lean();

  if (!notification) {
    return res.status(404).json({ success: false, message: "Bildirim bulunamadı" });
  }

  res.json({ success: true, data: notification });
});

const markAllAsRead = asyncErrorWrapper(async (req, res) => {
  const { id: userId, companyId } = req.user;

  await Notification.updateMany(
    { companyId, userId, isRead: false },
    { isRead: true }
  );

  res.json({ success: true, message: "Tüm bildirimler okundu olarak işaretlendi" });
});

module.exports = {
  getList,
  markAsRead,
  markAllAsRead
};
