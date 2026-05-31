/**
 * /api/pg/proforma — Prisma/PostgreSQL Proforma controller.
 *
 * Mongo karsiligi: server/controllers/Proforma/index.js
 * - POST /addproforma   yeni proforma + PDF + (opsiyonel) Cloudinary
 * - GET  /              company scoped, customer include
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const {
  generatePdfSafe,
  uploadPdfSafe,
  cloudResultToDocument,
} = require("../_docHelpers");

/** POST /api/pg/proforma/addproforma */
const createProforma = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }

  const {
    customerId,
    delivery,
    deliveryInfo,
    quoteNumber,
    invoiceDate,
    validUntil,
    bankInfo,
    originCountry,
    gtipCode,
    note,
    totalNetWeight,
    totalGrossWeight,
    totalPackageCount,
  } = req.body || {};

  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunludur" });
  }
  if (!quoteNumber || !invoiceDate || !validUntil) {
    return res.status(400).json({
      success: false,
      message: "quoteNumber, invoiceDate ve validUntil zorunludur",
    });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
  });
  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: "Musteri bulunamadi" });
  }

  const deliveryData =
    delivery ||
    (deliveryInfo && {
      type: deliveryInfo.deliveryType,
      vehicle: deliveryInfo.deliveryVehicle,
      point: deliveryInfo.deliveryPoint,
    });

  const proforma = await prisma.proforma.create({
    data: {
      companyId,
      customerId: customer.id,
      delivery: deliveryData ?? undefined,
      bankInfo: bankInfo ?? undefined,
      quoteNumber,
      invoiceDate: new Date(invoiceDate),
      validUntil: new Date(validUntil),
      originCountry: originCountry || null,
      gtipCode: gtipCode || null,
      note: note || null,
      totalNetWeight: Number(totalNetWeight ?? 0),
      totalGrossWeight: Number(totalGrossWeight ?? 0),
      totalPackageCount: Number(totalPackageCount ?? 0),
    },
  });

  // PDF + Cloudinary (best-effort)
  const data = { ...proforma, customer };
  const pdfBuffer = await generatePdfSafe("proforma", data);
  const cloudResult = await uploadPdfSafe(
    pdfBuffer,
    `proforma-${proforma.quoteNumber}`,
    "proformas"
  );
  const doc = cloudResultToDocument(cloudResult);
  let saved = proforma;
  if (doc) {
    saved = await prisma.proforma.update({
      where: { id: proforma.id },
      data: { document: doc },
    });
  }

  res.status(201).json({ success: true, data: saved });
});

/** GET /api/pg/proforma */
const getProformas = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }

  const proformas = await prisma.proforma.findMany({
    where: { companyId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({ success: true, data: proformas });
});

module.exports = { createProforma, getProformas };
