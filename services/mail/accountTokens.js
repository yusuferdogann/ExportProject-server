/**
 * MailAccount credentials okuma / yenileme.
 */

const { getPrisma } = require("../../db/prisma");
const {
  encryptCredentials,
  decryptCredentials,
} = require("./credentials");
const gmailOAuth = require("./oauth/gmailOAuth");
const microsoftOAuth = require("./oauth/microsoftOAuth");

async function saveCredentials(accountId, creds) {
  const prisma = getPrisma();
  return prisma.mailAccount.update({
    where: { id: accountId },
    data: { credentials: encryptCredentials(creds) },
  });
}

async function getAccessToken(account) {
  const creds = decryptCredentials(account.credentials);
  if (!creds?.accessToken) {
    throw new Error("OAuth token bulunamadi — hesabi yeniden baglayin");
  }

  const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) {
    return creds.accessToken;
  }

  if (!creds.refreshToken) {
    throw new Error("Refresh token yok — hesabi yeniden baglayin");
  }

  let refreshed;
  if (account.provider === "gmail") {
    refreshed = await gmailOAuth.refreshAccessToken(creds.refreshToken);
  } else if (account.provider === "microsoft") {
    refreshed = await microsoftOAuth.refreshAccessToken(creds.refreshToken);
  } else {
    throw new Error("Provider refresh desteklenmiyor");
  }

  const next = {
    ...creds,
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    refreshToken: refreshed.refresh_token || creds.refreshToken,
  };
  await saveCredentials(account.id, next);
  return next.accessToken;
}

module.exports = { getAccessToken, saveCredentials, decryptCredentials };
