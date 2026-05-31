const asyncHandler = require("express-async-handler");
const multer = require("multer");
const { uploadPdfToCloudinary, generateChecklistPdf } = require("../../services/pdfService");
const { extractTextFromPdf, extractTablesFromPdf, extractJsonFromText } = require("../../services/documentUploadService");
const Invoice = require("../../models/Invoice");
const Proforma = require("../../models/Proforma");
const Checklist = require("../../models/Checklist");
const PriceOffer = require("../../models/PriceOffer");
const Customer = require("../../models/Customers");
const mongoose = require("mongoose");

const MODELS = { invoices: Invoice, proformas: Proforma, checklists: Checklist, priceQuotes: PriceOffer };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Sadece PDF dosyaları yüklenebilir"));
    }
    cb(null, true);
  },
});

const TR_EN_CHECKLIST = {
  "Satıcı Adı": "sellerName",
  "Satıcı Adresi": "sellerAddress",
  "Satıcı Telefon": "sellerPhone",
  "Satıcı E-posta": "sellerEmail",
  "Satıcı Vergi No": "sellerTaxId",
  "Satıcı Vergi Dairesi": "sellerTaxOffice",
  "Satıcı Web": "sellerWebsite",
  "Alıcı Adı": "customerName",
  "Alıcı Adresi": "customerAddress",
  "Alıcı E-posta": "customerEmail",
  "Alıcı Telefon": "customerPhone",
  "Fatura Numarası": "invoiceNumber",
  Tarih: "invoiceDate",
  Plaka: "truckPlate",
  Not: "note",
  "Toplam Fiyat": "totalPrice",
  "GTİP No": "gtipCode",
  "TOTAL MASTER PAKET": "masterPackageUnit",
  "NET KİLO KGS": "totalNetWeight",
  "BRÜT KİLO KGS": "totalGrossWeight",
  "GENEL TOPLAM KGS": "grandTotalKgs",
  "Menşei Notu": "originNote",
};

const toNum = (v) => {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/\s*(KGS|KG)?\s*$/i, "").trim();
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const normalizeChecklistPayload = (p) => {
  const out = {};
  const kiloFields = ["NET KİLO KGS", "BRÜT KİLO KGS", "GENEL TOPLAM KGS"];
  for (const [tr, en] of Object.entries(TR_EN_CHECKLIST)) {
    if (p[tr] === undefined) continue;
    if (kiloFields.includes(tr)) {
      out[en] = toNum(p[tr]);
    } else if (tr === "Toplam Fiyat") {
      out[en] = toNum(p[tr]);
    } else {
      out[en] = p[tr];
    }
  }
  if (p["Ürünler"] && Array.isArray(p["Ürünler"])) {
    out.products = p["Ürünler"].map((u) => ({
      code: u["Kod"] ?? u.code ?? "",
      name: u["Ürün Tanımı"] ?? u.name ?? "",
      master: u["Master Paket"] ?? u.master ?? "",
      qty: toNum(u["Adet Set"] ?? u.qty) || 0,
      net: toNum(u["Net Kilo Kg"] ?? u.net) || 0,
      gross: toNum(u["Brüt Kilo Kg"] ?? u.gross) || 0,
      price: Number(u["Fiyat"] ?? u.price ?? 0) || 0,
    }));
  }
  if (p.products && !out.products) out.products = p.products;
  return { ...p, ...out };
};

const findCustomerByCompanyAndName = async (companyId, name) => {
  if (!name || typeof name !== "string") return null;
  const clean = name.trim();
  if (!clean) return null;
  const c = await Customer.findOne({
    companyId,
    $or: [
      { firmName: { $regex: clean, $options: "i" } },
      { firmName: { $regex: clean.replace(/\s+/g, ".*"), $options: "i" } },
    ],
  }).lean();
  return c?._id || null;
};

/** 1. PDF yükle -> Metin çıkar -> Gemini ile JSON çıkar -> frontend'e dön (teyit için) */
exports.extractPdfData = [
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "PDF dosyası gerekli" });
    const { type } = req.body || {};
    const validTypes = ["proformas", "invoices", "checklists", "priceQuotes"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: "Geçersiz belge tipi" });
    }

    const rawText = await extractTextFromPdf(req.file.buffer);
    if (!rawText || rawText.length < 20) {
      return res.status(400).json({
        success: false,
        message: "PDF'den metin çıkarılamadı. Taranmış veya bozuk PDF olabilir.",
      });
    }

    let tables = [];
    if (type === "checklists") {
      tables = await extractTablesFromPdf(req.file.buffer).catch(() => []);
    }

    const extracted = await extractJsonFromText(rawText, type, { tables });
    res.json({
      success: true,
      data: {
        extracted,
        rawText,
        originalFileName: req.file.originalname,
      },
    });
  }),
];

