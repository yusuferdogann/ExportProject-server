/**
 * /api/pg/enterprise-mail — Kurumsal e-posta (Gmail/Outlook/SES).
 * Dahili /api/messages ve /api/mail-ai dokunulmaz.
 */

const crypto = require("crypto");
const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const mailConfig = require("../../../config/enterpriseMail");
const { enqueueMailEvent, buildIdempotencyKey } = require("../../../services/mail/mailEventQueue");
const {
  providerConfigured,
  getOAuthStartUrl,
} = require("../../../services/mail/providers");
const { connectOAuthAccount } = require("../../../services/mail/oauth/connectAccount");
const {
  isConsumerMailbox,
  repairUserMailAccounts,
} = require("../../../services/mail/mailAccountHelpers");
const { saveOAuthState, consumeOAuthState } = require("../../../services/mail/oauthState");
const { linkMailToLatestMeeting } = require("../Meetings/mailMeta");
const { notifyEnterpriseMailUpdated } = require("../../../services/mail/mailNotifications");
const { runIncrementalSync } = require("../../../services/mail/sync");

function shapeAccount(a) {
  const supportsInboxSync = a.provider === "gmail" || a.provider === "microsoft";
  return {
    id: a.id,
    emailAddress: a.emailAddress,
    displayName: a.displayName,
    provider: a.provider,
    status: a.status,
    isDefault: a.isDefault,
    lastSyncAt: a.lastSyncAt,
    lastSyncError: a.lastSyncError,
    providerReady: providerConfigured(a.provider),
    supportsInboxSync,
  };
}

/** GET /api/pg/enterprise-mail/accounts */
const listAccounts = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;

  await repairUserMailAccounts(prisma, userId, companyId);

  const accounts = await prisma.mailAccount.findMany({
    where: { userId, companyId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const oauth = mailConfig.getOAuthPublicConfig();

  res.json({
    success: true,
    data: accounts.map(shapeAccount),
    config: {
      sesReady: providerConfigured("ses_domain"),
      gmailOAuthReady: providerConfigured("gmail"),
      microsoftOAuthReady: providerConfigured("microsoft"),
      s3Ready: Boolean(mailConfig.s3.bucket),
      gmailRedirectUri: oauth.gmailRedirectUri || null,
      microsoftRedirectUri: oauth.microsoftRedirectUri || null,
      appPublicUrl: oauth.appPublicUrl || null,
      oauthEnvironment: oauth.oauthEnvironment,
      mailOAuthEnv: oauth.mailOAuthEnv,
      gmailPubsubConfigured: oauth.gmailPubsubConfigured,
      nodeEnv: oauth.nodeEnv,
    },
  });
});

/** POST /api/pg/enterprise-mail/accounts/ses-domain */
const registerSesDomainAccount = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { emailAddress, displayName } = req.body || {};

  if (!emailAddress || !String(emailAddress).includes("@")) {
    return res.status(400).json({
      success: false,
      message: "Gecerli emailAddress gerekli (ornek: user@firma.com)",
    });
  }

  const email = String(emailAddress).trim().toLowerCase();

  if (isConsumerMailbox(email)) {
    return res.status(400).json({
      success: false,
      message:
        "Gmail/Outlook gibi kisisel adresler SES ile kaydedilmez. Connect Gmail veya Connect Outlook kullanin.",
    });
  }

  const existing = await prisma.mailAccount.findFirst({
    where: { userId, emailAddress: email },
  });
  if (existing) {
    return res.json({ success: true, data: shapeAccount(existing) });
  }

  const count = await prisma.mailAccount.count({ where: { userId } });

  const account = await prisma.mailAccount.create({
    data: {
      companyId,
      userId,
      emailAddress: email,
      displayName: displayName || email.split("@")[0],
      provider: "ses_domain",
      status: providerConfigured("ses_domain") ? "active" : "pending",
      isDefault: count === 0,
    },
  });

  if (providerConfigured("ses_domain")) {
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });
  }

  res.status(201).json({
    success: true,
    data: shapeAccount(account),
    message: providerConfigured("ses_domain")
      ? "Hesap kaydedildi. SES identity dogrulamasi tamamlaninca aktif olacak."
      : "Hesap kaydedildi. SES bilgileri (.env) eklendiginde gonderim acilacak.",
  });
});

