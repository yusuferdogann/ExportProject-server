/**
 * /api/pg/invoice — Prisma/PostgreSQL Invoice controller.
 *
 * Mongo karsiligi: server/controllers/Invoice/index.js
 *  POST   /addinvoice         olustur + PDF + Cloudinary (best-effort)
 *  GET    /                    company scoped, customer + approval include
 *  POST   /:id/submit          draft -> pending_approval, Approval kaydi ac
 *  GET    /:id/preview         PDF inline (Cloudinary varsa, yoksa local generate)
 *  GET    /:id/download        PDF attachment
 *  GET    /:id/generate-pdf    PDF tekrar uret + Cloudinary upload
 */

const asyncErrorWrapper = require("express-async-handler");
const axios = require("axios");
const { getPrisma } = require("../../../db/prisma");
const {
  generatePdfSafe,
  uploadPdfSafe,
  cloudResultToDocument,
} = require("../_docHelpers");

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

/** POST /api/pg/invoice/addinvoice */
const createInvoice = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }

  const {
    invoiceNo,
    invoiceDate,
    delivery,
    destinationCountry,
    gtip,
    bank,
    products,
    totalAmount,
    customerId,
  } = req.body || {};

  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunludur" });
  }
  if (!invoiceNo || !invoiceDate) {
    return res.status(400).json({
      success: false,
      message: "invoiceNo ve invoiceDate zorunludur",
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

  // unique guard (companyId+invoiceNo @@unique)
  const dup = await prisma.invoice.findFirst({
    where: { companyId, invoiceNo },
  });
  if (dup) {
    return res.status(400).json({
      success: false,
      message: "Bu fatura numarasi zaten mevcut.",
    });
  }

  const invoice = await prisma.invoice.create({
    data: {
      companyId,
      customerId: customer.id,
      invoiceNo,
      invoiceDate: new Date(invoiceDate),
      delivery: delivery || null,
      destinationCountry: destinationCountry || null,
      gtip: gtip || null,
      bank: bank ?? undefined,
      products: products ?? undefined,
      totalAmount: Number(totalAmount ?? 0),
      status: "draft",
      documentStatus: "pending",
      isDeleted: false,
    },
  });

  const data = {
    ...invoice,
    bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
    products: invoice.products || [],
  };
  const pdfBuffer = await generatePdfSafe("invoice", data);
  const cloudResult = await uploadPdfSafe(
    pdfBuffer,
    `invoice-${invoice.invoiceNo}`,
    "invoices"
  );
  const doc = cloudResultToDocument(cloudResult);

  let saved = invoice;
  if (doc) {
    saved = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { document: doc, documentStatus: "generated" },
    });
  }

  res.status(201).json({ success: true, data: saved });
});

/** GET /api/pg/invoice */
const getInvoices = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi yok" });
  }
  const invoices = await prisma.invoice.findMany({
    where: { companyId, isDeleted: false },
    include: { customer: true, approval: true },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ success: true, data: invoices });
});

/** POST /api/pg/invoice/:id/submit */
const submitInvoice = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { id } = req.params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, isDeleted: false },
  });
  if (!invoice) {
    return res.status(404).json({ message: "Invoice bulunamadi" });
  }
  if (invoice.status !== "draft") {
    return res
      .status(400)
      .json({ message: "Sadece draft invoice submit edilebilir" });
  }

  const approval = await prisma.approval.create({
    data: {
      companyId,
      createdById: userId,
      entityType: "invoice",
      entityId: invoice.id,
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
      comment: "Invoice icin talep olusturuldu",
    },
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "pending_approval",
      submittedAt: new Date(),
      approvalId: approval.id,
    },
  });

  res.status(200).json({ success: true, data: updated });
});

async function streamInvoicePdf(prisma, req, res, disposition) {
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, isDeleted: false },
  });
  if (!invoice) return res.status(404).send("Invoice bulunamadi");

  const pdfUrl = getCloudinaryPdfUrl(invoice.document);
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
          `${disposition}; filename=invoice-${invoice.invoiceNo}.pdf`
        );
        return res.send(Buffer.from(response.data));
      }
    } catch (_) {
      // fallback to local generate
    }
  }

  const data = {
    ...invoice,
    bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
    products: invoice.products || [],
  };
  const pdfBuffer = await generatePdfSafe("invoice", data);
  if (!pdfBuffer) return res.status(500).send("PDF olusturulamadi");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename=invoice-${invoice.invoiceNo}.pdf`
  );
  res.send(pdfBuffer);
}

const previewInvoice = asyncErrorWrapper(async (req, res, next) => {
  await streamInvoicePdf(getPrisma(), req, res, "inline");
});

const downloadInvoicePdf = asyncErrorWrapper(async (req, res, next) => {
  await streamInvoicePdf(getPrisma(), req, res, "attachment");
});

const generateInvoicePdfController = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, isDeleted: false },
  });
  if (!invoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  const allowed = invoice.status === "approved" || invoice.status === "draft";
  if (!allowed) {
    return res
      .status(400)
      .json({ message: "PDF sadece taslak veya onayli fatura icin uretilebilir" });
  }

  const data = {
    ...invoice,
    bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
    products: invoice.products || [],
  };
  const pdfBuffer = await generatePdfSafe("invoice", data);
  if (!pdfBuffer) {
    return res.status(500).json({ message: "PDF uretilemedi" });
  }

  const cloudResult = await uploadPdfSafe(
    pdfBuffer,
    `invoice-${invoice.invoiceNo}`,
    "invoices"
  );
  const doc = cloudResultToDocument(cloudResult);

  const updated = doc
    ? await prisma.invoice.update({
        where: { id: invoice.id },
        data: { document: doc, documentStatus: "generated" },
      })
    : invoice;

  res.status(200).json({ success: true, data: updated });
});

module.exports = {
  createInvoice,
  submitInvoice,
  getInvoices,
  previewInvoice,
  downloadInvoicePdf,
  generateInvoicePdfController,
};
