const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ChecklistSchema = new Schema(
  {
    // Tenant mantığı
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },

    // Seçilen müşteri
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "customers",
      default: null,
    },

    // Fatura bilgileri
    invoiceNumber: { 
      type: String, 
      required: true, 
      trim: true 
    },

    truckPlate: { type: String, trim: true },

    invoiceDate: { type: Date },
    gtipCode: { type: String, trim: true },
    originCountry: { type: String, trim: true },
    masterPackageUnit: { type: String, trim: true },
    grandTotalKgs: { type: Number },
    sellerName: { type: String, trim: true },
    sellerAddress: { type: String, trim: true },
    sellerPhone: { type: String, trim: true },
    sellerEmail: { type: String, trim: true },
    sellerTaxId: { type: String, trim: true },
    sellerTaxOffice: { type: String, trim: true },
    sellerWebsite: { type: String, trim: true },
    customerAddress: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    customerPhone: { type: String, trim: true },

    note: { 
      type: String, 
      trim: true 
    },

    // Ürünler tablosu
    products: [
      {
        code: { type: String, trim: true },
        name: { type: String, trim: true },
        master: { type: String, trim: true },

        qty: { 
          type: Number, 
          default: 0,
          min: 0,
        },

        net: { 
          type: Number, 
          default: 0,
          min: 0,
        },

        gross: { 
          type: Number,   // 🔥 artık number
          default: 0,
          min: 0,
        },

        price: { 
          type: Number,   // 🔥 artık number
          default: 0,
          min: 0,
        },
      },
    ],

    // Toplamlar
    totalPrice: { 
      type: Number, 
      default: 0,
      min: 0,
    },

    totalNetWeight: { 
      type: Number, 
      default: 0,
      min: 0,
    },

    totalGrossWeight: { 
      type: Number, 
      default: 0,
      min: 0,
    },

    totalPackageCount: { 
      type: Number, 
      default: 0,
      min: 0,
    },

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

    language: { type: String, enum: ["tr", "en"], default: "tr" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Checklist", ChecklistSchema);
