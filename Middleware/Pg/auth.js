/**
 * /api/pg/* rotalarinda kullanilan auth middleware.
 *
 * - Bearer JWT bekler.
 * - JWT'den gelen user.id ile Prisma'dan canli PG user satirini yukler.
 * - req.userPg = { id, username, email, role, companyId, permissions[] }
 * - Geriye uyumluluk icin req.user'i da ayni objeyle doldurur (mevcut helper'lar
 *   req.user.id okuyor; PG controller'larinda da hayatimizi kolaylastirir).
 *
 * MongoDB tarafindaki Middleware/authorization/auth.js'e DOKUNMAZ.
 */

const jwt = require("jsonwebtoken");
const CustomError = require("../../helpers/error/CustomError");
const { getPrisma } = require("../../db/prisma");

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  role: true,
  companyId: true,
  permissions: true,
};

/** Mongo ObjectId (24 hex) — PG JWT ise UUID */
const MONGO_ID_RE = /^[a-f0-9]{24}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolvePgUser(prisma, decoded) {
  const rawId = decoded?.id != null ? String(decoded.id) : "";

  if (UUID_RE.test(rawId)) {
    const byUuid = await prisma.user.findUnique({
      where: { id: rawId },
      select: USER_SELECT,
    });
    if (byUuid) return byUuid;
  }

  if (MONGO_ID_RE.test(rawId)) {
    const byLegacy = await prisma.user.findUnique({
      where: { legacyMongoId: rawId },
      select: USER_SELECT,
    });
    if (byLegacy) return byLegacy;
  }

  if (decoded?.email) {
    const email = String(decoded.email).trim().toLowerCase();
    const byEmail = await prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });
    if (byEmail) return byEmail;
  }

  return null;
}

function isTokenIncluded(req) {
  return (
    !!req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  );
}

function getAccessTokenFromHeader(req) {
  return String(req.headers.authorization || "").split(" ")[1];
}

const getAccessToRoutePg = async (req, res, next) => {
  try {
    const { JWT_SECRET_KEY } = process.env;
    if (!JWT_SECRET_KEY) {
      return next(new CustomError("JWT_SECRET_KEY tanimli degil", 500));
    }
    if (!isTokenIncluded(req)) {
      return next(new CustomError("Yetkiniz yok (token yok)", 401));
    }

    const token = getAccessTokenFromHeader(req);
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET_KEY);
    } catch (e) {
      return next(new CustomError("Yetkiniz yok (token gecersiz)", 401));
    }

    if (!decoded?.id) {
      return next(new CustomError("Yetkiniz yok (id eksik)", 401));
    }

    const prisma = getPrisma();
    const user = await resolvePgUser(prisma, decoded);

    if (!user) {
      return next(
        new CustomError("Yetkiniz yok (kullanici bulunamadi)", 401)
      );
    }

    const ctx = {
      id: user.id,
      name: user.username,
      username: user.username,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
    };
    req.userPg = ctx;
    req.user = ctx; // mevcut helper'lar req.user okuyor
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { getAccessToRoutePg };
