/**
 * /api/pg/reports — PG paralel Reports route'lari.
 */

const express = require("express");
const {
  getAllReports,
  getReportById,
  createReport,
  updateReport,
  deleteReport,
  downloadReportPdf,
  getChartData,
} = require("../../controllers/Pg/Reports");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();
router.use(getAccessToRoutePg);
router.get("/chart-data", getChartData);
router.get("/", getAllReports);
router.get("/:id/pdf", downloadReportPdf);
router.get("/:id", getReportById);
router.post("/", createReport);
router.put("/:id", updateReport);
router.delete("/:id", deleteReport);

module.exports = router;
