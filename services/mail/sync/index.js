const { syncGmailIncremental } = require("./gmailSync");
const { syncMicrosoftIncremental } = require("./microsoftSync");
const { getPrisma } = require("../../../db/prisma");

async function runIncrementalSync(account) {
  const prisma = getPrisma();
  const before = await prisma.mailMessage.count({
    where: { mailAccountId: account.id },
  });

  switch (account.provider) {
    case "gmail":
      await syncGmailIncremental(account);
      break;
    case "microsoft":
      await syncMicrosoftIncremental(account);
      break;
    case "ses_domain":
      return {
        newMessages: 0,
        accountId: account.id,
        userId: account.userId,
        skipped: "ses_inbound_pending",
      };
    default:
      return {
        newMessages: 0,
        accountId: account.id,
        userId: account.userId,
        skipped: account.provider,
      };
  }

  const after = await prisma.mailMessage.count({
    where: { mailAccountId: account.id },
  });

  return {
    newMessages: Math.max(0, after - before),
    accountId: account.id,
    userId: account.userId,
  };
}

module.exports = { runIncrementalSync };