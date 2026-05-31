const axios = require("axios");
const { getAccessToken } = require("../accountTokens");

function buildRawMime({ from, to, cc, bcc, subject, bodyText, bodyHtml }) {
  const lines = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
  ];
  if (cc?.length) lines.push(`Cc: ${cc.join(", ")}`);
  if (bcc?.length) lines.push(`Bcc: ${bcc.join(", ")}`);
  lines.push(`Subject: ${subject || ""}`);
  lines.push("MIME-Version: 1.0");
  if (bodyHtml) {
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("");
    lines.push(bodyHtml);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("");
    lines.push(bodyText || "");
  }
  const raw = lines.join("\r\n");
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendViaGmail(account, payload) {
  const accessToken = await getAccessToken(account);
  const from = account.displayName
    ? `${account.displayName} <${account.emailAddress}>`
    : account.emailAddress;
  const raw = buildRawMime({
    from,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    bodyText: payload.bodyText,
    bodyHtml: payload.bodyHtml,
  });
  const { data } = await axios.post(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { raw },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

module.exports = { sendViaGmail };
