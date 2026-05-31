/**
 * /api/workernotes — geriye uyumluluk (PG).
 * Yeni istemciler /api/pg/workernotes kullanir.
 */
const express = require("express");
const {
  createWorkerNote,
  getWorkerNotes,
  getWorkerNoteById,
  updateWorkerNote,
  deleteWorkerNote,
} = require("../controllers/Pg/WorkerNotes");
const { getAccessToRoutePg } = require("../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.post("/addworkernote", createWorkerNote);
router.get("/", getWorkerNotes);
router.get("/:id", getWorkerNoteById);
router.put("/:id", updateWorkerNote);
router.delete("/:id", deleteWorkerNote);

module.exports = router;
