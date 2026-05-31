const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CustomerSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },
    firmName: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    mail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    personName: {
      type: String,
      trim: true,
    },
    personTitle: {
      type: String,
      trim: true,
    },
    saveDate: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
  },
  { timestamps: true }
);

const CustomerModel = mongoose.model("customers", CustomerSchema);
module.exports = CustomerModel;
