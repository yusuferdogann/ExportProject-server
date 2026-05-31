const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProformaSchema = new Schema(
  {
    // Tenant mantığı
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },

    // Formdan seçilen müşteri
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "customers",
    },

    // 1.row - Teslimat (nested)
    delivery: {
      type: { type: String, trim: true },      // Teslim Şekli
      vehicle: { type: String, trim: true },   // Ulaşım Aracı
      point: { type: String, trim: true },     // Ulaşım Noktası
    },

    // 3.row - Proforma bilgileri
    quoteNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    validUntil: { type: Date, required: true },

    // 4.row - Banka bilgileri (nested)
    bankInfo: {
      name: { type: String, trim: true },
      branch: { type: String, trim: true },
      swiftCode: { type: String, trim: true },
      iban: { type: String, trim: true },
    },

    // 5.row
    originCountry: { type: String, trim: true },
    gtipCode: { type: String, trim: true },

    // 6.row
    note: { type: String, trim: true },

    // 7.row
    totalNetWeight: { type: Number, default: 0 },
    totalGrossWeight: { type: Number, default: 0 },
    totalPackageCount: { type: Number, default: 0 },

    // 🔥 Approval entegrasyonu
    status: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "rejected", "cancelled"],
      default: "draft",
    },
    approvalId: {
      type: Schema.Types.ObjectId,
      ref: "Approval",
      index: true,
    },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },

    document: {
      public_id: { type: String },
      secure_url: { type: String },
      resource_type: { type: String, default: "raw" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Proforma", ProformaSchema);
