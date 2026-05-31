const Invoice = require("../../models/Invoice");
const Approval = require("../../models/Approval");
const ApprovalStep = require("../../models/ApprovalStep");
const ApprovalLog = require("../../models/ApprovalLogs");
const axios = require("axios");
const path = require("path");
const cloudinary = require("../../config/cloudinary.config");
const mongoose = require("mongoose");
const fs = require("fs");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const { uploadPdfToCloudinary, generateInvoicePdf } = require("../../services/pdfService");

const createInvoice = async (req, res) => {
  try {
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
    } = req.body;

    const companyId = req.user.companyId || req.user.id;

    const invoice = await Invoice.create({
      companyId,
      customerId: customerId || new mongoose.Types.ObjectId(),
      invoiceNo,
      invoiceDate,
      delivery,
      destinationCountry,
      gtip,
      bank,
      products: products || [],
      totalAmount: totalAmount ?? 0,
      status: "draft",
      documentStatus: "pending",
      isDeleted: false,
    });

    // 1️⃣ PDF oluştur → 2️⃣ Cloudinary'e yükle → 3️⃣ MongoDB'ye document alanını ekle
    const data = {
      ...invoice.toObject(),
      bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
      products: invoice.products || [],
    };
    const pdfBuffer = await generateInvoicePdf(data);
    const cloudResult = await uploadPdfToCloudinary(pdfBuffer, `invoice-${invoice.invoiceNo}`);

    invoice.document = {
      public_id: cloudResult.public_id,
      secure_url: cloudResult.secure_url,
      asset_id: cloudResult.asset_id,
      version: cloudResult.version,
      resource_type: cloudResult.resource_type || "raw",
    };
    invoice.documentStatus = "generated";
    await invoice.save();

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Bu fatura numarası zaten mevcut.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Fatura oluşturulamadı",
      error: error.message,
    });
  }
};


// 🔥 2️⃣ SUBMIT → Approval başlatır
const submitInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId || req.user.id;

    const invoice = await Invoice.findOne({
      _id: id,
      companyId,
      isDeleted: false,
    });

    if (!invoice)
      return res.status(404).json({ message: "Invoice bulunamadı" });

    if (invoice.status !== "draft")
      return res.status(400).json({
        message: "Sadece draft invoice submit edilebilir",
      });

    const approval = await Approval.create({
      companyId,
      createdBy: req.user.id,
      entityType: "invoice",
      entityId: invoice._id,
      status: "pending",
      currentStep: 1,
    });

    const step = await ApprovalStep.create({
      approvalId: approval._id,
      stepOrder: 1,
      role: "manager",
      status: "pending",
    });

    await ApprovalLog.create({
      approvalId: approval._id,
      stepId: step._id,
      action: "created",
      userId: req.user.id,
      comment: "Invoice için talep oluşturuldu",
    });

    invoice.status = "pending_approval";
    invoice.submittedAt = new Date();
    invoice.approvalId = approval._id;

    await invoice.save();

    res.status(200).json({ success: true, data: invoice });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// 🔥 3️⃣ GENERATE PDF (Sadece Approved ise)
// const generateInvoicePdf = async (invoice) => {
//   const invoiceData = invoice.toObject ? invoice.toObject() : invoice; // doc veya JSON fark etmez
//   const templatePath = path.join(__dirname, "../../templates/invoices/invoice.template.html");
//   const html = fs.readFileSync(templatePath, "utf8");
//   const template = Handlebars.compile(html);
//   const htmlWithData = template(invoiceData);

//   const browser = await puppeteer.launch({ headless: true });
//   const page = await browser.newPage();
//   await page.setContent(htmlWithData, { waitUntil: "networkidle0" });
//   const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
//   await browser.close();

//   return pdfBuffer;
// };

// Cloudinary icin hazirlanmisti simdi offline 
// const previewInvoice = async (req, res) => {
//   try {
//     const invoice = await Invoice.findById(req.params.id);
//     if (!invoice?.document?.secure_url)
//       return res.status(404).send("PDF bulunamadı");

//     const response = await axios.get(invoice.document.secure_url, {
//       responseType: "arraybuffer",
//     });

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `inline; filename=invoice-${invoice.invoiceNo}.pdf`
//     );
//     res.send(response.data);
//   } catch (error) {
//     res.status(500).send(error.message);
//   }
// };

// Cloudinary icin hazirlanmisti simdi offline 
// const previewInvoice = async (req, res) => {
//   const { id } = req.params;
//   const invoice = await Invoice.findById(id);
//   if (!invoice) return res.status(404).send("Invoice not found");

//   const pdfPath = path.join(__dirname, `../../../invoices/invoice-${invoice.invoiceNo}.pdf`);

//   if (!fs.existsSync(pdfPath)) {
//     await generateInvoicePdf(invoice);
//   }

//   res.setHeader("Content-Type", "application/pdf");
//   res.sendFile(pdfPath);
// };

// Cloudinary 401/403/404 veya JSON hata (untrusted) döndü mü
const cloudinaryBlocked = (response) => {
  if (!response?.data) return true;
  if ([401, 403, 404].includes(response.status)) return true;
  const buf = response.data;
  if (Buffer.isBuffer(buf) && buf.length > 0 && buf[0] === 0x7b) return true;
  if ((response.headers || {})["content-type"]?.includes("application/json")) return true;
  return false;
};

// public_id ile signed URL - 401/restricted erişim için
const getCloudinaryPdfUrl = (doc) => {
  if (!doc) return null;
  if (doc.public_id) {
    return cloudinary.url(doc.public_id, {
      resource_type: "raw",
      format: "pdf",
      sign_url: true,
      secure: true,
    });
  }
  return doc.secure_url || null;
};

