const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { createWorkOrder, getWorkOrders } = require("../controllers/WorkOrder");

const router = express.Router();
router.use(getAccessToRoute);

router.post("/", createWorkOrder);
router.get("/", getWorkOrders);

module.exports = router;
