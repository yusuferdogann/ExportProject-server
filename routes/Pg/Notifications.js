/**
 * /api/pg/notifications — PG paralel Notification route'lari.
 */

const express = require("express");
const {
  getList,
  markAsRead,
  markAllAsRead,
  createNotification,
} = require("../../controllers/Pg/Notifications");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/", getList);
router.post("/", createNotification);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

module.exports = router;
