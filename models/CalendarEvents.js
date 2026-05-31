const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    date: { type: Date }, // geriye uyumluluk
    startDate: { type: Date }, // başlangıç (veya date ile geriye uyum)
    endDate: { type: Date }, // bitiş (opsiyonel)
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
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    assignedToName: { type: String },
    creatorName: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CalendarEvent", calendarEventSchema);