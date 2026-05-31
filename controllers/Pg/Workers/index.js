/**
 * /api/pg/workers — Prisma/PostgreSQL Worker controller.
 *
 * Mongo karsiligi: server/controllers/Worker/index.js
 * - GET    /                        company scoped, user populate
 * - POST   /                        worker (+ opsiyonel User hesabi)
 * - PUT    /:id                     worker guncelle
 * - DELETE /:id                     worker sil
 * - POST   /create-account/:id      mevcut worker'a User hesabi olustur
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const { hashPassword } = require("../../../helpers/pg/authHelpers");

function shapeWorker(w) {
  if (!w) return w;
  return {
    _id: w.id,
    id: w.id,
    name: w.name,
    title: w.title,
    phone: w.phone,
    email: w.email,
    avatar: w.avatar,
    companyId: w.companyId,
    parentId: w.parentId,
    userId: w.user
      ? { _id: w.user.id, id: w.user.id, username: w.user.username, email: w.user.email }
      : w.userId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

async function ensureUniqueUsername(prisma, base, companyId) {
  let username = base;
  let suffix = 0;
  while (await prisma.user.findFirst({ where: { username, companyId } })) {
    suffix += 1;
    username = `${base}${suffix}`;
  }
  return username;
}

const userPickSelect = { id: true, username: true, email: true };

/** GET /api/pg/workers */
const getWorkers = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const workers = await prisma.worker.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: userPickSelect } },
  });

  res.json({ success: true, data: workers.map(shapeWorker) });
});

/** POST /api/pg/workers */
const createWorker = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) {
    return res
      .status(400)
      .json({ success: false, message: "Sirket bilgisi bulunamadi" });
  }

  const { name, title, phone, email, avatar, createAccount } = req.body || {};
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Ad soyad zorunludur" });
  }

  let userId = null;
  if (createAccount && email && String(email).trim()) {
    const normalized = String(email).trim().toLowerCase();
    let existing = await prisma.user.findFirst({
      where: { email: normalized, companyId },
    });
    if (!existing) {
      existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing && existing.companyId !== companyId) {
        existing = await prisma.user.update({
          where: { id: existing.id },
          data: { companyId },
        });
      }
    }
    if (existing) {
      userId = existing.id;
    } else {
      const usernameBase =
        normalized.split("@")[0] ||
        name.replace(/\s/g, "").toLowerCase() ||
        "worker";
      const username = await ensureUniqueUsername(prisma, usernameBase, companyId);
      const created = await prisma.user.create({
        data: {
          username,
          email: normalized,
          password: await hashPassword("1234"),
          role: "employee",
          companyId,
        },
        select: { id: true },
      });
      userId = created.id;
    }
  }

  const worker = await prisma.worker.create({
    data: {
      companyId,
      name,
      title: title || "",
      phone: phone || "",
      email: email || "",
      avatar: avatar || "",
      userId: userId || undefined,
    },
    include: { user: { select: userPickSelect } },
  });

  res.status(201).json({ success: true, data: shapeWorker(worker) });
});

/** PUT /api/pg/workers/:id */
const updateWorker = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const target = await prisma.worker.findFirst({ where: { id, companyId } });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Calisan bulunamadi" });
  }

  const { name, title, phone, email, avatar } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (title !== undefined) data.title = title;
  if (phone !== undefined) data.phone = phone;
  if (email !== undefined) data.email = email;
  if (avatar !== undefined) data.avatar = avatar;

  const worker = await prisma.worker.update({
    where: { id },
    data,
    include: { user: { select: userPickSelect } },
  });
  res.json({ success: true, data: shapeWorker(worker) });
});

/** POST /api/pg/workers/create-account/:id */
const createAccountForWorker = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res
      .status(400)
      .json({ success: false, message: "Calisan ID gerekli" });
  }

  const worker = await prisma.worker.findUnique({ where: { id } });
  if (!worker) {
    return res
      .status(404)
      .json({ success: false, message: "Calisan bulunamadi" });
  }
  if (companyId && worker.companyId !== companyId) {
    return res
      .status(403)
      .json({ success: false, message: "Bu calisana erisim yetkiniz yok" });
  }
  if (worker.userId) {
    return res.json({
      success: true,
      data: { userId: worker.userId },
      message: "Hesap zaten mevcut",
    });
  }
  const email = worker.email?.trim();
  if (!email) {
    return res.status(400).json({
      success: false,
      message:
        "Bu calisanin e-posta adresi yok. Mesaj alabilmesi icin once e-posta ekleyin.",
    });
  }

  const normalized = email.toLowerCase();
  let user = await prisma.user.findFirst({
    where: { email: normalized, companyId: worker.companyId },
  });
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: normalized } });
    if (user && user.companyId !== worker.companyId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { companyId: worker.companyId },
      });
    }
    if (!user) {
      const usernameBase =
        normalized.split("@")[0] ||
        worker.name.replace(/\s/g, "").toLowerCase() ||
        "worker";
      const username = await ensureUniqueUsername(
        prisma,
        usernameBase,
        worker.companyId
      );
      user = await prisma.user.create({
        data: {
          username,
          email: normalized,
          password: await hashPassword("1234"),
          role: "employee",
          companyId: worker.companyId,
        },
      });
    }
  }

  await prisma.worker.update({
    where: { id },
    data: { userId: user.id },
  });

  res.json({ success: true, data: { userId: user.id } });
});

/** DELETE /api/pg/workers/:id */
const deleteWorker = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const id = String(req.params.id || "").trim();
  if (!id) return next(new CustomError("id zorunlu", 400));

  const r = await prisma.worker.deleteMany({ where: { id, companyId } });
  if (r.count === 0) {
    return res
      .status(404)
      .json({ success: false, message: "Calisan bulunamadi" });
  }
  res.json({ success: true, message: "Calisan silindi" });
});

module.exports = {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  createAccountForWorker,
};
