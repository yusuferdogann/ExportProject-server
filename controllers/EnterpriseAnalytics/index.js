const asyncErrorWrapper = require("express-async-handler");
const mongoose = require("mongoose");
const Customer = require("../../models/Customers");
const Invoice = require("../../models/Invoice");
const PriceQuote = require("../../models/PriceOffer");
const Checklist = require("../../models/Checklist");
const Message = require("../../models/Message");
const MailAiUsageLog = require("../../models/MailAiUsageLog");
const MonthlyUsageMinute = require("../../models/MonthlyUsageMinute");

function toOid(v) {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
}

function parseYearMonth(ym) {
  const parts = String(ym).trim().split("-");
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  return { y, mo };
}

function rangeForYearMonth(yearMonth) {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return null;
  const { y, mo } = parsed;
  const start = new Date(y, mo - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, mo, 1, 0, 0, 0, 0);
  return { start, end };
}

function trailingMonthsAnchored(anchorYm, count) {
  const parsed = parseYearMonth(anchorYm);
  if (!parsed) return [];
  let y = parsed.y;
  let m = parsed.mo;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return arr.reverse();
}

function formatYmNow() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

async function aggregateRevenueBuckets(companyId, start, end) {
  const cid = companyId;

  const [inv, pq, cl] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          companyId: cid,
          isDeleted: { $ne: true },
          createdAt: { $gte: start, $lt: end },
          customerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$customerId",
          invoiceTotal: { $sum: { $toDouble: { $ifNull: ["$totalAmount", 0] } } },
          invoiceCount: { $sum: 1 },
        },
      },
    ]),
    PriceQuote.aggregate([
      {
        $match: {
          companyId: cid,
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $addFields: {
          lineTotal: {
            $reduce: {
              input: { $ifNull: ["$products", []] },
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  { $toDouble: { $ifNull: ["$$this.total", 0] } },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$customerId",
          quoteTotal: { $sum: "$lineTotal" },
          quoteCount: { $sum: 1 },
        },
      },
    ]),
    Checklist.aggregate([
      {
        $match: {
          companyId: cid,
          customerId: { $exists: true, $ne: null },
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: "$customerId",
          checklistTotal: { $sum: { $toDouble: { $ifNull: ["$totalPrice", 0] } } },
          checklistCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  return { inv, pq, cl };
}

function mergeCustomerRevenueMaps({ inv, pq, cl }) {
  const map = new Map();

  const ensure = (id) => {
    const k = String(id);
    if (!map.has(k)) {
      map.set(k, {
        invoiceTotal: 0,
        quoteTotal: 0,
        checklistTotal: 0,
        invoiceCount: 0,
        quoteCount: 0,
        checklistCount: 0,
      });
    }
    return map.get(k);
  };

  for (const row of inv) {
    if (!row._id) continue;
    const o = ensure(row._id);
    o.invoiceTotal = Number(row.invoiceTotal) || 0;
    o.invoiceCount = row.invoiceCount || 0;
  }
  for (const row of pq) {
    if (!row._id) continue;
    const o = ensure(row._id);
    o.quoteTotal = Number(row.quoteTotal) || 0;
    o.quoteCount = row.quoteCount || 0;
  }
  for (const row of cl) {
    if (!row._id) continue;
    const o = ensure(row._id);
    o.checklistTotal = Number(row.checklistTotal) || 0;
    o.checklistCount = row.checklistCount || 0;
  }

  return map;
}

async function monthSeriesPoint(companyId, ym) {
  const range = rangeForYearMonth(ym);
  if (!range) {
    return {
      yearMonth: ym,
      revenue: 0,
      internalMessages: 0,
      mailAiOperations: 0,
      usageMinutes: 0,
    };
  }
  const { start, end } = range;
  const cid = companyId;

  const buckets = await aggregateRevenueBuckets(cid, start, end);
  const merged = mergeCustomerRevenueMaps(buckets);
  let revenue = 0;
  for (const v of merged.values()) {
    revenue += v.invoiceTotal + v.quoteTotal + v.checklistTotal;
  }

  const [internalMessages, mailAiOperations, usageAgg] = await Promise.all([
    Message.countDocuments({ companyId: cid, createdAt: { $gte: start, $lt: end } }),
    MailAiUsageLog.countDocuments({ companyId: cid, createdAt: { $gte: start, $lt: end } }),
    MonthlyUsageMinute.aggregate([
      { $match: { companyId: cid, yearMonth: ym } },
      { $group: { _id: null, t: { $sum: "$minutes" } } },
    ]),
  ]);

  return {
    yearMonth: ym,
    revenue: Math.round(revenue * 100) / 100,
    internalMessages,
    mailAiOperations,
    usageMinutes: usageAgg[0]?.t || 0,
  };
}

exports.getOverview = asyncErrorWrapper(async (req, res) => {
  const cid = toOid(req.user.companyId);
  if (!cid) {
    return res.status(400).json({ success: false, message: "companyId eksik" });
  }

  const ymParam = String(req.query.yearMonth || "").trim() || formatYmNow();
  const range = rangeForYearMonth(ymParam);
  if (!range) {
    return res.status(400).json({ success: false, message: "Geçersiz yearMonth" });
  }

  const { start, end } = range;

  const customers = await Customer.find({ companyId: cid })
    .select("firmName country code personName isActive createdAt")
    .sort({ firmName: 1 })
    .lean();

  const buckets = await aggregateRevenueBuckets(cid, start, end);
  const revMap = mergeCustomerRevenueMaps(buckets);

  const [internalMessages, mailAiOperations, usageTotalAgg, usageByCustomerRows] =
    await Promise.all([
      Message.countDocuments({ companyId: cid, createdAt: { $gte: start, $lt: end } }),
      MailAiUsageLog.countDocuments({ companyId: cid, createdAt: { $gte: start, $lt: end } }),
      MonthlyUsageMinute.aggregate([
        { $match: { companyId: cid, yearMonth: ymParam } },
        { $group: { _id: null, t: { $sum: "$minutes" } } },
      ]),
      MonthlyUsageMinute.aggregate([
        {
          $match: {
            companyId: cid,
            yearMonth: ymParam,
            customerScopeKey: { $nin: ["_", null, ""] },
          },
        },
        { $group: { _id: "$customerScopeKey", minutes: { $sum: "$minutes" } } },
      ]),
    ]);

  const usageByCustomerId = {};
  for (const row of usageByCustomerRows) {
    if (row._id) usageByCustomerId[String(row._id)] = row.minutes || 0;
  }

  let revenueMonthTotal = 0;
  const customerRows = customers.map((c) => {
    const id = String(c._id);
    const r = revMap.get(id) || {
      invoiceTotal: 0,
      quoteTotal: 0,
      checklistTotal: 0,
      invoiceCount: 0,
      quoteCount: 0,
      checklistCount: 0,
    };
    const lineRevenue =
      r.invoiceTotal + r.quoteTotal + r.checklistTotal;
    revenueMonthTotal += lineRevenue;
    return {
      customerId: id,
      firmName: c.firmName,
      country: c.country,
      code: c.code,
      personName: c.personName,
      isActive: c.isActive,
      revenueMonth: Math.round(lineRevenue * 100) / 100,
      breakdown: {
        invoiceTotal: Math.round(r.invoiceTotal * 100) / 100,
        quoteTotal: Math.round(r.quoteTotal * 100) / 100,
        checklistTotal: Math.round(r.checklistTotal * 100) / 100,
        invoiceCount: r.invoiceCount,
        quoteCount: r.quoteCount,
        checklistCount: r.checklistCount,
      },
      usageMinutesAttributed: usageByCustomerId[id] || 0,
    };
  });

  customerRows.sort((a, b) => (b.revenueMonth || 0) - (a.revenueMonth || 0));

  const ymSeries = trailingMonthsAnchored(ymParam, 6);
  const series = [];
  for (const ym of ymSeries) {
    series.push(await monthSeriesPoint(cid, ym));
  }

  res.json({
    success: true,
    data: {
      yearMonth: ymParam,
      summary: {
        customerCount: customers.length,
        activeCustomerCount: customers.filter((x) => x.isActive !== false).length,
        revenueMonthTotal: Math.round(revenueMonthTotal * 100) / 100,
        internalMessages,
        mailAiOperations,
        usageMinutesCompany: usageTotalAgg[0]?.t || 0,
      },
      customers: customerRows,
      seriesLastMonths: series,
      meta: {
        revenueNote:
          "Ciro seçilen ayda oluşturulan fatura, fiyat teklifi ürün toplamları ve çeki listesi tutarından türetilir.",
        messagesNote:
          "Şirket içi ileti gönderimi (Mesajlar modülü). Müşteri alanı ile ilişkilendirilmez.",
        mailAiNote:
          "Mail asistanında (Gemini) başarıyla tamamlanan düzeltme / çeviri çağrılarıdır.",
        usageNote:
          "Oturum dakikası heartbeat (~60 sn) ile birikir. İstemci istek gövdesinde customerId gönderirse bu dakikalar müşteri sütununda ayrışır (ör. ileride /customers/:id rotası).",
      },
    },
  });
});
