/**
 * facilityInfo kayıtlarını companyId bazına taşır.
 *
 * Hedef:
 * - facilityinfos.companyId alanını doldurmak (eksikse)
 * - Aynı companyId için birden fazla facilityInfo varsa tekilleştirmek
 *
 * Kullanım:
 *   cd server && node scripts/migrate-facilityinfo-to-companyid.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

function asObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) throw new Error("MONGO_URI / DATABASE_URL tanımlı değil.");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const facilityInfos = db.collection("facilityinfos");
  const facilities = db.collection("facilities");
  const users = db.collection("users");

  const total = await facilityInfos.countDocuments();
  console.log(`facilityinfos toplam kayıt: ${total}`);

  // 1) companyId backfill
  const cursor = facilityInfos.find(
    { companyId: { $exists: false } },
    { projection: { _id: 1, facilityId: 1 } },
  );

  let backfilled = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc?.facilityId) continue;

    const facility = await facilities.findOne(
      { _id: doc.facilityId },
      { projection: { _id: 1, userId: 1 } },
    );
    if (!facility?.userId) continue;

    const user = await users.findOne(
      { _id: facility.userId },
      { projection: { _id: 1, companyId: 1 } },
    );
    if (!user?.companyId) continue;

    await facilityInfos.updateOne(
      { _id: doc._id },
      { $set: { companyId: user.companyId } },
    );
    backfilled += 1;
  }

  console.log(`companyId backfill tamam: ${backfilled} kayıt güncellendi.`);

  // 2) Dedupe: companyId başına tek kayıt kalsın
  const groups = await facilityInfos
    .aggregate([
      { $match: { companyId: { $exists: true, $ne: null } } },
      { $group: { _id: "$companyId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  let removed = 0;
  for (const g of groups) {
    // İlk kaydı tut, geri kalanları sil
    const [, ...toDelete] = g.ids;
    if (toDelete.length) {
      const delRes = await facilityInfos.deleteMany({ _id: { $in: toDelete } });
      removed += delRes.deletedCount || 0;
    }
  }

  console.log(`Tekilleştirme tamam: ${removed} duplicate kayıt silindi.`);
  console.log("Bitti. (Not: unique index'i Mongoose schema üzerinden devrede.)");

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Hata:", err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });

