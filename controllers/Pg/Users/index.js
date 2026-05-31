/**
 * /api/pg/users — PostgreSQL (Prisma) tabanli User CRUD controller.
 *
 * Tenant izolasyonu: tum sorgular req.user.companyId ile siniri.
 * Mongo /api/users ile birebir uyumlu shape: { success, data: [{ _id, id, ... }] }
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const { hashPassword } = require("../../../helpers/pg/authHelpers");

const VALID_ROLES = new Set([
  "owner",
  "foreign_trade_manager",
  "general_manager",
  "finance_manager",
  "administrator",
  "demo",
  "employee",
]);

function shape(u) {
  return {
    _id: u.id,
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    permissions: u.permissions || [],
    companyId: u.companyId,
    createdAt: u.createdAt,
  };
}

/** GET /api/pg/users/company — ayni sirketteki tum kullanicilar */
const getCompanyUsers = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      companyId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    success: true,
    data: users.map(shape),
  });
});

/** GET /api/pg/users/:id */
const getOne = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const user = await prisma.user.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      companyId: true,
      createdAt: true,
    },
  });
  if (!user) return next(new CustomError("Kullanici bulunamadi", 404));

  res.json({ success: true, data: shape(user) });
});

/** POST /api/pg/users — yeni kullanici (owner/general_manager/administrator) */
const create = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const callerRole = req.userPg?.role || req.user?.role;

  if (!["owner", "general_manager", "administrator"].includes(callerRole)) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }

  const { username, email, password, role, permissions } = req.body || {};
  if (!username || !email || !password) {
    return next(new CustomError("username/email/password zorunlu", 400));
  }
  if (String(password).length < 4) {
    return next(new CustomError("Sifre en az 4 karakter olmali", 400));
  }
  const cleanRole = role && VALID_ROLES.has(role) ? role : "employee";
  const cleanPerms = Array.isArray(permissions)
    ? permissions.filter((p) => typeof p === "string")
    : [];

  const normalizedEmail = String(email).trim().toLowerCase();
  const dup = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (dup) {
    return next(new CustomError("Bu email ile kullanici zaten var", 409));
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      username: String(username).trim(),
      password: passwordHash,
      role: cleanRole,
      permissions: cleanPerms,
      companyId,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      companyId: true,
      createdAt: true,
    },
  });

  res.status(201).json({ success: true, data: shape(user) });
});

/** PATCH /api/pg/users/:id */
const update = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const callerRole = req.userPg?.role || req.user?.role;
  const id = String(req.params.id || "").trim();

  if (!["owner", "general_manager", "administrator"].includes(callerRole)) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.user.findFirst({ where: { id, companyId } });
  if (!target) return next(new CustomError("Kullanici bulunamadi", 404));

  const { username, role, permissions, password } = req.body || {};
  const data = {};
  if (typeof username === "string" && username.trim())
    data.username = username.trim();
  if (role && VALID_ROLES.has(role)) data.role = role;
  if (Array.isArray(permissions))
    data.permissions = permissions.filter((p) => typeof p === "string");
  if (typeof password === "string" && password.length >= 4) {
    data.password = await hashPassword(password);
  }

  if (!Object.keys(data).length) {
    return next(new CustomError("Guncellenecek alan yok", 400));
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      companyId: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: shape(user) });
});

/** DELETE /api/pg/users/:id */
const remove = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const callerRole = req.userPg?.role || req.user?.role;
  const callerId = req.userPg?.id || req.user?.id;
  const id = String(req.params.id || "").trim();

  if (!["owner", "general_manager", "administrator"].includes(callerRole)) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }
  if (!id) return next(new CustomError("id zorunlu", 400));
  if (id === callerId)
    return next(new CustomError("Kendinizi silemezsiniz", 400));

  const target = await prisma.user.findFirst({ where: { id, companyId } });
  if (!target) return next(new CustomError("Kullanici bulunamadi", 404));

  await prisma.user.delete({ where: { id } });
  res.json({ success: true, message: "Kullanici silindi" });
});

module.exports = {
  getCompanyUsers,
  getOne,
  create,
  update,
  remove,
};
