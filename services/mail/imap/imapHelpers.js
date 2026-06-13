const { emailDomain, isConsumerMailbox } = require("../mailAccountHelpers");

function defaultMailHosts(domain) {
  const host = `mail.${domain}`;
  return {
    imapHost: host,
    imapPort: 993,
    imapSecure: true,
    smtpHost: host,
    smtpPort: 465,
    smtpSecure: true,
  };
}

function resolveImapSettings(input = {}) {
  const email = String(input.emailAddress || input.email || "")
    .trim()
    .toLowerCase();
  const domain = emailDomain(email);
  const defaults = domain ? defaultMailHosts(domain) : {};

  return {
    emailAddress: email,
    password: String(input.password || ""),
    imapHost: String(input.imapHost || defaults.imapHost || "").trim(),
    imapPort: Number(input.imapPort || defaults.imapPort || 993),
    imapSecure:
      input.imapSecure !== undefined
        ? input.imapSecure !== false
        : Number(input.imapPort || defaults.imapPort || 993) === 993,
    smtpHost: String(input.smtpHost || defaults.smtpHost || "").trim(),
    smtpPort: Number(input.smtpPort || defaults.smtpPort || 465),
    smtpSecure:
      input.smtpSecure !== undefined
        ? input.smtpSecure !== false
        : Number(input.smtpPort || defaults.smtpPort || 465) === 465,
    inboxLastUid: Number(input.inboxLastUid || 0),
    sentLastUid: Number(input.sentLastUid || 0),
    sentFolder: input.sentFolder || null,
  };
}

function isCorporateMailbox(email) {
  return Boolean(email) && email.includes("@") && !isConsumerMailbox(email);
}

const SENT_FOLDER_CANDIDATES = [
  "INBOX.Sent",
  "Sent",
  "Sent Items",
  "Sent Messages",
  "INBOX.Sent Items",
];

const SPAM_FOLDER_CANDIDATES = [
  "Junk",
  "Spam",
  "INBOX.spam",
  "INBOX.Junk",
  "INBOX.Spam",
  "Bulk Mail",
  "INBOX.Bulk Mail",
];

module.exports = {
  defaultMailHosts,
  resolveImapSettings,
  isCorporateMailbox,
  SENT_FOLDER_CANDIDATES,
  SPAM_FOLDER_CANDIDATES,
};
