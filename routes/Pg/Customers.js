/**
 * /api/pg/customer — PG paralel Customer route'lari.
 * Mongo karsiligi: server/routes/Customers.js (POST /addcustomer, GET /)
 * Ek olarak: GET /:id, PATCH /:id, DELETE /:id eklendi (Mongo'da yoktu).
 */

const express = require("express");
const {
  createCustomer,
  checkDuplicateCustomer,
  getCustomers,
  getOne,
  updateCustomer,
  deleteCustomer,
} = require("../../controllers/Pg/Customers");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.post("/addcustomer", createCustomer);
router.post("/check-duplicate", checkDuplicateCustomer);
router.get("/", getCustomers);
router.get("/:id", getOne);
router.patch("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;
