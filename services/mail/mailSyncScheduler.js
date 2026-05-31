/**
 * Gmail watch yenileme + (Pub/Sub yoksa) arka planda gelen kutusu kontrolu.
 * Yeni posta bulundugunda yalnizca socket bildirimi gonderilir — UI periyodik refresh yapmaz.
 */

const { getPrisma } = require("../../db/prisma");
const mailConfig = require("../../config/enterpriseMail");
const { runIncrementalSync } = require("./sync");
const { notifyEnterpriseMailUpdated } = require("./mailNotifications");
const { ensureGmailWatch } = require("./webhooks/gmailWatch");

const SCHEDULER_INTERVAL_MS = Number(
  process.env.ENTERPRISE_MAIL_SYNC_INTERVAL_MS || 60_000
);
const WATCH_RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_MIN_SYNC_GAP_MS = 45_000;

let schedulerTimer = null;
let tickRunning = false;
let lastWatchRenewAt = 0;

async function renewGmailWatches() {
  if (!mailConfig.gmail.pubsubTopic) return;
  if (Date.now() - lastWatchRenewAt < WATCH_RENEW_INTERVAL_MS) return;

  const prisma = getPrisma();
  const accounts = await prisma.mailAccount.findMany({
    where: { provider: "gmail", status: "active" },
  });

  for (const account of accounts) {
    try {
      await ensureGmailWatch(account);
    } catch (err) {
      console.warn("[mail-watch-renew]", account.emailAddress, err.message);
    }
  }
  lastWatchRenewAt = Date.now();
}

/** Pub/Sub yoksa (local dev): arka planda kontrol, yalnizca yeni posta varsa bildir */
async function fallbackInboxCheck() {
  if (mailConfig.gmail.pubsubTopic) return;

  const prisma = getPrisma();
  const accounts = await prisma.mailAccount.findMany({
    where: {
      provider: { in: ["gmail", "microsoft"] },
      status: "active",
    },
  });

  const now = Date.now();
  for (const account of accounts) {
    const last = account.lastSyncAt
      ? new Date(account.lastSyncAt).getTime()
      : 0;
    if (last && now - last < FALLBACK_MIN_SYNC_GAP_MS) continue;

    try {
      const result = await runIncrementalSync(account);
      if (result.newMessages > 0) {
        notifyEnterpriseMailUpdated({
          userId: account.userId,
          accountId: account.id,
          folder: "inbox",
          newMessages: result.newMessages,
          reason: "fallback_inbox_check",
        });
      }
    } catch (err) {
      console.warn("[mail-fallback-check]", account.emailAddress, err.message);
    }
  }
}

async function schedulerTick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await renewGmailWatches();
    await fallbackInboxCheck();
  } finally {
    tickRunning = false;
  }
}

function startMailSyncScheduler() {
  if (schedulerTimer || !mailConfig.workerEnabled) return;

  schedulerTimer = setInterval(() => {
    schedulerTick().catch((err) => {
      console.error("[mail-sync-scheduler] tick error", err.message);
    });
  }, SCHEDULER_INTERVAL_MS);

  schedulerTick().catch((err) => {
    console.error("[mail-sync-scheduler] initial tick error", err.message);
  });

  const mode = mailConfig.gmail.pubsubTopic
    ? "push (Pub/Sub) + watch renew"
    : "fallback inbox check (Pub/Sub yok)";
  console.info(`[mail-sync-scheduler] started — ${mode}, interval ${SCHEDULER_INTERVAL_MS}ms`);
}

function stopMailSyncScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  startMailSyncScheduler,
  stopMailSyncScheduler,
  schedulerTick,
};
