const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CompanySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true, // 🔑 subdomain karşılığı
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const CompanyModel = mongoose.model("companies", CompanySchema);
module.exports = CompanyModel;
