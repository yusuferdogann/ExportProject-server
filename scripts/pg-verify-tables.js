/**
 * Prisma'nin olusturdugu PostgreSQL tablolarini listele ve dogrula.
 * Calistirma: node scripts/pg-verify-tables.js
 */
require("dotenv").config();
const { Client } = require("pg");

(async () => {
  const c = new Client({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  });
  await c.connect();

  const tablesQ = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`\n[OK] public semasinda ${tablesQ.rows.length} tablo bulundu:\n`);
  tablesQ.rows.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2, " ")}. ${r.table_name}`));

  const enumsQ = await c.query(`
    SELECT t.typname AS enum_name, COUNT(e.enumlabel) AS values_count
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname
    ORDER BY t.typname
  `);
  console.log(`\n[OK] public semasinda ${enumsQ.rows.length} enum tipi:\n`);
  enumsQ.rows.forEach((r, i) =>
    console.log(`  ${String(i + 1).padStart(2, " ")}. ${r.enum_name}  (${r.values_count} deger)`)
  );

  const fkQ = await c.query(`
    SELECT COUNT(*) AS fk_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'
  `);
  console.log(`\n[OK] Toplam Foreign Key sayisi: ${fkQ.rows[0].fk_count}`);

  const idxQ = await c.query(`
    SELECT COUNT(*) AS idx_count
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);
  console.log(`[OK] Toplam index sayisi: ${idxQ.rows[0].idx_count}`);

  await c.end();
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
