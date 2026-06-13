/**
 * Mail sync event worker — webhook → incremental sync → send.
 */

const { getPrisma } = require("../../db/prisma");
const {
  claimNextEvent,
  completeEvent,
  failEvent,
  enqueueMailEvent,
} = require("./mailEventQueue");
const { runIncrementalSync } = require("./sync");
const { sendOutboundMessage } = require("./send");
const { notifyEnterpriseMailUpdated } = require("./mailNotifications");

function emitMailUpdate(account, result, event, folder) {
  const source = event.payload?.source || event.type;
  const shouldNotify =
    result.newMessages > 0 ||
    source === "after_send" ||
    event.payload?.reason === "oauth_connected" ||
    event.payload?.reason === "imap_connected";

  if (!shouldNotify) return;

  notifyEnterpriseMailUpdated({
    userId: account.userId,
    accountId: account.id,
    folder: folder || (source === "after_send" ? "sent" : "inbox"),
    newMessages: result.newMessages,
    reason: source,
  });
}

async function handleGmailPush(event) {
  const accountId = event.mailAccountId;
  if (!accountId) return;
  await enqueueMailEvent({
    companyId: event.companyId,
    mailAccountId: accountId,
    type: "incremental_sync",
    payload: { source: "gmail_push", parentEventId: event.id },
    idempotencyKey: `incr:gmail:${accountId}:${event.payload?.historyId || Date.now()}`,
  });
}

async function handleMicrosoftNotification(event) {
  const accountId = event.mailAccountId;
  if (!accountId) return;
  await enqueueMailEvent({
    companyId: event.companyId,
    mailAccountId: accountId,
    type: "incremental_sync",
    payload: { source: "microsoft_notification", parentEventId: event.id },
    idempotencyKey: `incr:ms:${accountId}:${Date.now()}`,
  });
}

async function handleIncrementalSync(event) {
  const prisma = getPrisma();
  const account = event.mailAccountId
    ? await prisma.mailAccount.findUnique({ where: { id: event.mailAccountId } })
    : null;
  if (!account) return;

  const canSync =
    account.status === "active" ||
    event.type === "manual_resync" ||
    event.payload?.reason === "oauth_connected" ||
    event.payload?.reason === "imap_connected";

  if (!canSync && account.status !== "pending") return;

  try {
    const result = await runIncrementalSync(account);
    if (account.provider === "ses_domain") {
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: {
          status: "active",
          lastSyncAt: new Date(),
          lastSyncError: null,
        },
      });
      return;
    }
    emitMailUpdate(account, result, event);
  } catch (err) {
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastSyncError: err.message, status: "error" },
    });
    throw err;
  }
}

async function handleSendRequest(event) {
  const prisma = getPrisma();
  const messageId = event.payload?.messageId;
  if (!messageId) return;

  const draft = await prisma.mailMessage.findUnique({
    where: { id: messageId },
    include: { mailAccount: true },
  });
  if (!draft?.mailAccount) {
    throw new Error("Gonderilecek mesaj bulunamadi");
  }

  await sendOutboundMessage(draft.mailAccount, draft);

  await enqueueMailEvent({
    companyId: event.companyId,
    mailAccountId: draft.mailAccountId,
    type: "incremental_sync",
    payload: { source: "after_send" },
    idempotencyKey: `incr:after-send:${draft.id}`,
  });
}

async function processMailEvent(event) {
  switch (event.type) {
    case "gmail_push":
      await handleGmailPush(event);
      break;
    case "microsoft_notification":
      await handleMicrosoftNotification(event);
      break;
    case "incremental_sync":
    case "manual_resync":
      await handleIncrementalSync(event);
      break;
    case "send_request":
      await handleSendRequest(event);
      break;
    default:
      console.info("[mail-worker] unhandled type", event.type);
  }
}

let workerTimer = null;

function startMailEventWorker() {
  if (workerTimer) return;

  const tick = async () => {
    try {
      const event = await claimNextEvent();
      if (!event) return;
      try {
        await processMailEvent(event);
        await completeEvent(event.id);
      } catch (err) {
        const dead = event.attempts >= 5;
        await failEvent(event.id, err, { dead });
        console.error("[mail-worker] event failed", event.id, err.message);
      }
    } catch (e) {
      console.error("[mail-worker] tick error", e.message);
    }
  };

  const ms = require("../../config/enterpriseMail").workerPollMs;
  workerTimer = setInterval(tick, ms);
  console.info(`[mail-worker] started (interval ${ms}ms, DB queue)`);
}

function stopMailEventWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = {
  processMailEvent,
  startMailEventWorker,
  stopMailEventWorker,
};
