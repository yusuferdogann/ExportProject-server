const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const requireManagerPackageUser = require("../Middleware/requireManagerPackageUser");
const {
  list,
  create,
  getOne,
  update,
  remove,
} = require("../controllers/ManagerPackages");

const router = express.Router();

router.use(getAccessToRoute);
router.use(requireManagerPackageUser);

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
