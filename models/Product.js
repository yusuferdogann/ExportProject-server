const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProductSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, ref: "companies" },
    tenantId: { type: String, trim: true }, // subdomain / tenant bilgisi
    customerId: { type: Schema.Types.ObjectId, ref: "customers", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "users", default: null },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, trim: true }, // ürün tipi; bazı akışlarda kullanılır
    unit: { type: String, default: "Adet", trim: true },
    defaultPrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ companyId: 1, code: 1 }, { unique: true });
module.exports = mongoose.model("products", ProductSchema);
