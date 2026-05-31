const mailConfig = require("../../../config/enterpriseMail");

let sesClient;
function getSes() {
  if (sesClient !== undefined) return sesClient;
  try {
    const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    sesClient = {
      client: new SESClient({
        region: mailConfig.ses.region,
        credentials:
          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              }
            : undefined,
      }),
      SendEmailCommand,
    };
  } catch (e) {
    sesClient = null;
  }
  return sesClient;
}

async function sendViaSes({ from, to, cc = [], bcc = [], subject, bodyText, bodyHtml }) {
  const ses = getSes();
  if (!ses) throw new Error("SES SDK kullanilamiyor");

  const fromEmail = from || process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("SES_FROM_EMAIL veya from zorunlu");

  const cmd = new ses.SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: to,
      CcAddresses: cc,
      BccAddresses: bcc,
    },
    Message: {
      Subject: { Data: subject || "", Charset: "UTF-8" },
      Body: {
        ...(bodyHtml
          ? { Html: { Data: bodyHtml, Charset: "UTF-8" } }
          : { Text: { Data: bodyText || "", Charset: "UTF-8" } }),
      },
    },
    ...(mailConfig.ses.configurationSet
      ? { ConfigurationSetName: mailConfig.ses.configurationSet }
      : {}),
  });

  return ses.client.send(cmd);
}

module.exports = { sendViaSes };
