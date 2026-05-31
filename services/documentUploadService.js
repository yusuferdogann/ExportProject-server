if (typeof global.DOMMatrix === "undefined") {
  try {
    global.DOMMatrix = require("dommatrix");
  } catch (_) {}
}

const { GoogleGenerativeAI } = require("@google/generative-ai");
let PDFParse;
try {
  PDFParse = require("pdf-parse").PDFParse;
} catch (_) {
  PDFParse = null;
}

const getGenAI = () => {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return key ? new GoogleGenerativeAI(key) : null;
};

const SCHEMA_PROMPTS = {
  proformas: `Bu PDF belge metninden aşağıdaki alanları çıkar. Sadece geçerli JSON döndür, başka metin yazma.
JSON şeması:
{
  "customerName": "müşteri/şirket adı",
  "delivery": { "type": "", "vehicle": "", "point": "" },
  "quoteNumber": "",
  "invoiceDate": "YYYY-MM-DD",
  "validUntil": "YYYY-MM-DD",
  "bankInfo": { "name": "", "branch": "", "swiftCode": "", "iban": "" },
  "originCountry": "",
  "gtipCode": "",
  "note": "",
  "totalNetWeight": 0,
  "totalGrossWeight": 0,
  "totalPackageCount": 0
}`,
  invoices: `Bu PDF fatura metninden aşağıdaki alanları çıkar. Sadece geçerli JSON döndür.
JSON şeması:
{
  "customerName": "müşteri adı",
  "invoiceNo": "",
  "invoiceDate": "YYYY-MM-DD",
  "delivery": "",
  "destinationCountry": "",
  "gtip": "",
  "bank": { "name": "", "branch": "", "swift": "", "iban": "" },
  "products": [ { "description": "", "quantity": 0, "unit": "", "unitPrice": 0, "total": 0 } ],
  "totalAmount": 0
}`,
  checklists: `ÖNEMLİ: Bu belge ÇEKİ LİSTESİ (Packing List). Proforma veya Fatura şeması KULLANMA.
YASAK: customerName, delivery, quoteNumber, validUntil, bankInfo - bu alanlar çeki listesinde yok.

Tablo başlıkları No, Ürün Tanımı, Master Paket, Adet Set, Net Kilo Kg, Brüt Kilo Kg olan tablodaki HER SATIRI "Ürünler" dizisine ekle. Örn: Piston Pimli, 41, 280,00, 291,00 gibi.

Çıktıda YALNIZCA aşağıdaki TÜRKÇE anahtarları kullan. Sadece geçerli JSON döndür.

JSON şeması (SADECE bu anahtarlar):
{
  "Satıcı Adı": "",
  "Satıcı Adresi": "",
  "Satıcı Telefon": "",
  "Satıcı E-posta": "",
  "Satıcı Vergi No": "",
  "Satıcı Vergi Dairesi": "",
  "Satıcı Web": "",
  "Alıcı Adı": "",
  "Alıcı Adresi": "",
  "Alıcı E-posta": "",
  "Alıcı Telefon": "",
  "Fatura Numarası": "",
  "Tarih": "",
  "Plaka": "",
  "Not": "",
  "Ürünler": [
    { "No": "", "Ürün Tanımı": "", "Master Paket": "", "Adet Set": "", "Net Kilo Kg": "", "Brüt Kilo Kg": "" }
  ],
  "Toplam Fiyat": 0,
  "GTİP No": "",
  "TOTAL MASTER PAKET": "",
  "NET KİLO KGS": "",
  "BRÜT KİLO KGS": "",
  "GENEL TOPLAM KGS": "",
  "Menşei Notu": ""
}`,
  priceQuotes: `Bu PDF fiyat teklifi metninden alanları çıkar. Sadece geçerli JSON döndür.
JSON şeması:
{
  "customerName": "müşteri adı",
  "products": [ { "name": "", "unit": "", "quantity": 0, "price": 0, "total": 0 } ],
  "delivery": { "type": "", "vehicle": "", "point": "" },
  "priceInfo": { "quoteNumber": "", "invoiceDate": "YYYY-MM-DD", "validUntil": "YYYY-MM-DD" },
  "destinationCountry": ""
}`,
};

