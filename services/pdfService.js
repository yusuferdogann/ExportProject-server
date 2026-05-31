const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const Handlebars = require("handlebars");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const cloudinary = require("../config/cloudinary.config");


// Cloudinary yapisi icin suan offline edildi 
// const generateInvoicePdf = async (invoiceData) => {
//   const templatePath = path.join(__dirname, "../templates/invoices/invoice.template.html");
//   let html = fs.readFileSync(templatePath, "utf8");

//   const template = Handlebars.compile(html);
//   const htmlWithData = template(invoiceData);

//   const browser = await puppeteer.launch({ headless: true });
//   const page = await browser.newPage();
//   await page.setContent(htmlWithData, { waitUntil: "networkidle0" });
//   const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
//   await browser.close();

//   return Buffer.from(pdfBuffer);
// };

// Cloudinary yapisi icin suan offline edildi 
// const generateInvoicePdf = async (invoice) => {
//   const templatePath = path.join(__dirname, "../../templates/invoices/invoice-template.html");
//   const html = fs.readFileSync(templatePath, "utf8");
//   const template = Handlebars.compile(html);
//   const htmlWithData = template(invoice);

//   const browser = await puppeteer.launch({ headless: true });
//   const page = await browser.newPage();
//   await page.setContent(htmlWithData, { waitUntil: "networkidle0" });

//   const pdfPath = path.join(__dirname, `../../invoices/invoice-${invoice.invoiceNo}.pdf`);
//   const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
//   await browser.close();

//   return pdfPath;
// };


// PDF oluşturur ve Buffer döndürür. Yerel dosyaya yazmaz - Cloudinary için memory üzerinden akış.
const generateInvoicePdf = async (invoice) => {
  try {
    const templatePath = path.join(__dirname, "../templates/invoices/invoice.template.html");
    const html = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(html, { allowProtoPropertiesByDefault: true });
    const htmlWithData = template(invoice);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlWithData, { waitUntil: "networkidle0" });

  // PDF path’i server/invoices klasöründe
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[generateInvoicePdf] Puppeteer fallback:", err.message);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont("Helvetica");
    page.drawText("Fatura No: " + invoice.invoiceNo, { x: 50, y: 780, size: 14, font });
    return Buffer.from(await pdfDoc.save());
  }
};



const uploadPdfToCloudinary = (pdfBuffer, fileName, folder = "invoices") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder,
        public_id: fileName,
        format: "pdf",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(pdfBuffer);
  });
};

/** WinAnsi (Helvetica) ile uyumlu: Türkçe karakterleri ASCII'ye çevir */
const toWinAnsiSafe = (str) => {
  if (str == null || str === "") return "";
  const s = String(str);
  const map = {
    İ: "I", ı: "i", Ğ: "G", ğ: "g", Ü: "U", ü: "u",
    Ş: "S", ş: "s", Ö: "O", ö: "o", Ç: "C", ç: "c",
  };
  return s.replace(/[İıĞğÜüŞşÖöÇç]/g, (c) => (map[c] != null ? map[c] : c));
};

/** Checklist, Proforma, PriceQuote için pdf-lib ile basit PDF (yerel dosya yok) */
const generateSimplePdf = async (title, lines) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 780;
  page.drawText(toWinAnsiSafe(title), { x: 50, y, size: 16, font });
  y -= 30;
  (lines || []).forEach((line) => {
    page.drawText(toWinAnsiSafe(String(line)), { x: 50, y, size: 11, font });
    y -= 18;
  });
  const buf = await pdfDoc.save();
  return Buffer.from(buf);
};

