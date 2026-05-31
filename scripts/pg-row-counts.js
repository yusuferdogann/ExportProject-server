/**
 * Her PG tablosundaki kayit sayisi.
 * Calistirma: node scripts/pg-row-counts.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  await prisma.$connect();
  const tables = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  const rows = [];
  for (const t of tables) {
    const name = t.tablename;
    if (name.startsWith("_prisma")) continue;
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "${name}"`
    );
    rows.push({ table: name, rows: r[0].count });
  }
  console.table(rows);
  const total = rows.reduce((s, r) => s + r.rows, 0);
  const tablesWithData = rows.filter((r) => r.rows > 0).length;
  console.log(`\nTOPLAM: ${total} satir / ${rows.length} tablo (verili tablo sayisi: ${tablesWithData})`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
