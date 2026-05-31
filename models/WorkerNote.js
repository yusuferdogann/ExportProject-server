const mongoose = require("mongoose");

const workerNoteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    createdDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed"],
      default: "open",
    },
    read: {
      type: Boolean,
      default: false,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Tenant",
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Customer",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkerNote", workerNoteSchema);