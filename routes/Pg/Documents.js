/**
 * /api/pg/documents — PG paralel Documents route'lari.
 * NOT: Mongo'da PDF upload/extract endpoint'leri de var; bunlar Round 5'te eklenecek
 * (extractPdfData PDF parsing'e bagli, ayri ele alinacak).
 */

const express = require("express");
const {
  previewDocument,
  downloadDocument,
} = require("../../controllers/Pg/Documents");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/preview/:type/:id", previewDocument);
router.get("/download/:type/:id", downloadDocument);

module.exports = router;
