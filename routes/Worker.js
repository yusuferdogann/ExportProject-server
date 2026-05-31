const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  createAccountForWorker,
} = require("../controllers/Worker");
const { createWorkOrder, getWorkOrders } = require("../controllers/WorkOrder");

const router = express.Router();

router.use(getAccessToRoute);
router.get("/work-orders", getWorkOrders);
router.post("/work-orders", createWorkOrder);
router.get("/", getWorkers);
router.post("/", createWorker);
router.post("/create-account/:id", (req, res, next) => {
  console.debug("[Worker route] POST /create-account/:id hit, params:", req.params);
  next();
}, createAccountForWorker);
router.put("/:id", updateWorker);
router.delete("/:id", deleteWorker);

module.exports = router;
