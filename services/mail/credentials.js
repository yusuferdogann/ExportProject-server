/**
 * OAuth token saklama — MAIL_CREDENTIALS_SECRET ile AES-256-GCM.
 * Secret yoksa JSON duz saklanir (sadece local dev).
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getKey() {
  const secret =
    process.env.MAIL_CREDENTIALS_SECRET ||
    process.env.JWT_SECRET ||
    "";
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredentials(obj) {
  const key = getKey();
  const plain = JSON.stringify(obj);
  if (!key) return { _plain: true, data: obj };

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    _enc: true,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    payload: enc.toString("base64"),
  };
}

function decryptCredentials(stored) {
  if (!stored || typeof stored !== "object") return null;
  if (stored._plain) return stored.data;
  if (!stored._enc) return stored;

  const key = getKey();
  if (!key) return null;

  const iv = Buffer.from(stored.iv, "base64");
  const tag = Buffer.from(stored.tag, "base64");
  const data = Buffer.from(stored.payload, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

module.exports = { encryptCredentials, decryptCredentials };
