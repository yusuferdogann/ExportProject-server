/**
 * PostgreSQL kullanici yetkisi teshisi.
 * Calistirma: node scripts/pg-check-permissions.js
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

  const queries = [
    "SELECT current_user AS usr, current_database() AS db",
    "SELECT pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_in_db",
    "SELECT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public_schema",
    "SELECT pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public_schema",
    "SELECT datname, pg_catalog.pg_get_userbyid(datdba) AS db_owner FROM pg_database WHERE datname = current_database()",
    "SELECT nspname, pg_catalog.pg_get_userbyid(nspowner) AS schema_owner FROM pg_namespace WHERE nspname = 'public'",
    "SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolcanlogin FROM pg_roles WHERE rolname = current_user",
  ];

  for (const sql of queries) {
    try {
      const r = await c.query(sql);
      console.log("\n>>>", sql);
      console.table(r.rows);
    } catch (e) {
      console.log("\n>>>", sql, "\n   FAIL:", e.message);
    }
  }

  await c.end();
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
