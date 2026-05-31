const { register, login, getUser, logout, addScope } = require('../controllers/AuthController');
const { data, getdata } = require('../controllers/DataController');
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const updateCompanyInfo = require('../Middleware/companyInfo/companyInfo');
const { DashboardWeekGrafic, EditData,controlFacility, DeletedFacility, TotalEmission, checkBalanceReport, getReportLimit, checkReportLimit, GetExcelData, imageUpload, checkFacilityLimit, updatedFacility, FacilityUpdateInfo, FacilitySaveInfo, getLogo, addedFacility, GetFacilityInfo, getOneFacility, GetAllScopeByDateOfDaily, DeletedScope, ReportPeriodData, findObjectName, summaryFilterSubData, getAllFacility, filterFacilityByUserId, filterAmountByUserId, summaryFilterData, DashboardMounthGrafic, DashboardFacilityGrafic, DashboardScopeGrafic } = require('../Middleware/facility/updateFacility');

const express = require('express');
const routers = express.Router();

// Authentication Routes
routers.post('/register', register);
routers.post('/login', login);
// /login route
routers.get("/login", getAccessToRoute, (req, res) => {
    // Token geçerli ise, verileri döndür
    res.json({ message: "Dashboard verileri başarıyla alındı" });
  });
routers.post('/logout', getAccessToRoute, logout);
routers.get("/profile", getAccessToRoute, getUser);

// Facility Routes
routers.post("/addfacility", getAccessToRoute, addedFacility);
routers.get("/getfacility", getAccessToRoute, filterFacilityByUserId);
routers.get("/getfacilityinfo", getAccessToRoute, GetFacilityInfo);
routers.get("/facility", getAccessToRoute, controlFacility);
  
// Dashboard Routes
routers.get("/dashboard", getAccessToRoute, (req, res) => {
  // Dashboard için veriler burada alınabilir
  res.json({ message: "Dashboard verileri başarıyla alındı" });
});

// Report Routes
routers.get("/get-report", getAccessToRoute, (req, res) => {
  // Rapor verileri alınabilir
  res.json({ message: "Rapor verileri başarıyla alındı" });
});

// Calculation Routes
routers.post("/calculation", data);

// Facility Info Update Routes
routers.post("/facilityinfo", getAccessToRoute, FacilitySaveInfo);
routers.put("/facilityinfoupdate", getAccessToRoute, FacilityUpdateInfo);
routers.get("/getfacilityinfo", getAccessToRoute, GetFacilityInfo);

// Graph Data Routes
routers.get("/getgraficdata", getAccessToRoute, DashboardMounthGrafic);
routers.get("/getfacilitygraficdata", getAccessToRoute, DashboardFacilityGrafic);
routers.get("/getcardgraficdata", getAccessToRoute, DashboardScopeGrafic);
routers.get("/getweekgraficdata", getAccessToRoute, DashboardWeekGrafic);

// Excel Data Route
routers.get("/get-excel", getAccessToRoute, GetExcelData);

// Facility and Report Limit Routes
routers.post('/checkFacilityLimit', getAccessToRoute, checkFacilityLimit);
routers.post('/checkReportLimit', getAccessToRoute, checkReportLimit);
routers.post('/checkBalanceReport', getAccessToRoute, checkBalanceReport);
routers.get('/getReportLimit', getAccessToRoute, getReportLimit);

// Summary Data Routes
routers.post("/getsummarydata", getAccessToRoute, summaryFilterData);
routers.post("/getsummarysubdata", getAccessToRoute, summaryFilterSubData);

// Delete and Update Routes
routers.post("/deletefacility", getAccessToRoute, DeletedFacility);
routers.post("/deletedscope", getAccessToRoute, DeletedScope);
routers.post("/editdata", getAccessToRoute, EditData);

// Upload Image Route
routers.post('/uploadimage', getAccessToRoute, imageUpload);

// Get Logo Route
routers.get("/getlogo", getAccessToRoute, getLogo);

module.exports = routers;
