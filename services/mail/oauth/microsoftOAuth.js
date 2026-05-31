const axios = require("axios");
const mailConfig = require("../../../config/enterpriseMail");

function tokenUrl() {
  const tenant = mailConfig.microsoft.tenantId || "common";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = mailConfig.microsoft;
  const { data } = await axios.post(
    tokenUrl(),
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = mailConfig.microsoft;
  const { data } = await axios.post(
    tokenUrl(),
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return data;
}

async function fetchMicrosoftProfile(accessToken) {
  const { data } = await axios.get("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

module.exports = {
  exchangeCode,
  refreshAccessToken,
  fetchMicrosoftProfile,
};
