/**
 * Mail provider registry — gonderim ve incremental sync.
 */

const mailConfig = require("../../../config/enterpriseMail");

function providerConfigured(provider) {
  switch (provider) {
    case "ses_domain":
      return Boolean(mailConfig.ses.fromDomain || process.env.SES_FROM_EMAIL);
    case "gmail":
      return Boolean(mailConfig.gmail.clientId && mailConfig.gmail.clientSecret);
    case "microsoft":
      return Boolean(
        mailConfig.microsoft.clientId && mailConfig.microsoft.clientSecret
      );
    case "imap_custom":
      return true;
    default:
      return false;
  }
}

function getOAuthStartUrl(provider, state) {
  if (provider === "gmail" && providerConfigured("gmail")) {
    const params = new URLSearchParams({
      client_id: mailConfig.gmail.clientId,
      redirect_uri: mailConfig.gmail.redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (provider === "microsoft" && providerConfigured("microsoft")) {
    const tenant = mailConfig.microsoft.tenantId || "common";
    const params = new URLSearchParams({
      client_id: mailConfig.microsoft.clientId,
      redirect_uri: mailConfig.microsoft.redirectUri,
      response_type: "code",
      scope: [
        "offline_access",
        "https://graph.microsoft.com/Mail.Read",
        "https://graph.microsoft.com/Mail.Send",
      ].join(" "),
      state,
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
  }
  return null;
}

module.exports = {
  providerConfigured,
  getOAuthStartUrl,
};
