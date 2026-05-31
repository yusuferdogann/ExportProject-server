const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { proofread, translate } = require("../controllers/MailAiController");

const router = express.Router();

router.use(getAccessToRoute);

router.post("/proofread", proofread);
router.post("/translate", translate);

module.exports = router;
