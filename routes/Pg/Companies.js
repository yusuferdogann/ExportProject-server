/**
 * /api/pg/companies — Prisma/PostgreSQL tabanli company route'lari.
 */

const express = require("express");
const { getMine, listAll, updateMine } = require("../../controllers/Pg/Companies");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/mine", getMine);
router.patch("/mine", updateMine);
router.get("/", listAll);

module.exports = router;