// PDF preview endpoint - signed URL ile Cloudinary'den gerçek PDF
const previewInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId || req.user?.id;
    const filter = { _id: id, isDeleted: false };
    if (companyId) filter.companyId = companyId;
    const invoice = await Invoice.findOne(filter).lean();
    if (!invoice) return res.status(404).send("Invoice not found");

    const pdfUrl = getCloudinaryPdfUrl(invoice.document);
    if (pdfUrl) {
      try {
        const response = await axios.get(pdfUrl, { responseType: "arraybuffer", validateStatus: () => true });
        if (!cloudinaryBlocked(response)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `inline; filename=invoice-${invoice.invoiceNo}.pdf`);
          res.send(Buffer.from(response.data));
          return;
        }
      } catch (e) {
        // fallback to local
      }
    }

    const data = {
      ...invoice,
      bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
      products: invoice.products || [],
    };
    const pdfBuffer = await generateInvoicePdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=invoice-${invoice.invoiceNo}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[previewInvoice]", error);
    res.status(500).send(error.message || "PDF oluşturulamadı");
  }
};

// PDF download endpoint - Cloudinary document varsa oradan stream, yoksa local dosya
const downloadInvoicePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId || req.user?.id;
    const filter = { _id: id, isDeleted: false };
    if (companyId) filter.companyId = companyId;

    const invoice = await Invoice.findOne(filter).lean();
    if (!invoice) return res.status(404).send("Invoice bulunamadı");

    const pdfUrl = getCloudinaryPdfUrl(invoice.document);
    if (pdfUrl) {
      try {
        const response = await axios.get(pdfUrl, { responseType: "arraybuffer", validateStatus: () => true });
        if (!cloudinaryBlocked(response)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename=invoice-${invoice.invoiceNo}.pdf`);
          res.send(Buffer.from(response.data));
          return;
        }
      } catch (e) {
        // fallback to local
      }
    }

    const data = {
      ...invoice,
      bank: invoice.bank || { name: "", branch: "", swift: "", iban: "" },
      products: invoice.products || [],
    };
    const pdfBuffer = await generateInvoicePdf(data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${invoice.invoiceNo}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[downloadInvoicePdf]", error);
    res.status(500).send("PDF indirilemedi");
  }
};


// 🔥 4️⃣ DELETE (Soft Delete + Status Guard)
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId || req.user.id;

    const invoice = await Invoice.findOne({
      _id: id,
      companyId,
      isDeleted: false,
    });

    if (!invoice)
      return res.status(404).json({ message: "Invoice bulunamadı" });

    if (invoice.status === "approved")
      return res.status(400).json({
        message: "Approved invoice silinemez",
      });

    invoice.isDeleted = true;
    invoice.status = "cancelled";

    await invoice.save();

    res.status(200).json({ success: true });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const generateInvoicePdfController = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice)
      return res.status(404).json({ message: "Invoice not found" });

    // Draft veya approved olsun PDF üretilebilsin (yeni faturada da document dolsun)
    if (invoice.status !== "approved" && invoice.status !== "draft")
      return res.status(400).json({ message: "PDF sadece taslak veya onaylı fatura için üretilebilir" });

    // 1️⃣ PDF'i üret (Buffer döner)
    const pdfBuffer = await generateInvoicePdf(invoice);

    // 2️⃣ Cloudinary'e yükle ve MongoDB güncelle
    const cloudResult = await uploadPdfToCloudinary(pdfBuffer, `invoice-${invoice.invoiceNo}`);

    invoice.document = {
      public_id: cloudResult.public_id,
      secure_url: cloudResult.secure_url,
      asset_id: cloudResult.asset_id,
      version: cloudResult.version,
      resource_type: cloudResult.resource_type,
    };
    invoice.documentStatus = "generated";
    await invoice.save();

    // 3️⃣ UI'ye döndür
    return res.status(200).json({ success: true, data: invoice });

  } catch (error) {
    console.error("PDF GENERATION ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
};

const previewInvoicePdfController = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice || !invoice.document?.public_id) {
      return res.status(404).json({ message: "Invoice PDF bulunamadı" });
    }

    // Cloudinary'den dosya URL
    const pdfUrl = cloudinary.url(invoice.document.public_id, {
      resource_type: "raw",
      format: "pdf",
      secure: true,
    });

    // Tarayıcıya PDF olarak göster
    res.setHeader("Content-Type", "application/pdf");
    res.redirect(pdfUrl); // ✅ Browser redirect ile preview açılır

  } catch (error) {
    console.error("PREVIEW ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

//Cloudinary iinc hazirlanmisti simdi offline 
// const downloadInvoicePdf = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const invoice = await Invoice.findById(id);
//     if (!invoice || !invoice.document?.public_id) {
//       return res.status(404).json({ message: "PDF bulunamadı" });
//     }

//     // Cloudinary signed URL üret
//     const signedUrl = cloudinary.url(invoice.document.public_id, {
//       resource_type: "raw",
//       type: "authenticated", // signed URL
//       format: "pdf",
//     });

//     // Redirect ile tarayıcıya gönder
//     return res.redirect(signedUrl);

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: "PDF indirilemedi" });
//   }
// };

const getInvoices = async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.id;

    const invoices = await Invoice.find({
      companyId,
      isDeleted: false,
    })
      .populate("customerId")
      .populate("approvalId")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: invoices });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fatura listesi alınamadı",
      error: error.message,
    });
  }
};


module.exports = {
  createInvoice,
  submitInvoice,
  generateInvoicePdf,
  deleteInvoice,
  getInvoices,
  generateInvoicePdfController,
  previewInvoicePdfController,
  previewInvoice,
  downloadInvoicePdf
};