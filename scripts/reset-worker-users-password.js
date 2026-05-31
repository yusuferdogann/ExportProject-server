/**
 * Worker'a bağlı user'ların şifresini 1234'e çeker.
 * Ek olarak sadece "demo" rolünü "employee" yapar (admin rolleri korunur).
 *
 * Kullanım:
 *   cd server && node scripts/reset-worker-users-password.js [password]
 *
 * Varsayılan şifre: 1234
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Worker = require("../models/Worker");
const User = require("../models/User");

async function run() {
  const password = process.argv[2] || "1234";
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGO_URI / DATABASE_URL tanımlı değil.");

  await mongoose.connect(uri);

  const userIds = await Worker.distinct("userId", { userId: { $ne: null } });
  const safeUserIds = (userIds || []).filter(Boolean);

  console.log(`Worker-linked user sayisi: ${safeUserIds.length}`);

  const protectedRoles = new Set([
    "owner",
    "foreign_trade_manager",
    "general_manager",
    "finance_manager",
  ]);

  let updated = 0;
  for (const id of safeUserIds) {
    const u = await User.findById(id);
    if (!u) continue;

    // admin rolleri korunur; sadece demo -> employee istenir
    if (u.role === "demo") u.role = "employee";

    // protected rol ise sadece password güncelle (role değiştirme)
    u.password = password;
    await u.save();
    updated++;
  }

  console.log(`Password reset tamamlandi. updated=${updated}`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Hata:", err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });

