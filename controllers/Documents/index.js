const axios = require("axios");
const cloudinary = require("../../config/cloudinary.config");
const Invoice = require("../../models/Invoice");
const Checklist = require("../../models/Checklist");
const Proforma = require("../../models/Proforma");
const PriceOffer = require("../../models/PriceOffer");
const {
  generateInvoicePdf,
  generateChecklistPdf,
  generateProformaPdf,
  generatePriceQuotePdf,
} = require("../../services/pdfService");

const MODELS = {
  invoices: Invoice,
  checklists: Checklist,
  proformas: Proforma,
  priceQuotes: PriceOffer,
};

const getDisplayName = (entity, type) => {
  if (type === "invoices") return entity.invoiceNo;
  if (type === "checklists") return entity.invoiceNumber;
  if (type === "proformas") return entity.quoteNumber;
  if (type === "priceQuotes") return entity?.priceInfo?.quoteNumber;
  return "document";
};

/** public_id ile Cloudinary signed URL üret - 401/restricted erişim için gerekli */
const getCloudinaryPdfUrl = (doc) => {
  if (!doc) return null;
  const publicId = doc.public_id;
  if (!publicId) return doc.secure_url || null;
  return cloudinary.url(publicId, {
    resource_type: "raw",
    format: "pdf",
    sign_url: true,
    secure: true,
  });
};

/** Cloudinary erişilemezse memory üzerinden PDF oluştur ve gönder. Desteklenen tipler: invoices, checklists, proformas, priceQuotes */
const tryFallbackByType = async (entity, type, res, disposition = "inline") => {
  let pdfBuffer;
  let filename;
  if (type === "invoices") {
    const data = {
      ...entity,
      bank: entity.bank || { name: "", branch: "", swift: "", iban: "" },
      products: entity.products || [],
    };
    pdfBuffer = await generateInvoicePdf(data);
    filename = `invoice-${entity.invoiceNo}.pdf`;
  } else if (type === "checklists") {
    pdfBuffer = await generateChecklistPdf(entity, entity.language || "tr");
    filename = `checklist-${entity.invoiceNumber}.pdf`;
  } else if (type === "proformas") {
    pdfBuffer = await generateProformaPdf(entity);
    filename = `proforma-${entity.quoteNumber}.pdf`;
  } else if (type === "priceQuotes") {
    pdfBuffer = await generatePriceQuotePdf(entity);
    const qn = entity.priceInfo?.quoteNumber || entity._id;
    filename = `pricequote-${qn}.pdf`;
  } else {
    return false;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename=${filename}`);
  res.send(pdfBuffer);
  return true;
};

/** Cloudinary 401/403/404 veya JSON hata (untrusted vb.) döndü mü kontrol et */
const isCloudinaryBlocked = (response) => {
  if (!response || !response.data) return true;
  const status = response.status;
  const data = response.data;
  if (status === 401 || status === 403 || status === 404) return true;
  if (Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7b) return true; // { ile başlıyorsa JSON
  const ct = response.headers?.["content-type"] || "";
  if (ct.includes("application/json")) return true;
  return false;
};

/** Untrusted hatası gelirse konsola Cloudinary ayar uyarısı */
const logCloudinaryUntrustedHint = (response) => {
  if (!response?.data || !Buffer.isBuffer(response.data)) return;
  try {
    const str = response.data.toString("utf8").slice(0, 200);
    if (str.includes("show_original_customer_untrusted") || str.includes("Customer is marked as untrusted")) {
      console.warn(
        "[Cloudinary] PDF teslimi engelli. Çözüm: https://console.cloudinary.com → Settings → Security → 'Allow delivery of PDF and ZIP files' işaretleyin."
      );
    }
  } catch (e) {}
};

/**
 * Tüm belge tipleri için Cloudinary proxy - 404/403 veya untrusted hatası olursa Invoice için local fallback
 */
const previewDocument = async (req, res) => {
  try {
    const { type, id } = req.params;
    const companyId = req.user?.companyId || req.user?.id;

    const Model = MODELS[type];
    if (!Model) return res.status(400).json({ message: "Geçersiz belge tipi" });

    const filter = { _id: id };
    if (companyId) filter.companyId = companyId;

    const entity = await Model.findOne(filter).lean();
    if (!entity) return res.status(404).send("Belge bulunamadı");

    const doc = entity?.document;
    const pdfUrl = getCloudinaryPdfUrl(doc);

    if (pdfUrl) {
      try {
        const response = await axios.get(pdfUrl, {
          responseType: "arraybuffer",
          validateStatus: () => true,
        });
        if (!isCloudinaryBlocked(response)) {
          const name = getDisplayName(entity, type);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename=${name}.pdf`);
          res.send(Buffer.from(response.data));
          return;
        }
        logCloudinaryUntrustedHint(response);
      } catch (cloudErr) {
        // axios network error vb.
      }
      if (await tryFallbackByType(entity, type, res, "inline")) return;
    }

    if (await tryFallbackByType(entity, type, res, "inline")) return;

    return res.status(404).send("PDF bulunamadı");
  } catch (error) {
    console.error("[previewDocument]", error);
    res.status(500).send(error?.message || "PDF yüklenemedi");
  }
};

const downloadDocument = async (req, res) => {
  try {
    const { type, id } = req.params;
    const companyId = req.user?.companyId || req.user?.id;

    const Model = MODELS[type];
    if (!Model) return res.status(400).json({ message: "Geçersiz belge tipi" });

    const filter = { _id: id };
    if (companyId) filter.companyId = companyId;

    const entity = await Model.findOne(filter).lean();
    if (!entity) return res.status(404).send("Belge bulunamadı");

    const doc = entity?.document;
    const pdfUrl = getCloudinaryPdfUrl(doc);

    if (pdfUrl) {
      try {
        const response = await axios.get(pdfUrl, {
          responseType: "arraybuffer",
          validateStatus: () => true,
        });
        if (!isCloudinaryBlocked(response)) {
          const name = getDisplayName(entity, type);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename=${name}.pdf`);
          res.send(Buffer.from(response.data));
          return;
        }
        logCloudinaryUntrustedHint(response);
      } catch (cloudErr) {
        // axios network error vb.
      }
      if (await tryFallbackByType(entity, type, res, "attachment")) return;
    }

    if (await tryFallbackByType(entity, type, res, "attachment")) return;

    return res.status(404).send("PDF bulunamadı");
  } catch (error) {
    console.error("[downloadDocument]", error);
    res.status(500).send(error?.message || "PDF indirilemedi");
  }
};

module.exports = {
  previewDocument,
  downloadDocument,
};
