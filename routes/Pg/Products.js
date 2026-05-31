/**
 * /api/pg/products — PG paralel Product route'lari.
 */

const express = require("express");
const {
  getProducts,
  createProduct,
  bulkCreateProducts,
} = require("../../controllers/Pg/Products");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/", getProducts);
router.post("/", createProduct);
router.post("/bulk", bulkCreateProducts);

module.exports = router;
