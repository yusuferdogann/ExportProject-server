/**
 * /api/pg doc controller'larinin ortak yardimcilari.
 *
 * - generatePdfSafe: PDF generation hata verirse undefined doner, log atar.
 * - uploadPdfSafe:   Cloudinary upload hata verirse undefined doner, log atar.
 *
 * Boylece PG endpoint'ler PDF/Cloudinary bagimliligi olmadan da calisir.
 */

let pdfServiceCache;
function pdfService() {
  if (!pdfServiceCache) {
    pdfServiceCache = require("../../services/pdfService");
  }
  return pdfServiceCache;
}

async function generatePdfSafe(kind, data, opts = {}) {
  try {
    const svc = pdfService();
    switch (kind) {
      case "invoice":
        return await svc.generateInvoicePdf(data);
      case "proforma":
        return await svc.generateProformaPdf(data);
      case "checklist":
        return await svc.generateChecklistPdf(data, opts.lang || "tr");
      case "pricequote":
        return await svc.generatePriceQuotePdf(data);
      default:
        return undefined;
    }
  } catch (err) {
    console.warn(`[pg-doc] PDF (${kind}) uretilemedi:`, err?.message || err);
    return undefined;
  }
}

async function uploadPdfSafe(pdfBuffer, fileName, folder) {
  if (!pdfBuffer) return undefined;
  try {
    const svc = pdfService();
    return await svc.uploadPdfToCloudinary(pdfBuffer, fileName, folder);
  } catch (err) {
    console.warn(
      `[pg-doc] Cloudinary upload basarisiz (${fileName}):`,
      err?.message || err
    );
    return undefined;
  }
}

function cloudResultToDocument(cloudResult) {
  if (!cloudResult) return undefined;
  return {
    public_id: cloudResult.public_id,
    secure_url: cloudResult.secure_url,
    asset_id: cloudResult.asset_id,
    version: cloudResult.version,
    resource_type: cloudResult.resource_type || "raw",
  };
}

module.exports = {
  generatePdfSafe,
  uploadPdfSafe,
  cloudResultToDocument,
};
