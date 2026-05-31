const PriceQuote = require("../../models/PriceOffer");
const Customer = require("../../models/Customers");
const { generatePriceQuotePdf, uploadPdfToCloudinary } = require("../../services/pdfService");
const Approval = require("../../models/Approval");
const ApprovalStep = require("../../models/ApprovalStep");
const ApprovalLog = require("../../models/ApprovalLogs");

const createPriceQuote = async (req, res) => {
  try {
    const companyId = req.user.companyId || req.user.id;
    const {
      customerId,
      products = [],
      delivery = {},
      priceInfo = {},
      destinationCountry,
    } = req.body || {};

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId zorunludur",
      });
    }

    const customerDoc = await Customer.findOne({
      _id: customerId,
      companyId,
    });

    if (!customerDoc) {
      return res.status(404).json({
        success: false,
        message: "Müşteri bulunamadı",
      });
    }

    const quotePayload = {
      companyId,
      customerId: customerDoc._id,
      products: products.map((p) => {
        const qty = Number(p.quantity || 0);
        const price = Number(p.price || 0);
        return {
          name: p.name,
          unit: p.unit,
          quantity: qty,
          price,
          photo: p.photo || "",
          total: Number(p.total || qty * price),
        };
      }),
      delivery: {
        type: delivery.type,
        vehicle: delivery.vehicle,
        point: delivery.point,
      },
      priceInfo: {
        quoteNumber: priceInfo.quoteNumber,
        invoiceDate: priceInfo.invoiceDate,
        validUntil: priceInfo.validUntil,
      },
      destinationCountry,
      status: "pending_approval",
    };

    const quote = await PriceQuote.create(quotePayload);

    // PDF oluştur -> Cloudinary'e yükle -> MongoDB document alanını güncelle
    const data = quote.toObject ? quote.toObject() : { ...quote };
    data.customer = customerDoc.toObject ? customerDoc.toObject() : customerDoc;
    const pdfBuffer = await generatePriceQuotePdf(data);
    const qn = data.priceInfo?.quoteNumber || quote._id.toString();
    const cloudResult = await uploadPdfToCloudinary(pdfBuffer, `pricequote-${qn}`, "pricequotes");

    quote.document = {
      public_id: cloudResult.public_id,
      secure_url: cloudResult.secure_url,
      asset_id: cloudResult.asset_id,
      version: cloudResult.version,
      resource_type: cloudResult.resource_type || "raw",
    };
    await quote.save();

    const approval = await Approval.create({
      companyId,
      createdBy: req.user.id,
      entityType: "pricequote",
      entityId: quote._id,
      status: "pending",
      currentStep: 1,
    });

    const step = await ApprovalStep.create({
      approvalId: approval._id,
      stepOrder: 1,
      role: "manager",
      status: "pending",
    });

    await ApprovalLog.create({
      approvalId: approval._id,
      stepId: step._id,
      action: "created",
      userId: req.user.id,
      comment: "Fiyat teklifi oluşturuldu",
    });

    quote.approvalId = approval._id;
    quote.submittedAt = new Date();
    await quote.save();

    res.status(201).json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error("[DEBUG] Error in createPriceQuote:", error);
    res.status(500).json({
      success: false,
      message: "PriceQuote kaydedilemedi",
      error: error.message,
    });
  }
};

const getPriceQuotes = async (req, res) => {
  try {
    const priceQuotes = await PriceQuote.find({
      companyId: req.user.companyId || req.user.id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: priceQuotes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Teklif listesi alınamadı",
      error: error.message,
    });
  }
};

module.exports = {
  createPriceQuote,
  getPriceQuotes,
};
