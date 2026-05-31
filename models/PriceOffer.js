const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PriceQuoteSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "customers",
    },
    products: [
      {
        name: { type: String, required: true, trim: true },
        unit: { type: String, trim: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        photo: { type: String, default: "" },
        total: { type: Number, required: true },
      },
    ],
    delivery: {
      type: { type: String, trim: true },
      vehicle: { type: String, trim: true },
      point: { type: String, trim: true },
    },
    priceInfo: {
      quoteNumber: { type: String, required: true, trim: true },
      invoiceDate: { type: Date, required: true },
      validUntil: { type: Date, required: true },
    },
    destinationCountry: {
      type: String,
      required: true,
      trim: true,
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
  },
  { timestamps: true }
);

const PriceQuoteModel = mongoose.model("pricequotes", PriceQuoteSchema);
module.exports = PriceQuoteModel;
