const { getPrisma } = require("../../../db/prisma");
const { encryptCredentials } = require("../credentials");
const gmailOAuth = require("./gmailOAuth");
const microsoftOAuth = require("./microsoftOAuth");
const { enqueueMailEvent, buildIdempotencyKey } = require("../mailEventQueue");
const { ensureGmailWatch } = require("../webhooks/gmailWatch");
const { ensureMicrosoftSubscription } = require("../webhooks/microsoftSubscription");

async function connectOAuthAccount({ userId, companyId, provider, code }) {
  const prisma = getPrisma();
  let tokens;
  let emailAddress;
  let displayName;
  let historyId;

  if (provider === "gmail") {
    tokens = await gmailOAuth.exchangeCode(code);
    const profile = await gmailOAuth.fetchGmailProfile(tokens.access_token);
    emailAddress = (profile.emailAddress || "").toLowerCase();
    displayName = profile.emailAddress?.split("@")[0] || null;
    historyId = profile.historyId ? String(profile.historyId) : null;
  } else if (provider === "microsoft") {
    tokens = await microsoftOAuth.exchangeCode(code);
    const profile = await microsoftOAuth.fetchMicrosoftProfile(tokens.access_token);
    emailAddress = (profile.mail || profile.userPrincipalName || "").toLowerCase();
    displayName = profile.displayName || null;
  } else {
    throw new Error("Desteklenmeyen provider");
  }

  if (!emailAddress) {
    throw new Error("E-posta adresi alinamadi");
  }

  const credentials = encryptCredentials({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(
      Date.now() + (tokens.expires_in || 3600) * 1000
    ).toISOString(),
    scope: tokens.scope,
  });

  // Eski placeholder kayitlari temizle
  await prisma.mailAccount.deleteMany({
    where: {
      userId,
      provider,
      emailAddress: { endsWith: "@connect.local" },
    },
  });

  // Ayni e-posta yanlislikla SES ile kayitliysa OAuth baglantisi onu gmail/microsoft yapar
  await prisma.mailAccount.deleteMany({
    where: {
      userId,
      emailAddress,
      provider: "ses_domain",
    },
  });

  const count = await prisma.mailAccount.count({ where: { userId } });

  const account = await prisma.mailAccount.upsert({
    where: {
      userId_emailAddress: { userId, emailAddress },
    },
    create: {
      companyId,
      userId,
      emailAddress,
      displayName,
      provider,
      status: "active",
      credentials,
      gmailHistoryId: historyId,
      isDefault: count === 0,
    },
    update: {
      displayName,
      provider,
      credentials,
      gmailHistoryId: historyId || undefined,
      status: "active",
      lastSyncError: null,
    },
  });

  try {
    if (provider === "gmail") await ensureGmailWatch(account);
    if (provider === "microsoft") await ensureMicrosoftSubscription(account);
  } catch (e) {
    console.warn("[oauth] webhook setup:", e.message);
  }

  await enqueueMailEvent({
    companyId,
    mailAccountId: account.id,
    type: "incremental_sync",
    payload: { reason: "oauth_connected" },
    idempotencyKey: buildIdempotencyKey(["oauth-sync", account.id]),
  });

  return account;
}

module.exports = { connectOAuthAccount };
