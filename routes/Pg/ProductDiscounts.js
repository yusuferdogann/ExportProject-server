/**
 * /api/pg/product-discounts — PG paralel ProductDiscount route'lari.
 */

const express = require("express");
const {
  getByWorker,
  getByProduct,
  upsert,
  bulkUpsert,
} = require("../../controllers/Pg/ProductDiscounts");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/by-worker", getByWorker);
router.get("/by-product", getByProduct);
router.post("/upsert", upsert);
router.post("/bulk-upsert", bulkUpsert);

module.exports = router;
