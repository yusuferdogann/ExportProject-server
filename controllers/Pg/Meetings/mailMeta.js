/**
 * Gorusme kaydina bagli kurumsal mail meta (Prisma client eski olsa raw SQL ile okur).
 */

async function readMeetingMailColumns(prisma, meetingId) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT last_mail_message_id AS "lastMailMessageId",
             last_mail_subject AS "lastMailSubject",
             last_mail_sent_at AS "lastMailSentAt"
      FROM meetings
      WHERE id = ${meetingId}::uuid
      LIMIT 1
    `;
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function writeMeetingMailColumns(prisma, meetingId, { messageId, subject, sentAt }) {
  try {
    await prisma.$executeRaw`
      UPDATE meetings
      SET last_mail_message_id = ${messageId}::uuid,
          last_mail_subject = ${subject || ""},
          last_mail_sent_at = ${sentAt || new Date()},
          "updatedAt" = NOW()
      WHERE id = ${meetingId}::uuid
    `;
    return true;
  } catch (err) {
    console.warn("[meetings] mail link:", err?.message);
    return false;
  }
}

async function loadMeetingMailMeta(prisma, meeting) {
  let messageId = meeting.lastMailMessageId;
  let subject = meeting.lastMailSubject;
  let sentAt = meeting.lastMailSentAt;

  if (messageId === undefined) {
    const raw = await readMeetingMailColumns(prisma, meeting.id);
    if (raw) {
      messageId = raw.lastMailMessageId;
      subject = raw.lastMailSubject;
      sentAt = raw.lastMailSentAt;
    }
  }

  if (!messageId) {
    return { sent: false };
  }

  const msg = await prisma.mailMessage.findFirst({
    where: { id: messageId },
    select: {
      id: true,
      subject: true,
      sentAt: true,
      createdAt: true,
      isDraft: true,
      snippet: true,
      bodyText: true,
    },
  });

  const resolvedSubject = subject || msg?.subject || "";
  const resolvedSentAt = sentAt || msg?.sentAt || msg?.createdAt || null;
  const isPending = Boolean(msg?.isDraft);
  const sent = Boolean(msg && !msg.isDraft);

  return {
    sent: sent || isPending,
    pending: isPending,
    messageId,
    subject: resolvedSubject || "(Konu yok)",
    sentAt: resolvedSentAt,
    snippet: msg?.snippet || "",
  };
}

async function linkMailToLatestMeeting(prisma, companyId, customerId, mail) {
  const meet = await prisma.meeting.findFirst({
    where: { companyId, customerId },
    orderBy: { createdAt: "desc" },
  });
  if (!meet) return null;

  const ok = await writeMeetingMailColumns(prisma, meet.id, {
    messageId: mail.messageId,
    subject: mail.subject,
    sentAt: mail.sentAt || new Date(),
  });

  if (!ok) {
    try {
      await prisma.meeting.update({
        where: { id: meet.id },
        data: {
          lastMailMessageId: mail.messageId,
          lastMailSubject: mail.subject,
          lastMailSentAt: mail.sentAt || new Date(),
        },
      });
    } catch (_) {
      return null;
    }
  }

  return meet.id;
}

module.exports = {
  loadMeetingMailMeta,
  linkMailToLatestMeeting,
  writeMeetingMailColumns,
};
