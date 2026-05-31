/**
 * /api/pg/reminder — PG paralel Reminder route'lari.
 */

const express = require("express");
const {
  createReminder,
  getReminders,
} = require("../../controllers/Pg/Reminders");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addreminder", createReminder);
router.get("/", getReminders);

module.exports = router;