/** GET /api/pg/enterprise-mail/oauth/:provider/start */
const oauthStart = asyncErrorWrapper(async (req, res) => {
  const provider = req.params.provider;
  if (!["gmail", "microsoft"].includes(provider)) {
    return res.status(400).json({ success: false, message: "Desteklenmeyen provider" });
  }

  const prismaProvider = provider === "gmail" ? "gmail" : "microsoft";
  if (!providerConfigured(prismaProvider)) {
    return res.status(503).json({
      success: false,
      message: `${provider} OAuth yapilandirilmamis (.env)`,
    });
  }

  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const state = crypto.randomBytes(24).toString("hex");
  const rawReturn = String(req.query.returnPath || "/settings/email-accounts").trim();
  const returnPath =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : "/settings/email-accounts";

  await saveOAuthState({
    state,
    userId,
    companyId,
    provider: prismaProvider,
    returnPath,
  });

  const url = getOAuthStartUrl(prismaProvider, state);
  if (!url) {
    return res.status(503).json({ success: false, message: "OAuth URL olusturulamadi" });
  }

  res.json({ success: true, data: { url, state } });
});

/** GET /api/pg/enterprise-mail/oauth/:provider/callback */
const oauthCallback = asyncErrorWrapper(async (req, res) => {
  const provider = req.params.provider;
  const { code, state, error } = req.query;
  const saved = await consumeOAuthState(state);
  const returnPath = saved?.returnPath || "/settings/email-accounts";
  const frontend = `${mailConfig.appPublicUrl}${returnPath}`;

  if (error) {
    return res.redirect(`${frontend}?connect=error&message=${encodeURIComponent(error)}`);
  }

  if (!saved) {
    return res.redirect(`${frontend}?connect=error&message=invalid_state`);
  }

  if (!code) {
    return res.redirect(`${frontend}?connect=error&message=no_code`);
  }

  const prismaProvider = provider === "gmail" ? "gmail" : "microsoft";

  try {
    const account = await connectOAuthAccount({
      userId: saved.userId,
      companyId: saved.companyId,
      provider: prismaProvider,
      code,
    });
    return res.redirect(
      `${frontend}?connect=success&accountId=${account.id}&email=${encodeURIComponent(account.emailAddress)}`
    );
  } catch (err) {
    console.error("[oauth callback]", err);
    return res.redirect(
      `${frontend}?connect=error&message=${encodeURIComponent(err.message || "oauth_failed")}`
    );
  }
});

function mapMessageToListRow(m, account) {
  const toLabel = (m.toEmails || []).join(", ") || "—";
  return {
    id: m.id,
    threadId: m.threadId,
    subject: m.subject,
    snippet: m.snippet,
    fromEmail: m.fromEmail,
    toEmails: m.toEmails,
    bodyText: m.bodyText,
    bodyHtml: m.bodyHtml,
    sentAt: m.sentAt,
    receivedAt: m.receivedAt,
    createdAt: m.createdAt,
    isRead: m.isRead,
    isOutbound: m.isOutbound,
    mailAccount: account
      ? { emailAddress: account.emailAddress, provider: account.provider }
      : null,
    listPreview:
      m.isOutbound || m.folder === "sent"
        ? `Kime: ${toLabel}`
        : m.fromEmail || toLabel,
  };
}

