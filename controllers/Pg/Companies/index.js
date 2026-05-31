/**
 * /api/pg/companies — PostgreSQL (Prisma) tabanli Company controller.
 *
 * Tenant izolasyonu: bir kullanici yalnizca kendi sirketini gorebilir/duzenler.
 * "administrator", "owner", "general_manager" rolu olan kullanicilarin tum
 * sirketleri listelemesine izin verilir (enterprise dashboard).
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const ADMIN_ROLES = new Set(["administrator", "owner", "general_manager"]);

/** GET /api/pg/companies/mine — oturumdaki kullanicinin sirketi */
const getMine = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!company) return next(new CustomError("Sirket bulunamadi", 404));

  res.json({ success: true, data: company });
});

/** GET /api/pg/companies — yalnizca admin rolleri */
const listAll = asyncErrorWrapper(async (req, res, next) => {
  if (!ADMIN_ROLES.has(req.userPg?.role || req.user?.role)) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }
  const prisma = getPrisma();
  const list = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      _count: { select: { users: true, customers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ success: true, data: list });
});

/** PATCH /api/pg/companies/mine — sirketin name/isActive guncelle */
const updateMine = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  // Sadece owner / general_manager / administrator duzenleyebilir
  if (!ADMIN_ROLES.has(req.userPg?.role || req.user?.role)) {
    return next(new CustomError("Bu islem icin yetkiniz yok", 403));
  }

  const { name, isActive } = req.body || {};
  const data = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof isActive === "boolean") data.isActive = isActive;

  if (!Object.keys(data).length) {
    return next(new CustomError("Guncellenecek alan yok", 400));
  }

  const company = await prisma.company.update({
    where: { id: companyId },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: company });
});

module.exports = {
  getMine,
  listAll,
  updateMine,
};
