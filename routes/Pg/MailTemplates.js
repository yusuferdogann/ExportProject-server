/**
 * /api/pg/mail-templates — PG paralel MailTemplate route'lari.
 * Mongo tarafinda direkt app.get/post/put/delete olarak mount ediliyordu;
 * PG tarafinda standart router uzerinden mount edilir.
 */

const express = require("express");
const {
  list,
  create,
  update,
  remove,
} = require("../../controllers/Pg/MailTemplates");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

module.exports = router;