/** GET /api/pg/enterprise-mail/mailbox — hesap + klasore gore liste */
const listMailboxHandler = async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const { accountId, folder = "inbox", limit = "50" } = req.query;
  const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const folderKey = folder === "sent" ? "sent" : "inbox";

  if (!accountId) {
    return res.status(400).json({ success: false, message: "accountId zorunlu" });
  }

  const account = await prisma.mailAccount.findFirst({
    where: { id: String(accountId), userId },
  });
  if (!account) {
    return res.status(404).json({ success: false, message: "Hesap bulunamadi" });
  }

  if (account.provider === "ses_domain" && folderKey === "inbox") {
    return res.json({
      success: true,
      data: [],
      meta: {
        provider: account.provider,
        inboxUnavailable: true,
        message:
          "SES kurumsal hesabi gelen kutusu desteklemiyor. Gonderilenler sekmesini kullanin.",
      },
    });
  }

  if (account.provider === "ses_domain" && folderKey === "sent") {
    const messages = await prisma.mailMessage.findMany({
      where: {
        mailAccountId: account.id,
        folder: "sent",
        isOutbound: true,
      },
      orderBy: { sentAt: "desc" },
      take,
    });
    return res.json({
      success: true,
      data: messages.map((m) => mapMessageToListRow(m, account)),
      meta: { provider: account.provider, mode: "messages" },
    });
  }

  const threads = await prisma.mailThread.findMany({
    where: {
      mailAccountId: account.id,
      messages: { some: { folder: folderKey } },
    },
    orderBy: { lastMessageAt: "desc" },
    take,
    include: {
      mailAccount: { select: { emailAddress: true, provider: true } },
      messages: {
        where: { folder: folderKey },
        orderBy: { receivedAt: "desc" },
        take: 1,
      },
    },
  });

  res.json({
    success: true,
    data: threads,
    meta: { provider: account.provider, mode: "threads" },
  });
};

const listMailbox = asyncErrorWrapper(listMailboxHandler);

/** GET /api/pg/enterprise-mail/threads — geriye uyumluluk */
const listThreads = asyncErrorWrapper(async (req, res) => {
  if (req.query.accountId) {
    return listMailboxHandler(req, res);
  }
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const { folder = "inbox", limit = "50" } = req.query;
  const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const folderKey = folder === "sent" ? "sent" : "inbox";

  const accounts = await prisma.mailAccount.findMany({
    where: {
      userId,
      provider: { in: ["gmail", "microsoft"] },
      status: "active",
    },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (!accountIds.length) {
    return res.json({ success: true, data: [] });
  }

  const threads = await prisma.mailThread.findMany({
    where: {
      mailAccountId: { in: accountIds },
      messages: { some: { folder: folderKey } },
    },
    orderBy: { lastMessageAt: "desc" },
    take,
    include: {
      mailAccount: { select: { emailAddress: true, provider: true } },
    },
  });

  res.json({ success: true, data: threads });
});

/** GET /api/pg/enterprise-mail/threads/:threadId/messages */
const listThreadMessages = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const { threadId } = req.params;

  const thread = await prisma.mailThread.findFirst({
    where: { id: threadId, mailAccount: { userId } },
  });
  if (!thread) {
    return res.status(404).json({ success: false, message: "Konu bulunamadi" });
  }

  const messages = await prisma.mailMessage.findMany({
    where: { threadId },
    orderBy: { receivedAt: "asc" },
    include: { attachments: true },
  });

  res.json({ success: true, data: messages });
});

/** GET /api/pg/enterprise-mail/messages/:id */
const getMessage = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const { id } = req.params;

  const message = await prisma.mailMessage.findFirst({
    where: {
      id,
      mailAccount: { userId },
    },
    include: {
      attachments: true,
      thread: true,
      mailAccount: { select: { emailAddress: true, provider: true } },
    },
  });

  if (!message) {
    return res.status(404).json({ success: false, message: "Mesaj bulunamadi" });
  }

  if (!message.isRead) {
    await prisma.mailMessage.update({
      where: { id },
      data: { isRead: true },
    });
  }

  res.json({ success: true, data: message });
});

