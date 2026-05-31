/**
 * Kurumsal mail guncellemelerini yalnizca yeni posta geldiginde socket ile bildirir.
 */

const { getSocketIo } = require("../../socket/ioRegistry");

function notifyEnterpriseMailUpdated({
  userId,
  accountId,
  folder = "inbox",
  newMessages = 0,
  reason = "sync",
}) {
  const io = getSocketIo();
  if (!io || !userId) return;

  io.to(`pg_user_${userId}`).emit("enterprise_mail_updated", {
    accountId,
    folder,
    newMessages,
    reason,
    at: new Date().toISOString(),
  });
}

module.exports = { notifyEnterpriseMailUpdated };
