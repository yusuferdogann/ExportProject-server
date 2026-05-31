const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  getInbox,
  getSent,
  sendMessage,
  markAsRead,
  deleteMessage,
  getConversation,
} = require("../controllers/MessageController");

const router = express.Router();

router.use(getAccessToRoute);

router.get("/inbox", getInbox);
router.get("/sent", getSent);
router.post("/", sendMessage);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteMessage);
router.get("/conversation/:userId", getConversation);

module.exports = router;
