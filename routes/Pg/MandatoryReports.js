/**
 * /api/pg/mandatory-reports — PG paralel MandatoryReport route'lari.
 */

const express = require("express");
const {
  list,
  createOrUpdate,
  checkPending,
  remove,
  getWorkers,
} = require("../../controllers/Pg/MandatoryReports");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/", list);
router.post("/", createOrUpdate);
router.get("/check", checkPending);
router.get("/workers", getWorkers);
router.delete("/:id", remove);

module.exports = router;
