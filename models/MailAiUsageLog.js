const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MailAiUsageLogSchema = new Schema(
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
    operation: {
      type: String,
      enum: ["proofread", "translate"],
      required: true,
    },
  },
  { timestamps: true }
);

MailAiUsageLogSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model("mailaiusagelogs", MailAiUsageLogSchema);
