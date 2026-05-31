/**
 * /api/pg/proforma — PG paralel Proforma route'lari.
 */

const express = require("express");
const {
  createProforma,
  getProformas,
} = require("../../controllers/Pg/Proforma");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addproforma", createProforma);
router.get("/", getProformas);

module.exports = router;
