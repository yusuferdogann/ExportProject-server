const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const InterviewReminderSettingsSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "company",
    },
    descriptionKey: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
      min: 1,
    },
    unit: {
      type: String,
      required: true,
      enum: ["dakika", "saat", "gun", "hafta", "ay"],
    },
  },
  { timestamps: true }
);

InterviewReminderSettingsSchema.index({ companyId: 1, descriptionKey: 1 }, { unique: true });

const InterviewReminderSettings = mongoose.model("interview_reminder_settings", InterviewReminderSettingsSchema);
module.exports = InterviewReminderSettings;
