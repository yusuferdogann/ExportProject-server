/**
 * Enterprise mail (Gmail/Outlook/SES) yapilandirmasi.
 * SES ve S3 bilgileri hazir oldugunda .env uzerinden doldurulacak.
 */

const bool = (v, def = false) => {
  if (v === undefined || v === null || v === "") return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};

module.exports = {
  /** Arka planda DB queue event isleyici */
  workerEnabled: bool(process.env.ENTERPRISE_MAIL_WORKER_ENABLED, true),
  workerPollMs: Number(process.env.ENTERPRISE_MAIL_WORKER_POLL_MS || 2000),

  /** AWS SES — kullanici verecek */
  ses: {
    region: process.env.AWS_REGION || process.env.SES_REGION || "eu-central-1",
    fromDomain: process.env.SES_FROM_DOMAIN || "",
    configurationSet: process.env.SES_CONFIGURATION_SET || "",
  },

  /** AWS S3 — ekler ve ham MIME */
  s3: {
    region: process.env.AWS_S3_REGION || process.env.AWS_REGION || "eu-central-1",
    bucket: process.env.ENTERPRISE_MAIL_S3_BUCKET || "",
    prefix: process.env.ENTERPRISE_MAIL_S3_PREFIX || "mail/",
  },

  /** SQS (opsiyonel; bos ise DB queue kullanilir) */
  sqs: {
    queueUrl: process.env.ENTERPRISE_MAIL_SQS_URL || "",
  },

  /** OpenSearch (opsiyonel; Faz 2+) */
  openSearch: {
    node: process.env.OPENSEARCH_NODE || "",
    indexPrefix: process.env.OPENSEARCH_MAIL_INDEX_PREFIX || "mail",
  },

  gmail: {
    clientId: process.env.GOOGLE_MAIL_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_MAIL_REDIRECT_URI ||
      "http://localhost:5000/api/pg/enterprise-mail/oauth/gmail/callback",
    pubsubTopic: process.env.GOOGLE_MAIL_PUBSUB_TOPIC || "",
  },

  microsoft: {
    clientId: process.env.MICROSOFT_MAIL_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_MAIL_CLIENT_SECRET || "",
    tenantId: process.env.MICROSOFT_MAIL_TENANT_ID || "common",
    redirectUri:
      process.env.MICROSOFT_MAIL_REDIRECT_URI ||
      "http://localhost:5000/api/pg/enterprise-mail/oauth/microsoft/callback",
  },

  appPublicUrl:
    process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "http://localhost:5173",
};
