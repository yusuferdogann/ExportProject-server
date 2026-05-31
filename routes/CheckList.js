const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { createChecklist, getChecklists } = require("../controllers/CheckList/index");

const router = express.Router();

// Checkliste oluştur
router.post("/addchecklist", getAccessToRoute, createChecklist);

// Checkliste listele (tenant bazlı)
router.get("/", getAccessToRoute, getChecklists);

module.exports = router;
