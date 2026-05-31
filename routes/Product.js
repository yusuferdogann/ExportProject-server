const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { getProducts, createProduct, bulkCreateProducts } = require("../controllers/Product");

const router = express.Router();
router.use(getAccessToRoute);
router.get("/", getProducts);
router.post("/", createProduct);
router.post("/bulk", bulkCreateProducts);
module.exports = router;
