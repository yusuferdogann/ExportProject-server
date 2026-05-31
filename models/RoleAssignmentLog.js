const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const RoleAssignmentLogSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    roleName: {
      type: String,
      required: true,
      trim: true,
    },
    roleType: {
      type: String,
      enum: ["template", "custom"],
      required: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      refPath: "roleModel",
    },
    roleModel: {
      type: String,
      enum: ["roletemplates", "customroles"],
    },
    permissions: {
      type: [String],
      default: [],
    },
    action: {
      type: String,
      enum: ["assigned", "updated", "removed"],
      default: "assigned",
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

RoleAssignmentLogSchema.index({ companyId: 1, targetUserId: 1, createdAt: -1 });
const RoleAssignmentLogModel = mongoose.model("roleassignmentlogs", RoleAssignmentLogSchema);
module.exports = RoleAssignmentLogModel;
