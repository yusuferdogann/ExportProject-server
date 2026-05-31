const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { postHeartbeat } = require("../controllers/UsageHeartbeat");

const router = express.Router();

router.use(getAccessToRoute);
router.post("/heartbeat", postHeartbeat);

module.exports = router;
