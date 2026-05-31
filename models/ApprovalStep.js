const mongoose = require("mongoose");
const { Schema } = mongoose;

const ApprovalStepSchema = new Schema(
  {
    approvalId: { type: Schema.Types.ObjectId, required: true, ref: "Approval" },
    stepOrder: { type: Number, required: true },
    role: { type: String, required: true }, // manager | finance | owner
    assignedTo: { type: Schema.Types.ObjectId, ref: "users" }, // opsiyonel
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    actionBy: { type: Schema.Types.ObjectId, ref: "users" },
    actionAt: { type: Date },
    comment: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApprovalStep", ApprovalStepSchema);

