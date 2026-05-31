const { Pool } = require("pg");

/**
 * PostgreSQL bağlantısı (MongoDB ile paralel çalışır, ona dokunmaz).
 *
 * Strateji:
 *  - .env içindeki bireysel alanlar (PG_HOST, PG_PORT, PG_USER, PG_PASSWORD,
 *    PG_DATABASE) tercih edilir. Parolada '@' gibi karakterler URL parse
 *    sırasında sorun çıkarabildiği için bu yaklaşım güvenlidir.
 *  - Alternatif olarak PG_URI tanımlıysa onunla bağlanılır.
 *  - Bağlantı kurulduğunda terminale net bir log basılır.
 *  - Hata olursa exponential backoff ile retry edilir; uygulama çökmez.
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let pool = null;

function buildPoolConfig() {
  const ssl =
    String(process.env.PG_SSL || "false").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false;

  if (process.env.PG_URI && String(process.env.PG_URI).trim()) {
    return {
      connectionString: String(process.env.PG_URI).trim(),
      ssl,
    };
  }

  return {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl,
    // Pool boyutu/timeout makul varsayılanlar
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  };
}

function getPool() {
  if (!pool) {
    pool = new Pool(buildPoolConfig());

    pool.on("error", (err) => {
      console.error("[pg] idle client error:", err?.message || err);
    });
  }
  return pool;
}

async function connectPostgres() {
  const cfg = buildPoolConfig();

  const hostInfo = cfg.connectionString
    ? "(connection string)"
    : `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;

  if (
    !cfg.connectionString &&
    (!cfg.host || !cfg.user || !cfg.database)
  ) {
    console.error(
      "[pg] PostgreSQL ENV eksik. .env içinde PG_HOST/PG_USER/PG_PASSWORD/PG_DATABASE veya PG_URI tanımlayın."
    );
    return;
  }

  const p = getPool();

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      console.log(`[pg] PostgreSQL bağlanılıyor → ${hostInfo} (deneme ${attempt})`);
      const client = await p.connect();
      try {
        const res = await client.query(
          "SELECT current_database() AS db, current_user AS usr, version() AS version, now() AS now"
        );
        const row = res.rows[0] || {};
        console.log("[pg] ✅ PostgreSQL bağlantısı BAŞARILI");
        console.log(`[pg]    db:      ${row.db}`);
        console.log(`[pg]    user:    ${row.usr}`);
        console.log(`[pg]    server:  ${(row.version || "").split(" ").slice(0, 2).join(" ")}`);
        console.log(`[pg]    now():   ${row.now?.toISOString?.() || row.now}`);
      } finally {
        client.release();
      }
      return p;
    } catch (err) {
      const waitMs = Math.min(30_000, 1000 * Math.pow(2, Math.min(5, attempt)));
      console.error(
        `[pg] ❌ bağlantı hatası (deneme ${attempt}). ${waitMs}ms sonra tekrar denenecek. sebep: ${err?.message || err}`
      );
      await sleep(waitMs);
    }
  }
}

module.exports = {
  connectPostgres,
  getPool,
};
