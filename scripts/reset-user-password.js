/**
 * Kullanıcı şifresini bcrypt ile doğru şekilde yeniden yazar.
 * Compass'ta düz metin veya bozuk hash ile eklenen kullanıcılar için kullanın.
 *
 * Kullanım (server klasöründen):
 *   node scripts/reset-user-password.js mert@gmail.com 1234
 *
 * veya proje kökünden:
 *   node server/scripts/reset-user-password.js mert@gmail.com 1234
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const User = require("../models/User");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const [, , emailArg, newPassword] = process.argv;
  if (!emailArg || !newPassword) {
    console.error(
      "Kullanım: node scripts/reset-user-password.js <email> <yeni_sifre>",
    );
    process.exit(1);
  }
  if (newPassword.length < 4) {
    console.error("Şifre en az 4 karakter olmalı (User şeması).");
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
  if (!uri) {
    console.error("MONGO_URI veya DATABASE_URL .env içinde tanımlı değil.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const email = emailArg.trim();
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") },
    });
  }

  if (!user) {
    console.error(`Kullanıcı bulunamadı: ${emailArg}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("Bulundu:", user.email, "| rol:", user.role, "| id:", user._id);

  user.password = newPassword;
  await user.save();

  console.log("Şifre güncellendi (bcrypt hash ile kaydedildi).");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
