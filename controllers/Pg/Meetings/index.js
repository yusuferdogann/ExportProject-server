/**
 * /api/pg/meet — Prisma/PostgreSQL Meeting controller.
 *
 * Mongo karsiligi: server/controllers/Meets/index.js
 * - POST   /addmeet                  yeni gorusme + (varsa) otomatik reminder
 * - GET    /                          company scoped, customer populate
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const { loadMeetingMailMeta } = require("./mailMeta");

function shape(m) {
  if (!m) return m;
  return {
    _id: m.id,
    id: m.id,
    firmName: m.firmName,
    mail: m.mail,
    phone: m.phone,
    status: m.status,
    title: m.title,
    meetDate: m.meetDate,
    noteDetail: m.noteDetail,
    recordDate: m.recordDate,
    companyId: m.companyId,
    customerId: m.customer
      ? {
          _id: m.customer.id,
          id: m.customer.id,
          firmName: m.customer.firmName,
          country: m.customer.country,
          mail: m.customer.mail,
          phone: m.customer.phone,
        }
      : m.customerId,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function addTime(date, value, unit) {
  const d = new Date(date);
  switch (unit) {
    case "dakika":
      d.setMinutes(d.getMinutes() + value);
      break;
    case "saat":
      d.setHours(d.getHours() + value);
      break;
    case "gun":
      d.setDate(d.getDate() + value);
      break;
    case "hafta":
      d.setDate(d.getDate() + value * 7);
      break;
    case "ay":
      d.setMonth(d.getMonth() + value);
      break;
    default:
      d.setDate(d.getDate() + value);
  }
  return d;
}

/** POST /api/pg/meet/addmeet */
const createMeet = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const callerId = req.userPg?.id || req.user?.id;
  const callerCompanyId = req.userPg?.companyId || req.user?.companyId;

  const { customerId, status, description, title, date, noteDetail } = req.body || {};
  const descKey = description || status;

  if (!customerId) {
    return res
      .status(400)
      .json({ success: false, message: "customerId zorunlu" });
  }

  if (descKey === "ozelNot" && !String(noteDetail || "").trim()) {
    return res.status(400).json({
      success: false,
      message: "Not 2 detayi zorunludur",
    });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId: callerCompanyId },
  });
  if (!customer) {
    return res
      .status(404)
      .json({ success: false, message: "Musteri bulunamadi" });
  }
  const companyId = customer.companyId;

  const meetDate = date ? new Date(date) : new Date();

  const meet = await prisma.meeting.create({
    data: {
      companyId,
      customerId: customer.id,
      firmName: customer.firmName,
      mail: customer.mail || null,
      phone: customer.phone || null,
      status: String(descKey || status || ""),
      title: title ? String(title).trim() : "",
      meetDate,
      noteDetail: descKey === "ozelNot" ? String(noteDetail).trim() : "",
      recordDate: new Date(),
    },
  });

  // Auto reminder
  if (descKey) {
    const setting = await prisma.interviewReminderSettings.findFirst({
      where: { companyId, descriptionKey: descKey },
    });
    if (setting && setting.value > 0) {
      const baseDate =
        setting.unit === "dakika"
          ? new Date()
          : date
            ? new Date(date)
            : new Date();
      const reminderDate = addTime(baseDate, setting.value, setting.unit);
      const timeStr = `${String(reminderDate.getHours()).padStart(2, "0")}:${String(reminderDate.getMinutes()).padStart(2, "0")}`;

      await prisma.reminder.create({
        data: {
          companyId,
          customerId: customer.id,
          createdById: callerId || null,
          title: title || `Hatirlatma: ${customer.firmName}`,
          description: `Gorusme: ${descKey}`,
          date: reminderDate,
          time: timeStr,
        },
      });
    }
  }

  res.status(201).json({ success: true, data: shape(meet) });
});

/** GET /api/pg/meet */
const getMeet = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const customerId = String(req.query.customerId || "").trim();
  const where = { companyId };
  if (customerId) where.customerId = customerId;

  const meets = await prisma.meeting.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          firmName: true,
          country: true,
          mail: true,
          phone: true,
        },
      },
    },
    orderBy: { recordDate: "desc" },
  });

  const data = await Promise.all(
    meets.map(async (m) => {
      const mailMeta = await loadMeetingMailMeta(prisma, m);
      return { ...shape(m), mailMeta };
    })
  );

  res.status(200).json({ success: true, data });
});

module.exports = {
  createMeet,
  getMeet,
};
