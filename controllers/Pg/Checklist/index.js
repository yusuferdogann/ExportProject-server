/**
 * /api/pg/checklist — Prisma/PostgreSQL Checklist controller.
 *
 * Mongo karsiligi: server/controllers/CheckList/index.js
 *  POST /addchecklist   olustur + PDF + Cloudinary (best-effort)
 *  GET  /                company scoped, customer include
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const {
  generatePdfSafe,
  uploadPdfSafe,
  cloudResultToDocument,
} = require("../_docHelpers");

const VALID_LANG = new Set(["tr", "en"]);

/** POST /api/pg/checklist/addchecklist */
const createChecklist = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }

  const {
    customerId,
    invoiceNumber,
    truckPlate,
    note,
    products,
    totalPrice,
    totalNetWeight,
    totalGrossWeight,
    totalPackageCount,
    language = "tr",
  } = req.body || {};

  if (!invoiceNumber) {
    return res
      .status(400)
      .json({ success: false, message: "invoiceNumber zorunludur" });
  }

  let customerDoc = null;
  if (customerId) {
    customerDoc = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
    });
    if (!customerDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Musteri bulunamadi" });
    }
  }

  const lang = VALID_LANG.has(language) ? language : "tr";

  const checklist = await prisma.checklist.create({
    data: {
      companyId,
      customerId: customerDoc ? customerDoc.id : null,
      invoiceNumber,
      truckPlate: truckPlate || null,
      note: note || null,
      products: products ?? undefined,
      totalPrice: Number(totalPrice ?? 0),
      totalNetWeight: Number(totalNetWeight ?? 0),
      totalGrossWeight: Number(totalGrossWeight ?? 0),
      totalPackageCount: Number(totalPackageCount ?? 0),
      language: lang,
    },
  });

  const data = { ...checklist, customer: customerDoc || {} };
  const pdfBuffer = await generatePdfSafe("checklist", data, { lang });
  const cloudResult = await uploadPdfSafe(
    pdfBuffer,
    `checklist-${checklist.invoiceNumber}`,
    "checklists"
  );
  const doc = cloudResultToDocument(cloudResult);

  let saved = checklist;
  if (doc) {
    saved = await prisma.checklist.update({
      where: { id: checklist.id },
      data: { document: doc },
    });
  }

  res.status(201).json({ success: true, data: saved });
});

/** GET /api/pg/checklist */
const getChecklists = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }
  const checklists = await prisma.checklist.findMany({
    where: { companyId },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ success: true, data: checklists });
});

module.exports = { createChecklist, getChecklists };
