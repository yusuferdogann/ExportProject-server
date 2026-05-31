/**
 * PG'deki test kullanicilarini listele (sifresiz, sadece kim oldugunu gor).
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      companyId: true,
      legacyMongoId: true,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  console.table(users);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
