const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RoleTemplateSchema = new Schema(
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
    description: {
      type: String,
      trim: true,
      default: "",
    },
    permissions: {
      type: [String],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

RoleTemplateSchema.index({ companyId: 1, name: 1 }, { unique: true });
const RoleTemplateModel = mongoose.model("roletemplates", RoleTemplateSchema);
module.exports = RoleTemplateModel;
