const asyncErrorWrapper = require("express-async-handler");
const ProductDiscount = require("../../models/ProductDiscount");
const Product = require("../../models/Product");

const getByWorker = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const { userId: targetUserId } = req.query;

  const uid = targetUserId || userId;
  const discounts = await ProductDiscount.find({
    companyId,
    userId: uid,
  })
    .populate("productId", "code name unit defaultPrice type")
    .lean();

  const data = discounts.map((d) => ({
    _id: d._id,
    productId: d.productId,
    product: d.productId,
    productName: d.productName,
    productType: d.productType,
    discountPercent: d.discountPercent,
  }));

  res.json({ success: true, data });
});

const getByProduct = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { productId } = req.query;

  if (!productId) {
    return res.status(400).json({ success: false, message: "productId gerekli" });
  }

  const discounts = await ProductDiscount.find({
    companyId,
    productId,
  })
    .populate("userId", "username email")
    .lean();

  res.json({ success: true, data: discounts });
});

const upsert = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { productId, userId, discountPercent } = req.body;

  if (!productId || !userId || discountPercent == null) {
    return res.status(400).json({
      success: false,
      message: "Ürün, çalışan ve iskonto oranı zorunludur",
    });
  }

  const pct = Math.max(0, Math.min(100, Number(discountPercent)));
  const product = await Product.findById(productId).select("name type").lean();
  const update = {
    discountPercent: pct,
    ...(product && {
      productName: product.name,
      productType: product.type ?? "",
    }),
  };

  const doc = await ProductDiscount.findOneAndUpdate(
    { companyId, productId, userId },
    update,
    { new: true, upsert: true }
  )
    .populate("productId", "code name unit defaultPrice type")
    .populate("userId", "username email")
    .lean();

  res.json({ success: true, data: doc });
});

const bulkUpsert = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { items } = req.body;

  console.log("[ProductDiscount bulkUpsert] ÇAĞRILDI companyId:", companyId, "items:", JSON.stringify(items));

  if (!Array.isArray(items) || items.length === 0) {
    console.log("[ProductDiscount bulkUpsert] items boş veya geçersiz, 400 dön");
    return res.status(400).json({ success: false, message: "items array gerekli" });
  }

  const results = [];
  for (const it of items) {
    const { productId, userId, discountPercent } = it;
    if (!productId || !userId || discountPercent == null) {
      console.log("[ProductDiscount bulkUpsert] atlanan item:", it);
      continue;
    }

    const pct = Math.max(0, Math.min(100, Number(discountPercent)));
    const product = await Product.findById(productId).select("name type").lean();
    const update = {
      discountPercent: pct,
      ...(product && {
        productName: product.name,
        productType: product.type ?? "",
      }),
    };

    const doc = await ProductDiscount.findOneAndUpdate(
      { companyId, productId, userId },
      update,
      { new: true, upsert: true }
    )
      .populate("productId", "code name unit defaultPrice type")
      .populate("userId", "username email")
      .lean();
    results.push(doc);
    console.log("[ProductDiscount bulkUpsert] kaydedildi:", doc?._id);
  }

  console.log("[ProductDiscount bulkUpsert] bitti, toplam:", results.length);
  res.json({ success: true, data: results });
});

module.exports = {
  getByWorker,
  getByProduct,
  upsert,
  bulkUpsert,
};
