/**
 * /api/pg/reports — Prisma/PostgreSQL Reports controller.
 *
 * Mongo karsiligi: server/controllers/Report/index.js
 *  GET    /chart-data            aylik trend grafigi (reports/invoices)
 *  GET    /                       admin: tum altindakiler | calisan: kendi
 *  GET    /:id                    detay (yetki kontrolu)
 *  POST   /                       manuel olustur
 *  PUT    /:id                    guncelle (icerik / status / period)
 *  DELETE /:id                    sil
 *  GET    /:id/pdf                PDFKit ile PDF + content + images
 */

const asyncErrorWrapper = require("express-async-handler");
const path = require("path");
const PDFDocument = require("pdfkit");
const { getPrisma } = require("../../../db/prisma");
const { isReportManagerRole } = require("../../../constants/roles");

const VALID_TYPE = new Set(["employee", "monthly", "weekly", "tracking"]);

/** GET /api/pg/reports?type=... */
const getAllReports = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const role = req.userPg?.role || req.user?.role;
  const { type } = req.query;

  const where = { companyId };
  if (type && VALID_TYPE.has(type)) where.type = type;

  const isAdmin = isReportManagerRole(role);

  if (!isAdmin) {
    where.senderId = userId;
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({ success: true, data: reports });
});

/** GET /api/pg/reports/:id */
const getReportById = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const role = req.userPg?.role || req.user?.role;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, companyId },
  });
  if (!report) {
    return res
      .status(404)
      .json({ success: false, message: "Rapor bulunamadi" });
  }

  if (!isReportManagerRole(role)) {
    if (report.senderId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Bu rapora erisim yetkiniz yok",
      });
    }
  }

  res.status(200).json({ success: true, data: report });
});

/** POST /api/pg/reports */
const createReport = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const userName = req.userPg?.username || req.user?.username;

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
  } = req.body || {};

  if (!type || !VALID_TYPE.has(type)) {
    return res
      .status(400)
      .json({ success: false, message: "Rapor turu zorunludur" });
  }

  const tenantId = req.headers["x-tenant"] || null;
  const now = new Date();
  const autoNo =
    "R-" +
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "-" +
    now.getTime().toString().slice(-4);

  let autoTypeLabel = "Rapor";
  if (type === "employee") autoTypeLabel = "Calisan Raporu";
  else if (type === "monthly") autoTypeLabel = "Aylik Rapor";
  else if (type === "weekly") autoTypeLabel = "Haftalik Rapor";
  else if (type === "tracking") autoTypeLabel = "Calisan Takip Raporu";

  const finalReportNo = reportNo || autoNo;
  const finalReportType = reportType || autoTypeLabel;

  const report = await prisma.report.create({
    data: {
      companyId,
      tenantId,
      type,
      reportNo: finalReportNo,
      reportType: finalReportType,
      senderId: userId,
      sender: sender || userName || "Bilinmeyen",
      senderRole: senderRole || "",
      ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      reportPeriod: reportPeriod || null,
      status: status || "Hazir",
      reviewer: reviewer || null,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      viewStatus: viewStatus || "Gorulmedi",
      fileType: fileType || "PDF",
      fileUrl: fileUrl || null,
      title: title || null,
      contentHTML: contentHTML || "",
      images: Array.isArray(images) ? images : [],
      meta: meta ?? {},
    },
  });

  res.status(201).json({ success: true, data: report });
});

/** PUT /api/pg/reports/:id */
const updateReport = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const target = await prisma.report.findFirst({ where: { id, companyId } });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Rapor bulunamadi" });
  }

  const {
    contentHTML,
    images,
    title,
    status,
    periodStart,
    periodEnd,
    reportPeriod,
    meta,
  } = req.body || {};

  const data = {};
  if (contentHTML !== undefined) data.contentHTML = contentHTML;
  if (images !== undefined)
    data.images = Array.isArray(images) ? images : target.images;
  if (title !== undefined) data.title = title;
  if (status !== undefined) data.status = status;
  if (periodStart !== undefined)
    data.periodStart = periodStart ? new Date(periodStart) : null;
  if (periodEnd !== undefined)
    data.periodEnd = periodEnd ? new Date(periodEnd) : null;
  if (reportPeriod !== undefined) data.reportPeriod = reportPeriod;
  if (meta !== undefined) data.meta = meta;

  const updated = await prisma.report.update({ where: { id }, data });
  res.status(200).json({ success: true, data: updated });
});

