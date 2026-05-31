const express = require("express");
const router = express.Router();

const {
  createInvoice,
  getInvoices,
  submitInvoice,
  generateInvoicePdf,
  deleteInvoice,
} = require("../controllers/Invoice/index");
const {testPdf}  = require("../controllers/testPdf")

// CRUD
router.post("/", createInvoice);
router.get("/", getInvoices);

// Approval submit
router.post("/:id/submit", submitInvoice);

// PDF generate (gerçek kullanım)
router.post("/:id/generate-pdf", generateInvoicePdf);

// 🔥 TEST PDF (Browser’da direkt açmak için)
router.get("/", testPdf);

// Delete
router.delete("/:id", deleteInvoice);

module.exports = router;