/** Checklist (Çeki Listesi) PDF - Puppeteer + HTML template, TR/EN destekli */
const LABELS_CHECKLIST = {
  tr: {
    title: "CEKI LISTESI",
    buyer: "ALICI",
    invoiceNo: "Fatura Numarasi",
    date: "Tarih",
    truckPlate: "Plaka",
    no: "No",
    productDesc: "Urun Tanimi",
    masterPack: "Master Paket",
    qty: "Adet Set",
    netWeight: "Net Kilo Kg",
    grossWeight: "Brut Kilo KG",
    gtipNo: "GTIP NO:",
    totalMasterPack: "TOTAL MASTER PAKET:",
    netKgs: "NET KILO KGS:",
    grossKgs: "BRUT KILO KGS:",
    totalKgs: "GENEL TOPLAM KGS:",
    kgs: "KGS",
    origin: "Urunlerimiz Turkiyede Uretilmis Olup Turk Menseilidir",
  },
  en: {
    title: "PACKING LIST",
    buyer: "BUYER / CLIENT",
    invoiceNo: "Invoice No",
    date: "Date",
    truckPlate: "Truck / Trailer Plate No",
    no: "No",
    productDesc: "Description Of Products",
    masterPack: "Master Pack",
    qty: "Qty Pcs",
    netWeight: "Net Weight Kg",
    grossWeight: "Gross Weight Kg",
    gtipNo: "HS CODE:",
    totalMasterPack: "TOTAL MASTER PACK:",
    netKgs: "NETT WEIGHT KGS:",
    grossKgs: "GROSS WEIGHT KGS:",
    totalKgs: "TOTAL WEIGHT KGS:",
    kgs: "KGS",
    origin: "Our products are manufactured in Turkey and are of Turkish origin",
  },
};