/** DELETE /api/pg/reports/:id */
const deleteReport = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;
  const r = await prisma.report.deleteMany({ where: { id, companyId } });
  if (r.count === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Rapor bulunamadi" });
  }
  res.status(200).json({ success: true, message: "Rapor silindi" });
});

// ----- PDF helpers (Mongo karsiligindan kopya) -----
function toPngUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (
    url.includes("res.cloudinary.com") &&
    (url.includes(".webp") || url.includes("/image/upload/"))
  ) {
    return url.replace("/image/upload/", "/image/upload/f_png/");
  }
  return url;
}

async function fetchImageBuffer(url) {
  const axios = require("axios");
  const imgUrl = toPngUrl(url);
  const r = await axios.get(imgUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    maxRedirects: 5,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return Buffer.from(r.data);
}

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

/** GET /api/pg/reports/:id/pdf */
const downloadReportPdf = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, companyId },
  });
  if (!report) {
    return res
      .status(404)
      .json({ success: false, message: "Rapor bulunamadi" });
  }

  const title = report.title || report.reportType || "Rapor";
  const created =
    report.createdAt && new Date(report.createdAt).toLocaleString("tr-TR");
  const contentHTML = report.contentHTML || "";

  const segments = parseHtmlSegments(contentHTML);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${report.reportNo || "rapor"}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  try {
    const fontPath = path.join(
      path.dirname(require.resolve("dejavu-fonts-ttf/package.json")),
      "ttf",
      "DejaVuSans.ttf"
    );
    doc.registerFont("DejaVu", fontPath);
    doc.font("DejaVu");
  } catch (_) {
    // font yoksa default'la devam
  }
  doc.pipe(res);

  doc.fontSize(18).text(title, { align: "left" });
  doc.moveDown();
  if (created) {
    doc.fontSize(10).text(`Olusturulma: ${created}`);
    doc.moveDown();
  }
  for (const seg of segments) {
    if (seg.type === "text" && seg.content) {
      doc.fontSize(12).text(seg.content, { align: "left" });
      doc.moveDown();
    } else if (seg.type === "image" && seg.url) {
      try {
        const buf = await fetchImageBuffer(seg.url);
        doc.image(buf, { width: 450 });
        doc.moveDown();
      } catch (_) {
        doc
          .fontSize(10)
          .fillColor("gray")
          .text("[Resim yuklenemedi]", { align: "left" });
        doc.fillColor("black").moveDown();
      }
    }
  }
  doc.end();
});

/** GET /api/pg/reports/chart-data?source=reports|invoices&months=N */
const getChartData = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { source = "reports", months = 6 } = req.query;
  const numMonths = Math.min(12, Math.max(3, parseInt(months, 10) || 6));

  const start = new Date();
  start.setMonth(start.getMonth() - numMonths);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  // Aylik grouping Prisma'da raw query ile
  if (source === "reports") {
    const rows = await prisma.$queryRaw`
      SELECT to_char("createdAt", 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM reports
      WHERE "companyId" = ${companyId}::uuid AND "createdAt" >= ${start}
      GROUP BY month
      ORDER BY month
    `;
    const labels = [];
    const data = [];
    for (let i = 0; i < numMonths; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      const key = d.toISOString().slice(0, 7);
      labels.push(
        d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" })
      );
      const found = rows.find((r) => r.month === key);
      data.push(found ? Number(found.count) : 0);
    }
    return res.json({
      success: true,
      data: {
        labels,
        series: [{ name: "Rapor Sayisi", data }],
        categories: labels,
      },
    });
  }

  // invoices toplami
  const rows = await prisma.$queryRaw`
    SELECT to_char("createdAt", 'YYYY-MM') AS month,
           COALESCE(SUM("totalAmount"), 0)::float AS total,
           COUNT(*)::int AS count
    FROM invoices
    WHERE "companyId" = ${companyId}::uuid
      AND "createdAt" >= ${start}
      AND "isDeleted" = false
    GROUP BY month
    ORDER BY month
  `;
  const labels = [];
  const data = [];
  for (let i = 0; i < numMonths; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const key = d.toISOString().slice(0, 7);
    labels.push(
      d.toLocaleDateString("tr-TR", { month: "short", year: "2-digit" })
    );
    const found = rows.find((r) => r.month === key);
    data.push(found ? Number(found.total) || 0 : 0);
  }
  return res.json({
    success: true,
    data: {
      labels,
      series: [{ name: "Fatura Toplami", data }],
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
