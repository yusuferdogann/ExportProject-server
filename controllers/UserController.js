const asyncErrorWrapper = require("express-async-handler");
const User = require("../models/User");

const getCompanyUsers = asyncErrorWrapper(async (req, res) => {
  const { id: currentUserId, companyId } = req.user;

  const users = await User.find({ companyId })
    .select("_id username email role permissions")
    .lean();

  res.json({
    success: true,
    data: users.map((u) => ({
      _id: u._id,
      id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      permissions: u.permissions || [],
    }))
  });
});

module.exports = { getCompanyUsers };
