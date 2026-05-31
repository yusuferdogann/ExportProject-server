const { GoogleGenerativeAI } = require("@google/generative-ai");
const asyncHandler = require("express-async-handler");
const CustomError = require("../../helpers/error/CustomError");

const getGenAI = () => {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return key ? new GoogleGenerativeAI(key) : null;
};

const SEARCH_SYSTEM_PROMPT = `Kullanıcının aradığı konuyu anla ve ilgili sonuçları semantik olarak değerlendir. Türkçe ve özlü yanıt ver.`;

const ANALYZE_SYSTEM_PROMPT = `Verilen veri/istatistikleri analiz et. Dashboard için kısa, anlaşılır Türkçe yorumlar üret. Trend, öneri ve dikkat çekici noktaları vurgula.`;

const ensureApiKey = () => {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  const ai = getGenAI();
  if (!key || !ai) {
    throw new CustomError("GEMINI_API_KEY yapılandırılmamış. .env dosyasına ekleyin.", 503);
  }
  return ai;
};

const GEMINI_MODEL = "gemini-flash-latest"; // Google AI Studio default

exports.chat = asyncHandler(async (req, res) => {
  const genAI = ensureApiKey();
  const { message, history = [] } = req.body;

  const handleGeminiError = (err) => {
    const msg = (err && err.message) ? String(err.message) : "";
    if (msg.includes("429") || msg.includes("Too Many Requests") || msg.includes("quota")) {
      const custom = new CustomError("API kota limiti aşıldı. Lütfen birkaç dakika sonra tekrar deneyin.", 429);
      custom.statusCode = 429;
      throw custom;
    }
    throw err;
  };
  if (!message || typeof message !== "string") {
    return res.status(400).json({ success: false, message: "message gerekli" });
  }

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const chat = model.startChat({
    history: history
      .filter((h) => h && h.role && h.content)
      .map((h) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: String(h.content) }],
      })),
  });

  let result;
  try {
    result = await chat.sendMessage(message);
  } catch (err) {
    handleGeminiError(err);
  }

  const response = result.response;

  let text;
  try {
    text = response.text();
  } catch (e) {
    text = "Üzgünüm, bu mesaja yanıt veremiyorum. Lütfen farklı bir şekilde sorun.";
  }

  if (!text || typeof text !== "string") {
    text = "Üzgünüm, yanıt oluşturulamadı. Lütfen tekrar deneyin.";
  }

  res.json({ success: true, data: { text, role: "model" } });
});

exports.semanticSearch = asyncHandler(async (req, res) => {
  const genAI = ensureApiKey();
  const { query, context = "" } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ success: false, message: "query gerekli" });
  }

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = context
    ? `${SEARCH_SYSTEM_PROMPT}\n\nBağlam: ${context}\n\nAranan: ${query}`
    : `${SEARCH_SYSTEM_PROMPT}\n\nAranan: ${query}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  res.json({ success: true, data: { text, query } });
});

exports.analyzeData = asyncHandler(async (req, res) => {
  const genAI = ensureApiKey();
  const { data, question } = req.body;
  if (!data) {
    return res.status(400).json({ success: false, message: "data gerekli" });
  }

  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const q = question || "Bu veriyi analiz et ve önemli bulguları özetle.";
  const prompt = `${ANALYZE_SYSTEM_PROMPT}\n\nVeri:\n${dataStr}\n\nSoru: ${q}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  res.json({ success: true, data: { text, summary: text } });
});
