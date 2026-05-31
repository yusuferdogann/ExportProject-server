const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Ön uç heartbeat ile biriken oturum dakikaları (şirket / kullanıcı / opsiyonel müşteri bağlamı).
 */
const MonthlyUsageMinuteSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
      index: true,
    },
    /** Müşteri sayfası yoksa "_" */
    customerScopeKey: { type: String, default: "_", index: true },
    yearMonth: { type: String, required: true, trim: true },
    minutes: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

MonthlyUsageMinuteSchema.index(
  { companyId: 1, userId: 1, yearMonth: 1, customerScopeKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("monthlyusageminutes", MonthlyUsageMinuteSchema);
