const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const BankinfoSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    sube: {
      type: String,
      trim: true,
    },
    switch: {
      type: String,
      trim: true,
    },
    iban: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["bekliyor", "onaylandi", "reddedildi", "revize"],
      default: "bekliyor",
    },
    accountHolder: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const BankinfoModel = mongoose.model("bankinfos", BankinfoSchema);
module.exports = BankinfoModel;

