const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const database = require("./config/database.js");
const { connectPostgres } = require("./config/postgres.js");
const { connectPrisma } = require("./db/prisma.js");
const authRouter = require("./routes/AuthRouter.js");
// const productRouter = require("./routes/ProductRouter.js");
const httpContext = require("express-http-context");
const customErrorHandler = require("./Middleware/errors/customErrorHandler.js");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const customerRoutes = require("./routes/Customers.js");
const meetRoutes = require("./routes/Meetings.js");
const noteRoutes = require("./routes/Notes.js");
const reminderRoutes = require("./routes/Reminders.js");
const priceQuoteRoutes = require("./routes/PriceOffer.js");
const proformaRoutes = require("./routes/Proforma.js");
const checklistRoutes = require("./routes/CheckList.js");
const invoiceRoutes = require("./routes/Invoice.js");
const uploadRoutes = require("./routes/Upload.js");
const reportRoutes = require("./routes/Reports.js");
const workerNote = require("./routes/workerNotes.js");
const calendarRoutes = require("./routes/Calendar.js");
const testPdfRouter = require("./routes/testPdf");
const messageRoutes = require("./routes/Message");
const notificationRoutes = require("./routes/Notification");
const userRoutes = require("./routes/User");
const workerRoutes = require("./routes/Worker");
const productRoutes = require("./routes/Product");
const productDiscountRoutes = require("./routes/ProductDiscount");
const bankRoutes = require("./routes/BankInfo");
const authorizationRoutes = require("./routes/Authorization");
const approvalRoutes = require("./routes/Approval");
const documentsRoutes = require("./routes/Documents");
const mandatoryReportRoutes = require("./routes/MandatoryReport");
const geminiRoutes = require("./routes/Gemini");
const interviewReminderSettingsRoutes = require("./routes/InterviewReminderSettings");
const mailAiRoutes = require("./routes/MailAi");
const enterpriseAnalyticsRoutes = require("./routes/EnterpriseAnalytics");
const usageRoutes = require("./routes/Usage");
const managerPackagesRoutes = require("./routes/ManagerPackages");
const { getAccessToRoute } = require("./Middleware/authorization/auth");
const mailTemplateCtrl = require("./controllers/MailTemplateController");

// ===== PostgreSQL (Prisma) paralel route'lari — Mongo'ya dokunmadan =====
const pgAuthRoutes = require("./routes/Pg/Auth");
const pgUsersRoutes = require("./routes/Pg/Users");
const pgCompaniesRoutes = require("./routes/Pg/Companies");
const pgCustomersRoutes = require("./routes/Pg/Customers");
const pgCustomerSettingsRoutes = require("./routes/Pg/CustomerSettings");
const pgProductsRoutes = require("./routes/Pg/Products");
const pgProductDiscountsRoutes = require("./routes/Pg/ProductDiscounts");
const pgBankInfoRoutes = require("./routes/Pg/BankInfo");
const pgMailTemplatesRoutes = require("./routes/Pg/MailTemplates");
const pgNotificationsRoutes = require("./routes/Pg/Notifications");
const pgWorkersRoutes = require("./routes/Pg/Workers");
const pgWorkerNotesRoutes = require("./routes/Pg/WorkerNotes");
const pgMessagesRoutes = require("./routes/Pg/Messages");
const pgMeetingsRoutes = require("./routes/Pg/Meetings");
const pgRemindersRoutes = require("./routes/Pg/Reminders");
const pgNotesRoutes = require("./routes/Pg/Notes");
const pgCalendarRoutes = require("./routes/Pg/CalendarEvents");
const pgAuthorizationRoutes = require("./routes/Pg/Authorization");
const pgApprovalRoutes = require("./routes/Pg/Approval");
const pgProformaRoutes = require("./routes/Pg/Proforma");
const pgInvoiceRoutes = require("./routes/Pg/Invoice");
const pgChecklistRoutes = require("./routes/Pg/Checklist");
const pgPriceOfferRoutes = require("./routes/Pg/PriceOffer");
const pgDocumentsRoutes = require("./routes/Pg/Documents");
const pgWorkOrdersRoutes = require("./routes/Pg/WorkOrders");
const pgReportsRoutes = require("./routes/Pg/Reports");
const pgMandatoryReportsRoutes = require("./routes/Pg/MandatoryReports");
const pgEnterpriseMailRoutes = require("./routes/Pg/EnterpriseMail");
const { startMailEventWorker } = require("./services/mail/mailEventProcessor");
const { startMailSyncScheduler } = require("./services/mail/mailSyncScheduler");
const mailConfig = require("./config/enterpriseMail");

// 🔹 SOCKET
const http = require("http");
const { initSocket } = require("./socket");

dotenv.config();

const app = express();

//================ SUBDOMAIN CORS ======================
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/([a-z0-9-]+\.)?localhost:5173$/,
  /^http:\/\/127\.0\.0\.1:5173$/,
  /^https:\/\/app\.ihracattakip\.com$/,
  /^http:\/\/app\.ihracattakip\.com$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/,
  /^https:\/\/[a-z0-9-]+\.loca\.lt$/,
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
];

const isLocalDevOrigin = (origin) => {
  if (process.env.NODE_ENV === "production") return false;
  return (
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
    /^http:\/\/\[::1\]:\d+$/.test(origin)
  );
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return true;
  return isLocalDevOrigin(origin);
};

