/**
 * /api/pg/pricequote — Prisma/PostgreSQL PriceOffer controller.
 *
 * Mongo karsiligi: server/controllers/PriceOffer/index.js
 *  POST /addpricequote   olustur + PDF + Cloudinary + Approval kaydi ac
 *  GET  /                 company scoped
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const {
  generatePdfSafe,
  uploadPdfSafe,
  cloudResultToDocument,
} = require("../_docHelpers");

/** POST /api/pg/pricequote/addpricequote */
const createPriceQuote = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }

  const {
    customerId,
    products = [],
    delivery = {},
    priceInfo = {},
    destinationCountry,
  } = req.body || {};

  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunludur" });
  }
  if (!destinationCountry) {
    return res
      .status(400)
      .json({ success: false, message: "destinationCountry zorunludur" });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: "Musteri bulunamadi" });
  }

  const cleanProducts = (Array.isArray(products) ? products : []).map((p) => {
    const qty = Number(p?.quantity || 0);
    const price = Number(p?.price || 0);
    return {
      name: p?.name,
      unit: p?.unit,
      quantity: qty,
      price,
      photo: p?.photo || "",
      total: Number(p?.total ?? qty * price),
    };
  });

  const cleanDelivery = {
    type: delivery?.type,
    vehicle: delivery?.vehicle,
    point: delivery?.point,
  };
  const cleanPrice = {
    quoteNumber: priceInfo?.quoteNumber,
    invoiceDate: priceInfo?.invoiceDate,
    validUntil: priceInfo?.validUntil,
  };

  const quote = await prisma.priceOffer.create({
    data: {
      companyId,
      customerId: customer.id,
      products: cleanProducts,
      delivery: cleanDelivery,
      priceInfo: cleanPrice,
      destinationCountry,
      status: "pending_approval",
    },
  });

  // PDF + Cloudinary
  const data = { ...quote, customer };
  const pdfBuffer = await generatePdfSafe("pricequote", data);
  const qn = cleanPrice.quoteNumber || quote.id;
  const cloudResult = await uploadPdfSafe(
    pdfBuffer,
    `pricequote-${qn}`,
    "pricequotes"
  );
  const doc = cloudResultToDocument(cloudResult);
  if (doc) {
    await prisma.priceOffer.update({
      where: { id: quote.id },
      data: { document: doc },
    });
  }

  // Approval olustur
  const approval = await prisma.approval.create({
    data: {
      companyId,
      createdById: userId,
      entityType: "pricequote",
      entityId: quote.id,
      status: "pending",
      currentStep: 1,
    },
  });
  const step = await prisma.approvalStep.create({
    data: {
      approvalId: approval.id,
      stepOrder: 1,
      role: "manager",
      status: "pending",
    },
  });
  await prisma.approvalLog.create({
    data: {
      approvalId: approval.id,
      stepId: step.id,
      action: "created",
      userId,
      comment: "Fiyat teklifi olusturuldu",
    },
  });

  const final = await prisma.priceOffer.update({
    where: { id: quote.id },
    data: { approvalId: approval.id, submittedAt: new Date() },
  });

  res.status(201).json({ success: true, data: final });
});

/** GET /api/pg/pricequote */
const getPriceQuotes = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }
  const quotes = await prisma.priceOffer.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ success: true, data: quotes });
});

module.exports = { createPriceQuote, getPriceQuotes };
