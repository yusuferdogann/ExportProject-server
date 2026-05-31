const mongoose = require("mongoose");
const { Schema } = mongoose;

const MailTemplateSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

MailTemplateSchema.index({ companyId: 1, order: 1 });

module.exports = mongoose.model("mailtemplates", MailTemplateSchema);
