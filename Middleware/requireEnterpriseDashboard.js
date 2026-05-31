const { ROLES } = require("../constants/roles");

const ENTERPRISE_DASHBOARD_ROLES = [
  ROLES.ADMINISTRATOR,
  ROLES.OWNER,
  ROLES.GENERAL_MANAGER,
];

module.exports = function requireEnterpriseDashboard(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (!ENTERPRISE_DASHBOARD_ROLES.includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};
