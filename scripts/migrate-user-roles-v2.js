/**
 * Eski role değerlerini yeni 6 role haritasına taşır.
 * Çalıştırma: node server/scripts/migrate-user-roles-v2.js
 * Önce .env ile Mongo bağlantısının yüklü olduğundan emin olun.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const MAP = {
  admin: "general_manager",
  professional: "foreign_trade_manager",
  "çalışan": "employee",
  beginner: "demo",
  standard: "employee",
  owner: "owner",
  demo: "demo",
};

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGO_URI / MONGODB_URI tanımlı değil.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const col = mongoose.connection.collection("users");
  for (const [from, to] of Object.entries(MAP)) {
    const res = await col.updateMany({ role: from }, { $set: { role: to } });
    console.log(`role ${from} -> ${to}: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  }
  console.log("Tamam.");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
