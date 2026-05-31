/**
 * Tum mail_accounts kayitlarini duzeltir:
 * - @gmail.com vb. yanlis SES kayitlarini siler (OAuth yoksa)
 * - OAuth token var ama provider ses_domain → gmail/microsoft
 * - Kurumsal SES pending → active
 *
 * Kullanim: node scripts/pg-repair-mail-accounts.js
 */

require("dotenv").config();
const { connectPrisma, getPrisma } = require("../db/prisma");
const { repairUserMailAccounts } = require("../services/mail/mailAccountHelpers");

async function main() {
  await connectPrisma();
  const prisma = getPrisma();

  const users = await prisma.mailAccount.findMany({
    select: { userId: true, companyId: true },
    distinct: ["userId", "companyId"],
  });

  const totals = { removed: 0, fixed: 0, activated: 0 };

  for (const { userId, companyId } of users) {
    const report = await repairUserMailAccounts(prisma, userId, companyId);
    totals.removed += report.removed.length;
    totals.fixed += report.fixed.length;
    totals.activated += report.activated.length;
    if (
      report.removed.length ||
      report.fixed.length ||
      report.activated.length
    ) {
      console.log(`user=${userId}`, report);
    }
  }

  const remaining = await prisma.mailAccount.findMany({
    select: {
      emailAddress: true,
      provider: true,
      status: true,
      userId: true,
    },
    orderBy: { emailAddress: "asc" },
  });

  console.log("\n--- Ozet ---");
  console.log("Kaldirilan:", totals.removed);
  console.log("Duzeltilen:", totals.fixed);
  console.log("Aktif SES:", totals.activated);
  console.log("\nKalan hesaplar:");
  for (const a of remaining) {
    console.log(`  ${a.emailAddress} | ${a.provider} | ${a.status}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
