const asyncErrorWrapper = require("express-async-handler");
const path = require("path");
const mongoose = require("mongoose");
const Report = require("../../models/Report");
const Worker = require("../../models/Worker");
const PDFDocument = require("pdfkit");
const { isReportManagerRole } = require("../../constants/roles");

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
};

// GET /api/reports?type=employee|monthly|weekly|tracking
// Admin: altındaki tüm çalışanların raporları | Çalışan: sadece kendi raporları
const getAllReports = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: currentUserId, role } = req.user;
  const { type } = req.query;

  const query = { companyId };
  if (type) query.type = type;

  const isAdmin = isReportManagerRole(role);

  if (isAdmin) {
    const workers = await Worker.find({ companyId }).select("userId").lean();
    const subordinateUserIds = workers
      .filter((w) => w.userId)
      .map((w) => w.userId.toString());
    const allowedSenderIds = [
      currentUserId?.toString?.(),
      ...new Set(subordinateUserIds),
    ]
      .filter(Boolean)
      .map(toObjectId)
      .filter(Boolean);
    query.senderId = allowedSenderIds.length ? { $in: allowedSenderIds } : currentUserId;
  } else {
    query.senderId = toObjectId(currentUserId) || currentUserId;
  }

  const reports = await Report.find(query).sort({ createdAt: -1 }).lean();
  return res.status(200).json({
    success: true,
    data: reports,
  });
});

// GET /api/reports/:id
const getReportById = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: currentUserId, role } = req.user;
  const { id } = req.params;

  const report = await Report.findOne({ _id: id, companyId }).lean();
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Rapor bulunamadı",
    });
  }

  if (!isReportManagerRole(role)) {
    const sid = report.senderId?.toString?.();
    if (!sid || sid !== currentUserId?.toString?.()) {
      return res.status(403).json({
        success: false,
        message: "Bu rapora erişim yetkiniz yok",
      });
    }
  }

  return res.status(200).json({
    success: true,
    data: report,
  });
});

// POST /api/reports  (manuel rapor oluşturma – çalışan raporları için kullanılabilir)
const createReport = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: userId } = req.user;
  const {
    type,
    reportNo,
    reportType,
    sender,
    senderRole,
    createdAt,
    periodStart,
    periodEnd,
    reportPeriod,
    status,
    reviewer,
    reviewDate,
    viewStatus,
    fileType,
    fileUrl,
    title,
    contentHTML,
    images = [],
    meta,
  } = req.body;

  if (!type) {
    return res.status(400).json({
      success: false,
      message: "Rapor türü zorunludur",
    });
  }

  const tenantId = req.headers["x-tenant"] || null;

  // Boş geldiyse raporNo / reportType üret
  const safeType = type;
  const now = new Date();
  const autoNo =
    "R-" +
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    now.getTime().toString().slice(-4);

  let autoTypeLabel = "Rapor";
  if (safeType === "employee") autoTypeLabel = "Çalışan Raporu";
  else if (safeType === "monthly") autoTypeLabel = "Aylık Rapor";
  else if (safeType === "weekly") autoTypeLabel = "Haftalık Rapor";
  else if (safeType === "tracking") autoTypeLabel = "Çalışan Takip Raporu";

  const finalReportNo = reportNo || autoNo;
  const finalReportType = reportType || autoTypeLabel;

  const report = await Report.create({
    companyId,
    tenantId,
    type: safeType,
    reportNo: finalReportNo,
    reportType: finalReportType,
    senderId: userId,
    sender: sender || req.user.name,
    senderRole: senderRole || "",
    createdAt: createdAt || new Date(),
    periodStart,
    periodEnd,
    reportPeriod,
    status: status || "Hazır",
    reviewer,
    reviewDate,
    viewStatus: viewStatus || "Görülmedi",
    fileType: fileType || "PDF",
    fileUrl,
    title,
    contentHTML: contentHTML || "",
    images: Array.isArray(images) ? images : [],
    meta: meta || {},
  });

  return res.status(201).json({
    success: true,
    data: report,
  });
});

// PUT /api/reports/:id
const updateReport = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;
  const {
    contentHTML,
    images,
    title,
    status,
    periodStart,
    periodEnd,
    reportPeriod,
    meta,
  } = req.body;

  const report = await Report.findOne({ _id: id, companyId });
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Rapor bulunamadı",
    });
  }

  if (contentHTML !== undefined) report.contentHTML = contentHTML;
  if (images !== undefined) report.images = Array.isArray(images) ? images : report.images;
  if (title !== undefined) report.title = title;
  if (status !== undefined) report.status = status;
  if (periodStart !== undefined) report.periodStart = periodStart;
  if (periodEnd !== undefined) report.periodEnd = periodEnd;
  if (reportPeriod !== undefined) report.reportPeriod = reportPeriod;
  if (meta !== undefined) report.meta = meta;

  await report.save();

  return res.status(200).json({
    success: true,
    data: report,
  });
});

