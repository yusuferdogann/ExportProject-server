const asyncErrorWrapper = require("express-async-handler");
const WorkOrder = require("../../models/WorkOrder");
const Worker = require("../../models/Worker");
const User = require("../../models/User");

const createWorkOrder = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { receiverId, title, content } = req.body;

  if (!receiverId || !title?.trim() || !content?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Alıcı, başlık ve içerik zorunludur",
    });
  }

  const receiverIdStr = typeof receiverId === "object" && receiverId?.$oid ? receiverId.$oid : String(receiverId);

  const workOrder = await WorkOrder.create({
    companyId,
    senderId: userId,
    receiverId: receiverIdStr,
    title: title.trim(),
    content: content.trim(),
  });

  const populated = await WorkOrder.findById(workOrder._id)
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .lean();

  res.status(201).json({ success: true, data: populated });
});

const getWorkOrders = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { type } = req.query; // "sent" | "inbox" | undefined (all for admin)

  let query = { companyId };
  if (type === "sent") {
    query.senderId = userId;
  } else if (type === "inbox") {
    query.receiverId = userId;
  }

  const orders = await WorkOrder.find(query)
    .populate("senderId", "username email")
    .populate("receiverId", "username email")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: orders });
});

module.exports = {
  createWorkOrder,
  getWorkOrders,
};
