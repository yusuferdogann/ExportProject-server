const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NotificationSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    type: {
      type: String,
      default: "info", // info, warning, alert gibi
    },
  },
  { timestamps: true }
);

const NotificationModel = mongoose.model("notifications", NotificationSchema);
module.exports = NotificationModel;
