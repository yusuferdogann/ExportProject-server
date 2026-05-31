/**
 * /api/pg/products — Prisma/PostgreSQL Product controller.
 *
 * Mongo karsiligi: server/controllers/Product/index.js
 * - GET /         → companyId scoped, code ASC
 * - POST /        → tekil ekleme, (companyId, code) unique
 * - POST /bulk    → toplu ekleme, otomatik kod uretimi
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

function shape(p) {
  if (!p) return p;
  return {
    _id: p.id,
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    unit: p.unit,
    defaultPrice: p.defaultPrice,
    tenantId: p.tenantId,
    companyId: p.companyId,
    customerId: p.customerId,
    createdBy: p.createdById,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** GET /api/pg/products */
const getProducts = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const products = await prisma.product.findMany({
    where: { companyId },
    orderBy: { code: "asc" },
  });

  res.json({ success: true, data: products.map(shape) });
});

/** POST /api/pg/products */
const createProduct = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const { code, name, type, unit, defaultPrice, customerId } = req.body || {};

  if (!code?.trim() || !name?.trim() || defaultPrice == null) {
    return res.status(400).json({
      success: false,
      message: "Urun kodu, ad ve birim fiyat zorunludur",
    });
  }

  const cleanCode = String(code).trim();
  const existing = await prisma.product.findFirst({
    where: { companyId, code: cleanCode },
  });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Bu urun kodu zaten mevcut",
    });
  }

  const product = await prisma.product.create({
    data: {
      companyId,
      tenantId: req.headers["x-tenant"] || null,
      createdById: userId || null,
      customerId: customerId || null,
      code: cleanCode,
      name: String(name).trim(),
      type: type != null ? String(type).trim() : null,
      unit: unit || "Adet",
      defaultPrice: Number(defaultPrice),
    },
  });

  res.status(201).json({ success: true, data: shape(product) });
});

/** POST /api/pg/products/bulk */
const bulkCreateProducts = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Eklenecek urun bulunamadi",
    });
  }

  const tenantId = req.headers["x-tenant"] || null;
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const row = items[i] || {};
    const name = String(row.name || row.productName || "").trim();
    const unit = row.unit || "Adet";
    const defaultPrice = row.defaultPrice ?? row.price;
    if (!name || defaultPrice == null) continue;

    const base =
      row.code ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) ||
      "PRD";

    let code = String(base).trim();
    let suffix = 1;
    while (await prisma.product.findFirst({ where: { companyId, code } })) {
      code = `${base}${suffix}`;
      suffix += 1;
    }

    const product = await prisma.product.create({
      data: {
        companyId,
        tenantId,
        createdById: userId || null,
        customerId: row.customerId || null,
        code,
        name,
        type: row.type != null ? String(row.type).trim() : null,
        unit,
        defaultPrice: Number(defaultPrice),
      },
    });
    results.push(product);
  }

  res.status(201).json({ success: true, data: results.map(shape) });
});

module.exports = {
  getProducts,
  createProduct,
  bulkCreateProducts,
};
