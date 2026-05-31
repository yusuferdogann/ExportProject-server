/**
 * PostgreSQL (Prisma) tabanli Auth controller.
 *
 * Endpoint shape'leri eski Mongo /api/auth ile birebir uyumludur — frontend
 * tarafinda sadece base URL "/api" -> "/api/pg" degisikligi yeterli olur.
 *
 * MongoDB tarafindaki AuthController.js'e DOKUNMAZ.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const {
  hashPassword,
  comparePasswordSync,
  sendJwtToClientPg,
} = require("../../../helpers/pg/authHelpers");
const { validateUserInput } = require("../../../helpers/input/inputHelpers");

function effectiveSlug(req) {
  const slug =
    req.headers["x-tenant"] ||
    req.headers["x-forwarded-host"]?.split(".")[0] ||
    req.hostname.split(".")[0];
  if (!slug || slug === "localhost") return "default";
  return String(slug).toLowerCase();
}

/**
 * POST /api/pg/auth/register
 * Body: { username, email, password }
 */
const register = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return next(new CustomError("username/email/password zorunlu", 400));
  }
  if (String(password).length < 4) {
    return next(new CustomError("Sifre en az 4 karakter olmali", 400));
  }

  const slug = effectiveSlug(req);
  const normalizedEmail = String(email).trim().toLowerCase();

  // Email global benzersiz oldugu icin onceden bakalim
  const exists = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (exists) {
    return next(new CustomError("Bu email ile kullanici zaten var", 409));
  }

  const passwordHash = await hashPassword(password);

  // Tek transaction icinde company yoksa olustur + user yarat
  const result = await prisma.$transaction(async (tx) => {
    let company = await tx.company.findUnique({ where: { slug } });
    if (!company) {
      company = await tx.company.create({
        data: { name: slug, slug, isActive: true },
      });
    }
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        username: String(username).trim(),
        password: passwordHash,
        role: "owner",
        companyId: company.id,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        companyId: true,
        permissions: true,
      },
    });
    return user;
  });

  return sendJwtToClientPg(result, res);
});

/**
 * POST /api/pg/auth/login
 * Body: { email, password }
 */
const login = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const { email: rawEmail, password } = req.body || {};
  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  const rawTrimmed = typeof rawEmail === "string" ? rawEmail.trim() : "";

  if (!validateUserInput(email, password)) {
    return next(new CustomError("Lutfen email ve sifrenizi giriniz", 400));
  }

  // 1) tam eslesme email
  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      username: true,
      email: true,
      password: true,
      role: true,
      companyId: true,
      permissions: true,
    },
  });

  // 2) email alaninda username yazilmis olabilir
  if (!user && rawTrimmed) {
    user = await prisma.user.findFirst({
      where: {
        username: { equals: rawTrimmed, mode: "insensitive" },
      },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true,
        companyId: true,
        permissions: true,
      },
    });
  }

  if (!user) {
    return next(new CustomError("Gecersiz email veya sifre", 400));
  }

  if (!comparePasswordSync(password, user.password)) {
    return next(new CustomError("Gecersiz email veya sifre", 400));
  }

  // password alanini token uretmeye gondermiyoruz
  const { password: _pw, ...safe } = user;
  return sendJwtToClientPg(safe, res);
});

/**
 * POST /api/pg/auth/logout
 */
const logout = asyncErrorWrapper(async (req, res) => {
  return res
    .status(200)
    .cookie("access_token", "", {
      httpOnly: true,
      expires: new Date(Date.now()),
      secure: process.env.NODE_ENV !== "development",
    })
    .json({ success: true, message: "Logout Successfull" });
});

/**
 * GET /api/pg/auth/profile
 */
const getUser = (req, res) => {
  const u = req.userPg || req.user || {};
  return res.json({
    success: true,
    data: {
      id: u.id,
      _id: u.id,
      name: u.username,
      username: u.username,
      email: u.email,
      role: u.role,
      companyId: u.companyId,
      permissions: u.permissions || [],
    },
  });
};

/**
 * PUT /api/pg/auth/change-password
 * Body: { currentPassword, newPassword }
 */
const changePassword = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const { currentPassword, newPassword } = req.body || {};
  const cur = typeof currentPassword === "string" ? currentPassword : "";
  const neu = typeof newPassword === "string" ? newPassword : "";

  if (!cur || !neu) {
    return next(new CustomError("Mevcut sifre ve yeni sifre zorunlu", 400));
  }
  if (neu.length < 4) {
    return next(new CustomError("Yeni sifre en az 4 karakter olmali", 400));
  }
  if (cur === neu) {
    return next(new CustomError("Yeni sifre mevcut sifre ile ayni olamaz", 400));
  }

  const userId = req.userPg?.id || req.user?.id;
  if (!userId) return next(new CustomError("Yetkiniz yok", 401));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) return next(new CustomError("Kullanici bulunamadi", 404));

  if (!comparePasswordSync(cur, user.password)) {
    return next(new CustomError("Mevcut sifre hatali", 400));
  }

  const newHash = await hashPassword(neu);
  await prisma.user.update({
    where: { id: userId },
    data: { password: newHash },
  });

  return res
    .status(200)
    .json({ success: true, message: "Sifreniz basariyla guncellendi" });
});

module.exports = {
  register,
  login,
  logout,
  getUser,
  changePassword,
};
