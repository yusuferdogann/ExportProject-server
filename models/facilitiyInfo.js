const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FacilityInfoSchema = new Schema({
  companyId: {
    type: Schema.Types.ObjectId,
    ref: "companies",
    required: true,
    unique: true,
    index: true,
  },
  companyName: {
    type: String,
    // required: true,
  },
  cknNumber: {
    type: String,
    // required: true,
  },
  companyNumber: {
    type: String,
    trim: true,
  },
  companyMail: {
    type: String,
    // required: true,
  },
  companyWebsite: {
    type: String,
    trim: true,
  },
  fieldActivity: {
    type: String,
    // required: true,
  },
  closeArea: {
    type: String,
    // required: true,
  },
  openArea: {
    type: String,
    // required: true,
  },
  workerCount: {
    type: String,
    // required: true,
  },
  totalArea: {
    type: String,
    // required: true,
  },
  address: {
    type: String,
    // required: true,
  },
  companyLogo: {
    type: String,
    default: "",
  },
  /**
   * Eski yapıdan kalan bağ: artık companyId bazında tek kayıt hedefleniyor.
   * Legacy uyumluluk için opsiyonel bırakıldı.
   */
  facilityId: {
    type: Schema.Types.ObjectId,
    required: false,
    ref: "facilities",
    default: null,
  },
});

const FacilityInfoModel = mongoose.model("facilityInfo", FacilityInfoSchema);
module.exports = FacilityInfoModel;
