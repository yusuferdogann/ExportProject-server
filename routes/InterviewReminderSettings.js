const express = require("express");
const router = express.Router();
const { getSettings, saveSettings } = require("../controllers/InterviewReminderSettings");
const { getAccessToRoute } = require("../Middleware/authorization/auth");

router.get("/", getAccessToRoute, getSettings);
router.post("/", getAccessToRoute, saveSettings);

module.exports = router;
