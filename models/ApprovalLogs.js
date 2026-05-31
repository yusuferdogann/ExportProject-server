const mongoose = require("mongoose");
const { Schema } = mongoose;

const ApprovalLogSchema = new Schema(
  {
    approvalId: { type: Schema.Types.ObjectId, required: true, ref: "Approval" },
    stepId: { type: Schema.Types.ObjectId, ref: "ApprovalStep" },
    action: {
      type: String,
      required: true, // created | approved | rejected | delegated | commented
    },
    userId: { type: Schema.Types.ObjectId, ref: "users" },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApprovalLog", ApprovalLogSchema);

