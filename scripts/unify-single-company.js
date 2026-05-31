/**
 * Tüm tenant verisini tek bir companyId altında birleştirir.
 *
 * Kapsam:
 * - users.companyId
 * - workers.companyId
 * - roletemplates.companyId
 * - customroles.companyId
 * - roleassignmentlogs.companyId
 *
 * Kullanım:
 *   cd server && node scripts/unify-single-company.js
 *
 * Opsiyonel hedef şirket:
 *   TARGET_COMPANY_ID=<ObjectId> node scripts/unify-single-company.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

function asObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

async function pickTargetCompanyId(db) {
  const envTarget = process.env.TARGET_COMPANY_ID;
  if (envTarget) {
    return asObjectId(envTarget);
  }

  const companies = await db
    .collection("companies")
    .find({}, { projection: { _id: 1, name: 1 } })
    .toArray();

  if (!companies.length) {
    throw new Error("companies koleksiyonunda kayıt bulunamadı.");
  }

  let best = null;
  for (const c of companies) {
    const [uCount, wCount] = await Promise.all([
      db.collection("users").countDocuments({ companyId: c._id }),
      db.collection("workers").countDocuments({ companyId: c._id }),
    ]);
    const score = uCount + wCount;
    if (!best || score > best.score) {
      best = { _id: c._id, name: c.name, score };
    }
  }

  console.log(
    `Hedef şirket otomatik seçildi: ${best.name || "(isimsiz)"} (${best._id}) | skor=${best.score}`,
  );
  return best._id;
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    throw new Error("MONGO_URI / DATABASE_URL tanımlı değil.");
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const targetCompanyId = await pickTargetCompanyId(db);
  const collections = [
    "users",
    "workers",
    "roletemplates",
    "customroles",
    "roleassignmentlogs",
  ];

  console.log(`\nTek şirkete birleştirme başlıyor. targetCompanyId=${targetCompanyId}\n`);

  for (const name of collections) {
    const col = db.collection(name);

    const totalBefore = await col.countDocuments();
    const sameBefore = await col.countDocuments({ companyId: targetCompanyId });
    const differentBefore = await col.countDocuments({
      companyId: { $exists: true, $ne: targetCompanyId },
    });

    const updateResult = await col.updateMany(
      { companyId: { $exists: true, $ne: targetCompanyId } },
      { $set: { companyId: targetCompanyId } },
    );

    const missingResult = await col.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId: targetCompanyId } },
    );

    const totalAfter = await col.countDocuments();
    const sameAfter = await col.countDocuments({ companyId: targetCompanyId });

    console.log(`[${name}]`);
    console.log(`  total before: ${totalBefore}`);
    console.log(`  same before: ${sameBefore}`);
    console.log(`  different before: ${differentBefore}`);
    console.log(`  updated(diff): ${updateResult.modifiedCount}`);
    console.log(`  updated(missing): ${missingResult.modifiedCount}`);
    console.log(`  total after: ${totalAfter}`);
    console.log(`  same after: ${sameAfter}`);
    console.log("");
  }

  console.log("Tamamlandı: users/workers ve yetkilendirme tabloları tek companyId altında.");
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

