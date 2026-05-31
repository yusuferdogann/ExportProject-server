const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { getByWorker, getByProduct, upsert, bulkUpsert } = require("../controllers/ProductDiscount");

const router = express.Router();
router.use(getAccessToRoute);
router.get("/by-worker", getByWorker);
router.get("/by-product", getByProduct);
router.post("/upsert", upsert);
router.post("/bulk-upsert", (req, res, next) => {
  console.log("[ProductDiscount route] POST /bulk-upsert hit, body.items length:", req.body?.items?.length);
  next();
}, bulkUpsert);
module.exports = router;
