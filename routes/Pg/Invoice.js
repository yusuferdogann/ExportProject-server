/**
 * /api/pg/invoice — PG paralel Invoice route'lari.
 */

const express = require("express");
const {
  createInvoice,
  submitInvoice,
  getInvoices,
  previewInvoice,
  downloadInvoicePdf,
  generateInvoicePdfController,
} = require("../../controllers/Pg/Invoice");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.post("/addinvoice", createInvoice);
router.get("/", getInvoices);
router.post("/:id/submit", submitInvoice);
router.get("/:id/generate-pdf", generateInvoicePdfController);
router.get("/:id/download", downloadInvoicePdf);
router.get("/:id/preview", previewInvoice);

module.exports = router;
