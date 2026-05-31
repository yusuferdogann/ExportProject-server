/**
 * Mail hesap yardimcilari — yanlis SES kayitlari, provider duzeltme.
 */

const { providerConfigured } = require("./providers");

const CONSUMER_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
]);

function emailDomain(email) {
  const e = String(email || "").trim().toLowerCase();
  const i = e.lastIndexOf("@");
  return i >= 0 ? e.slice(i + 1) : "";
}

function isConsumerMailbox(email) {
  return CONSUMER_MAIL_DOMAINS.has(emailDomain(email));
}

function hasOAuthCredentials(account) {
  const c = account?.credentials;
  if (!c || typeof c !== "object") return false;
  return Boolean(c.accessToken || c.refreshToken);
}

function inferProviderFromEmail(email) {
  const domain = emailDomain(email);
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (
    ["outlook.com", "hotmail.com", "live.com"].includes(domain)
  ) {
    return "microsoft";
  }
  return null;
}

/**
 * Kullanicinin mail hesaplarini duzeltir (listeleme / repair oncesi).
 * @returns {{ removed: string[], fixed: string[], activated: string[] }}
 */
async function repairUserMailAccounts(prisma, userId, companyId) {
  const report = { removed: [], fixed: [], activated: [] };

  const accounts = await prisma.mailAccount.findMany({
    where: { userId, companyId },
  });

  for (const a of accounts) {
    const email = a.emailAddress;

    // Yanlis: Gmail/Outlook adresi SES ile kayitli, OAuth yok → sil (Connect Gmail ile tekrar baglan)
    if (
      a.provider === "ses_domain" &&
      isConsumerMailbox(email) &&
      !hasOAuthCredentials(a)
    ) {
      await prisma.mailAccount.delete({ where: { id: a.id } });
      report.removed.push(email);
      continue;
    }

    // OAuth token var ama provider hala ses_domain → gmail/microsoft yap
    if (a.provider === "ses_domain" && hasOAuthCredentials(a)) {
      const inferred = inferProviderFromEmail(email);
      if (inferred) {
        const updated = await prisma.mailAccount.update({
          where: { id: a.id },
          data: {
            provider: inferred,
            status: "active",
            lastSyncError: null,
          },
        });
        report.fixed.push(`${email} → ${inferred}`);
        await enqueueSyncIfNeeded(prisma, updated, companyId);
      }
      continue;
    }

    // Kurumsal SES pending → active
    if (
      a.provider === "ses_domain" &&
      a.status === "pending" &&
      !isConsumerMailbox(email) &&
      providerConfigured("ses_domain")
    ) {
      await prisma.mailAccount.update({
        where: { id: a.id },
        data: { status: "active", lastSyncAt: new Date(), lastSyncError: null },
      });
      report.activated.push(email);
    }
  }

  return report;
}

async function enqueueSyncIfNeeded(prisma, account, companyId) {
  const { enqueueMailEvent, buildIdempotencyKey } = require("./mailEventQueue");
  if (account.provider !== "gmail" && account.provider !== "microsoft") return;
  const fresh = await prisma.mailAccount.findUnique({ where: { id: account.id } });
  if (!fresh || fresh.status !== "active") return;
  await enqueueMailEvent({
    companyId,
    mailAccountId: fresh.id,
    type: "incremental_sync",
    payload: { reason: "repair_promoted" },
    idempotencyKey: buildIdempotencyKey(["repair-sync", fresh.id, Date.now()]),
  });
}

module.exports = {
  CONSUMER_MAIL_DOMAINS,
  isConsumerMailbox,
  hasOAuthCredentials,
  repairUserMailAccounts,
};
