const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Yönetici tarafından belirlenen zorunlu rapor: hangi çalışan, periyot tipi, son tarih
const MandatoryReportSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "companies", required: true },
    workerId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    deadlineDate: { type: Date, required: true },
    periodType: { type: String, enum: ["günlük", "haftalık", "aylık"], default: "aylık" },
    periodMonth: { type: Number }, // 1-12 (aylık için)
    periodYear: { type: Number }, // (aylık için)
  },
  { timestamps: true }
);

MandatoryReportSchema.index({ companyId: 1, workerId: 1, periodYear: 1, periodMonth: 1 }, { unique: true });

module.exports = mongoose.model("MandatoryReport", MandatoryReportSchema);
