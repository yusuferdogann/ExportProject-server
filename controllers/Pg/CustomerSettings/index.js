/**
 * /api/pg/customer-settings — müşteri durum & mail kural ayarları
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const RATING_KEYS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function shapeFollowUp(row) {
  return {
    rating: Number(row.rating),
    value: row.value,
    unit: row.unit,
  };
}

function shapeMailRule(row) {
  return {
    rating: Number(row.rating),
    mode: row.mode,
    value: row.value,
    unit: row.unit,
  };
}

/** GET /api/pg/customer-settings */
const getAll = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const [ratingFollowUp, mailRules] = await Promise.all([
    prisma.customerRatingFollowUpSetting.findMany({
      where: { companyId },
      orderBy: { rating: "asc" },
    }),
    prisma.customerMailRuleSetting.findMany({
      where: { companyId },
      orderBy: { rating: "asc" },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ratingFollowUp: ratingFollowUp.map(shapeFollowUp),
      mailRules: mailRules.map(shapeMailRule),
    },
  });
});

/** POST /api/pg/customer-settings */
const saveAll = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const { ratingFollowUp = [], mailRules = [] } = req.body || {};

  for (const item of ratingFollowUp) {
    const rating = Number(item.rating);
    if (!RATING_KEYS.some((r) => Math.abs(r - rating) < 0.001)) continue;
    const value = Math.max(1, Number(item.value) || 1);
    const unit = item.unit || "gun";
    await prisma.customerRatingFollowUpSetting.upsert({
      where: {
        companyId_rating: { companyId, rating },
      },
      create: { companyId, rating, value, unit },
      update: { value, unit },
    });
  }

  for (const item of mailRules) {
    const rating = Number(item.rating);
    if (!RATING_KEYS.some((r) => Math.abs(r - rating) < 0.001)) continue;
    const mode = ["hatirlat", "periyodik", "hic"].includes(item.mode)
      ? item.mode
      : "hatirlat";
    const value = Math.max(1, Number(item.value) || 1);
    const unit = item.unit || "hafta";
    await prisma.customerMailRuleSetting.upsert({
      where: {
        companyId_rating: { companyId, rating },
      },
      create: { companyId, rating, mode, value, unit },
      update: { mode, value, unit },
    });
  }

  const [savedFollowUp, savedMail] = await Promise.all([
    prisma.customerRatingFollowUpSetting.findMany({
      where: { companyId },
      orderBy: { rating: "asc" },
    }),
    prisma.customerMailRuleSetting.findMany({
      where: { companyId },
      orderBy: { rating: "asc" },
    }),
  ]);

  res.json({
    success: true,
    data: {
      ratingFollowUp: savedFollowUp.map(shapeFollowUp),
      mailRules: savedMail.map(shapeMailRule),
    },
  });
});

module.exports = { getAll, saveAll };
