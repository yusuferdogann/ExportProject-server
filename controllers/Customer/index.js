const Customer = require("../../models/Customers");


const createCustomer = async (req, res) => {
  try {
    const {
      firmName,
      country,
      address,
      code,
      phone,
      mail,
      website,
      personName,
      personTitle,
      saveDate,
      companyId,
    } = req.body;

    const customer = await Customer.create({
      firmName,
      country,
      address,
      code,
      phone,
      mail,
      website,
      personName,
      personTitle,
      saveDate,
      companyId,
      userId: req.user.id, // auth middleware’den geliyor
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Customer kayıt edilemedi",
      error: error.message,
    });
  }
};

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({
      companyId: req.user.companyId || req.user.id, // company bazlı
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Customer listesi alınamadı",
      error: error.message,
    });
  }
};


module.exports = {
  createCustomer,
  getCustomers
};
