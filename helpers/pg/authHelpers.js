/**
 * PostgreSQL (Prisma) icin auth helpers.
 * Eski Mongoose UserSchema.methods.genereteJwtFromUser() yerine gecer.
 *
 * MongoDB tarafindaki helpers/authorization/tokenHelpers.js'e dokunmaz.
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rolePermissions = require("../../config/roles");

const BCRYPT_ROUNDS = 10;

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

function comparePasswordSync(plain, hashed) {
  if (!plain || !hashed) return false;
  try {
    return bcrypt.compareSync(String(plain), String(hashed));
  } catch (_) {
    return false;
  }
}

/**
 * PG User satirindan JWT olustur.
 *
 * Beklenen user objesi: { id, username, email, role, companyId, permissions[] }
 */
function signJwtForUser(user) {
  const { JWT_SECRET_KEY, JWT_EXPIRE } = process.env;
  if (!JWT_SECRET_KEY) {
    throw new Error("JWT_SECRET_KEY .env'de tanimli degil");
  }

  const rolePerms = rolePermissions[user.role] || [];
  const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
  const permissions = Array.from(new Set([...rolePerms, ...userPerms]));

  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    permissions,
    companyId: user.companyId,
    // backend'in PG kaynakli oldugunu gosteren marker (opsiyonel)
    src: "pg",
  };

  return jwt.sign(payload, JWT_SECRET_KEY, {
    expiresIn: JWT_EXPIRE || "60m",
  });
}

/**
 * Eski sendJwtToClient ile ayni shape'i kullanir; frontend hicbir fark gormez.
 */
function sendJwtToClientPg(user, res) {
  const token = signJwtForUser(user);
  const { NODE_ENV, JWT_COOKIE } = process.env;

  return res
    .status(200)
    .cookie("access_token", token, {
      httpOnly: true,
      expires: new Date(
        Date.now() + parseInt(JWT_COOKIE || "60", 10) * 1000 * 60
      ),
      secure: NODE_ENV === "development" ? false : true,
    })
    .json({
      success: true,
      access_token: token,
      data: {
        username: user.username,
        email: user.email,
        detail: {
          _id: user.id, // Mongo'daki "_id" alanini frontend bekleyebiliyor
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          permissions: user.permissions || [],
        },
      },
    });
}

module.exports = {
  hashPassword,
  comparePasswordSync,
  signJwtForUser,
  sendJwtToClientPg,
};
