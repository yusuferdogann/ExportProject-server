/**
 * /api/pg/note — PG paralel Note route'lari.
 */

const express = require("express");
const { createNote, getNotes } = require("../../controllers/Pg/Notes");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addnote", createNote);
router.get("/", getNotes);

module.exports = router;
