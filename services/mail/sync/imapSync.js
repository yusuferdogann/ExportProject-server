const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { getPrisma } = require("../../../db/prisma");
const { decryptCredentials, encryptCredentials } = require("../credentials");
const { upsertMailFromProvider } = require("./upsertMessage");
const {
  SENT_FOLDER_CANDIDATES,
  SPAM_FOLDER_CANDIDATES,
} = require("../imap/imapHelpers");

function resolveInboxPath(mailboxes) {
  const list = mailboxes || [];
  const byFlag = list.find((m) => m.specialUse === "\\Inbox");
  if (byFlag) return byFlag.path;
  const exact = list.find((m) => /^INBOX$/i.test(m.path));
  if (exact) return exact.path;
  const fuzzy = list.find((m) => /inbox/i.test(m.path) && !/sent|trash|draft|junk|spam/i.test(m.path));
  return fuzzy?.path || "INBOX";
}

function findExistingFolder(mailboxes, candidates) {
  const paths = new Set((mailboxes || []).map((m) => m.path));
  return candidates.find((p) => paths.has(p)) || null;
}

function getImapCredentials(account) {
  const creds = decryptCredentials(account.credentials);
  if (!creds?.password) {
    throw new Error("IMAP kimlik bilgisi bulunamadi");
  }
  return creds;
}

function createImapClient(account, creds) {
  return new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort || 993,
    secure: creds.imapSecure !== false,
    auth: {
      user: account.emailAddress,
      pass: creds.password,
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

function pickAddresses(list) {
  return (list || [])
    .map((a) => (a.address || "").trim().toLowerCase())
    .filter(Boolean);
}

async function persistParsedMessage(prisma, account, parsed, folder, uid) {
  const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() || "";
  const fromName = parsed.from?.value?.[0]?.name || null;
  const toEmails = pickAddresses(parsed.to?.value);
  const ccEmails = pickAddresses(parsed.cc?.value);
  const bccEmails = pickAddresses(parsed.bcc?.value);
  const subject = parsed.subject || "";
  const bodyText = parsed.text || "";
  const bodyHtml = parsed.html || null;
  const date = parsed.date || new Date();
  const messageId = parsed.messageId || `imap-${folder}-${uid}`;
  const isOutbound = folder === "sent";

  await upsertMailFromProvider(prisma, {
    account,
    providerMessageId: `imap-${folder}-${uid}`,
    providerThreadId: messageId,
    folder,
    fromEmail: fromEmail || account.emailAddress,
    fromName,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    snippet: bodyText.slice(0, 200) || subject.slice(0, 200),
    bodyText: bodyText || null,
    bodyHtml,
    receivedAt: date,
    sentAt: isOutbound ? date : null,
    isRead: true,
    isOutbound,
    isDraft: false,
  });
}

async function syncFolder(client, prisma, account, mailboxPath, folderKey, lastUid, uidKey) {
  let maxUid = lastUid;
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    console.warn("[imap-sync] mailbox lock failed", mailboxPath, err.message);
    return lastUid;
  }

  try {
    const status = await client.status(mailboxPath, { uidNext: true, messages: true });
    const uidNext = status.uidNext || 1;
    let range;

    if (lastUid > 0) {
      if (lastUid >= uidNext - 1) return lastUid;
      range = `${lastUid + 1}:*`;
    } else {
      const start = Math.max(1, uidNext - Math.min(100, status.messages || 100));
      range = `${start}:*`;
    }

    for await (const msg of client.fetch(range, { uid: true, source: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      await persistParsedMessage(prisma, account, parsed, folderKey, msg.uid);
      maxUid = Math.max(maxUid, msg.uid);
    }
  } finally {
    lock.release();
  }

  return { maxUid, uidKey };
}

async function syncImapIncremental(account) {
  const prisma = getPrisma();
  const creds = getImapCredentials(account);
  const client = createImapClient(account, creds);

  await client.connect();

  try {
    const mailboxes = await client.list();
    const inboxPath = resolveInboxPath(mailboxes);

    const inboxResult = await syncFolder(
      client,
      prisma,
      account,
      inboxPath,
      "inbox",
      Number(creds.inboxLastUid || 0),
      "inboxLastUid"
    );
    const inboxLastUid =
      typeof inboxResult === "object" ? inboxResult.maxUid : inboxResult;

    let sentFolder = creds.sentFolder || findExistingFolder(mailboxes, SENT_FOLDER_CANDIDATES);
    if (!sentFolder) {
      sentFolder =
        mailboxes.find((m) => /sent/i.test(m.path))?.path || null;
    }

    let sentLastUid = Number(creds.sentLastUid || 0);
    if (sentFolder) {
      const sentResult = await syncFolder(
        client,
        prisma,
        account,
        sentFolder,
        "sent",
        sentLastUid,
        "sentLastUid"
      );
      sentLastUid =
        typeof sentResult === "object" ? sentResult.maxUid : sentResult;
    }

    let junkFolder =
      creds.junkFolder || findExistingFolder(mailboxes, SPAM_FOLDER_CANDIDATES);
    if (!junkFolder) {
      junkFolder =
        mailboxes.find((m) => /junk|spam/i.test(m.path))?.path || null;
    }

    let junkLastUid = Number(creds.junkLastUid || 0);
    if (junkFolder) {
      const junkResult = await syncFolder(
        client,
        prisma,
        account,
        junkFolder,
        "inbox",
        junkLastUid,
        "junkLastUid"
      );
      junkLastUid =
        typeof junkResult === "object" ? junkResult.maxUid : junkResult;
    }

    const updatedCreds = encryptCredentials({
      ...creds,
      inboxLastUid,
      sentLastUid,
      sentFolder,
      junkFolder,
      junkLastUid,
    });

    await prisma.mailAccount.update({
      where: { id: account.id },
      data: {
        credentials: updatedCreds,
        lastSyncAt: new Date(),
        lastSyncError: null,
        status: "active",
      },
    });
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { syncImapIncremental };
