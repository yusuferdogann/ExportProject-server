const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  getList,
  markAsRead,
  markAllAsRead
} = require("../controllers/NotificationController");

const router = express.Router();

router.use(getAccessToRoute);

router.get("/", getList);
router.patch("/:id/read", markAsRead);
router.patch("/read-all", markAllAsRead);

module.exports = router;
