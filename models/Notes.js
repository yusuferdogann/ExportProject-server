const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const NotesSchema = new Schema(
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
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const NotesModel = mongoose.model("noties", NotesSchema);
module.exports = NotesModel;
