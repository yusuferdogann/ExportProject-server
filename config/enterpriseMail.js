/**
 * Enterprise mail (Gmail/Outlook/SES) yapilandirmasi.
 *
 * Ortam secimi (.env):
 *   MAIL_OAUTH_ENV=local       → localhost redirect + Vite UI
 *   MAIL_OAUTH_ENV=production  → app.ihracattakip.com
 *
 * Istege bagli override: GOOGLE_MAIL_REDIRECT_URI, APP_PUBLIC_URL
 */
const MAIL_OAUTH_PROFILES = {
  local: {
    gmailRedirectUri:
      "http://localhost:5000/api/pg/enterprise-mail/oauth/gmail/callback",
    microsoftRedirectUri:
      "http://localhost:5000/api/pg/enterprise-mail/oauth/microsoft/callback",
    appPublicUrl: "http://localhost:5173",
  },
  production: {
    gmailRedirectUri:
      "https://app.ihracattakip.com/api/pg/enterprise-mail/oauth/gmail/callback",
    microsoftRedirectUri:
      "https://app.ihracattakip.com/api/pg/enterprise-mail/oauth/microsoft/callback",
    appPublicUrl: "https://app.ihracattakip.com",
  },
};

function resolveMailOAuthProfile() {
  const key = String(process.env.MAIL_OAUTH_ENV || "local")
    .trim()
    .toLowerCase();
  return MAIL_OAUTH_PROFILES[key] || MAIL_OAUTH_PROFILES.local;
}

const bool = (v, def = false) => {
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};

function trimUrl(v) {
  return String(v || "").trim().replace(/\/$/, "");
}

function isLocalHostUrl(url) {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(String(url || ""));
}

function resolveAppPublicUrl() {
  const explicit = trimUrl(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL);
  if (explicit) return explicit;
  return resolveMailOAuthProfile().appPublicUrl;
}

/** OAuth callback icin API taban URL (nginx /api proxy veya dogrudan Node portu). */
function resolveApiPublicBase() {
  const explicit = trimUrl(process.env.API_PUBLIC_URL);
  if (explicit) return explicit;

  const redirect = trimUrl(process.env.GOOGLE_MAIL_REDIRECT_URI);
  if (redirect && redirect.includes("/api/pg/enterprise-mail/oauth/")) {
    return redirect.replace(/\/api\/pg\/enterprise-mail\/oauth\/[^/]+\/callback$/i, "");
  }

  const app = resolveAppPublicUrl();
  if (app && !isLocalHostUrl(app)) return app;

  const port = Number(process.env.PORT) || 5000;
  return `http://127.0.0.1:${port}`;
}

function resolveGmailRedirectUri() {
  const explicit = String(process.env.GOOGLE_MAIL_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const profile = resolveMailOAuthProfile();
  if (profile.gmailRedirectUri) return profile.gmailRedirectUri;
  return `${resolveApiPublicBase()}/api/pg/enterprise-mail/oauth/gmail/callback`;
}

function resolveMicrosoftRedirectUri() {
  const explicit = String(process.env.MICROSOFT_MAIL_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const profile = resolveMailOAuthProfile();
  if (profile.microsoftRedirectUri) return profile.microsoftRedirectUri;
  return `${resolveApiPublicBase()}/api/pg/enterprise-mail/oauth/microsoft/callback`;
}

/** UI ve diagnostics icin public OAuth ozeti (secret icermez). */
function getOAuthPublicConfig() {
  const gmailRedirectUri = resolveGmailRedirectUri();
  const microsoftRedirectUri = resolveMicrosoftRedirectUri();
  const appPublicUrl = resolveAppPublicUrl();
  const oauthEnvironment = isLocalHostUrl(gmailRedirectUri) ? "local" : "production";

  return {
    oauthEnvironment,
    mailOAuthEnv: String(process.env.MAIL_OAUTH_ENV || "local").trim().toLowerCase(),
    appPublicUrl,
    apiPublicBase: resolveApiPublicBase(),
    gmailRedirectUri,
    microsoftRedirectUri,
    gmailPubsubConfigured: Boolean(String(process.env.GOOGLE_MAIL_PUBSUB_TOPIC || "").trim()),
    nodeEnv: process.env.NODE_ENV || "development",
  };
}

const gmailRedirectUri = resolveGmailRedirectUri();
const microsoftRedirectUri = resolveMicrosoftRedirectUri();
const appPublicUrl = resolveAppPublicUrl();

module.exports = {
  workerEnabled: bool(process.env.ENTERPRISE_MAIL_WORKER_ENABLED, true),
  workerPollMs: Number(process.env.ENTERPRISE_MAIL_WORKER_POLL_MS || 2000),

  ses: {
    region: process.env.AWS_REGION || process.env.SES_REGION || "eu-central-1",
    fromDomain: process.env.SES_FROM_DOMAIN || "",
    configurationSet: process.env.SES_CONFIGURATION_SET || "",
  },

  s3: {
    region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "eu-central-1",
    bucket: process.env.ENTERPRISE_MAIL_S3_BUCKET || "",
    prefix: process.env.ENTERPRISE_MAIL_S3_PREFIX || "mail/",
  },

  sqs: {
    queueUrl: process.env.ENTERPRISE_MAIL_SQS_URL || "",
  },

  openSearch: {
    node: process.env.OPENSEARCH_NODE || "",
    indexPrefix: process.env.OPENSEARCH_MAIL_INDEX_PREFIX || "mail",
  },

  gmail: {
    clientId: process.env.GOOGLE_MAIL_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET || "",
    redirectUri: gmailRedirectUri,
    pubsubTopic: process.env.GOOGLE_MAIL_PUBSUB_TOPIC || "",
  },

  microsoft: {
    clientId: process.env.MICROSOFT_MAIL_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_MAIL_CLIENT_SECRET || "",
    tenantId: process.env.MICROSOFT_MAIL_TENANT_ID || "common",
    redirectUri: microsoftRedirectUri,
  },

  appPublicUrl,

  getOAuthPublicConfig,
  isLocalHostUrl,
  resolveMailOAuthProfile,
  MAIL_OAUTH_PROFILES,
};
