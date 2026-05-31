const express = require("express");
const { createCustomer,getCustomers } = require("../controllers/Customer/index");
const { getAccessToRoute } = require("../Middleware/authorization/auth");

const router = express.Router();

router.post("/addcustomer", getAccessToRoute, createCustomer);
router.get("/", getAccessToRoute, getCustomers);

module.exports = router;
