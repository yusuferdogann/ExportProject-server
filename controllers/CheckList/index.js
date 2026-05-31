const Checklist = require("../../models/Checklist");
const Customer = require("../../models/Customers");
const mongoose = require("mongoose");
const { generateChecklistPdf, uploadPdfToCloudinary } = require("../../services/pdfService");

const createChecklist = async (req, res) => {
  try {
    const {
      customerId,
      invoiceNumber,
      truckPlate,
      note,
      products,
      totalPrice,
      totalNetWeight,
      totalGrossWeight,
      totalPackageCount,
      language = "tr",
    } = req.body;

    const customerDoc = customerId ? await Customer.findById(customerId).lean() : null;

    const checklist = await Checklist.create({
      companyId: req.user.companyId || req.user.id,
      customerId,
      invoiceNumber,
      truckPlate,
      note,
      products,
      totalPrice,
      totalNetWeight,
      totalGrossWeight,
      totalPackageCount,
      language,
    });

    const data = checklist.toObject ? checklist.toObject() : { ...checklist };
    data.customer = customerDoc || {};
    const pdfBuffer = await generateChecklistPdf(data, language);
    const cloudResult = await uploadPdfToCloudinary(pdfBuffer, `checklist-${checklist.invoiceNumber}`, "checklists");

    checklist.document = {
      public_id: cloudResult.public_id,
      secure_url: cloudResult.secure_url,
      asset_id: cloudResult.asset_id,
      version: cloudResult.version,
      resource_type: cloudResult.resource_type || "raw",
    };
    await checklist.save();

    return res.status(201).json({
      success: true,
      data: checklist,
    });

  } catch (error) {
    console.error("CREATE CHECKLIST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Checkliste kaydedilemedi",
      error: error.message,
    });
  }
};


const getChecklists = async (req, res) => {
  try {
    const checklists = await Checklist.find({
      companyId: req.user.companyId || req.user.id,
    })
      .populate("customerId") // müşteri bilgisi göstermek için
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: checklists,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Checkliste listesi alınamadı",
      error: error.message,
    });
  }
};

module.exports = {
  createChecklist,
  getChecklists,
};
