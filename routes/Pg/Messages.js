/**
 * /api/pg/messages — PG paralel Message route'lari.
 */

const express = require("express");
const {
  getInbox,
  getSent,
  sendMessage,
  markAsRead,
  deleteMessage,
  getConversation,
} = require("../../controllers/Pg/Messages");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/inbox", getInbox);
router.get("/sent", getSent);
router.post("/", sendMessage);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteMessage);
router.get("/conversation/:userId", getConversation);

module.exports = router;
