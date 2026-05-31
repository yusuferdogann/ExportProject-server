const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const InvoiceSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
      index: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "customers",
      required: true,
    },

    invoiceNo: {
      type: String,
      required: true,
      trim: true,
    },

    invoiceDate: {
      type: Date,
      required: true,
      index: true,
    },

    delivery: { type: String, trim: true },
    destinationCountry: { type: String, trim: true },
    gtip: { type: String, trim: true },

    bank: {
      name: String,
      branch: String,
      swift: String,
      iban: String,
    },

    products: [
      {
        description: String,
        quantity: { type: Number, default: 0 },
        unit: String,
        unitPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },
    ],

    totalAmount: { type: Number, default: 0 },

    // 🔥 DOCUMENT LIFECYCLE STATUS
    status: {
      type: String,
      enum: [
        "draft",
        "pending_approval",
        "approved",
        "rejected",
        "cancelled",
        "archived",
      ],
      default: "draft",
      index: true,
    },

    // 🔥 Approval bağlantısı
    approvalId: {
      type: Schema.Types.ObjectId,
      ref: "Approval",
      index: true,
    },

    submittedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },

    // 🔥 Cloudinary Document Metadata
    document: {
      public_id: { type: String },
      secure_url: { type: String },
      asset_id: { type: String },
      version: { type: Number },
      resource_type: { type: String, default: "raw" },
    },

    documentStatus: {
      type: String,
      enum: ["pending", "generated", "failed"],
      default: "pending",
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Multi-tenant unique
InvoiceSchema.index({ companyId: 1, invoiceNo: 1 }, { unique: true });

module.exports = mongoose.model("Invoice", InvoiceSchema);