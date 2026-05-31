/**
 * JWT (PG UUID veya Mongo ObjectId) → Mongo route'larinin bekledigi req.user baglami.
 */

const mongoose = require("mongoose");
const { getPrisma } = require("../../db/prisma");

const MONGO_ID_RE = /^[a-f0-9]{24}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * @param {object} decoded - jwt.verify payload
 * @returns {Promise<object>} req.user shape
 */
async function resolveUserContext(decoded) {
  const permissions = Array.isArray(decoded.permissions)
    ? decoded.permissions
    : [];

  const ctx = {
    id: decoded.id != null ? String(decoded.id) : "",
    name: decoded.username,
    email: decoded.email,
    role: decoded.role,
    companyId: decoded.companyId != null ? String(decoded.companyId) : "",
    permissions,
    src: decoded.src || (UUID_RE.test(String(decoded.id || "")) ? "pg" : "mongo"),
    pgId: null,
    companyPgId: null,
  };

  const rawId = ctx.id;

  if (MONGO_ID_RE.test(rawId)) {
    try {
      const prisma = getPrisma();
      const pgUser = await prisma.user.findUnique({
        where: { legacyMongoId: rawId },
        select: { id: true, companyId: true },
      });
      if (pgUser) {
        ctx.pgId = pgUser.id;
        ctx.companyPgId = pgUser.companyId;
      }
    } catch {
      /* prisma yoksa mongo id ile devam */
    }
    return ctx;
  }

  if (!UUID_RE.test(rawId) && decoded.src !== "pg") {
    return ctx;
  }

  ctx.pgId = rawId;
  ctx.companyPgId = decoded.companyId != null ? String(decoded.companyId) : null;

  try {
    const prisma = getPrisma();
    const pgUser = await prisma.user.findUnique({
      where: { id: rawId },
      select: {
        id: true,
        email: true,
        companyId: true,
        legacyMongoId: true,
        company: { select: { id: true, legacyMongoId: true } },
      },
    });

    if (pgUser) {
      ctx.companyPgId = pgUser.companyId;
      if (pgUser.legacyMongoId) {
        ctx.id = pgUser.legacyMongoId;
      }
      if (pgUser.company?.legacyMongoId) {
        ctx.companyId = pgUser.company.legacyMongoId;
      }
    }
  } catch (e) {
    console.warn("[auth] PG kullanici cozumlenemedi:", e.message);
  }

  if (MONGO_ID_RE.test(ctx.id)) {
    return ctx;
  }

  if (isMongoConnected() && decoded.email) {
    try {
      const User = require("../../models/User");
      const mongoUser = await User.findOne({
        email: String(decoded.email).trim().toLowerCase(),
      })
        .select("_id companyId")
        .lean();
      if (mongoUser?._id) {
        ctx.id = String(mongoUser._id);
        if (mongoUser.companyId) {
          ctx.companyId = String(mongoUser.companyId);
        }
        ctx.src = "pg+mongo";
      }
    } catch {
      /* mongo kapali */
    }
  }

  return ctx;
}

module.exports = {
  resolveUserContext,
  isMongoConnected,
  MONGO_ID_RE,
  UUID_RE,
};
