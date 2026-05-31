const express = require("express");
const router = express.Router();
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  getAllReports,
  getReportById,
  createReport,
  updateReport,
  deleteReport,
  downloadReportPdf,
  getChartData,
} = require("../controllers/Report/index");

router.use(getAccessToRoute);

// Chart data (önce tanımla - parametreli route'dan önce)
router.get("/chart-data", getChartData);

// GET all reports (filtered by company, optional type)
router.get("/", getAllReports);

// PDF download (önce tanımla ki /:id ile çakışmasın)
router.get("/:id/pdf", downloadReportPdf);

// GET single report by id
router.get("/:id", getReportById);

// POST create report (for manual/çalışan raporları)
router.post("/", createReport);

// PUT update report
router.put("/:id", updateReport);

// DELETE report
router.delete("/:id", deleteReport);

module.exports = router;