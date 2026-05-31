/**
 * Public webhooks — JWT auth yok.
 * Gmail Pub/Sub ve Microsoft Graph subscription buraya duser.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const {
  enqueueMailEvent,
  buildIdempotencyKey,
} = require("../../../services/mail/mailEventQueue");

/** POST /api/pg/enterprise-mail/webhooks/gmail */
const gmailPush = asyncErrorWrapper(async (req, res) => {
  const body = req.body || {};
  const message = body.message;
  const dataB64 = message?.data;
  let decoded = {};
  if (dataB64) {
    try {
      decoded = JSON.parse(
        Buffer.from(dataB64, "base64").toString("utf8")
      );
    } catch (_) {
      decoded = {};
    }
  }

  const email = decoded.emailAddress;
  const historyId = decoded.historyId;

  const prisma = getPrisma();
  let account = null;
  if (email) {
    account = await prisma.mailAccount.findFirst({
      where: { emailAddress: email, provider: "gmail" },
    });
  }

  if (account) {
    await enqueueMailEvent({
      companyId: account.companyId,
      mailAccountId: account.id,
      type: "gmail_push",
      payload: { historyId, email },
      idempotencyKey: buildIdempotencyKey([
        "gmail_push",
        account.id,
        historyId,
      ]),
    });
  }

  res.status(200).send();
});

/** POST /api/pg/enterprise-mail/webhooks/microsoft */
const microsoftNotification = asyncErrorWrapper(async (req, res) => {
  const validationToken = req.query.validationToken;
  if (validationToken) {
    return res.type("text/plain").send(validationToken);
  }

  const notifications = req.body?.value || [];
  const prisma = getPrisma();

  for (const n of notifications) {
    const subId = n.subscriptionId;
    const sub = subId
      ? await prisma.mailWebhookSubscription.findFirst({
          where: { externalSubId: subId, provider: "microsoft" },
          include: { mailAccount: true },
        })
      : null;

    const account = sub?.mailAccount;
    if (!account) continue;

    await enqueueMailEvent({
      companyId: account.companyId,
      mailAccountId: account.id,
      type: "microsoft_notification",
      payload: {
        subscriptionId: subId,
        changeType: n.changeType,
        resource: n.resource,
      },
      idempotencyKey: buildIdempotencyKey([
        "ms",
        subId,
        n.clientState,
        n.resource,
      ]),
    });
  }

  res.status(202).send();
});

module.exports = {
  gmailPush,
  microsoftNotification,
};