// DELETE /api/reports/:id
const deleteReport = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  const report = await Report.findOneAndDelete({ _id: id, companyId });
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Rapor bulunamadı",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Rapor silindi",
  });
});

// Cloudinary WebP → PNG (PDFKit sadece JPEG/PNG destekler)
function toPngUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (url.includes("res.cloudinary.com") && (url.includes(".webp") || url.includes("/image/upload/"))) {
    return url.replace("/image/upload/", "/image/upload/f_png/");
  }
  return url;
}

// URL'den resim buffer indir (axios - redirect, SSL)
async function fetchImageBuffer(url) {
  const axios = require("axios");
  const imgUrl = toPngUrl(url);
  const res = await axios.get(imgUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return Buffer.from(res.data);
}

// HTML'den metin ve resim URL'leri çıkar (sıralı)
function parseHtmlSegments(html) {
  if (!html) return [{ type: "text", content: "" }];
  const segments = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let lastIndex = 0;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index);
    const text = before
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text) segments.push({ type: "text", content: text });
    segments.push({ type: "image", url: match[1] });
    lastIndex = match.index + match[0].length;
  }
  const after = html.slice(lastIndex);
  const text = after
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text) segments.push({ type: "text", content: text });
  if (segments.length === 0) segments.push({ type: "text", content: "" });
  return segments;
}

// GET /api/reports/:id/pdf - PDF indir (PDFKit: metin + resimler)
const downloadReportPdf = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  const report = await Report.findOne({ _id: id, companyId }).lean();
  if (!report) {
    return res.status(404).json({
      success: false,
      message: "Rapor bulunamadı",
    });
  }

  const title = report.title || report.reportType || "Rapor";
  const created =
    report.createdAt && new Date(report.createdAt).toLocaleString("tr-TR");
  const contentHTML = report.contentHTML || "";
  const images = report.images || [];

  const segments = parseHtmlSegments(contentHTML);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${(report.reportNo || "rapor")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  const fontPath = path.join(
    path.dirname(require.resolve("dejavu-fonts-ttf/package.json")),
    "ttf",
    "DejaVuSans.ttf"
  );
  doc.registerFont("DejaVu", fontPath);
  doc.font("DejaVu");
  doc.pipe(res);

  doc.fontSize(18).text(title, { align: "left" });
  doc.moveDown();

  if (created) {
    doc.fontSize(10).text(`Oluşturulma: ${created}`);
    doc.moveDown();
  }

  for (const seg of segments) {
    if (seg.type === "text" && seg.content) {
      doc.fontSize(12).text(seg.content, { align: "left" });
      doc.moveDown();
    } else if (seg.type === "image" && seg.url) {
      try {
        const buf = await fetchImageBuffer(seg.url);
        const maxWidth = 450;
        doc.image(buf, { width: maxWidth });
        doc.moveDown();
      } catch (err) {
        doc.fontSize(10).fillColor("gray").text(`[Resim yüklenemedi]`, { align: "left" });
        doc.fillColor("black").moveDown();
      }
    }
  }

  if (segments.length === 0) {
    const plainText = contentHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "İçerik bulunamadı.";
    doc.fontSize(12).text(plainText, { align: "left" });
  }

  doc.end();
});

// GET /api/reports/chart-data - Grafik için gerçek veri (aylık rapor sayıları vb.)
const getChartData = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { source = "reports", months = 6 } = req.query;

  const numMonths = Math.min(12, Math.max(3, parseInt(months, 10) || 6));
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - numMonths);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  if (source === "reports") {
    const docs = await Report.aggregate([
      { $match: { companyId: toObjectId(companyId), createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const labels = [];
    const data = [];
    for (let i = 0; i < numMonths; i++) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      const key = d.toISOString().slice(0, 7);
      labels.push(
        d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" })
      );
      const found = docs.find((x) => x._id === key);
      data.push(found ? found.count : 0);
    }
    return res.json({
      success: true,
      data: {
        labels,
        series: [{ name: "Rapor Sayısı", data }],
        categories: labels,
      },
    });
  }

  const Invoice = require("../../models/Invoice");
  const invDocs = await Invoice.aggregate([
    { $match: { companyId: toObjectId(companyId), createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const labels = [];
  const data = [];
  for (let i = 0; i < numMonths; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const key = d.toISOString().slice(0, 7);
    labels.push(
      d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" })
    );
    const found = invDocs.find((x) => x._id === key);
    data.push(found ? Number(found.total) || 0 : 0);
  }
  return res.json({
    success: true,
    data: {
      labels,
      series: [{ name: "Fatura Toplamı", data }],
      categories: labels,
    },
  });
});

module.exports = {
  getAllReports,
  getReportById,
  createReport,
  updateReport,
  deleteReport,
  downloadReportPdf,
  getChartData,
};