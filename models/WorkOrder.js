const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WorkOrderSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "done"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("workorders", WorkOrderSchema);
