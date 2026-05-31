/**
 * OAuth state — bellek + PostgreSQL (restart-safe).
 */

const { getPrisma } = require("../../db/prisma");

const memory = new Map();
const TTL_MS = 15 * 60 * 1000;

function memSet(state, payload) {
  memory.set(state, { ...payload, at: Date.now() });
}

function memGet(state) {
  const saved = memory.get(state);
  if (!saved) return null;
  if (Date.now() - saved.at > TTL_MS) {
    memory.delete(state);
    return null;
  }
  return saved;
}

function memDelete(state) {
  memory.delete(state);
}

async function saveOAuthState({
  state,
  userId,
  companyId,
  provider,
  returnPath,
}) {
  const payload = {
    userId,
    companyId,
    provider,
    returnPath,
    at: Date.now(),
  };
  memSet(state, payload);

  try {
    const prisma = getPrisma();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await prisma.mailOAuthState.upsert({
      where: { state },
      create: {
        state,
        userId,
        companyId,
        provider,
        returnPath,
        expiresAt,
      },
      update: { expiresAt, returnPath, provider },
    });
    await prisma.mailOAuthState.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (e) {
    console.warn("[oauth-state] DB kayit atlandi:", e.message);
  }
}

async function consumeOAuthState(state) {
  const fromMem = memGet(state);
  if (fromMem) {
    memDelete(state);
    return fromMem;
  }

  try {
    const prisma = getPrisma();
    const row = await prisma.mailOAuthState.findUnique({ where: { state } });
    if (!row || row.expiresAt < new Date()) {
      if (row) {
        await prisma.mailOAuthState.delete({ where: { state } }).catch(() => {});
      }
      return null;
    }
    await prisma.mailOAuthState.delete({ where: { state } });
    return {
      userId: row.userId,
      companyId: row.companyId,
      provider: row.provider,
      returnPath: row.returnPath,
      at: row.createdAt.getTime(),
    };
  } catch (e) {
    console.warn("[oauth-state] DB okuma atlandi:", e.message);
    return null;
  }
}

module.exports = { saveOAuthState, consumeOAuthState };
