const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/** Heartbeat tekrarını sınırlamak için son ping zamanı */
const UsageLastPingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "users",
    },
    lastBeatAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("usagelastpings", UsageLastPingSchema);
