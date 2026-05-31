/**
 * /api/pg/mandatory-reports — Prisma/PostgreSQL MandatoryReport controller.
 *
 * Mongo karsiligi: server/controllers/MandatoryReport/index.js
 *  GET    /                liste (admin)
 *  POST   /                ekle/guncelle (workerIds[])
 *  GET    /check           bekleyen zorunlu rapor kontrolu (login user)
 *  GET    /workers         atanabilecek calisanlar listesi
 *  DELETE /:id             sil
 *
 * NOT: Prisma'da periodType enum diakritiksiz (gunluk/haftalik/aylik). Body'den
 *      gelen TR diakritikli ("günlük" vb.) deger normalize edilir.
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");

const PERIOD_MAP = {
  gunluk: "gunluk",
  haftalik: "haftalik",
  aylik: "aylik",
  // diakritikli TR girisleri
  "günlük": "gunluk",
  "haftalık": "haftalik",
  "aylık": "aylik",
};

function normalizePeriod(p) {
  if (!p) return "aylik";
  return PERIOD_MAP[String(p).toLowerCase()] || "aylik";
}

function shape(m) {
  if (!m) return m;
  return {
    _id: m.id,
    id: m.id,
    deadlineDate: m.deadlineDate,
    periodType: m.periodType,
    periodMonth: m.periodMonth,
    periodYear: m.periodYear,
    companyId: m.companyId,
    workerId: m.worker
      ? {
          _id: m.worker.id,
          id: m.worker.id,
          username: m.worker.username,
          email: m.worker.email,
        }
      : m.workerId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/** GET /api/pg/mandatory-reports */
const list = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const rows = await prisma.mandatoryReport.findMany({
    where: { companyId },
    include: {
      worker: { select: { id: true, username: true, email: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
  res.json({ success: true, data: rows.map(shape) });
});

/** POST /api/pg/mandatory-reports */
const createOrUpdate = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { workerIds, deadlineDate, periodType = "aylik" } = req.body || {};

  if (
    !Array.isArray(workerIds) ||
    workerIds.length === 0 ||
    !deadlineDate
  ) {
    return res
      .status(400)
      .json({ success: false, message: "workerIds ve deadlineDate gerekli" });
  }

  const d = new Date(deadlineDate);
  const pt = normalizePeriod(periodType);
  let periodMonth = d.getMonth() + 1;
  let periodYear = d.getFullYear();
  if (pt === "gunluk") periodMonth = 0;
  if (pt === "haftalik") periodMonth = 13;

  const results = [];
  for (const wid of workerIds) {
    if (typeof wid !== "string") continue;
    const target = await prisma.user.findFirst({
      where: { id: wid, companyId },
      select: { id: true },
    });
    if (!target) continue;

    const existing = await prisma.mandatoryReport.findFirst({
      where: {
        companyId,
        workerId: wid,
        periodYear,
        periodMonth,
      },
    });

    const data = {
      companyId,
      workerId: wid,
      deadlineDate: d,
      periodMonth,
      periodYear,
      periodType: pt,
    };

    let doc;
    if (existing) {
      doc = await prisma.mandatoryReport.update({
        where: { id: existing.id },
        data,
      });
    } else {
      doc = await prisma.mandatoryReport.create({ data });
    }
    results.push(doc);
  }

  res.json({ success: true, data: results.map(shape) });
});

/** GET /api/pg/mandatory-reports/check */
const checkPending = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!userId) {
    return res.json({
      success: true,
      data: { hasPending: false, pending: [], daysLeft: null, deadlineDate: null },
    });
  }
  const now = new Date();

  const mandatories = await prisma.mandatoryReport.findMany({
    where: { workerId: userId },
    orderBy: { deadlineDate: "asc" },
  });

  const pending = [];
  for (const m of mandatories) {
    let periodStart;
    let periodEnd;
    if (m.periodType === "gunluk") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    } else if (m.periodType === "haftalik") {
      const d = new Date(now);
      const day = d.getDay();
      const toMonday = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + toMonday);
      periodStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      periodEnd = new Date(
        periodStart.getTime() + 7 * 24 * 60 * 60 * 1000
      );
    } else {
      const y = m.periodYear ?? now.getFullYear();
      const mn = m.periodMonth ?? now.getMonth() + 1;
      periodStart = new Date(y, mn - 1, 1);
      periodEnd = new Date(y, mn, 1);
    }

    const sent = await prisma.report.findFirst({
      where: {
        companyId,
        senderId: userId,
        type: "employee",
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    });

    if (!sent) {
      const daysLeft = Math.ceil(
        (new Date(m.deadlineDate) - now) / (24 * 60 * 60 * 1000)
      );
      pending.push({
        _id: m.id,
        id: m.id,
        periodType: m.periodType,
        periodYear: m.periodYear,
        periodMonth: m.periodMonth,
        deadlineDate: m.deadlineDate,
        daysLeft,
      });
    }
  }

  // Fallback: zorunlu kayit yoksa ve bu ay employee raporu yoksa hatirlatma
  if (pending.length === 0) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sentThisMonth = await prisma.report.findFirst({
      where: {
        companyId,
        senderId: userId,
        type: "employee",
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });
    if (!sentThisMonth) {
      const deadline = new Date(monthEnd.getTime() - 1);
      const daysLeft = Math.max(
        0,
        Math.ceil((deadline - now) / (24 * 60 * 60 * 1000))
      );
      pending.push({
        _id: null,
        periodType: "aylik",
        periodYear: now.getFullYear(),
        periodMonth: now.getMonth() + 1,
        deadlineDate: deadline,
        daysLeft,
        _fallback: true,
      });
    }
  }

  const nearest = pending[0];
  res.json({
    success: true,
    data: {
      hasPending: pending.length > 0,
      pending,
      daysLeft: nearest?.daysLeft ?? null,
      deadlineDate: nearest?.deadlineDate ?? null,
    },
  });
});

/** GET /api/pg/mandatory-reports/workers */
const getWorkers = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const workers = await prisma.worker.findMany({
    where: { companyId, userId: { not: null } },
    include: {
      user: { select: { id: true, username: true, email: true } },
    },
  });

  const data = workers
    .filter((w) => w.user)
    .map((w) => ({
      _id: w.user.id,
      name: w.user.username || w.name,
      email: w.user.email || w.email,
    }));

  res.json({ success: true, data });
});

/** DELETE /api/pg/mandatory-reports/:id */
const remove = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;
  await prisma.mandatoryReport.deleteMany({ where: { id, companyId } });
  res.json({ success: true });
});

module.exports = {
  list,
  createOrUpdate,
  checkPending,
  remove,
  getWorkers,
};
