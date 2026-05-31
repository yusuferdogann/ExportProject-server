/**
 * administrator rolünde kurumsal analitik kullanıcı oluşturur veya günceller.
 *
 *   cd server && node scripts/seed-administrator-user.js
 *
 * Şirket: en çok kullanıcı bağlı olan companyId (TARGET_COMPANY_ID ile üzerine yazılabilir)
 * Hesap (varsayılan):
 *   email: manager@gmail.com
 *   password: 1234
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const DEFAULT_EMAIL = "manager@gmail.com";
const DEFAULT_USERNAME = "Enterprise Administrator";

async function pickCompanyId(db) {
  const env = process.env.TARGET_COMPANY_ID;
  if (env) return new mongoose.Types.ObjectId(String(env));

  const companies = await db
    .collection("companies")
    .find({}, { projection: { _id: 1, name: 1 } })
    .toArray();
  if (!companies.length) {
    throw new Error("companies koleksiyonunda kayıt yok.");
  }
  let best = null;
  for (const c of companies) {
    const uCount = await db.collection("users").countDocuments({ companyId: c._id });
    if (!best || uCount > best.score) {
      best = { _id: c._id, name: c.name, score: uCount };
    }
  }
  console.log(
    `Şirket: ${best.name || "(isimsiz)"} (${best._id}) | kullanıcı sayısı=${best.score}`,
  );
  return best._id;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("MONGO_URI / DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const companyId = await pickCompanyId(mongoose.connection.db);

  const email = (process.env.ADMINISTRATOR_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const password = String(process.env.ADMINISTRATOR_PASSWORD || "1234");
  if (password.length < 4) {
    console.error("Şifre en az 4 karakter olmalı.");
    process.exit(1);
  }

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      username: process.env.ADMINISTRATOR_USERNAME || DEFAULT_USERNAME,
      password,
      role: "administrator",
      companyId,
    });
    console.log("Oluşturuldu:", user.email, user._id);
  } else {
    user.role = "administrator";
    user.companyId = companyId;
    user.password = password;
    if (process.env.ADMINISTRATOR_USERNAME) {
      user.username = process.env.ADMINISTRATOR_USERNAME.trim();
    }
    await user.save();
    console.log("Güncellendi:", user.email, user._id);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
