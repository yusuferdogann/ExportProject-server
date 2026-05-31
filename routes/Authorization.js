const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
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
} = require("../controllers/Authorization");

const router = express.Router();

router.use(getAccessToRoute);

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
