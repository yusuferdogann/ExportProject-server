const InterviewReminderSettings = require("../../models/InterviewReminderSettings");

const getSettings = async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.id;
    const list = await InterviewReminderSettings.find({ companyId }).lean();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Ayarlar alınamadı",
      error: error.message,
    });
  }
};

const saveSettings = async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.id;
    const { settings } = req.body;

    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, message: "settings array gerekli" });
    }

    for (const s of settings) {
      const { descriptionKey, value, unit } = s;
      if (!descriptionKey || value == null || !unit) continue;
      await InterviewReminderSettings.findOneAndUpdate(
        { companyId, descriptionKey },
        { value: Number(value), unit },
        { upsert: true, new: true }
      );
    }

    const list = await InterviewReminderSettings.find({ companyId }).lean();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Ayarlar kaydedilemedi",
      error: error.message,
    });
  }
};

module.exports = {
  getSettings,
  saveSettings,
};
