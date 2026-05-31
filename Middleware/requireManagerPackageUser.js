/** Yalnızca belirli kurumsal paket yöneticisi e-postası (manager@gmail.com) */

const User = require("../models/User");

const MANAGER_EMAIL = String(
  process.env.MANAGER_PACKAGES_EMAIL || "manager@gmail.com"
)
  .trim()
  .toLowerCase();

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

module.exports = async function requireManagerPackageUser(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  let email = normalizeEmail(user.email);
  if (!email && user.id) {
    try {
      const u = await User.findById(user.id).select("email").lean();
      email = normalizeEmail(u?.email);
      if (email) req.user.email = email;
    } catch {
      /* noop */
    }
  }
  if (email !== MANAGER_EMAIL) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

module.exports.MANAGER_PACKAGES_EMAIL = MANAGER_EMAIL;