/** 2. Kullanıcı teyit ettikten sonra kaydet: PDF Cloudinary + JSON MongoDB */
exports.saveUploadedPdf = [
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "PDF dosyası gerekli" });
    const { type, data } = req.body || {};
    const validTypes = ["proformas", "invoices", "checklists", "priceQuotes"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: "Geçersiz belge tipi" });
    }

    let payload;
    try {
      payload = typeof data === "string" ? JSON.parse(data) : data;
    } catch (e) {
      return res.status(400).json({ success: false, message: "Geçersiz data JSON" });
    }

    const companyId = req.user?.companyId || req.user?.id;
    const customerIdFromBody = payload.customerId;
    const customerName = payload.customerName || payload["Alıcı Adı"] || payload.customer?.firmName;

    let customerId = customerIdFromBody;
    if (!customerId && customerName) {
      customerId = await findCustomerByCompanyAndName(companyId, customerName);
    }
    if (!customerId) {
      customerId = new mongoose.Types.ObjectId();
    }

    const folderMap = { invoices: "invoices", proformas: "proformas", checklists: "checklists", priceQuotes: "pricequotes" };
    const folder = folderMap[type] || "documents";
    const publicId = `${type}-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let pdfBuffer = req.file.buffer;
    if (type === "checklists") {
      const norm = normalizeChecklistPayload(payload);
      const mapProduct = (p) => ({
        code: p?.code || norm.gtipCode || "",
        name: p?.name || "",
        master: p?.master != null ? String(p.master) : "",
        qty: Number(p?.qty) || 0,
        net: Number(p?.net) || 0,
        gross: Number(p?.gross) || 0,
      });
      const products = (norm.products || payload.products || []).map(mapProduct);
      const totalNetWeight = norm.totalNetWeight ?? payload.totalNetWeight ?? 0;
      const totalGrossWeight = norm.grandTotalKgs ?? norm.totalGrossWeight ?? payload.totalGrossWeight ?? 0;
      const totalPackageCount = norm.totalPackageCount ?? payload.totalPackageCount ?? products.reduce((s, p) => s + Number(p.qty || 0), 0);
      const entityForPdf = {
        customer: {
          firmName: norm.customerName ?? payload["Alıcı Adı"] ?? payload.customerName ?? "",
          address: norm.customerAddress ?? payload["Alıcı Adresi"] ?? "",
          mail: norm.customerEmail ?? payload["Alıcı E-posta"] ?? "",
          phone: norm.customerPhone ?? payload["Alıcı Telefon"] ?? "",
        },
        products,
        invoiceNumber: norm.invoiceNumber || payload["Fatura Numarası"] || payload.invoiceNumber || "-",
        truckPlate: norm.truckPlate ?? payload.Plaka ?? "-",
        note: [norm.note, norm.originNote, payload.Not].filter(Boolean).join(" ") || "",
        totalNetWeight,
        totalGrossWeight,
        totalPackageCount,
        gtipCode: norm.gtipCode ?? payload["GTİP No"] ?? "",
        createdAt: (norm.invoiceDate || payload.Tarih || payload.invoiceDate) ? new Date(norm.invoiceDate || payload.Tarih || payload.invoiceDate) : new Date(),
      };
      if (entityForPdf.products.length && !entityForPdf.products[0].code && entityForPdf.gtipCode) {
        entityForPdf.products[0].code = entityForPdf.gtipCode;
      }
      try {
        pdfBuffer = await generateChecklistPdf(entityForPdf, "tr");
      } catch (e) {
        console.warn("[uploadPdf] Checklist PDF üretilemedi, orijinal yüklenecek:", e?.message);
      }
    }

    const cloudResult = await uploadPdfToCloudinary(pdfBuffer, publicId, folder);

    const docMeta = {
      public_id: cloudResult.public_id,
      secure_url: cloudResult.secure_url,
      asset_id: cloudResult.asset_id,
      version: cloudResult.version,
      resource_type: "raw",
    };

    const Model = MODELS[type];
    let entity;

    if (type === "proformas") {
      const d = payload.delivery || {};
      entity = await Proforma.create({
        companyId,
        customerId,
        delivery: { type: d.type, vehicle: d.vehicle, point: d.point },
        quoteNumber: payload.quoteNumber || `PRO-${Date.now()}`,
        invoiceDate: payload.invoiceDate || new Date(),
        validUntil: payload.validUntil || new Date(),
        bankInfo: payload.bankInfo || {},
        originCountry: payload.originCountry,
        gtipCode: payload.gtipCode,
        note: payload.note,
        totalNetWeight: payload.totalNetWeight || 0,
        totalGrossWeight: payload.totalGrossWeight || 0,
        totalPackageCount: payload.totalPackageCount || 0,
        document: docMeta,
      });
    } else if (type === "invoices") {
      entity = await Invoice.create({
        companyId,
        customerId,
        invoiceNo: payload.invoiceNo || `INV-${Date.now()}`,
        invoiceDate: payload.invoiceDate || new Date(),
        delivery: payload.delivery,
        destinationCountry: payload.destinationCountry,
        gtip: payload.gtip,
        bank: payload.bank || {},
        products: payload.products || [],
        totalAmount: payload.totalAmount || 0,
        document: docMeta,
        documentStatus: "generated",
      });
    } else if (type === "checklists") {
      const norm = normalizeChecklistPayload(payload);
      const mapProduct = (p) => ({
        code: p?.code || "",
        name: p?.name || "",
        master: p?.master != null ? String(p.master) : "",
        qty: Number(p?.qty) || 0,
        net: Number(p?.net) || 0,
        gross: Number(p?.gross) || 0,
        price: Number(p?.price) || 0,
      });
      entity = await Checklist.create({
        companyId,
        customerId,
        invoiceNumber: norm.invoiceNumber || norm.quoteNumber || payload.invoiceNumber || `CHK-${Date.now()}`,
        invoiceDate: (norm.invoiceDate || payload.invoiceDate) ? new Date(norm.invoiceDate || payload.invoiceDate) : undefined,
        truckPlate: norm.truckPlate ?? payload.truckPlate,
        note: [norm.note, norm.originNote, payload.note].filter(Boolean).join(" ") || undefined,
        gtipCode: norm.gtipCode ?? payload.gtipCode,
        originCountry: norm.originCountry ?? payload.originCountry ?? (norm.originNote || payload.originNote),
        masterPackageUnit: norm.masterPackageUnit ?? payload.masterPackageUnit,
        grandTotalKgs: norm.grandTotalKgs ?? payload.grandTotalKgs,
        sellerName: norm.sellerName ?? payload.sellerName,
        sellerAddress: norm.sellerAddress ?? payload.sellerAddress,
        sellerPhone: norm.sellerPhone ?? payload.sellerPhone,
        sellerEmail: norm.sellerEmail ?? payload.sellerEmail,
        sellerTaxId: norm.sellerTaxId ?? payload.sellerTaxId,
        sellerTaxOffice: norm.sellerTaxOffice ?? payload.sellerTaxOffice,
        sellerWebsite: norm.sellerWebsite ?? payload.sellerWebsite,
        customerAddress: norm.customerAddress ?? payload.customerAddress,
        customerEmail: norm.customerEmail ?? payload.customerEmail,
        customerPhone: norm.customerPhone ?? payload.customerPhone,
        products: (norm.products || payload.products || []).map(mapProduct),
        totalPrice: norm.totalPrice ?? payload.totalPrice ?? 0,
        totalNetWeight: norm.totalNetWeight ?? payload.totalNetWeight ?? 0,
        totalGrossWeight: norm.totalGrossWeight ?? payload.totalGrossWeight ?? 0,
        totalPackageCount: norm.totalPackageCount ?? payload.totalPackageCount ?? 0,
        document: docMeta,
      });
    } else if (type === "priceQuotes") {
      const pi = payload.priceInfo || {};
      entity = await PriceOffer.create({
        companyId,
        customerId,
        products: (payload.products || []).map((p) => ({
          name: p.name,
          unit: p.unit,
          quantity: Number(p.quantity) || 0,
          price: Number(p.price) || 0,
          total: Number(p.total) || 0,
          photo: p.photo || "",
        })),
        delivery: payload.delivery || {},
        priceInfo: {
          quoteNumber: pi.quoteNumber || `PQ-${Date.now()}`,
          invoiceDate: pi.invoiceDate || new Date(),
          validUntil: pi.validUntil || new Date(),
        },
        destinationCountry: payload.destinationCountry || "",
        document: docMeta,
      });
    }

    res.status(201).json({ success: true, data: entity });
  }),
];
