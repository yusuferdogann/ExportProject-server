const express = require("express");
const router = express.Router();
const { chat, semanticSearch, analyzeData } = require("../controllers/Gemini");
const { getAccessToRoute } = require("../Middleware/authorization/auth");

router.post("/chat", getAccessToRoute, chat);
router.post("/search", getAccessToRoute, semanticSearch);
router.post("/analyze", getAccessToRoute, analyzeData);

module.exports = router;
