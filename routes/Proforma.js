const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { createProforma, getProformas } = require("../controllers/Proforma");

const router = express.Router();

// Proforma oluştur
router.post("/addproforma", getAccessToRoute, createProforma);

// Proforma listele (tenant bazlı)
router.get("/", getAccessToRoute, getProformas);

module.exports = router;
