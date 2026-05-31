/**
 * /api/pg/product-discounts — Prisma/PostgreSQL ProductDiscount controller.
 *
 * Mongo karsiligi: server/controllers/ProductDiscount/index.js
 * - GET  /by-worker        ?userId=<opt>     → kullanici bazli liste
 * - GET  /by-product       ?productId=<req>  → urun bazli liste
 * - POST /upsert                              → tek kayit upsert
 * - POST /bulk-upsert                         → toplu upsert
 *
 * Mongoose populate karsiligi: Prisma `include` ile yapilir.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function shapeDiscount(d, opts = {}) {
  if (!d) return d;
  const out = {
    _id: d.id,
    id: d.id,
    productId: d.product
      ? {
          _id: d.product.id,
          id: d.product.id,
          code: d.product.code,
          name: d.product.name,
          unit: d.product.unit,
          defaultPrice: d.product.defaultPrice,
          type: d.product.type,
        }
      : d.productId,
    productName: d.productName,
    productType: d.productType,
    discountPercent: d.discountPercent,
    userId: d.user
      ? {
          _id: d.user.id,
          id: d.user.id,
          username: d.user.username,
          email: d.user.email,
        }
      : d.userId,
    companyId: d.companyId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
  if (opts.withProductAlias) out.product = out.productId;
  return out;
}

const productSelect = {
  id: true,
  code: true,
  name: true,
  unit: true,
  defaultPrice: true,
  type: true,
};
const userSelect = { id: true, username: true, email: true };

/** GET /api/pg/product-discounts/by-worker?userId= */
const getByWorker = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const callerId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const targetUserId = String(req.query.userId || "").trim() || callerId;

  const discounts = await prisma.productDiscount.findMany({
    where: { companyId, userId: targetUserId },
    include: { product: { select: productSelect } },
  });

  res.json({
    success: true,
    data: discounts.map((d) => shapeDiscount(d, { withProductAlias: true })),
  });
});

/** GET /api/pg/product-discounts/by-product?productId= */
const getByProduct = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const productId = String(req.query.productId || "").trim();
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));
  if (!productId) {
    return res
      .status(400)
      .json({ success: false, message: "productId gerekli" });
  }

  const discounts = await prisma.productDiscount.findMany({
    where: { companyId, productId },
    include: { user: { select: userSelect } },
  });

  res.json({ success: true, data: discounts.map((d) => shapeDiscount(d)) });
});

/** POST /api/pg/product-discounts/upsert */
const upsert = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const { productId, userId, discountPercent } = req.body || {};
  if (!productId || !userId || discountPercent == null) {
    return res.status(400).json({
      success: false,
      message: "Urun, calisan ve iskonto orani zorunludur",
    });
  }

  const pct = Math.max(0, Math.min(100, Number(discountPercent)));
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { name: true, type: true },
  });

  const doc = await prisma.productDiscount.upsert({
    where: {
      companyId_productId_userId: { companyId, productId, userId },
    },
    update: {
      discountPercent: pct,
      ...(product && {
        productName: product.name,
        productType: product.type ?? "",
      }),
    },
    create: {
      companyId,
      productId,
      userId,
      discountPercent: pct,
      productName: product?.name ?? null,
      productType: product?.type ?? "",
    },
    include: {
      product: { select: productSelect },
      user: { select: userSelect },
    },
  });

  res.json({ success: true, data: shapeDiscount(doc) });
});

/** POST /api/pg/product-discounts/bulk-upsert */
const bulkUpsert = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "items array gerekli" });
  }

  const results = [];
  for (const it of items) {
    const { productId, userId, discountPercent } = it || {};
    if (!productId || !userId || discountPercent == null) continue;
    const pct = Math.max(0, Math.min(100, Number(discountPercent)));

    const product = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { name: true, type: true },
    });

    const doc = await prisma.productDiscount.upsert({
      where: {
        companyId_productId_userId: { companyId, productId, userId },
      },
      update: {
        discountPercent: pct,
        ...(product && {
          productName: product.name,
          productType: product.type ?? "",
        }),
      },
      create: {
        companyId,
        productId,
        userId,
        discountPercent: pct,
        productName: product?.name ?? null,
        productType: product?.type ?? "",
      },
      include: {
        product: { select: productSelect },
        user: { select: userSelect },
      },
    });
    results.push(doc);
  }

  res.json({ success: true, data: results.map((d) => shapeDiscount(d)) });
});

module.exports = {
  getByWorker,
  getByProduct,
  upsert,
  bulkUpsert,
};
