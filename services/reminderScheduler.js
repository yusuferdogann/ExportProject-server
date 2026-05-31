const Reminder = require("../models/Reminders");
const Notification = require("../models/Notification");

function parseTime(timeStr) {
  if (!timeStr) return { hours: 0, minutes: 0 };
  const [h, m] = String(timeStr).split(":").map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function isReminderDue(reminder) {
  const now = new Date();
  const d = new Date(reminder.date);
  const { hours, minutes } = parseTime(reminder.time);
  d.setHours(hours, minutes, 0, 0);
  return now >= d;
}

async function checkAndSendReminders(io) {
  if (!io) return;
  try {
    const due = await Reminder.find({
      notificationSent: false,
      createdBy: { $exists: true, $ne: null },
    }).lean();

    for (const r of due) {
      if (!isReminderDue(r)) continue;

      const notif = await Notification.create({
        companyId: r.companyId,
        userId: r.createdBy,
        title: r.title,
        description: r.description || "",
        type: "reminder",
      });

      await Reminder.updateOne(
        { _id: r._id },
        { notificationSent: true }
      );

      const userId = r.createdBy?.toString?.() ?? r.createdBy;
      if (userId) io.to(`user_${userId}`).emit("new_notification", notif);
    }
  } catch (err) {
    console.error("[reminderScheduler]", err.message);
  }
}

function startReminderScheduler(io) {
  checkAndSendReminders(io);
  setInterval(() => checkAndSendReminders(io), 15 * 1000); // Her 15 saniyede kontrol
}

module.exports = { startReminderScheduler };
