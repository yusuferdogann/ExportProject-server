/**
 * Worker tarafından referanslanan user'larda role="demo" olanları role="employee" yapar.
 * Böylece worker hesapları artık varsayılan olarak çalışan akışında görünür.
 *
 * Kullanım:
 *   cd server && node scripts/set-worker-demo-to-employee.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Worker = require("../models/Worker");
const User = require("../models/User");

async function run() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGO_URI / DATABASE_URL tanımlı değil.");

  await mongoose.connect(uri);

  const userIds = await Worker.distinct("userId", { userId: { $ne: null } });
  if (!userIds?.length) {
    console.log("Worker'userId referansı bulunamadı. İşlem atlandı.");
    await mongoose.disconnect();
    return;
  }

  const result = await User.updateMany(
    { _id: { $in: userIds }, role: "demo" },
    { $set: { role: "employee" } },
  );

  console.log("İşlem tamamlandı.");
  console.log("matchedCount:", result.matchedCount);
  console.log("modifiedCount:", result.modifiedCount);

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

