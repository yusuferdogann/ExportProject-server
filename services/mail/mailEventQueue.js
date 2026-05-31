/**
 * Event + cache + incremental sync — kuyruk katmani.
 * SQS URL tanimli degilse PostgreSQL mail_sync_events tablosu kullanilir (polling yok:
 * webhook aninda enqueue + arka plan worker claim eder).
 */

const crypto = require("crypto");
const { getPrisma } = require("../../db/prisma");
const mailConfig = require("../../config/enterpriseMail");

function buildIdempotencyKey(parts) {
  return crypto.createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex");
}

/**
 * @param {object} opts
 * @param {string} opts.companyId
 * @param {string} [opts.mailAccountId]
 * @param {import('@prisma/client').MailSyncEventType} opts.type
 * @param {object} opts.payload
 * @param {string} [opts.idempotencyKey]
 */
async function enqueueMailEvent(opts) {
  const prisma = getPrisma();
  const {
    companyId,
    mailAccountId,
    type,
    payload = {},
    idempotencyKey,
  } = opts;

  const key =
    idempotencyKey ||
    buildIdempotencyKey([
      companyId,
      mailAccountId,
      type,
      JSON.stringify(payload),
      String(Date.now()),
    ]);

  try {
    const row = await prisma.mailSyncEvent.create({
      data: {
        companyId,
        mailAccountId: mailAccountId || null,
        type,
        status: "pending",
        idempotencyKey: key,
        payload,
      },
    });
    return row;
  } catch (e) {
    if (e.code === "P2002") {
      return prisma.mailSyncEvent.findUnique({ where: { idempotencyKey: key } });
    }
    throw e;
  }
}

/** Worker: tek pending event claim et (FOR UPDATE SKIP LOCKED benzeri) */
async function claimNextEvent() {
  const prisma = getPrisma();
  const row = await prisma.mailSyncEvent.findFirst({
    where: {
      status: "pending",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!row) return null;

  const updated = await prisma.mailSyncEvent.updateMany({
    where: { id: row.id, status: "pending" },
    data: { status: "processing", attempts: { increment: 1 } },
  });
  if (updated.count === 0) return null;

  return prisma.mailSyncEvent.findUnique({ where: { id: row.id } });
}

async function completeEvent(id) {
  const prisma = getPrisma();
  return prisma.mailSyncEvent.update({
    where: { id },
    data: { status: "done", processedAt: new Date(), lastError: null },
  });
}

async function failEvent(id, error, { dead = false } = {}) {
  const prisma = getPrisma();
  const msg = error?.message || String(error);
  return prisma.mailSyncEvent.update({
    where: { id },
    data: {
      status: dead ? "dead" : "pending",
      lastError: msg,
      scheduledAt: dead ? undefined : new Date(Date.now() + 30_000),
      processedAt: dead ? new Date() : null,
    },
  });
}

function isSqsEnabled() {
  return Boolean(mailConfig.sqs.queueUrl);
}

module.exports = {
  enqueueMailEvent,
  claimNextEvent,
  completeEvent,
  failEvent,
  buildIdempotencyKey,
  isSqsEnabled,
};
