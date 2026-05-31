const Reminder = require("../../models/Reminders");
const Customer = require("../../models/Customers");

// Yeni reminder ekleme
const createReminder = async (req, res) => {
  try {
    const { customerId, title, description, date, time } = req.body;
    const companyId = req.user.companyId || req.user.id;
    const createdBy = req.user.id;

    // Müşteriyi doğrula
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Müşteri bulunamadı",
      });
    }

    // Reminder oluştur
    const reminder = await Reminder.create({
      companyId,
      customerId: customer._id,
      createdBy,
      title,
      description: description || "",
      date: date ? new Date(date) : new Date(),
      time,
    });

    res.status(201).json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Reminder kaydedilemedi",
      error: error.message,
    });
  }
};

// Bir müşteri veya şirket için reminderları listeleme
const getReminders = async (req, res) => {
  try {
    const { customerId } = req.query; // opsiyonel: sadece belirli müşteri
    const query = {
      companyId: req.user.companyId || req.user.id,
    };

    if (customerId) query.customerId = customerId;

    const reminders = await Reminder.find(query).sort({ date: 1, time: 1 });

    res.status(200).json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Reminderlar alınamadı",
      error: error.message,
    });
  }
};

module.exports = {
  createReminder,
  getReminders,
};