/** Worker axios her istekte X-Tenant gönderir; cross-origin (5173→3000) preflight için izin gerekir. */
const CORS_ALLOWED_HEADERS = [
  "Origin",
  "X-Requested-With",
  "Content-Type",
  "Accept",
  "Authorization",
  "X-Tenant",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  session({
    secret: "secret-123",
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

app.use(cookieParser());
app.use(httpContext.middleware);

// ================= ROUTES ===========================
app.use("/api/auth", authRouter);
app.use("/api/customer", customerRoutes);
app.use("/api/meet", meetRoutes);
app.use("/api/note", noteRoutes);
app.use("/api/reminder", reminderRoutes);
app.use("/api/pricequote", priceQuoteRoutes);
app.use("/api/proforma", proformaRoutes);
app.use("/api/checklist", checklistRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/workernotes", workerNote);
app.use("/api/calendar", calendarRoutes);
app.use("/api/test-pdf", testPdfRouter);
app.use("/api/messages", messageRoutes);
/**
 * Mail şablonları: Router mount + POST "/" bazen boş path ile eşleşmiyor (Cannot POST).
 * Doğrudan app üzerinde hem slashlı hem slashsız kayıt.
 */
app.get("/api/mail-templates", getAccessToRoute, mailTemplateCtrl.list);
app.get("/api/mail-templates/", getAccessToRoute, mailTemplateCtrl.list);
app.post("/api/mail-templates", getAccessToRoute, mailTemplateCtrl.create);
app.post("/api/mail-templates/", getAccessToRoute, mailTemplateCtrl.create);
app.put(
  "/api/mail-templates/:id",
  getAccessToRoute,
  mailTemplateCtrl.update
);
app.delete(
  "/api/mail-templates/:id",
  getAccessToRoute,
  mailTemplateCtrl.remove
);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/product-discounts", productDiscountRoutes);
app.use("/api/bank", bankRoutes);
app.use("/api/authorization", authorizationRoutes);
app.use("/api/approval", approvalRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/mandatory-reports", mandatoryReportRoutes);
app.use("/api/gemini", geminiRoutes);
app.use("/api/interview-reminder-settings", interviewReminderSettingsRoutes);
app.use("/api/mail-ai", mailAiRoutes);
app.use("/api/enterprise", enterpriseAnalyticsRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/manager-packages", managerPackagesRoutes);

// ===== /api/pg/* — PostgreSQL paralel API (FAZ 3) =====
app.use("/api/pg/auth", pgAuthRoutes);
app.use("/api/pg/users", pgUsersRoutes);
app.use("/api/pg/companies", pgCompaniesRoutes);
app.use("/api/pg/customer", pgCustomersRoutes);
app.use("/api/pg/customer-settings", pgCustomerSettingsRoutes);
app.use("/api/pg/products", pgProductsRoutes);
app.use("/api/pg/product-discounts", pgProductDiscountsRoutes);
app.use("/api/pg/bank", pgBankInfoRoutes);
app.use("/api/pg/mail-templates", pgMailTemplatesRoutes);
app.use("/api/pg/notifications", pgNotificationsRoutes);
app.use("/api/pg/workers", pgWorkersRoutes);
app.use("/api/pg/workernotes", pgWorkerNotesRoutes);
app.use("/api/pg/messages", pgMessagesRoutes);
app.use("/api/pg/meet", pgMeetingsRoutes);
app.use("/api/pg/reminder", pgRemindersRoutes);
app.use("/api/pg/note", pgNotesRoutes);
app.use("/api/pg/calendar", pgCalendarRoutes);
app.use("/api/pg/authorization", pgAuthorizationRoutes);
app.use("/api/pg/approval", pgApprovalRoutes);
app.use("/api/pg/proforma", pgProformaRoutes);
app.use("/api/pg/invoice", pgInvoiceRoutes);
app.use("/api/pg/checklist", pgChecklistRoutes);
app.use("/api/pg/pricequote", pgPriceOfferRoutes);
app.use("/api/pg/documents", pgDocumentsRoutes);
app.use("/api/pg/workorders", pgWorkOrdersRoutes);
app.use("/api/pg/reports", pgReportsRoutes);
app.use("/api/pg/mandatory-reports", pgMandatoryReportsRoutes);
app.use("/api/pg/enterprise-mail", pgEnterpriseMailRoutes);

// Test Route
app.get("/yusuf", (req, res) => {
  console.log("🔹 Test route /yusuf çağrıldı");
  res.send("selam");
});

// ================= DB ===============================
database();
connectPostgres();
connectPrisma().catch((err) => {
  console.error("[prisma] startup health check failed:", err?.message || err);
});

// ================= ERRORS ===========================
app.use(customErrorHandler);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "http://localhost:5173");
      res.header("Vary", "Origin");
    }
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(", "));
    res.header("Access-Control-Allow-Credentials", "true");
    return res.status(200).end();
  }
  next();
});

// ================= SOCKET SERVER ====================
const server = http.createServer(app);

// 🔥 SOCKET.IO INIT
const io = initSocket(server);

connectPrisma()
  .then(() => {
    if (mailConfig.workerEnabled) {
      startMailEventWorker();
      startMailSyncScheduler();
    }
  })
  .catch((err) => {
    console.error("[mail] worker start skipped:", err?.message || err);
  });

// 🔥 REMINDER SCHEDULER (vakit gelen hatırlatmaları bildirim yapar)
const { startReminderScheduler } = require("./services/reminderScheduler");
startReminderScheduler(io);

// ================= START ============================
const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`Port: ${PORT}`);
});

module.exports = app;
