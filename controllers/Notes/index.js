const Notes = require("../../models/Notes");
const Customer = require("../../models/Customers");

// Yeni note ekleme
const createNote = async (req, res) => {
  try {
    const { customerId, title, description, date } = req.body;

    // Müşteriyi doğrula
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Müşteri bulunamadı",
      });
    }

    // Note oluştur
    const note = await Notes.create({
      companyId: customer.companyId,
      customerId: customer._id,
      title,
      description,
      date: date ? new Date(date) : new Date(),
    });

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Not kaydedilemedi",
      error: error.message,
    });
  }
};

// Bir müşteri veya company için notları listeleme
const getNotes = async (req, res) => {
  try {
    const { customerId } = req.query; // opsiyonel: sadece belirli müşteri
    const query = {
      companyId: req.user.companyId || req.user.id,
    };

    if (customerId) query.customerId = customerId;

    const notes = await Notes.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Notlar alınamadı",
      error: error.message,
    });
  }
};

module.exports = {
  createNote,
  getNotes,
};
