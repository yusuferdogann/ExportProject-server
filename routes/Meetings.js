const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { getMeet,createMeet } = require("../controllers/Meets/index");

const router = express.Router();

router.post("/addmeet", getAccessToRoute, createMeet);
router.get("/", getAccessToRoute, getMeet);

module.exports = router;
