const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { createReminder, getReminders } = require("../controllers/Reminder/index");

const router = express.Router();

router.post("/addreminder", getAccessToRoute, createReminder);
router.get("/", getAccessToRoute, getReminders);

module.exports = router;
