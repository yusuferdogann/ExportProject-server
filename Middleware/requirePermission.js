const hasPermission = require("../utils/hasPermission");

module.exports = function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user; // JWT’den geliyor

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Owner & Genel Müdür tam erişim
    if (user.role === "owner" || user.role === "general_manager") return next();

    const allowed = hasPermission(user.permissions, permission);

    if (!allowed) {
      return res.status(403).json({
        message: "Forbidden",
        requiredPermission: permission,
      });
    }

    next();
  };
};
