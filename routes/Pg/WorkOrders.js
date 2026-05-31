/**
 * /api/pg/workorders — PG paralel WorkOrder route'lari.
 */

const express = require("express");
const {
  createWorkOrder,
  getWorkOrders,
} = require("../../controllers/Pg/WorkOrders");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/", getWorkOrders);
router.post("/", createWorkOrder);

module.exports = router;
