const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CustomRoleSchema = new Schema(
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
    permissions: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    assignedUserIds: {
      type: [Schema.Types.ObjectId],
      ref: "users",
      default: [],
    },
  },
  { timestamps: true }
);

CustomRoleSchema.index({ companyId: 1, name: 1 }, { unique: true });
const CustomRoleModel = mongoose.model("customroles", CustomRoleSchema);
module.exports = CustomRoleModel;
