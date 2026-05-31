const axios = require("axios");
const mailConfig = require("../../../config/enterpriseMail");
const { getAccessToken } = require("../accountTokens");

async function ensureGmailWatch(account) {
  const topic = mailConfig.gmail.pubsubTopic;
  if (!topic) {
    console.warn("[gmail-watch] GOOGLE_MAIL_PUBSUB_TOPIC tanimli degil — push atlaniyor");
    return null;
  }

  const accessToken = await getAccessToken(account);
  const { data } = await axios.post(
    "https://gmail.googleapis.com/gmail/v1/users/me/watch",
    {
      topicName: topic,
      labelIds: ["INBOX"],
    },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return data;
}

module.exports = { ensureGmailWatch };
