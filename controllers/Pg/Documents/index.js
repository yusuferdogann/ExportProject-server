/**
 * /api/pg/documents — Prisma/PostgreSQL Documents controller.
 *
 * Mongo karsiligi: server/controllers/Documents/index.js
 *  GET /preview/:type/:id    Cloudinary varsa proxy, yoksa local PDF
 *  GET /download/:type/:id   ayni; attachment olarak
 *
 * Desteklenen type: invoices | proformas | checklists | priceQuotes
 */

const asyncErrorWrapper = require("express-async-handler");
const axios = require("axios");
const { getPrisma } = require("../../../db/prisma");
const { generatePdfSafe } = require("../_docHelpers");

let cloudinaryCache;
function cloudinary() {
  if (cloudinaryCache === undefined) {
    try {
      cloudinaryCache = require("../../../config/cloudinary.config");
    } catch (_) {
      cloudinaryCache = null;
    }
  }
  return cloudinaryCache;
}

const MODEL_MAP = {
  invoices: { delegate: "invoice", pdfKind: "invoice" },
  proformas: { delegate: "proforma", pdfKind: "proforma" },
  checklists: { delegate: "checklist", pdfKind: "checklist" },
  priceQuotes: { delegate: "priceOffer", pdfKind: "pricequote" },
};

const getDisplayName = (entity, type) => {
  if (type === "invoices") return entity.invoiceNo;
  if (type === "checklists") return entity.invoiceNumber;
  if (type === "proformas") return entity.quoteNumber;
  if (type === "priceQuotes") return entity?.priceInfo?.quoteNumber;
  return "document";
};

const cloudinaryBlocked = (response) => {
  if (!response?.data) return true;
  if ([401, 403, 404].includes(response.status)) return true;
  const buf = response.data;
  if (Buffer.isBuffer(buf) && buf.length > 0 && buf[0] === 0x7b) return true;
  if ((response.headers || {})["content-type"]?.includes("application/json"))
    return true;
  return false;
};

const getCloudinaryPdfUrl = (doc) => {
  if (!doc) return null;
  const cl = cloudinary();
  if (cl && doc.public_id) {
    return cl.url(doc.public_id, {
      resource_type: "raw",
      format: "pdf",
      sign_url: true,
      secure: true,
    });
  }
  return doc.secure_url || null;
};

async function fetchEntity(prisma, type, id, companyId) {
  const cfg = MODEL_MAP[type];
  if (!cfg) return null;
  const where = { id };
  if (companyId) where.companyId = companyId;
  if (cfg.delegate === "invoice") where.isDeleted = false;
  return prisma[cfg.delegate].findFirst({
    where,
    include: { customer: true },
  });
}

async function streamEntityPdf(req, res, disposition) {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { type, id } = req.params;

  const cfg = MODEL_MAP[type];
  if (!cfg) {
    return res.status(400).json({ message: "Gecersiz belge tipi" });
  }

  const entity = await fetchEntity(prisma, type, id, companyId);
  if (!entity) return res.status(404).send("Belge bulunamadi");

  const pdfUrl = getCloudinaryPdfUrl(entity.document);
  const name = getDisplayName(entity, type);

  if (pdfUrl) {
    try {
      const response = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        validateStatus: () => true,
      });
      if (!cloudinaryBlocked(response)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `${disposition}; filename=${name}.pdf`
        );
        return res.send(Buffer.from(response.data));
      }
    } catch (_) {
      // local fallback
    }
  }

  // Local PDF generate
  let pdfBuffer;
  if (cfg.pdfKind === "invoice") {
    pdfBuffer = await generatePdfSafe("invoice", {
      ...entity,
      bank: entity.bank || { name: "", branch: "", swift: "", iban: "" },
      products: entity.products || [],
    });
  } else if (cfg.pdfKind === "proforma") {
    pdfBuffer = await generatePdfSafe("proforma", entity);
  } else if (cfg.pdfKind === "checklist") {
    pdfBuffer = await generatePdfSafe("checklist", entity, {
      lang: entity.language || "tr",
    });
  } else if (cfg.pdfKind === "pricequote") {
    pdfBuffer = await generatePdfSafe("pricequote", entity);
  }
  if (!pdfBuffer) {
    return res.status(404).send("PDF bulunamadi");
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename=${name}.pdf`
  );
  res.send(pdfBuffer);
}

const previewDocument = asyncErrorWrapper(async (req, res, next) => {
  await streamEntityPdf(req, res, "inline");
});

const downloadDocument = asyncErrorWrapper(async (req, res, next) => {
  await streamEntityPdf(req, res, "attachment");
});

module.exports = { previewDocument, downloadDocument };
