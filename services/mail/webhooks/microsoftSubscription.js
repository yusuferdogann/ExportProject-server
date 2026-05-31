const axios = require("axios");
const crypto = require("crypto");
const { getPrisma } = require("../../../db/prisma");
const { getAccessToken } = require("../accountTokens");
const mailConfig = require("../../../config/enterpriseMail");

function webhookBaseUrl() {
  const base =
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    "http://localhost:5000";
  return `${base.replace(/\/$/, "")}/api/pg/enterprise-mail/webhooks/microsoft`;
}

async function ensureMicrosoftSubscription(account) {
  const accessToken = await getAccessToken(account);
  const notificationUrl = webhookBaseUrl();
  const clientState = crypto.randomBytes(16).toString("hex");
  const expiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  const { data } = await axios.post(
    "https://graph.microsoft.com/v1.0/subscriptions",
    {
      changeType: "created,updated",
      notificationUrl,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime: expiration.toISOString(),
      clientState,
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const prisma = getPrisma();
  const existing = await prisma.mailWebhookSubscription.findFirst({
    where: { mailAccountId: account.id, provider: "microsoft" },
  });
  if (existing) {
    await prisma.mailWebhookSubscription.update({
      where: { id: existing.id },
      data: {
        externalSubId: data.id,
        resourceId: data.resource,
        expiresAt: new Date(data.expirationDateTime),
        clientState,
      },
    });
  } else {
    await prisma.mailWebhookSubscription.create({
      data: {
        mailAccountId: account.id,
        provider: "microsoft",
        externalSubId: data.id,
        resourceId: data.resource,
        expiresAt: new Date(data.expirationDateTime),
        clientState,
      },
    });
  }

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      microsoftSubscriptionId: data.id,
      webhookExpiresAt: new Date(data.expirationDateTime),
    },
  });

  return data;
}

module.exports = { ensureMicrosoftSubscription, webhookBaseUrl };
