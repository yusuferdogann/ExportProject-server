const { GoogleGenerativeAI } = require("@google/generative-ai");
const asyncHandler = require("express-async-handler");
const CustomError = require("../helpers/error/CustomError");
const MailAiUsageLog = require("../models/MailAiUsageLog");
const mongoose = require("mongoose");

async function recordMailAiUsage(req, operation) {
  try {
    const cid = req.user?.companyId;
    const uid = req.user?.id;
    if (!cid || !uid) return;
    await MailAiUsageLog.create({
      companyId: new mongoose.Types.ObjectId(String(cid)),
      userId: new mongoose.Types.ObjectId(String(uid)),
      operation,
    });
  } catch (e) {
    console.warn("[MailAiUsageLog]", e.message);
  }
}

const GEMINI_MODEL = "gemini-flash-latest";

const getGenAI = () => {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return key ? new GoogleGenerativeAI(key) : null;
};

const ensureApiKey = () => {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  const ai = getGenAI();
  if (!key || !ai) {
    throw new CustomError("GEMINI_API_KEY yapılandırılmamış. .env dosyasına ekleyin.", 503);
  }
  return ai;
};

const stripCodeFence = (raw) => {
  let t = String(raw || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/s, "");
  }
  return t.trim();
};

const parseJsonSafe = (text) => {
  const cleaned = stripCodeFence(text);
  return JSON.parse(cleaned);
};

/**
 * Mail metni: yazım ve bariz dil hatalarını düzeltir. Yanıt yalnızca JSON.
 */
exports.proofread = asyncHandler(async (req, res) => {
  const genAI = ensureApiKey();
  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ success: false, message: "Metin gerekli" });
  }

  const system = `Sen Türkçe (ve gerekiyorsa İngilizce karışık) iş e-postalarını düzelten bir asistansın.
Yazım hatalarını, bariz imla ve noktalama hatalarını düzelt. Anlamı ve tonu koru.
Yanıtta SADECE geçerli JSON ver, markdown veya açıklama ekleme.
Şema:
{"correctedText":"tam düzeltilmiş metin","fixes":[{"before":"hatalı parça","after":"doğru parça"}]}
fixes: yalnızca gerçekten değiştirdiğin parçalar; yoksa []. "after" metni correctedText içinde birebir geçmeli.`;

  const runProofread = async (useJsonMime) => {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        ...(useJsonMime ? { responseMimeType: "application/json" } : {}),
      },
    });
    const result = await model.generateContent(`${system}\n\nMetin:\n${text}`);
    return result.response.text();
  };

  let parsed;
  try {
    let out;
    try {
      out = await runProofread(true);
    } catch {
      out = await runProofread(false);
    }
    parsed = parseJsonSafe(out);
  } catch (e) {
    if (e instanceof SyntaxError) {
      return res.status(502).json({
        success: false,
        message: "AI yanıtı işlenemedi. Tekrar deneyin.",
      });
    }
    throw e;
  }

  const correctedText =
    typeof parsed.correctedText === "string" ? parsed.correctedText : text;
  let fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
  fixes = fixes
    .filter(
      (f) =>
        f &&
        typeof f.before === "string" &&
        typeof f.after === "string" &&
        f.before !== f.after
    )
    .map((f) => ({ before: f.before, after: f.after }));

  await recordMailAiUsage(req, "proofread");

  res.json({
    success: true,
    data: {
      correctedText,
      fixes,
    },
  });
});

/**
 * Hedef dile çeviri (varsayılan İngilizce).
 */
exports.translate = asyncHandler(async (req, res) => {
  const genAI = ensureApiKey();
  const { text, targetLang = "en" } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ success: false, message: "Metin gerekli" });
  }

  const langName =
    targetLang === "en"
      ? "English"
      : targetLang === "de"
        ? "German"
        : targetLang === "tr"
          ? "Turkish"
          : String(targetLang);

  const system = `Translate the following email/business message to ${langName}.
Preserve greeting/closing tone and line breaks where sensible.
Return ONLY valid JSON: {"translatedText":"..."}`;

  const runTranslate = async (useJsonMime) => {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        ...(useJsonMime ? { responseMimeType: "application/json" } : {}),
      },
    });
    const result = await model.generateContent(`${system}\n\n${text}`);
    return result.response.text();
  };

  let parsed;
  try {
    let out;
    try {
      out = await runTranslate(true);
    } catch {
      out = await runTranslate(false);
    }
    parsed = parseJsonSafe(out);
  } catch (e) {
    if (e instanceof SyntaxError) {
      return res.status(502).json({
        success: false,
        message: "Çeviri yanıtı işlenemedi.",
      });
    }
    throw e;
  }

  const translatedText =
    typeof parsed.translatedText === "string"
      ? parsed.translatedText
      : "";

  if (!translatedText) {
    return res.status(502).json({ success: false, message: "Çeviri oluşturulamadı." });
  }

  await recordMailAiUsage(req, "translate");

  res.json({ success: true, data: { translatedText, targetLang } });
});
