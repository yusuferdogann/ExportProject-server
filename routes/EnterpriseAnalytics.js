const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const requireEnterpriseDashboard = require("../Middleware/requireEnterpriseDashboard");
const { getOverview } = require("../controllers/EnterpriseAnalytics");

const router = express.Router();

router.use(getAccessToRoute);
router.get("/overview", requireEnterpriseDashboard, getOverview);

module.exports = router;
