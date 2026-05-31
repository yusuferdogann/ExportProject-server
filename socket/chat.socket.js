const Message = require("../models/Message");
const Notification = require("../models/Notification");
const User = require("../models/User");

module.exports = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user?.id;
    const companyId = socket.tenantId;

    if (!userId || !companyId) return;

    socket.join(`user_${userId}`);
    if (socket.user.pgId) {
      socket.join(`pg_user_${socket.user.pgId}`);
    }
    socket.join(`company_${companyId}`);
    console.log("🟢 Socket connected:", socket.user, "Tenant:", companyId, "SocketID:", socket.id);

    socket.on("join_room", (roomId) => {
      socket.join(`${companyId}_${roomId}`);
    });

    socket.on("send_message", async ({ receiverId, content, label }) => {
      try {
        const message = await Message.create({
          companyId,
          senderId: userId,
          receiverId,
          content,
          ...(label && { label })
        });

        const populated = await Message.findById(message._id)
          .populate("senderId", "username")
          .populate("receiverId", "username")
          .lean();

        io.to(`user_${receiverId}`).emit("receive_message", populated);
        socket.emit("message_sent", populated);

        const sender = await User.findById(userId).select("username").lean();
        const notification = await Notification.create({
          companyId,
          userId: receiverId,
          title: "Yeni Mesaj",
          description: `${sender?.username || "Bir kullanıcı"} size mesaj gönderdi: ${content.slice(0, 50)}${content.length > 50 ? "..." : ""}`,
          type: "message"
        });

        io.to(`user_${receiverId}`).emit("new_notification", notification);
      } catch (err) {
        console.error("❌ send_message hatası:", err.message);
        socket.emit("message_error", { message: err.message });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 Socket disconnected:", socket.id, "Reason:", reason);
    });
  });
};
