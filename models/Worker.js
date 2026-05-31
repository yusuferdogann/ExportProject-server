const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WorkerSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    avatar: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "workers",
      default: null,
    },
  },
  { timestamps: true }
);

const WorkerModel = mongoose.model("workers", WorkerSchema);
module.exports = WorkerModel;
