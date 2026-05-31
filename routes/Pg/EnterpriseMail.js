/**
 * /api/pg/enterprise-mail — kurumsal e-posta API
 */

const express = require("express");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");
const {
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
} = require("../../controllers/Pg/EnterpriseMail");
const {
  gmailPush,
  microsoftNotification,
} = require("../../controllers/Pg/EnterpriseMail/webhooks");

const router = express.Router();

// Public webhooks (once mount edilir)
router.post("/webhooks/gmail", gmailPush);
router.post("/webhooks/microsoft", microsoftNotification);

// OAuth callback tarayicidan gelir — auth header yok
router.get("/oauth/:provider/callback", oauthCallback);

router.use(getAccessToRoutePg);

router.get("/accounts", listAccounts);
router.post("/accounts/repair", repairMailAccounts);
router.post("/accounts/ses-domain", registerSesDomainAccount);
router.delete("/accounts/:id", deleteMailAccount);
router.post("/accounts/:id/resync", requestResync);
router.get("/oauth/:provider/start", oauthStart);

router.get("/mailbox", listMailbox);
router.get("/threads", listThreads);
router.get("/threads/:threadId/messages", listThreadMessages);
router.get("/messages/:id", getMessage);
router.post("/send", sendMail);

module.exports = router;
