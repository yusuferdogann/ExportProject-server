/**
 * /api/pg/workers — PG paralel Worker route'lari.
 * NOT: Mongo'da /work-orders alt route'u vardi; ona Round 4'te bakacagiz.
 */

const express = require("express");
const {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  createAccountForWorker,
} = require("../../controllers/Pg/Workers");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/", getWorkers);
router.post("/", createWorker);
router.post("/create-account/:id", createAccountForWorker);
router.put("/:id", updateWorker);
router.delete("/:id", deleteWorker);

module.exports = router;
