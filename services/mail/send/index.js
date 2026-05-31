const { getPrisma } = require("../../../db/prisma");
const { sendViaSes } = require("./sesSend");
const { sendViaGmail } = require("./gmailSend");
const { sendViaMicrosoft } = require("./microsoftSend");

async function sendOutboundMessage(account, draft) {
  const payload = {
    to: draft.toEmails,
    cc: draft.ccEmails,
    bcc: draft.bccEmails,
    subject: draft.subject,
    bodyText: draft.bodyText,
    bodyHtml: draft.bodyHtml,
  };

  let providerMessageId;
  switch (account.provider) {
    case "ses_domain":
      await sendViaSes({
        from: account.emailAddress,
        ...payload,
      });
      providerMessageId = `ses-${Date.now()}`;
      break;
    case "gmail": {
      const res = await sendViaGmail(account, payload);
      providerMessageId = res.id;
      break;
    }
    case "microsoft":
      await sendViaMicrosoft(account, payload);
      providerMessageId = `ms-${Date.now()}`;
      break;
    default:
      throw new Error(`Gonderim desteklenmiyor: ${account.provider}`);
  }

  const prisma = getPrisma();
  const sentAt = new Date();
  const updated = await prisma.mailMessage.update({
    where: { id: draft.id },
    data: {
      providerMessageId: String(providerMessageId),
      folder: "sent",
      isDraft: false,
      isOutbound: true,
      sentAt,
      receivedAt: sentAt,
    },
  });

  const threadId = String(providerMessageId);
  const thread = await prisma.mailThread.upsert({
    where: {
      mailAccountId_providerThreadId: {
        mailAccountId: account.id,
        providerThreadId: threadId,
      },
    },
    create: {
      companyId: account.companyId,
      mailAccountId: account.id,
      providerThreadId: threadId,
      subject: updated.subject || null,
      snippet: updated.snippet || null,
      participantEmails: [...new Set(updated.toEmails || [])],
      lastMessageAt: sentAt,
      messageCount: 1,
      isRead: true,
    },
    update: {
      subject: updated.subject || undefined,
      snippet: updated.snippet || undefined,
      participantEmails: [...new Set(updated.toEmails || [])],
      lastMessageAt: sentAt,
      messageCount: { increment: 1 },
    },
  });

  await prisma.mailMessage.update({
    where: { id: draft.id },
    data: { threadId: thread.id },
  });

  return { providerMessageId };
}

module.exports = { sendOutboundMessage };
