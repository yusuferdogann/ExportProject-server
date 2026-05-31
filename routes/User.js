const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { getCompanyUsers } = require("../controllers/UserController");

const router = express.Router();

router.use(getAccessToRoute);
router.get("/company", getCompanyUsers);

module.exports = router;
