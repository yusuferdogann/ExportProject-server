const mongoose = require("mongoose");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Enterprise-friendly DB boot:
 * - Uygulama ayağa kalkar, DB yoksa otomatik retry eder.
 * - DB bağlantısı geldiğinde log basar.
 * Not: DB yokken DB isteyen endpointler yine hata verir; ama tüm API'yi 503'e kilitlemeyiz.
 */
const database = () => {
  const uri = String(process.env.MONGO_URI || "").trim();
  if (!uri) {
    console.error("[db] MONGO_URI tanımlı değil. .env kontrol edin.");
    return;
  }

  mongoose.connection.on("connected", () => {
    console.log("[db] MongoDB connected");
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("[db] MongoDB disconnected (will retry)");
  });
  mongoose.connection.on("error", (err) => {
    console.error("[db] MongoDB error:", err?.message || err);
  });

  (async () => {
    let attempt = 0;
    while (true) {
      try {
        attempt += 1;
        await mongoose.connect(uri, {
          // Driver v4+ ile bu opsiyonlar gereksiz; warning'i de keser.
          serverSelectionTimeoutMS: 8000,
        });
        return;
      } catch (err) {
        const waitMs = Math.min(30000, 1000 * Math.pow(2, Math.min(5, attempt)));
        console.error(
          `[db] connect failed (attempt ${attempt}). retry in ${waitMs}ms. reason: ${err?.message || err}`,
        );
        await sleep(waitMs);
      }
    }
  })();
};

module.exports = database;
