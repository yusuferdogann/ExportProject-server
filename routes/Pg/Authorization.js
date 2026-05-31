/**
 * /api/pg/authorization — PG paralel Authorization route'lari.
 */

const express = require("express");
const {
  getHierarchy,
  getRoleTemplates,
  getCustomRoles,
  createCustomRole,
  assignRoleToUser,
  getUserDetail,
  getRoleAssignmentLogs,
  addSubUser,
  getPermissionDefinitions,
} = require("../../controllers/Pg/Authorization");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/hierarchy", getHierarchy);
router.get("/role-templates", getRoleTemplates);
router.get("/custom-roles", getCustomRoles);
router.post("/custom-roles", createCustomRole);
router.put("/assign-role/:targetUserId", assignRoleToUser);
router.get("/user/:id/logs", getRoleAssignmentLogs);
router.get("/user/:id", getUserDetail);
router.post("/sub-user", addSubUser);
router.get("/permission-definitions", getPermissionDefinitions);

module.exports = router;