const generateChecklistPdf = async (entity, lang = "tr") => {
  try {
    const Customer = require("../models/Customers");
    let customer = entity.customer;
    if (!customer && entity.customerId) {
      const doc = await Customer.findById(entity.customerId).lean();
      customer = doc || {};
    }
    customer = customer || { firmName: "", address: "", country: "", mail: "", phone: "" };

    const labels = LABELS_CHECKLIST[lang] || LABELS_CHECKLIST.tr;
    const formatNum = (n) => (n != null ? Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00");
    const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");

    const products = (entity.products || []).map((p) => ({
      name: p.name || "",
      master: p.master || "",
      qty: p.qty != null ? p.qty : 0,
      net: formatNum(p.net),
      gross: formatNum(p.gross),
    }));

    const totalNetWeight = entity.totalNetWeight != null ? entity.totalNetWeight : (entity.products || []).reduce((s, p) => s + Number(p.net || 0), 0);
    const totalGrossWeight = entity.totalGrossWeight != null ? entity.totalGrossWeight : (entity.products || []).reduce((s, p) => s + Number(p.gross || 0), 0);
    const totalPackageCount = entity.totalPackageCount != null ? entity.totalPackageCount : products.reduce((s, p) => s + Number(p.qty || 0), 0);

    const totalMasterPack = totalPackageCount > 0 ? `1 (PALET)` : "0";
    const totalQty = lang === "en" ? `${totalPackageCount} Pcs` : `${totalPackageCount} Set`;
    const gtipCode = (entity.products && entity.products[0] && entity.products[0].code) ? entity.products[0].code : "840991";

    const templateData = {
      lang: lang === "en" ? "en" : "tr",
      title: labels.title,
      labels,
      customer: { firmName: customer.firmName || "", address: customer.address || "", mail: customer.mail || "", phone: customer.phone || "" },
      invoiceNumber: entity.invoiceNumber || "-",
      formattedDate: formatDate(entity.createdAt),
      truckPlate: entity.truckPlate || "-",
      products,
      totalMasterPack,
      totalQty,
      totalNetWeight: formatNum(totalNetWeight),
      totalGrossWeight: formatNum(totalGrossWeight),
      gtipCode,
    };

    Handlebars.registerHelper("addOne", (i) => (i != null ? i + 1 : 1));
    const templatePath = path.join(__dirname, "../templates/checklists/checklist.template.html");
    const html = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(html, { allowProtoPropertiesByDefault: true });
    const htmlWithData = template(templateData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlWithData, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[generateChecklistPdf] Puppeteer hata:", err.message);
    return generateSimplePdf("Ceki Listesi", [
      `Ceki Listesi - ${entity.invoiceNumber || entity._id}`,
      `Tarih: ${entity.createdAt ? new Date(entity.createdAt).toLocaleDateString("tr-TR") : "-"}`,
      `Plaka: ${entity.truckPlate || "-"}`,
      `Not: ${entity.note || "-"}`,
      `Toplam Fiyat: ${entity.totalPrice != null ? entity.totalPrice : 0} TL`,
    ]);
  }
};

/** Proforma PDF - Puppeteer + HTML template (Price Offer gibi) */
const generateProformaPdf = async (entity) => {
  try {
    const Customer = require("../models/Customers");
    const PriceQuote = require("../models/PriceOffer");

    let customer = entity.customer;
    if (!customer && entity.customerId) {
      const doc = await Customer.findById(entity.customerId).lean();
      customer = doc || {};
    }
    customer = customer || { firmName: "", address: "", country: "", personName: "", code: "", mail: "" };

    let products = entity.products || [];
    let grandTotal = entity.grandTotal;
    let totalQuantity = entity.totalQuantity || 0;
    let totalUnit = entity.totalUnit || "Kg";
    if (!products.length && entity.customerId) {
      const latestQuote = await PriceQuote.findOne({ customerId: entity.customerId })
        .sort({ createdAt: -1 })
        .lean();
      if (latestQuote?.products?.length) {
        const rawProducts = latestQuote.products.map((p) => {
          const qty = Number(p.quantity || 0);
          const price = Number(p.price || 0);
          const total = p.total != null ? Number(p.total) : qty * price;
          return { name: p.name || "", quantity: qty, unit: p.unit || "Kg", price, total };
        });
        grandTotal = rawProducts.reduce((s, p) => s + (p.total || 0), 0);
        totalQuantity = rawProducts.reduce((s, p) => s + (p.quantity || 0), 0);
        products = rawProducts.map((p) => ({
          name: p.name,
          quantity: p.quantity.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
          unit: p.unit,
          unitPrice: p.price.toFixed(2).replace(".", ","),
          total: p.total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        }));
      }
    } else {
      const rawProducts = (products || []).map((p) => {
        const qty = Number(p.quantity || 0);
        const price = Number(p.price || 0);
        const total = p.total != null ? Number(p.total) : qty * price;
        return { name: p.name || "", quantity: qty, unit: p.unit || "Kg", price, total };
      });
      grandTotal = grandTotal != null ? grandTotal : rawProducts.reduce((s, p) => s + (p.total || 0), 0);
      totalQuantity = totalQuantity || rawProducts.reduce((s, p) => s + (p.quantity || 0), 0);
      products = rawProducts.map((p) => ({
        name: p.name,
        quantity: p.quantity.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
        unit: p.unit,
        unitPrice: p.price.toFixed(2).replace(".", ","),
        total: p.total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      }));
    }

    let totalNetWeight = entity.totalNetWeight != null ? entity.totalNetWeight : 0;
    let totalGrossWeight = entity.totalGrossWeight != null ? entity.totalGrossWeight : 0;
    let totalPackageCount = entity.totalPackageCount != null ? entity.totalPackageCount : 0;
    if ((!totalNetWeight || !totalGrossWeight) && entity.customerId) {
      const Checklist = require("../models/Checklist");
      const latestCl = await Checklist.findOne({ customerId: entity.customerId })
        .sort({ createdAt: -1 })
        .lean();
      if (latestCl) {
        totalNetWeight = totalNetWeight || (latestCl.totalNetWeight != null ? latestCl.totalNetWeight : 0);
        totalGrossWeight = totalGrossWeight || (latestCl.totalGrossWeight != null ? latestCl.totalGrossWeight : 0);
        totalPackageCount = totalPackageCount || (latestCl.totalPackageCount != null ? latestCl.totalPackageCount : 0);
      }
    }

    const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");
    const bank = entity.bankInfo || {};
    const delivery = entity.delivery || {};
    const deliveryTerm = [delivery.type || "FCA", delivery.point || "KONYA TURKIYE"].filter(Boolean).join(" ") || "FCA KONYA TURKIYE";
    const weSentBy = delivery.vehicle || "BY TRUCK";

    const templateData = {
      companyName: "SEYMOT OTOMOTIV IC VE DIS TIC. SAN. LTD. STI.",
      companyAddress: "Buyukkayacik Mh. 506 Nolu Sk. No: 4/1 Selcuklu Konya/Turkiye",
      companyPhone: "+90 332 342 49 27",
      companyEmail: "export@doganpiston.com.tr",
      companyTaxId: "7671211004",
      companyTaxOffice: "SELCUK",
      companyWebsite: "https://doganpiston.com/en",
      customer: { firmName: customer.firmName || "", address: customer.address || "", country: customer.country || "", personName: customer.personName || "", code: customer.code || "", mail: customer.mail || "" },
      quoteNumber: entity.quoteNumber || entity._id?.toString() || "-",
      formattedDate: formatDate(entity.invoiceDate),
      destinationCountry: customer.country || entity.originCountry || "-",
      products,
      grandTotal: Number(grandTotal || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalQuantity: Number(totalQuantity || 0).toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
      totalUnit: totalUnit,
      bankInfo: { name: bank.name || "-", branch: bank.branch || "-", swiftCode: bank.swiftCode || "-", iban: bank.iban || "-" },
      deliveryTerm,
      paymentTerm: entity.paymentTerm || "100% IN ADVANCE",
      origin: entity.originCountry || "TURKIYE",
      weSentBy,
      hsCode: entity.gtipCode || "840991",
      totalNetWeight: Number(totalNetWeight).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalGrossWeight: Number(totalGrossWeight).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalPackageCount: totalPackageCount != null ? totalPackageCount : 0,
      notes: entity.note || "",
    };

    Handlebars.registerHelper("addOne", (i) => (i != null ? i + 1 : 1));
    const templatePath = path.join(__dirname, "../templates/proformas/proforma.template.html");
    const html = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(html, { allowProtoPropertiesByDefault: true });
    const htmlWithData = template(templateData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlWithData, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[generateProformaPdf] Puppeteer hata:", err.message);
    return generateSimplePdf("Proforma", [
      `Proforma No: ${entity.quoteNumber || entity._id}`,
      `Tarih: ${entity.invoiceDate ? new Date(entity.invoiceDate).toLocaleDateString("tr-TR") : "-"}`,
      `Geçerlilik: ${entity.validUntil ? new Date(entity.validUntil).toLocaleDateString("tr-TR") : "-"}`,
      `Ulke: ${entity.originCountry || "-"}`,
    ]);
  }
};

/** Price Offer PDF - Puppeteer + HTML template (Invoice gibi) */
const generatePriceQuotePdf = async (entity) => {
  try {
    const Customer = require("../models/Customers");
    let customer = entity.customer;
    if (!customer && entity.customerId) {
      const doc = await Customer.findById(entity.customerId).lean();
      customer = doc || {};
    }
    customer = customer || { firmName: "", address: "", country: "", phone: "", mail: "" };

    const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-");
    const formatPrice = (n) => (n != null ? Number(n).toFixed(2).replace(".", ",") : "0,00");
    const deliveryTerm = [entity.delivery?.type || "EXW", entity.delivery?.point || "KONYA TURKIYE"].filter(Boolean).join(" ") || "EXW KONYA TURKIYE";

    const products = (entity.products || []).map((p) => ({
      name: p.name || "",
      unit: p.unit || "Pcs",
      quantity: p.quantity != null ? p.quantity : 0,
      price: formatPrice(p.price),
      total: formatPrice(p.total != null ? p.total : (p.quantity * p.price)),
      photo: p.photo || "",
    }));

    const templateData = {
      customer: { firmName: customer.firmName || "", address: customer.address || "", country: customer.country || "", phone: customer.phone || "", mail: customer.mail || "" },
      priceInfo: { quoteNumber: entity.priceInfo?.quoteNumber || entity._id?.toString() || "-" },
      formattedDate: formatDate(entity.priceInfo?.invoiceDate),
      formattedValidUntil: formatDate(entity.priceInfo?.validUntil),
      destinationCountry: entity.destinationCountry || "-",
      products,
      deliveryTerm,
      notes: entity.notes || "",
    };

    Handlebars.registerHelper("addOne", (i) => (i != null ? i + 1 : 1));
    const templatePath = path.join(__dirname, "../templates/priceoffers/priceOffer.template.html");
    const html = fs.readFileSync(templatePath, "utf8");
    const template = Handlebars.compile(html, { allowProtoPropertiesByDefault: true });
    const htmlWithData = template(templateData);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlWithData, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error("[generatePriceQuotePdf] Puppeteer hata:", err.message);
    return generateSimplePdf("Fiyat Teklifi", [
      `Teklif No: ${entity.priceInfo?.quoteNumber || entity._id}`,
      `Tarih: ${entity.priceInfo?.invoiceDate ? new Date(entity.priceInfo.invoiceDate).toLocaleDateString("tr-TR") : "-"}`,
      `Geçerlilik: ${entity.priceInfo?.validUntil ? new Date(entity.priceInfo.validUntil).toLocaleDateString("tr-TR") : "-"}`,
      `Hedef Ülke: ${entity.destinationCountry || "-"}`,
    ]);
  }
};

module.exports = {
  generateInvoicePdf,
  uploadPdfToCloudinary,
  generateChecklistPdf,
  generateProformaPdf,
  generatePriceQuotePdf,
};