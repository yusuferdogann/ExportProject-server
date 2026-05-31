/**
 * /api/pg/customer — PostgreSQL (Prisma) tabanli Customer controller.
 *
 * Mongo karsiligi: server/controllers/Customer/index.js
 * - Tenant izolasyonu: req.userPg.companyId
 * - Cevap shape: { success, data } (Mongo davranisi ile birebir)
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function clampRating(value) {
  return Math.min(5, Math.max(0, Number(value) || 0));
}

function parseRatingFromBody(body) {
  if (!body || !("rating" in body)) return null;
  if (body.rating == null || body.rating === "") return 0;
  return clampRating(body.rating);
}

function shape(c, ratingOverride) {
  if (!c) return c;
  const rating =
    ratingOverride != null ? ratingOverride : Number(c.rating) || 0;
  return {
    _id: c.id,
    id: c.id,
    firmName: c.firmName,
    country: c.country,
    address: c.address,
    code: c.code,
    phone: c.phone,
    mail: c.mail,
    website: c.website,
    personName: c.personName,
    personTitle: c.personTitle,
    saveDate: c.saveDate,
    isActive: c.isActive,
    rating,
    companyId: c.companyId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Prisma client eski ise rating kolonu okunmaz; raw SQL ile map. */
async function loadRatingMap(prisma, companyId) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT id, COALESCE(rating, 0)::float AS rating
      FROM customers
      WHERE "companyId" = ${companyId}::uuid
    `;
    return Object.fromEntries(
      rows.map((r) => [r.id, clampRating(r.rating)])
    );
  } catch (err) {
    console.warn("[pg/customer] rating read:", err?.message);
    return {};
  }
}

async function persistRating(prisma, id, rating) {
  const r = clampRating(rating);
  await prisma.$executeRaw`
    UPDATE customers
    SET rating = ${r}, "updatedAt" = NOW()
    WHERE id = ${id}::uuid
  `;
  return r;
}

/** POST /api/pg/customer/addcustomer */
const createCustomer = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const {
    firmName,
    country,
    address,
    code,
    phone,
    mail,
    website,
    personName,
    personTitle,
    saveDate,
    rating,
  } = req.body || {};

  if (!firmName || !String(firmName).trim()) {
    return next(new CustomError("Firma adi zorunludur", 400));
  }

  const initialRating =
    rating != null && rating !== "" ? clampRating(rating) : 0;

  const customer = await prisma.customer.create({
    data: {
      companyId,
      firmName: String(firmName).trim(),
      country: country || null,
      address: address || null,
      code: code || null,
      phone: phone || null,
      mail: mail || null,
      website: website || null,
      personName: personName || null,
      personTitle: personTitle || null,
      saveDate: saveDate ? new Date(saveDate) : undefined,
    },
  });

  let savedRating = 0;
  try {
    savedRating = await persistRating(prisma, customer.id, initialRating);
  } catch (err) {
    console.warn("[pg/customer] rating create:", err?.message);
  }

  res.status(201).json({ success: true, data: shape(customer, savedRating) });
});

/** GET /api/pg/customer */
const getCustomers = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const customers = await prisma.customer.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  const ratingById = await loadRatingMap(prisma, companyId);

  res.status(200).json({
    success: true,
    data: customers.map((c) => shape(c, ratingById[c.id])),
  });
});

/** GET /api/pg/customer/:id (ekstra: Mongo tarafinda yoktu ama UI'da gerekiyor olabilir) */
const getOne = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const customer = await prisma.customer.findFirst({
    where: { id, companyId },
  });
  if (!customer) return next(new CustomError("Musteri bulunamadi", 404));

  const ratingById = await loadRatingMap(prisma, companyId);
  res.json({ success: true, data: shape(customer, ratingById[id]) });
});

/** PATCH /api/pg/customer/:id */
const updateCustomer = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.customer.findFirst({ where: { id, companyId } });
  if (!target) return next(new CustomError("Musteri bulunamadi", 404));

  const allowed = [
    "firmName",
    "country",
    "address",
    "code",
    "phone",
    "mail",
    "website",
    "personName",
    "personTitle",
    "isActive",
  ];
  const ratingPatch = parseRatingFromBody(req.body);
  const data = {};
  for (const k of allowed) {
    if (k in (req.body || {})) data[k] = req.body[k];
  }
  if (req.body?.saveDate) data.saveDate = new Date(req.body.saveDate);

  if (!Object.keys(data).length && ratingPatch === null) {
    return next(new CustomError("Guncellenecek alan yok", 400));
  }

  let customer = target;
  if (Object.keys(data).length) {
    customer = await prisma.customer.update({ where: { id }, data });
  }

  let savedRating = ratingPatch;
  if (ratingPatch !== null) {
    try {
      savedRating = await persistRating(prisma, id, ratingPatch);
    } catch (err) {
      return next(new CustomError("Rating kaydedilemedi", 500));
    }
  } else {
    const ratingById = await loadRatingMap(prisma, companyId);
    savedRating = ratingById[id] ?? 0;
  }

  res.json({ success: true, data: shape(customer, savedRating) });
});

/** DELETE /api/pg/customer/:id */
const deleteCustomer = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.customer.findFirst({ where: { id, companyId } });
  if (!target) return next(new CustomError("Musteri bulunamadi", 404));

  await prisma.customer.delete({ where: { id } });
  res.json({ success: true, message: "Musteri silindi" });
});

module.exports = {
  createCustomer,
  getCustomers,
  getOne,
  updateCustomer,
  deleteCustomer,
};
