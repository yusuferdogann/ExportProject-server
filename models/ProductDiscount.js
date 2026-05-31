const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProductDiscountSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    productId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "products",
    },
    productName: { type: String, trim: true },
    productType: { type: String, trim: true },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

ProductDiscountSchema.index({ companyId: 1, productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("productdiscounts", ProductDiscountSchema);
