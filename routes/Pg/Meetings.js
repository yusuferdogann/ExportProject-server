/**
 * /api/pg/meet — PG paralel Meeting route'lari.
 */

const express = require("express");
const { createMeet, getMeet } = require("../../controllers/Pg/Meetings");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addmeet", createMeet);
router.get("/", getMeet);

module.exports = router;
