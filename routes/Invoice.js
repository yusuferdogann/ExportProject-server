const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  createInvoice,
  getInvoices,
  submitInvoice,
  generateInvoicePdfController,
  previewInvoice,
  downloadInvoicePdf,
} = require("../controllers/Invoice/index");
const { testPdf } = require("../controllers/testPdf");

const router = express.Router();

router.post("/addinvoice", getAccessToRoute, createInvoice);
router.get("/", getAccessToRoute, getInvoices);
router.post("/:id/submit", getAccessToRoute, submitInvoice);
router.get("/test", testPdf);
router.get("/:id/generate-pdf", getAccessToRoute, generateInvoicePdfController);
// router.get("/:id/preview", previewInvoicePdfController);
router.get("/:id/download", getAccessToRoute, downloadInvoicePdf);
router.get("/:id/preview", getAccessToRoute, previewInvoice);
module.exports = router;
