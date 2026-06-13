const nodemailer = require("nodemailer");
const { decryptCredentials } = require("../credentials");

async function sendViaImap(account, payload) {
  const creds = decryptCredentials(account.credentials);
  if (!creds?.password) {
    throw new Error("SMTP kimlik bilgisi bulunamadi");
  }

  const fromName =
    account.displayName ||
    account.emailAddress.split("@")[0] ||
    account.emailAddress;
  const fromAddress = `"${fromName.replace(/"/g, "")}" <${account.emailAddress}>`;

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort || 465,
    secure: creds.smtpSecure === true,
    requireTLS: Number(creds.smtpPort) === 587,
    auth: {
      user: account.emailAddress,
      pass: creds.password,
    },
    tls: { rejectUnauthorized: false },
  });

  const info = await transporter.sendMail({
    from: fromAddress,
    replyTo: account.emailAddress,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject || "",
    text: payload.bodyText || undefined,
    html: payload.bodyHtml || undefined,
  });

  return { id: info.messageId || `imap-${Date.now()}` };
}

module.exports = { sendViaImap };
