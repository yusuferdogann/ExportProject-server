/**
 * er@gmail.com ve newuser1 aynı şirkette (firma4) olmalı.
 * Bu script mevcut veriyi düzeltir:
 * 1. er@gmail.com User companyId -> firma4
 * 2. Mesajları er@gmail.com User'a yönlendir (receiverId güncelle)
 * 3. Worker userId'yi er@gmail.com User'a bağla
 *
 * Kullanım: node server/scripts/fix-er-company.js
 * (Server root'tan çalıştır: cd server && node scripts/fix-er-company.js)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

const ER_USER_ID = "69a44f6107104ace1d3de46e"; // er@gmail.com (Register)
const OLD_WORKER_USER_ID = "69a4481a6a3d957f6c960ac8"; // Worker'ın eski User (mesajlar buna gidiyordu)
const FIRMA4_COMPANY_ID = "696ce0a15b4ff597880d8a74"; // newuser1'in şirketi (firma4)

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
  const db = mongoose.connection.db;

  console.log("1. er@gmail.com User companyId güncelleniyor...");
  const users = db.collection("users");
  const ur = await users.updateOne(
    { _id: new mongoose.Types.ObjectId(ER_USER_ID) },
    { $set: { companyId: new mongoose.Types.ObjectId(FIRMA4_COMPANY_ID) } }
  );
  console.log("   Güncellendi:", ur.modifiedCount);

  console.log("2. Mesajlar receiverId güncelleniyor (69a4481a -> 69a44f61)...");
  const messages = db.collection("messages");
  const mr = await messages.updateMany(
    { receiverId: new mongoose.Types.ObjectId(OLD_WORKER_USER_ID) },
    { $set: { receiverId: new mongoose.Types.ObjectId(ER_USER_ID) } }
  );
  console.log("   Güncellendi:", mr.modifiedCount);

  console.log("3. Worker userId güncelleniyor...");
  const workers = db.collection("workers");
  const wr = await workers.updateMany(
    { userId: new mongoose.Types.ObjectId(OLD_WORKER_USER_ID) },
    { $set: { userId: new mongoose.Types.ObjectId(ER_USER_ID) } }
  );
  console.log("   Güncellendi:", wr.modifiedCount);

  console.log("\nBitti. er@gmail.com ile giriş yapıp Mesajlar sayfasını yenile.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
