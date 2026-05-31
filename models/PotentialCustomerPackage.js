const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/** Potansiyel müşteri kataloğundan türetilen yönetici paket kayıtları (tenant bazlı) */
const PotentialCustomerPackageSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
      index: true,
    },
    sourceCatalogId: { type: String, required: true, trim: true },
    /** Potansiyel müşteri kartının o anki kopyası */
    catalogSnapshot: { type: Schema.Types.Mixed, required: true },
    displayName: { type: String, trim: true, default: "" },
    managerNotes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PotentialCustomerPackageSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model("potentialcustomerpackages", PotentialCustomerPackageSchema);
