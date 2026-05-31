/**
 * /api/pg/users — Prisma/PostgreSQL tabanli user route'lari.
 */

const express = require("express");
const {
  getCompanyUsers,
  getOne,
  create,
  update,
  remove,
} = require("../../controllers/Pg/Users");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/company", getCompanyUsers);
router.get("/:id", getOne);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
