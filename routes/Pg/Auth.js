/**
 * /api/pg/auth — Prisma/PostgreSQL tabanli auth route'lari.
 *
 * Eski /api/auth (Mongo) AYNEN calismaya devam eder; bu sadece paralel sunulan
 * yeni bir versiyondur. Frontend tarafinda "/api" -> "/api/pg" degisikligi
 * yeterli olur.
 */

const express = require("express");
const {
  register,
  login,
  logout,
  getUser,
  changePassword,
} = require("../../controllers/Pg/Auth");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", getAccessToRoutePg, logout);
router.get("/profile", getAccessToRoutePg, getUser);
router.put("/change-password", getAccessToRoutePg, changePassword);

module.exports = router;
