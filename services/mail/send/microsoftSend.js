const axios = require("axios");
const { getAccessToken } = require("../accountTokens");

async function sendViaMicrosoft(account, payload) {
  const accessToken = await getAccessToken(account);
  const message = {
    subject: payload.subject || "",
    body: {
      contentType: payload.bodyHtml ? "HTML" : "Text",
      content: payload.bodyHtml || payload.bodyText || "",
    },
    toRecipients: payload.to.map((address) => ({
      emailAddress: { address },
    })),
  };
  if (payload.cc?.length) {
    message.ccRecipients = payload.cc.map((address) => ({
      emailAddress: { address },
    }));
  }
  await axios.post(
    "https://graph.microsoft.com/v1.0/me/sendMail",
    { message, saveToSentItems: true },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return { ok: true };
}

module.exports = { sendViaMicrosoft };
