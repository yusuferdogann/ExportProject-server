/**
 * /api/pg/checklist — PG paralel Checklist route'lari.
 */

const express = require("express");
const {
  createChecklist,
  getChecklists,
} = require("../../controllers/Pg/Checklist");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addchecklist", createChecklist);
router.get("/", getChecklists);

module.exports = router;
