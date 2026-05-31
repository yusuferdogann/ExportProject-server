const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { previewDocument, downloadDocument } = require("../controllers/Documents");
const { extractPdfData, saveUploadedPdf } = require("../controllers/Documents/uploadPdf");

router.get("/preview/:type/:id", getAccessToRoute, previewDocument);
router.get("/download/:type/:id", getAccessToRoute, downloadDocument);
router.post("/upload/extract", getAccessToRoute, extractPdfData);
router.post("/upload/save", getAccessToRoute, saveUploadedPdf);

module.exports = router;
