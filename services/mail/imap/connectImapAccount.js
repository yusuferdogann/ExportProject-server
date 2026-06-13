const { ImapFlow } = require("imapflow");
const nodemailer = require("nodemailer");
const { getPrisma } = require("../../../db/prisma");
const { encryptCredentials } = require("../credentials");
const { enqueueMailEvent, buildIdempotencyKey } = require("../mailEventQueue");
const {
  resolveImapSettings,
  isCorporateMailbox,
  SENT_FOLDER_CANDIDATES,
} = require("./imapHelpers");

async function testImapConnection(settings) {
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: {
      user: settings.emailAddress,
      pass: settings.password,
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.mailboxOpen("INBOX");
  await client.logout();
}

async function testSmtpConnection(settings) {
  const port = settings.smtpPort || 465;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure: settings.smtpSecure === true,
    requireTLS: port === 587,
    auth: {
      user: settings.emailAddress,
      pass: settings.password,
    },
    tls: { rejectUnauthorized: false },
  });
  await transporter.verify();
}

async function detectSentFolder(settings) {
  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: {
      user: settings.emailAddress,
      pass: settings.password,
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const mailboxes = await client.list();
    const paths = new Set(mailboxes.map((m) => m.path));
    for (const candidate of SENT_FOLDER_CANDIDATES) {
      if (paths.has(candidate)) return candidate;
    }
    const fuzzy = mailboxes.find((m) => /sent/i.test(m.path));
    return fuzzy?.path || null;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function connectImapAccount({
  userId,
  companyId,
  emailAddress,
  password,
  displayName,
  imapHost,
  imapPort,
  smtpHost,
  smtpPort,
  imapSecure,
  smtpSecure,
}) {
  const prisma = getPrisma();
  const settings = resolveImapSettings({
    emailAddress,
    password,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
    imapSecure,
    smtpSecure,
  });

  if (!settings.emailAddress || !settings.password) {
    throw new Error("E-posta adresi ve sifre zorunludur");
  }
  if (!isCorporateMailbox(settings.emailAddress)) {
    throw new Error(
      "Gmail/Outlook adresleri icin Connect Gmail veya Connect Outlook kullanin"
    );
  }
  if (!settings.imapHost || !settings.smtpHost) {
    throw new Error("IMAP/SMTP sunucu bilgisi cozulemedi");
  }

  await testImapConnection(settings);
  await testSmtpConnection(settings);
  const sentFolder = await detectSentFolder(settings);

  const credentials = encryptCredentials({
    password: settings.password,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecure: settings.imapSecure,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    inboxLastUid: 0,
    sentLastUid: 0,
    sentFolder,
  });

  await prisma.mailAccount.deleteMany({
    where: {
      userId,
      emailAddress: settings.emailAddress,
      provider: "ses_domain",
    },
  });

  const count = await prisma.mailAccount.count({ where: { userId } });

  const account = await prisma.mailAccount.upsert({
    where: {
      userId_emailAddress: {
        userId,
        emailAddress: settings.emailAddress,
      },
    },
    create: {
      companyId,
      userId,
      emailAddress: settings.emailAddress,
      displayName: displayName || settings.emailAddress.split("@")[0],
      provider: "imap_custom",
      status: "active",
      credentials,
      isDefault: count === 0,
    },
    update: {
      displayName: displayName || undefined,
      provider: "imap_custom",
      credentials,
      status: "active",
      lastSyncError: null,
    },
  });

  await enqueueMailEvent({
    companyId,
    mailAccountId: account.id,
    type: "incremental_sync",
    payload: { reason: "imap_connected" },
    idempotencyKey: buildIdempotencyKey(["imap-sync", account.id]),
  });

  return account;
}

module.exports = { connectImapAccount, testImapConnection, testSmtpConnection };
