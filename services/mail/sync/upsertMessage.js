/**
 * Provider'dan gelen mesaji thread + message olarak PG onbellegine yazar.
 */

async function upsertMailFromProvider(prisma, input) {
  const {
    account,
    providerMessageId,
    providerThreadId,
    folder,
    fromEmail,
    fromName,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    snippet,
    bodyText,
    bodyHtml,
    receivedAt,
    sentAt,
    isRead,
    isOutbound,
    isDraft,
  } = input;

  const participants = [
    fromEmail,
    ...toEmails,
    ...ccEmails,
  ].filter(Boolean);

  let thread = null;
  if (providerThreadId) {
    thread = await prisma.mailThread.upsert({
      where: {
        mailAccountId_providerThreadId: {
          mailAccountId: account.id,
          providerThreadId: String(providerThreadId),
        },
      },
      create: {
        companyId: account.companyId,
        mailAccountId: account.id,
        providerThreadId: String(providerThreadId),
        subject: subject || null,
        snippet: snippet || null,
        participantEmails: [...new Set(participants)],
        lastMessageAt: receivedAt || sentAt || new Date(),
        messageCount: 1,
        isRead,
      },
      update: {
        subject: subject || undefined,
        snippet: snippet || undefined,
        participantEmails: [...new Set(participants)],
        lastMessageAt: receivedAt || sentAt || new Date(),
        isRead,
      },
    });
  }

  await prisma.mailMessage.upsert({
    where: {
      mailAccountId_providerMessageId: {
        mailAccountId: account.id,
        providerMessageId: String(providerMessageId),
      },
    },
    create: {
      companyId: account.companyId,
      mailAccountId: account.id,
      threadId: thread?.id || null,
      providerMessageId: String(providerMessageId),
      folder,
      fromEmail,
      fromName,
      toEmails,
      ccEmails,
      bccEmails,
      subject,
      snippet,
      bodyText,
      bodyHtml,
      receivedAt,
      sentAt,
      isRead,
      isOutbound,
      isDraft,
    },
    update: {
      threadId: thread?.id || undefined,
      folder,
      subject,
      snippet,
      bodyText,
      bodyHtml,
      isRead,
      receivedAt,
      sentAt,
    },
  });

  if (thread) {
    const count = await prisma.mailMessage.count({
      where: { threadId: thread.id },
    });
    await prisma.mailThread.update({
      where: { id: thread.id },
      data: { messageCount: count },
    });
  }
}

module.exports = { upsertMailFromProvider };
