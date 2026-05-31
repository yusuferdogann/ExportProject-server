const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const { getBanks, createBank, updateBank, deleteBank } = require("../controllers/Bankinfo");

const router = express.Router();

router.use(getAccessToRoute);
router.get("/", getBanks);
router.post("/", createBank);
router.put("/:id", updateBank);
router.delete("/:id", deleteBank);

module.exports = router;

