const Meet = require("../../models/Meetings");
const Customer = require("../../models/Customers");
const Reminder = require("../../models/Reminders");
const InterviewReminderSettings = require("../../models/InterviewReminderSettings");

function addTime(date, value, unit) {
  const d = new Date(date);
  switch (unit) {
    case "dakika": d.setMinutes(d.getMinutes() + value); break;
    case "saat": d.setHours(d.getHours() + value); break;
    case "gun": d.setDate(d.getDate() + value); break;
    case "hafta": d.setDate(d.getDate() + value * 7); break;
    case "ay": d.setMonth(d.getMonth() + value); break;
    default: d.setDate(d.getDate() + value);
  }
  return d;
}

const createMeet = async (req, res) => {
    try {
        const { customerId, status, description, title, date, noteDetail } = req.body;
        const descKey = description || status;

        if (descKey === "ozelNot" && !String(noteDetail || "").trim()) {
            return res.status(400).json({
                success: false,
                message: "Not 2 detayı zorunludur",
            });
        }

        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Müşteri bulunamadı",
            });
        }

        const companyId = customer.companyId;
        const meetDate = date ? new Date(date) : new Date();
        const meet = await Meet.create({
            companyId,
            customerId: customer._id,
            firmName: customer.firmName,
            mail: customer.mail,
            phone: customer.phone,
            status: descKey || status,
            title: title ? String(title).trim() : "",
            meetDate,
            noteDetail: descKey === "ozelNot" ? String(noteDetail).trim() : "",
            recordDate: new Date(),
        });

        // Otomatik hatırlatma: Ayarlarda bu açıklama için süre varsa Reminder oluştur
        if (descKey) {
            const setting = await InterviewReminderSettings.findOne({
                companyId,
                descriptionKey: descKey,
            });
            if (setting && setting.value > 0) {
                // "Dakika" için mevcut zamandan, diğer birimler için görüşme tarihinden hesapla
                const baseDate = (setting.unit === "dakika") ? new Date() : (date ? new Date(date) : new Date());
                const reminderDate = addTime(baseDate, setting.value, setting.unit);
                const timeStr = `${String(reminderDate.getHours()).padStart(2, "0")}:${String(reminderDate.getMinutes()).padStart(2, "0")}`;
                await Reminder.create({
                    companyId,
                    customerId: customer._id,
                    createdBy: req.user?.id,
                    title: title || `Hatırlatma: ${customer.firmName}`,
                    description: `Görüşme: ${descKey}`,
                    date: reminderDate,
                    time: timeStr,
                });
            }
        }

        res.status(201).json({
            success: true,
            data: meet,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Görüşme kaydedilemedi",
            error: error.message,
        });
    }
};

const getMeet = async (req, res) => {
    try {
        const meets = await Meet.find({
            companyId: req.user.companyId || req.user.id,
        })
            .populate("customerId")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: meets,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Görüşme listesi alınamadı",
            error: error.message,
        });
    }
};

module.exports = {
    createMeet,
    getMeet,
};