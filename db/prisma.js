/**
 * Prisma Client singleton.
 *
 * - Tek bir Prisma Client instance'i tum uygulama boyunca paylasilir.
 * - Sunucu basladiginda connectPrisma() ile bir saglik kontrolu yapilir
 *   ve PostgreSQL versiyon/db bilgisi log'a basilir.
 * - process.exit / SIGINT / SIGTERM'de baglanti temiz kapatilir.
 *
 * MongoDB tarafindaki mongoose ve database.js dosyalarina HIC DOKUNMAZ.
 */

const { PrismaClient } = require("@prisma/client");

let prisma;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ["warn", "error"],
    });
  }
  return prisma;
}

async function connectPrisma() {
  const client = getPrisma();
  try {
    const rows = await client.$queryRaw`
      SELECT current_database() AS db,
             current_user       AS usr,
             version()          AS version,
             now()              AS now
    `;
    const row = rows && rows[0] ? rows[0] : {};
    console.log("[prisma] PostgreSQL Client hazir");
    console.log(`[prisma]    db:     ${row.db}`);
    console.log(`[prisma]    user:   ${row.usr}`);
    console.log(`[prisma]    server: ${(row.version || "").split(" ").slice(0, 2).join(" ")}`);
    console.log(`[prisma]    now():  ${row.now?.toISOString?.() || row.now}`);

    const tablesCount = await client.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const c = (tablesCount && tablesCount[0] && tablesCount[0].count) || 0;
    console.log(`[prisma]    public semasi: ${c} tablo`);

    return client;
  } catch (err) {
    console.error("[prisma] Baglanti hatasi:", err?.message || err);
    throw err;
  }
}

async function disconnectPrisma() {
  if (prisma) {
    try {
      await prisma.$disconnect();
      console.log("[prisma] Baglanti kapatildi");
    } catch (err) {
      console.error("[prisma] Disconnect error:", err?.message || err);
    }
  }
}

let shutdownRegistered = false;
function registerShutdownHooks() {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  const onSignal = async (sig) => {
    console.log(`[prisma] ${sig} alindi, baglanti kapatiliyor...`);
    await disconnectPrisma();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("beforeExit", onSignal);
}

registerShutdownHooks();

module.exports = {
  prisma: getPrisma(),
  getPrisma,
  connectPrisma,
  disconnectPrisma,
};
