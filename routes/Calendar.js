const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const requirePermission = require("../Middleware/requirePermission");
const {
  createEvent,
  getEvents,
  deleteEvent,
  getAssignableUsers,
} = require("../controllers/Calendar/index");

router.use(getAccessToRoute);
router.get("/assignable-users", requirePermission("calendar:event:view"), getAssignableUsers);
router.post("/addevent", requirePermission("calendar:event:create"), createEvent);
router.get("/", requirePermission("calendar:event:view"), getEvents);
router.delete("/:id", requirePermission("calendar:event:delete"), deleteEvent);

module.exports = router;