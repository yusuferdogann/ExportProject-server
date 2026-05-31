// uploadController.js
const cloudinary = require("../config/cloudinary.config"); // v2 + dotenv configlı
const multer = require("multer");

// RAM'de tutmak için memory storage
const storage = multer.memoryStorage();
const uploadMiddleware = multer({ storage });

const uploadImage = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    console.log("🟡 Image upload tetiklendi");
    console.log("🟡 Seçilen dosya:", req.file);

    const streamifier = require("streamifier");

    // Cloudinary upload stream ile buffer gönder
    const streamUpload = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "reports_images" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
      });
    };

    const result = await streamUpload(req.file.buffer);

    console.log("🟢 Cloudinary URL:", result.secure_url);
    res.status(201).json({ imageUrl: result.secure_url });
  } catch (err) {
    console.error("🔴 Cloudinary upload hatası:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadImage, uploadMiddleware };