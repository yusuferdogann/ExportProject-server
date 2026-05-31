const mongoose = require("mongoose");

const ApprovalSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "company" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    entityType: { type: String, required: true }, // e.g., "product", "leave"
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true }, 
    status: { type: String, default: "pending" }, // pending | approved | rejected | cancelled
    currentStep: { type: Number, default: 1 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Approval", ApprovalSchema);