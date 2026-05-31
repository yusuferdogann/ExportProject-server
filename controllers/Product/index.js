const asyncErrorWrapper = require("express-async-handler");
const Product = require("../../models/Product");

const getProducts = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const products = await Product.find({ companyId }).sort({ code: 1 }).lean();
  res.json({ success: true, data: products });
});

const createProduct = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { code, name, type, unit, defaultPrice, customerId } = req.body;

  if (!code?.trim() || !name?.trim() || defaultPrice == null) {
    return res.status(400).json({ success: false, message: "Ürün kodu, ad ve birim fiyat zorunludur" });
  }

  const existing = await Product.findOne({ companyId, code: code.trim() });
  if (existing) {
    return res.status(400).json({ success: false, message: "Bu ürün kodu zaten mevcut" });
  }

  const product = await Product.create({
    companyId,
    tenantId: req.headers["x-tenant"] || null,
    createdBy: userId,
    customerId: customerId || null,
    code: code.trim(),
    name: name.trim(),
    type: type != null ? String(type).trim() : undefined,
    unit: unit || "Adet",
    defaultPrice: Number(defaultPrice),
  });

  res.status(201).json({ success: true, data: product });
});

const bulkCreateProducts = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Eklenecek ürün bulunamadı" });
  }

  const tenantId = req.headers["x-tenant"] || null;

  const results = [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i] || {};
    const name = (row.name || row.productName || "").trim();
    const unit = row.unit || "Adet";
    const defaultPrice = row.defaultPrice ?? row.price;

    if (!name || defaultPrice == null) continue;

    // Otomatik ürün kodu üret
    const base =
      row.code ||
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) ||
      "PRD";

    let code = base;
    let suffix = 1;
    // Aynı company+code varsa sonuna sayı ekle
    // eslint-disable-next-line no-await-in-loop
    while (await Product.findOne({ companyId, code })) {
      code = `${base}${suffix}`;
      suffix += 1;
    }

    const product = await Product.create({
      companyId,
      tenantId,
      createdBy: userId,
      customerId: row.customerId || null,
      code,
      name,
      type: type || undefined,
      unit,
      defaultPrice: Number(defaultPrice),
    });
    results.push(product);
  }

  res.status(201).json({ success: true, data: results });
});

module.exports = { getProducts, createProduct, bulkCreateProducts };
