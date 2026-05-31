const express = require("express");
const { uploadImage, uploadMiddleware } = require("../controllers/uploadController");

const router = express.Router();

// POST /api/upload/image
router.post("/upload-image", uploadMiddleware.single("image"), uploadImage);

module.exports = router;