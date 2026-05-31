const axios = require("axios");
const mailConfig = require("../../../config/enterpriseMail");

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = mailConfig.gmail;
  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
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
  const { clientId, clientSecret } = mailConfig.gmail;
  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
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

async function fetchGmailProfile(accessToken) {
  const { data } = await axios.get(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

module.exports = {
  exchangeCode,
  refreshAccessToken,
  fetchGmailProfile,
};
