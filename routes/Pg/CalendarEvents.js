/**
 * /api/pg/calendar — PG paralel Calendar route'lari.
 * NOT: requirePermission (Mongo middleware) req.user.permissions okuyor;
 * getAccessToRoutePg req.user'i PG profile ile dolduruyor, bu sayede
 * mevcut permission middleware'i tekrar yazmadan kullanilabiliyor.
 */

const express = require("express");
const {
  createEvent,
  getEvents,
  deleteEvent,
  getAssignableUsers,
} = require("../../controllers/Pg/CalendarEvents");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");
const requirePermission = require("../../Middleware/requirePermission");

const router = express.Router();

router.use(getAccessToRoutePg);
router.get(
  "/assignable-users",
  requirePermission("calendar:event:view"),
  getAssignableUsers
);
router.post(
  "/addevent",
  requirePermission("calendar:event:create"),
  createEvent
);
router.get("/", requirePermission("calendar:event:view"), getEvents);
router.delete("/:id", requirePermission("calendar:event:delete"), deleteEvent);

module.exports = router;
