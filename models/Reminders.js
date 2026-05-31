const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ReminderSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "customers",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    notificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Reminder = mongoose.model("reminders", ReminderSchema);
module.exports = Reminder;