/** POST /api/pg/enterprise-mail/send */
const sendMail = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const {
    accountId,
    to = [],
    cc = [],
    bcc = [],
    subject,
    bodyText,
    bodyHtml,
    customerId,
  } = req.body || {};

  if (!accountId) {
    return res.status(400).json({ success: false, message: "accountId zorunlu" });
  }
  const toList = Array.isArray(to) ? to : [to].filter(Boolean);
  if (!toList.length) {
    return res.status(400).json({ success: false, message: "En az bir alici gerekli" });
  }

  const account = await prisma.mailAccount.findFirst({
    where: { id: accountId, userId, companyId },
  });
  if (!account) {
    return res.status(404).json({ success: false, message: "Posta hesabi bulunamadi" });
  }

  const draft = await prisma.mailMessage.create({
    data: {
      companyId,
      mailAccountId: account.id,
      providerMessageId: `draft-${crypto.randomUUID()}`,
      folder: "drafts",
      fromEmail: account.emailAddress,
      fromName: account.displayName,
      toEmails: toList.map(String),
      ccEmails: (Array.isArray(cc) ? cc : []).map(String),
      bccEmails: (Array.isArray(bcc) ? bcc : []).map(String),
      subject: subject || "",
      snippet: (bodyText || bodyHtml || "").slice(0, 200),
      bodyText: bodyText || null,
      bodyHtml: bodyHtml || null,
      isDraft: true,
      isOutbound: true,
    },
  });

  await enqueueMailEvent({
    companyId,
    mailAccountId: account.id,
    type: "send_request",
    payload: { messageId: draft.id, to: toList },
    idempotencyKey: buildIdempotencyKey(["send", draft.id]),
  });

  if (customerId) {
    await linkMailToLatestMeeting(prisma, companyId, String(customerId), {
      messageId: draft.id,
      subject: subject || "",
      sentAt: new Date(),
    });
  }

  res.status(202).json({
    success: true,
    data: { messageId: draft.id, status: "queued" },
    message: "Gonderim kuyruga alindi",
  });
});

/** POST /api/pg/enterprise-mail/accounts/:id/resync */
const requestResync = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const account = await prisma.mailAccount.findFirst({
    where: { id, userId, companyId },
  });
  if (!account) {
    return res.status(404).json({ success: false, message: "Hesap bulunamadi" });
  }

  if (account.provider === "ses_domain") {
    if (providerConfigured("ses_domain") && account.status === "pending") {
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { status: "active", lastSyncAt: new Date(), lastSyncError: null },
      });
    }
    return res.json({
      success: true,
      message:
        "SES hesabi yalnizca gonderim icindir; gelen kutusu senkronize edilmez. Gelen mailler icin Gmail baglayin.",
    });
  }

  try {
    const result = await runIncrementalSync(account);
    notifyEnterpriseMailUpdated({
      userId: account.userId,
      accountId: account.id,
      folder: "inbox",
      newMessages: result.newMessages,
      reason: "manual_resync",
    });
    res.json({ success: true, message: "Gelen kutusu senkronize edildi" });
  } catch (err) {
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastSyncError: err.message, status: "error" },
    });
    return res.status(502).json({
      success: false,
      message: err.message || "Senkronizasyon basarisiz",
    });
  }
});

/** DELETE /api/pg/enterprise-mail/accounts/:id */
const deleteMailAccount = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const account = await prisma.mailAccount.findFirst({
    where: { id, userId, companyId },
  });
  if (!account) {
    return res.status(404).json({ success: false, message: "Hesap bulunamadi" });
  }

  await prisma.mailAccount.delete({ where: { id: account.id } });

  res.json({
    success: true,
    message: `${account.emailAddress} kaldirildi`,
  });
});

/** POST /api/pg/enterprise-mail/accounts/repair */
const repairMailAccounts = asyncErrorWrapper(async (req, res) => {
  const prisma = getPrisma();
  const userId = req.userPg?.id || req.user?.id;
  const companyId = req.userPg?.companyId || req.user?.companyId;

  const report = await repairUserMailAccounts(prisma, userId, companyId);

  const accounts = await prisma.mailAccount.findMany({
    where: { userId, companyId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  res.json({
    success: true,
    data: accounts.map(shapeAccount),
    report,
    message:
      report.removed.length || report.fixed.length || report.activated.length
        ? "Hesaplar duzeltildi"
        : "Duzeltilecek kayit bulunamadi",
  });
});

module.exports = {
  listAccounts,
  registerSesDomainAccount,
  oauthStart,
  oauthCallback,
  listMailbox,
  listThreads,
  listThreadMessages,
  getMessage,
  sendMail,
  requestResync,
  deleteMailAccount,
  repairMailAccounts,
};
