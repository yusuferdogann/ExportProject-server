const axios = require("axios");
const { getPrisma } = require("../../../db/prisma");
const { getAccessToken } = require("../accountTokens");
const { upsertMailFromProvider } = require("./upsertMessage");

const GRAPH = "https://graph.microsoft.com/v1.0";

async function graphGet(accessToken, url) {
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

function mapFolder(parentFolderId) {
  if (parentFolderId === "sentitems") return "sent";
  if (parentFolderId === "drafts") return "drafts";
  return "inbox";
}

async function persistGraphMessage(prisma, account, msg) {
  const from = msg.from?.emailAddress || {};
  const toEmails = (msg.toRecipients || [])
    .map((r) => r.emailAddress?.address)
    .filter(Boolean);
  const ccEmails = (msg.ccRecipients || [])
    .map((r) => r.emailAddress?.address)
    .filter(Boolean);
  const receivedAt = msg.receivedDateTime
    ? new Date(msg.receivedDateTime)
    : new Date();
  const sentAt = msg.sentDateTime ? new Date(msg.sentDateTime) : null;

  await upsertMailFromProvider(prisma, {
    account,
    providerMessageId: msg.id,
    providerThreadId: msg.conversationId || msg.id,
    folder: msg.isDraft ? "drafts" : sentAt ? "sent" : "inbox",
    fromEmail: (from.address || account.emailAddress).toLowerCase(),
    fromName: from.name || null,
    toEmails,
    ccEmails,
    bccEmails: [],
    subject: msg.subject || "",
    snippet: msg.bodyPreview || "",
    bodyText: msg.body?.contentType === "text" ? msg.body.content : null,
    bodyHtml: msg.body?.contentType === "html" ? msg.body.content : null,
    receivedAt,
    sentAt,
    isRead: Boolean(msg.isRead),
    isOutbound: Boolean(sentAt),
    isDraft: Boolean(msg.isDraft),
  });
}

async function syncMicrosoftIncremental(account) {
  const prisma = getPrisma();
  const accessToken = await getAccessToken(account);

  let url =
    account.microsoftDeltaLink ||
    `${GRAPH}/me/mailFolders/inbox/messages/delta?$top=50`;

  let deltaLink = account.microsoftDeltaLink;
  let pages = 0;

  while (url && pages < 10) {
    const data = await graphGet(accessToken, url);
    for (const msg of data.value || []) {
      if (msg["@removed"]) continue;
      await persistGraphMessage(prisma, account, msg);
    }
    deltaLink = data["@odata.deltaLink"] || deltaLink;
    url = data["@odata.nextLink"] || null;
    pages += 1;
  }

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      microsoftDeltaLink: deltaLink || account.microsoftDeltaLink,
      lastSyncAt: new Date(),
      lastSyncError: null,
      status: "active",
    },
  });
}

module.exports = { syncMicrosoftIncremental };
