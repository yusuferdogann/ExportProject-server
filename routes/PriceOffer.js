const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {createPriceQuote,getPriceQuotes} = require("../controllers/PriceOffer/index.js");

const router = express.Router();

router.post("/addpricequote", getAccessToRoute, createPriceQuote);
router.get("/", getAccessToRoute, getPriceQuotes);

module.exports = router;
