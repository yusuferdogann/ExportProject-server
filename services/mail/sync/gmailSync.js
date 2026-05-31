const axios = require("axios");
const { getPrisma } = require("../../../db/prisma");
const { getAccessToken } = require("../accountTokens");
const {
  headerValue,
  parseAddressList,
  parseFrom,
  extractBodies,
} = require("./parseMime");
const { upsertMailFromProvider } = require("./upsertMessage");

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailGet(accessToken, path, params) {
  const { data } = await axios.get(`${GMAIL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
  });
  return data;
}

async function fetchMessage(accessToken, id) {
  return gmailGet(accessToken, `/messages/${id}`, { format: "full" });
}

async function listHistory(accessToken, startHistoryId) {
  return gmailGet(accessToken, "/history", {
    startHistoryId,
    historyTypes: "messageAdded",
  });
}

async function listInboxIds(accessToken, maxResults = 30) {
  const data = await gmailGet(accessToken, "/messages", {
    labelIds: "INBOX",
    maxResults,
  });
  return (data.messages || []).map((m) => m.id);
}

async function persistGmailMessage(prisma, account, gm) {
  const headers = gm.payload?.headers || [];
  const subject = headerValue(headers, "Subject");
  const fromRaw = headerValue(headers, "From");
  const { email: fromEmail, name: fromName } = parseFrom(fromRaw);
  const toEmails = parseAddressList(headerValue(headers, "To"));
  const ccEmails = parseAddressList(headerValue(headers, "Cc"));
  const { text, html } = extractBodies(gm.payload);
  const internalDate = gm.internalDate
    ? new Date(Number(gm.internalDate))
    : new Date();
  const labels = gm.labelIds || [];
  const folder = labels.includes("SENT")
    ? "sent"
    : labels.includes("DRAFT")
      ? "drafts"
      : "inbox";

  await upsertMailFromProvider(prisma, {
    account,
    providerMessageId: gm.id,
    providerThreadId: gm.threadId,
    folder,
    fromEmail: fromEmail || account.emailAddress,
    fromName,
    toEmails,
    ccEmails,
    bccEmails: [],
    subject,
    snippet: gm.snippet || text?.slice(0, 200) || "",
    bodyText: text || null,
    bodyHtml: html || null,
    receivedAt: internalDate,
    sentAt: labels.includes("SENT") ? internalDate : null,
    isRead: !labels.includes("UNREAD"),
    isOutbound: labels.includes("SENT"),
    isDraft: labels.includes("DRAFT"),
  });
}

async function syncGmailIncremental(account) {
  const prisma = getPrisma();
  const accessToken = await getAccessToken(account);
  let newHistoryId = account.gmailHistoryId;

  if (!account.gmailHistoryId) {
    const profile = await gmailGet(accessToken, "/profile");
    newHistoryId = profile.historyId;
    const ids = await listInboxIds(accessToken, 40);
    for (const id of ids) {
      const gm = await fetchMessage(accessToken, id);
      await persistGmailMessage(prisma, account, gm);
    }
  } else {
    try {
      const hist = await listHistory(accessToken, account.gmailHistoryId);
      newHistoryId = hist.historyId || newHistoryId;
      const messageIds = new Set();
      for (const h of hist.history || []) {
        for (const added of h.messagesAdded || []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
      }
      for (const id of messageIds) {
        const gm = await fetchMessage(accessToken, id);
        await persistGmailMessage(prisma, account, gm);
      }
    } catch (e) {
      if (e.response?.status === 404) {
        const ids = await listInboxIds(accessToken, 40);
        for (const id of ids) {
          const gm = await fetchMessage(accessToken, id);
          await persistGmailMessage(prisma, account, gm);
        }
        const profile = await gmailGet(accessToken, "/profile");
        newHistoryId = profile.historyId;
      } else {
        throw e;
      }
    }
  }

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      gmailHistoryId: String(newHistoryId),
      lastSyncAt: new Date(),
      lastSyncError: null,
      status: "active",
    },
  });
}

module.exports = { syncGmailIncremental };
