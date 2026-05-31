/**
 * SADECE PostgreSQL tarafindaki kullanici sifresini sifirlar.
 * MongoDB'ye DOKUNMAZ.
 *
 * Kullanim:
 *   node scripts/pg-reset-user-password.js <email> <yeni_sifre>
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

(async () => {
  const [, , emailArg, newPassword] = process.argv;
  if (!emailArg || !newPassword) {
    console.error("Kullanim: node scripts/pg-reset-user-password.js <email> <yeni_sifre>");
    process.exit(1);
  }
  if (newPassword.length < 4) {
    console.error("Sifre en az 4 karakter olmali.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  const email = emailArg.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kullanici bulunamadi (PG): ${emailArg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });

  console.log("[OK] PG'de sifre guncellendi:");
  console.log("  email:    ", user.email);
  console.log("  username: ", user.username);
  console.log("  role:     ", user.role);
  console.log("  id (UUID):", user.id);
  console.log("  legacyId :", user.legacyMongoId);

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
