const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { list, createOrUpdate, checkPending, remove, getWorkers } = require("../controllers/MandatoryReport");

router.get("/", getAccessToRoute, list);
router.post("/", getAccessToRoute, createOrUpdate);
router.get("/check", getAccessToRoute, checkPending);
router.get("/workers", getAccessToRoute, getWorkers);
router.delete("/:id", getAccessToRoute, remove);

module.exports = router;
