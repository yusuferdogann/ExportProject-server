/**
 * /api/pg/pricequote — PG paralel PriceOffer route'lari.
 */

const express = require("express");
const {
  createPriceQuote,
  getPriceQuotes,
} = require("../../controllers/Pg/PriceOffer");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addpricequote", createPriceQuote);
router.get("/", getPriceQuotes);

module.exports = router;