/** PDF buffer'dan metin çıkar - pdf-parse (daha iyi tablo/çeki desteği) veya unpdf fallback */
async function extractTextFromPdf(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // 1. pdf-parse ile dene (tablo ve karmaşık layout için daha iyi - v2 API)
  if (PDFParse) {
    try {
      const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    const text = (result?.text || "").trim();
    await parser.destroy?.();
    if (text && text.length > 50) return text;
    } catch (e) {
      // pdf-parse hata - unpdf'e geç
    }
  }
  // 2. unpdf fallback - sayfa sayfa çıkar (sıra korunur)
  const { extractText, getDocumentProxy } = await import("unpdf");
  const uint8 = new Uint8Array(buf.length);
  uint8.set(buf);
  const pdf = await getDocumentProxy(uint8);
  const result = await extractText(pdf, { mergePages: false });
  const pages = result?.text;
  if (Array.isArray(pages) && pages.length) {
    return pages.join("\n\n");
  }
  const merged = result?.text;
  return (typeof merged === "string" ? merged : "") || "";
}

/** PDF buffer'dan tablo verilerini çıkar (pdf-parse getTable) */
async function extractTablesFromPdf(buffer) {
  if (!PDFParse) return [];
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  try {
    const parser = new PDFParse({ data: buf });
    const tableResult = await parser.getTable();
    await parser.destroy?.();
    const merged = tableResult?.mergedTables || [];
    return Array.isArray(merged) ? merged : [];
  } catch (e) {
    return [];
  }
}

/** Gemini ile metinden JSON çıkar */
async function extractJsonFromText(text, documentType, options = {}) {
  const genAI = getGenAI();
  if (!genAI) throw new Error("GEMINI_API_KEY yapılandırılmamış");

  const schemaPrompt = SCHEMA_PROMPTS[documentType];
  if (!schemaPrompt) throw new Error("Geçersiz belge tipi");

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: documentType === "checklists" ? 4096 : 2048,
    },
  });

  const maxChars = 120000;
  const textChunk = text.length > maxChars ? text.slice(0, maxChars) + "\n\n[... metin kısaltıldı ...]" : text;

  const tablesPart =
    documentType === "checklists" && Array.isArray(options.tables) && options.tables.length
      ? `\n\nAşağıda pdf-parse ile çıkarılmış tablo dizileri var. No | Ürün Tanımı | Master Paket | Adet Set | Net Kilo Kg | Brüt Kilo Kg sütunlarına karşılık gelen her satırı "Ürünler" dizisine ekle, satır atlama:\n${JSON.stringify(
          options.tables,
        )}\n\n`
      : "";

  const extraRules =
    documentType === "checklists"
      ? "\nKurallar: (1) Tüm JSON anahtarları TÜRKÇE olmalı (Satıcı Adı, Alıcı Adı, Fatura Numarası, Ürünler, Ürün Tanımı, Master Paket, Adet Set, Net Kilo Kg, Brüt Kilo Kg). (2) PDF değerlerini çevirme, olduğu gibi bırak. (3) Ürün tablosundaki her satırı Ürünler içine ekle."
      : "\nKurallar: PDF içindeki alan değerlerini çevirme, mümkün olduğunca orijinal metni koru.";

  const prompt = `${schemaPrompt}\n${extraRules}\n\nPDF metni (tam içerik):\n${textChunk}${tablesPart}\nYukarıdaki verilerden alanları çıkarıp yalnızca geçerli JSON döndür. Bulamadığın alanlar için boş string veya 0 kullan.`;
  const result = await model.generateContent(prompt);
  const response = result.response;
  const jsonStr = response.text();
  if (!jsonStr) throw new Error("AI yanıt vermedi");

  let cleanStr = jsonStr.trim();
  const codeBlock = cleanStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) cleanStr = codeBlock[1].trim();
  else cleanStr = cleanStr.replace(/^`+|`+$/g, "").replace(/^json\s*/i, "").trim();
  const objectMatch = cleanStr.match(/\{[\s\S]*\}/);
  if (objectMatch) cleanStr = objectMatch[0];
  try {
    const parsed = JSON.parse(cleanStr);
    return { ...parsed, _sourceType: "uploaded" };
  } catch (e) {
    throw new Error("JSON ayrıştırılamadı: " + (e.message || "bilinmeyen hata"));
  }
}

module.exports = {
  extractTextFromPdf,
  extractTablesFromPdf,
  extractJsonFromText,
};
