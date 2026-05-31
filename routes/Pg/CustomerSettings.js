const express = require("express");
const { getAll, saveAll } = require("../../controllers/Pg/CustomerSettings");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get("/", getAll);
router.post("/", saveAll);

module.exports = router;
