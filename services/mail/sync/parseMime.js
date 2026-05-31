function headerValue(headers, name) {
  const h = (headers || []).find(
    (x) => String(x.name || "").toLowerCase() === name.toLowerCase()
  );
  return h?.value || "";
}

function parseAddressList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim().toLowerCase();
    })
    .filter(Boolean);
}

function parseFrom(raw) {
  if (!raw) return { email: "", name: null };
  const m = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  if (m) return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
  return { email: raw.trim().toLowerCase(), name: null };
}

function decodeBase64Url(data) {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function extractBodies(part) {
  let text = "";
  let html = "";
  if (!part) return { text, html };

  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data) {
      text += decodeBase64Url(p.body.data);
    } else if (p.mimeType === "text/html" && p.body?.data) {
      html += decodeBase64Url(p.body.data);
    }
    (p.parts || []).forEach(walk);
  };
  walk(part);
  if (!text && !html && part.body?.data) {
    text = decodeBase64Url(part.body.data);
  }
  return { text, html };
}

module.exports = {
  headerValue,
  parseAddressList,
  parseFrom,
  extractBodies,
};
