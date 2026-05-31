/**
 * /api/pg/bank — Prisma/PostgreSQL BankInfo controller.
 *
 * Mongo karsiligi: server/controllers/Bankinfo/index.js
 * - GET    /          companyId scoped, createdAt DESC
 * - POST   /          tek banka ekle
 * - PUT    /:id       banka guncelle
 * - DELETE /:id       banka sil
 *
 * NOT: status alani Prisma'da BankInfoStatus enum (bekliyor/onaylandi/reddedildi/revize).
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const VALID_STATUS = new Set(["bekliyor", "onaylandi", "reddedildi", "revize"]);

function shape(b) {
  if (!b) return b;
  return {
    _id: b.id,
    id: b.id,
    bankName: b.bankName,
    sube: b.sube,
    switch: b.switch,
    iban: b.iban,
    status: b.status,
    accountHolder: b.accountHolder,
    companyId: b.companyId,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** GET /api/pg/bank */
const getBanks = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const banks = await prisma.bankInfo.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: banks.map(shape) });
});

/** POST /api/pg/bank */
const createBank = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const {
    bankName,
    sube,
    switch: swiftCode,
    iban,
    status,
    accountHolder,
  } = req.body || {};

  if (!bankName?.trim() || !iban?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Banka adi ve IBAN zorunludur",
    });
  }

  const cleanStatus = VALID_STATUS.has(status) ? status : "bekliyor";

  const bank = await prisma.bankInfo.create({
    data: {
      companyId,
      bankName: bankName.trim(),
      sube: sube?.trim() || "",
      switch: swiftCode?.trim() || "",
      iban: iban.trim(),
      status: cleanStatus,
      accountHolder: accountHolder?.trim() || "",
    },
  });

  res.status(201).json({ success: true, data: shape(bank) });
});

/** PUT /api/pg/bank/:id */
const updateBank = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.bankInfo.findFirst({ where: { id, companyId } });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Banka kaydi bulunamadi" });
  }

  const {
    bankName,
    sube,
    switch: swiftCode,
    iban,
    status,
    accountHolder,
  } = req.body || {};
  const data = {};
  if (bankName !== undefined) data.bankName = bankName;
  if (sube !== undefined) data.sube = sube;
  if (swiftCode !== undefined) data.switch = swiftCode;
  if (iban !== undefined) data.iban = iban;
  if (status !== undefined && VALID_STATUS.has(status)) data.status = status;
  if (accountHolder !== undefined) data.accountHolder = accountHolder;

  if (!Object.keys(data).length) {
    return next(new CustomError("Guncellenecek alan yok", 400));
  }

  const bank = await prisma.bankInfo.update({ where: { id }, data });
  res.json({ success: true, data: shape(bank) });
});

/** DELETE /api/pg/bank/:id */
const deleteBank = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.bankInfo.findFirst({ where: { id, companyId } });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Banka kaydi bulunamadi" });
  }

  await prisma.bankInfo.delete({ where: { id } });
  res.json({ success: true, message: "Banka kaydi silindi" });
});

module.exports = {
  getBanks,
  createBank,
  updateBank,
  deleteBank,
};
