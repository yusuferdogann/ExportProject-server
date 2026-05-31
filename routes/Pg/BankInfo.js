/**
 * /api/pg/bank — PG paralel BankInfo route'lari.
 */

const express = require("express");
const {
  getBanks,
  createBank,
  updateBank,
  deleteBank,
} = require("../../controllers/Pg/BankInfo");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/", getBanks);
router.post("/", createBank);
router.put("/:id", updateBank);
router.delete("/:id", deleteBank);

module.exports = router;
