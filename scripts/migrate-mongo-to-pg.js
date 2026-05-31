#!/usr/bin/env node
/**
 * Mongo -> PostgreSQL (Prisma) veri migrasyonu
 * ------------------------------------------------------------
 * - Tum koleksiyonlari dependency order ile tasir.
 * - Idempotent: her satir legacyMongoId uzerinden UPSERT edilir.
 *   Bu sayede script tekrar tekrar calistirilabilir; duplicate uretmez.
 * - Mongo "_id" hex string'i her PG satirinda legacyMongoId olarak saklanir.
 * - FK referanslari bu legacy ID -> PG UUID donusumu ile cozulur.
 * - Mongo'ya HIC YAZMAZ. Yalnizca okur.
 *
 * Kullanim:
 *   node scripts/migrate-mongo-to-pg.js              # gercek tasima
 *   node scripts/migrate-mongo-to-pg.js --dry        # sadece say, yazma
 *   node scripts/migrate-mongo-to-pg.js --verbose    # detayli loglama
 *   node scripts/migrate-mongo-to-pg.js --only=companies,users   # secili modeller
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { PrismaClient } = require("@prisma/client");

// Yerel ISP DNS sunucusu Mongo Atlas SRV record lookup'ini reddedebiliyor.
// Bunu by-pass etmek icin Node DNS resolver'i public sunuculara yonlendiriyoruz.
// (.env'de PUBLIC_DNS=skip yazarsaniz devre disi kalir.)
if (String(process.env.PUBLIC_DNS || "").toLowerCase() !== "skip") {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
}

const prisma = new PrismaClient();

// ============================================================================
//  CLI ARGS
// ============================================================================
const args = process.argv.slice(2);
const argSet = new Set(args.filter((a) => !a.includes("=")));
const argMap = Object.fromEntries(
  args.filter((a) => a.includes("=")).map((a) => a.split("="))
);

const DRY = argSet.has("--dry") || argSet.has("-d");
const VERBOSE = argSet.has("--verbose") || argSet.has("-v");
const ONLY = (argMap["--only"] || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const should = (name) => (ONLY.length === 0 ? true : ONLY.includes(name));

// ============================================================================
//  ID MAP — Mongo hex _id -> PG UUID per model
// ============================================================================
const idMaps = {
  companies: new Map(),
  users: new Map(),
  roleTemplates: new Map(),
  customRoles: new Map(),
  workers: new Map(),
  customers: new Map(),
  facilities: new Map(),
  facilityInfo: new Map(),
  products: new Map(),
  productDiscounts: new Map(),
  bankInfo: new Map(),
  mailTemplates: new Map(),
  notifications: new Map(),
  messages: new Map(),
  reports: new Map(),
  meetings: new Map(),
  reminders: new Map(),
  notes: new Map(),
  approvals: new Map(),
  approvalSteps: new Map(),
  approvalLogs: new Map(),
  proformas: new Map(),
  invoices: new Map(),
  checklists: new Map(),
  priceOffers: new Map(),
  workOrders: new Map(),
  workerNotes: new Map(),
  calendarEvents: new Map(),
  roleAssignmentLogs: new Map(),
  potentialCustomerPackages: new Map(),
  mailAiUsageLogs: new Map(),
  monthlyUsageMinutes: new Map(),
  usageLastPings: new Map(),
  mandatoryReports: new Map(),
  interviewReminderSettings: new Map(),
  scopes: new Map(),
};

// ============================================================================
//  HELPERS
// ============================================================================
const hex = (v) => (v == null ? null : String(v));
const resolve = (map, val) => {
  if (val == null) return null;
  return map.get(hex(val)) || null;
};

const ENUMS = {
  UserRole: new Set([
    "owner",
    "foreign_trade_manager",
    "general_manager",
    "finance_manager",
    "administrator",
    "demo",
    "employee",
  ]),
  ApprovalStepStatus: new Set(["pending", "approved", "rejected"]),
  RoleAssignmentRoleType: new Set(["template", "custom"]),
  RoleAssignmentRoleModel: new Set(["roletemplates", "customroles"]),
  RoleAssignmentAction: new Set(["assigned", "updated", "removed"]),
  MandatoryReportPeriod: new Set(["gunluk", "haftalik", "aylik"]),
  DocFlowStatus: new Set([
    "draft",
    "pending_approval",
    "approved",
    "rejected",
    "cancelled",
    "archived",
  ]),
  DocumentGenerationStatus: new Set(["pending", "generated", "failed"]),
  WorkOrderStatus: new Set(["pending", "in_progress", "done"]),
  WorkerNoteStatus: new Set(["open", "in_progress", "completed"]),
  BankInfoStatus: new Set(["bekliyor", "onaylandi", "reddedildi", "revize"]),
  InterviewReminderUnit: new Set(["dakika", "saat", "gun", "hafta", "ay"]),
  MailAiOperation: new Set(["proofread", "translate"]),
  ReportType: new Set(["employee", "monthly", "weekly", "tracking"]),
  ChecklistLanguage: new Set(["tr", "en"]),
};

const enumOr = (kind, value, fallback) => {
  if (value == null) return fallback;
  // basit normalizasyon: TR diakritikler
  let v = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (kind === "MandatoryReportPeriod") {
    if (v.startsWith("g")) v = "gunluk";
    else if (v.startsWith("h")) v = "haftalik";
    else if (v.startsWith("a")) v = "aylik";
  }
  return ENUMS[kind].has(v) ? v : fallback;
};

// Infinity -> null (sinirsiz). NaN ve undefined -> null.
const cleanInt = (n) => {
  if (n == null || Number.isNaN(n) || !Number.isFinite(n)) return null;
  return Math.trunc(n);
};
const cleanFloat = (n) => {
  if (n == null || Number.isNaN(n)) return null;
  if (!Number.isFinite(n)) return null;
  return Number(n);
};

// ============================================================================
//  STATS
// ============================================================================
const stats = [];
const trackStats = (name, mongoCount, ok, skipped, errors) => {
  stats.push({ name, mongoCount, ok, skipped, errors });
};

// ============================================================================
//  GENERIC MIGRATE — bir koleksiyondan dokumanlari okur, mapper ile docu PG
//  satirina cevirir, upsert eder ve idMap'i doldurur.
//
//  args.mongoColl     : Mongo koleksiyon adi
//  args.prismaModel   : prisma.<model> property adi
//  args.idMap         : idMaps icinden map referansi
//  args.label         : log icin etiket
//  args.mapper(doc)   : { data, skipReason? } dondurur. data PG'ye gidecek satir.
//                       skipReason verirse satir atlanir.
// ============================================================================
async function migrate({ mongoColl, prismaModel, idMap, label, mapper }) {
  if (!should(label)) {
    console.log(`[skip] ${label} (--only filtresi)`);
    return;
  }
  const start = Date.now();
  const docs = await mongoose.connection.collection(mongoColl).find({}).toArray();
  let ok = 0,
    skipped = 0,
    errors = 0;

  for (const d of docs) {
    const legacyMongoId = hex(d._id);
    try {
      const out = mapper(d);
      if (!out || out.skipReason) {
        skipped++;
        if (VERBOSE && out?.skipReason) {
          console.warn(`  [${label}] SKIP ${legacyMongoId}: ${out.skipReason}`);
        }
        continue;
      }
      const data = out.data || out;

      if (DRY) {
        idMap.set(legacyMongoId, `dry-${legacyMongoId}`);
      } else {
        const row = await prisma[prismaModel].upsert({
          where: { legacyMongoId },
          create: { legacyMongoId, ...data },
          update: data,
        });
        idMap.set(legacyMongoId, row.id);
      }
      ok++;
    } catch (e) {
      errors++;
      console.error(`  [${label}] ERROR _id=${legacyMongoId}: ${e.message}`);
      if (VERBOSE) console.error(e);
    }
  }

  const ms = Date.now() - start;
  console.log(
    `[${label}] ${ok}/${docs.length} ok  (skip=${skipped} err=${errors})  ${ms}ms`
  );
  trackStats(label, docs.length, ok, skipped, errors);
}

// ============================================================================
//  MIGRATION FUNCTIONS — dependency order
// ============================================================================

// 1) Company
async function migrateCompanies() {
  await migrate({
    mongoColl: "companies",
    prismaModel: "company",
    idMap: idMaps.companies,
    label: "companies",
    mapper: (d) => {
      if (!d.name || !d.slug)
        return { skipReason: "missing required name/slug" };
      return {
        name: String(d.name),
        slug: String(d.slug).toLowerCase().trim(),
        isActive: d.isActive ?? true,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 2) User (pass 1: customRoleId/roleTemplateId NULL)
async function migrateUsersPass1() {
  await migrate({
    mongoColl: "users",
    prismaModel: "user",
    idMap: idMaps.users,
    label: "users (pass 1)",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.email || !d.username || !d.password)
        return { skipReason: "email/username/password eksik" };
      return {
        email: String(d.email).toLowerCase().trim(),
        username: String(d.username),
        password: String(d.password),
        role: enumOr("UserRole", d.role, "demo"),
        permissions: Array.isArray(d.permissions)
          ? d.permissions.filter((p) => typeof p === "string")
          : [],
        reportLimit: cleanInt(d.reportLimit),
        facilityLimit: cleanInt(d.facilityLimit),
        createdAt: d.createdAt || new Date(),
        companyId,
        // role linkleri ikinci pass'ta yazilacak
        roleTemplateId: null,
        customRoleId: null,
      };
    },
  });
}

// 3) RoleTemplate
async function migrateRoleTemplates() {
  await migrate({
    mongoColl: "roletemplates",
    prismaModel: "roleTemplate",
    idMap: idMaps.roleTemplates,
    label: "roleTemplates",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.name) return { skipReason: "name eksik" };
      return {
        name: String(d.name),
        description: d.description ?? "",
        permissions: Array.isArray(d.permissions)
          ? d.permissions.filter((p) => typeof p === "string")
          : [],
        isSystem: d.isSystem ?? false,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
        companyId,
      };
    },
  });
}

// 4) CustomRole
async function migrateCustomRoles() {
  await migrate({
    mongoColl: "customroles",
    prismaModel: "customRole",
    idMap: idMaps.customRoles,
    label: "customRoles",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const createdById = resolve(idMaps.users, d.createdBy);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!createdById) return { skipReason: "createdBy resolve edilemedi" };
      if (!d.name) return { skipReason: "name eksik" };
      return {
        name: String(d.name),
        permissions: Array.isArray(d.permissions)
          ? d.permissions.filter((p) => typeof p === "string")
          : [],
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
        companyId,
        createdById,
      };
    },
  });
}

// 5) User pass 2 — roleTemplateId / customRoleId yaz
async function migrateUsersPass2() {
  if (!should("users (pass 2)")) {
    console.log("[skip] users (pass 2)");
    return;
  }
  const docs = await mongoose.connection.collection("users").find({}).toArray();
  let ok = 0,
    skipped = 0,
    errors = 0;

  for (const d of docs) {
    const pgUserId = resolve(idMaps.users, d._id);
    if (!pgUserId) {
      skipped++;
      continue;
    }
    try {
      const roleTemplateId = resolve(idMaps.roleTemplates, d.roleTemplateId);
      const customRoleId = resolve(idMaps.customRoles, d.customRoleId);
      if (!DRY) {
        await prisma.user.update({
          where: { id: pgUserId },
          data: { roleTemplateId, customRoleId },
        });
      }
      ok++;
    } catch (e) {
      errors++;
      console.error(`  [users pass2] _id=${hex(d._id)}: ${e.message}`);
    }
  }
  console.log(
    `[users (pass 2)] ${ok}/${docs.length} ok  (skip=${skipped} err=${errors})`
  );
  trackStats("users (pass 2)", docs.length, ok, skipped, errors);
}

// 6) CustomRoleUser join (CustomRole.assignedUserIds[] -> rows)
async function migrateCustomRoleUserJoin() {
  if (!should("customRoleUsers")) {
    console.log("[skip] customRoleUsers");
    return;
  }
  const docs = await mongoose.connection
    .collection("customroles")
    .find({})
    .toArray();
  let ok = 0,
    skipped = 0,
    errors = 0,
    total = 0;

  for (const d of docs) {
    const customRoleId = resolve(idMaps.customRoles, d._id);
    if (!customRoleId) continue;
    const assigned = Array.isArray(d.assignedUserIds) ? d.assignedUserIds : [];
    for (const uid of assigned) {
      total++;
      const userId = resolve(idMaps.users, uid);
      if (!userId) {
        skipped++;
        continue;
      }
      try {
        if (!DRY) {
          await prisma.customRoleUser.upsert({
            where: {
              customRoleId_userId: { customRoleId, userId },
            },
            create: { customRoleId, userId },
            update: {},
          });
        }
        ok++;
      } catch (e) {
        errors++;
        if (VERBOSE) console.error(`  [customRoleUsers]: ${e.message}`);
      }
    }
  }
  console.log(
    `[customRoleUsers] ${ok}/${total} ok  (skip=${skipped} err=${errors})`
  );
  trackStats("customRoleUsers", total, ok, skipped, errors);
}

// 7) Customer
async function migrateCustomers() {
  await migrate({
    mongoColl: "customers",
    prismaModel: "customer",
    idMap: idMaps.customers,
    label: "customers",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.firmName) return { skipReason: "firmName eksik" };
      return {
        firmName: String(d.firmName),
        country: d.country ?? null,
        address: d.address ?? null,
        code: d.code ?? null,
        phone: d.phone ?? null,
        mail: d.mail ?? null,
        website: d.website ?? null,
        personName: d.personName ?? null,
        personTitle: d.personTitle ?? null,
        saveDate: d.saveDate || new Date(),
        isActive: d.isActive ?? true,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
        companyId,
      };
    },
  });
}

// 8) Worker (parentId resolve icin 2-pass yapmaya gerek yok cunku
//    parentId resolve edilemezse null koyariz; sonra ikinci pass'ta guncelleriz.)
async function migrateWorkersPass1() {
  await migrate({
    mongoColl: "workers",
    prismaModel: "worker",
    idMap: idMaps.workers,
    label: "workers (pass 1)",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.name) return { skipReason: "name eksik" };
      return {
        name: String(d.name),
        title: d.title ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
        avatar: d.avatar ?? null,
        userId: resolve(idMaps.users, d.userId),
        parentId: null, // pass 2'de
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
        companyId,
      };
    },
  });
}

async function migrateWorkersPass2() {
  if (!should("workers (pass 2)")) return;
  const docs = await mongoose.connection.collection("workers").find({}).toArray();
  let ok = 0,
    skipped = 0;
  for (const d of docs) {
    const id = resolve(idMaps.workers, d._id);
    const parentId = resolve(idMaps.workers, d.parentId);
    if (!id || !parentId) {
      skipped++;
      continue;
    }
    if (!DRY) {
      await prisma.worker.update({ where: { id }, data: { parentId } });
    }
    ok++;
  }
  console.log(`[workers (pass 2)] ${ok} parentId atandi (skip=${skipped})`);
  trackStats("workers (pass 2)", docs.length, ok, skipped, 0);
}

// 9) Facility
async function migrateFacilities() {
  await migrate({
    mongoColl: "facility",
    prismaModel: "facility",
    idMap: idMaps.facilities,
    label: "facilities",
    mapper: (d) => {
      const userId = resolve(idMaps.users, d.userId);
      if (!userId) return { skipReason: "userId resolve edilemedi" };
      const req = ["city", "country", "facilityname", "state", "totalarea", "latitude", "longitude", "CityCode", "FieldActivity"];
      for (const k of req) if (!d[k]) return { skipReason: `${k} eksik` };
      return {
        city: String(d.city),
        country: String(d.country),
        employeecount: d.employeecount ?? null,
        facilityname: String(d.facilityname),
        company_logo: d.company_logo || "default.jpg",
        state: String(d.state),
        totalarea: String(d.totalarea),
        latitude: String(d.latitude),
        longitude: String(d.longitude),
        CityCode: String(d.CityCode),
        FieldActivity: String(d.FieldActivity),
        userId,
      };
    },
  });
}

// 10) FacilityInfo
async function migrateFacilityInfo() {
  await migrate({
    mongoColl: "facilityInfo",
    prismaModel: "facilityInfo",
    idMap: idMaps.facilityInfo,
    label: "facilityInfo",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      return {
        companyName: d.companyName ?? null,
        cknNumber: d.cknNumber ?? null,
        companyNumber: d.companyNumber ?? null,
        companyMail: d.companyMail ?? null,
        companyWebsite: d.companyWebsite ?? null,
        fieldActivity: d.fieldActivity ?? null,
        closeArea: d.closeArea ?? null,
        openArea: d.openArea ?? null,
        workerCount: d.workerCount ?? null,
        totalArea: d.totalArea ?? null,
        address: d.address ?? null,
        companyLogo: d.companyLogo ?? "",
        facilityId: resolve(idMaps.facilities, d.facilityId),
        companyId,
      };
    },
  });
}

// 11) Product
async function migrateProducts() {
  await migrate({
    mongoColl: "products",
    prismaModel: "product",
    idMap: idMaps.products,
    label: "products",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.code || !d.name) return { skipReason: "code/name eksik" };
      return {
        companyId,
        customerId: resolve(idMaps.customers, d.customerId),
        createdById: resolve(idMaps.users, d.createdBy),
        code: String(d.code),
        name: String(d.name),
        type: d.type ?? null,
        unit: d.unit || "Adet",
        defaultPrice: cleanFloat(d.defaultPrice) ?? 0,
        tenantId: d.tenantId ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 12) ProductDiscount
async function migrateProductDiscounts() {
  await migrate({
    mongoColl: "productdiscounts",
    prismaModel: "productDiscount",
    idMap: idMaps.productDiscounts,
    label: "productDiscounts",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const productId = resolve(idMaps.products, d.productId);
      const userId = resolve(idMaps.users, d.userId);
      if (!companyId || !productId || !userId)
        return { skipReason: "FK resolve edilemedi" };
      return {
        companyId,
        productId,
        userId,
        productName: d.productName ?? null,
        productType: d.productType ?? null,
        discountPercent: cleanFloat(d.discountPercent) ?? 0,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 13) BankInfo
async function migrateBankInfo() {
  await migrate({
    mongoColl: "bankinfos",
    prismaModel: "bankInfo",
    idMap: idMaps.bankInfo,
    label: "bankInfo",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.bankName || !d.iban)
        return { skipReason: "bankName/iban eksik" };
      return {
        companyId,
        bankName: String(d.bankName),
        sube: d.sube ?? null,
        switch: d.switch ?? null,
        iban: String(d.iban),
        status: enumOr("BankInfoStatus", d.status, "bekliyor"),
        accountHolder: d.accountHolder ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 14) MailTemplate
async function migrateMailTemplates() {
  await migrate({
    mongoColl: "mailtemplates",
    prismaModel: "mailTemplate",
    idMap: idMaps.mailTemplates,
    label: "mailTemplates",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.name) return { skipReason: "name eksik" };
      return {
        companyId,
        createdById: resolve(idMaps.users, d.createdBy),
        name: String(d.name),
        subject: d.subject ?? "",
        body: d.body ?? "",
        order: cleanInt(d.order) ?? 0,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 15) Notification
async function migrateNotifications() {
  await migrate({
    mongoColl: "notifications",
    prismaModel: "notification",
    idMap: idMaps.notifications,
    label: "notifications",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const userId = resolve(idMaps.users, d.userId);
      if (!companyId || !userId) return { skipReason: "FK resolve edilemedi" };
      if (!d.title || !d.description)
        return { skipReason: "title/description eksik" };
      return {
        companyId,
        userId,
        title: String(d.title),
        description: String(d.description),
        isRead: d.isRead ?? false,
        type: d.type || "info",
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 16) Message
async function migrateMessages() {
  await migrate({
    mongoColl: "messages",
    prismaModel: "message",
    idMap: idMaps.messages,
    label: "messages",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const senderId = resolve(idMaps.users, d.senderId);
      const receiverId = resolve(idMaps.users, d.receiverId);
      if (!companyId || !senderId || !receiverId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.content) return { skipReason: "content eksik" };
      return {
        companyId,
        senderId,
        receiverId,
        content: String(d.content),
        isRead: d.isRead ?? false,
        label: d.label ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 17) Report
async function migrateReports() {
  await migrate({
    mongoColl: "reports",
    prismaModel: "report",
    idMap: idMaps.reports,
    label: "reports",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.type || !d.reportNo || !d.reportType)
        return { skipReason: "type/reportNo/reportType eksik" };
      return {
        companyId,
        senderId: resolve(idMaps.users, d.senderId),
        reviewerId: resolve(idMaps.users, d.reviewerId),
        tenantId: d.tenantId ?? null,
        type: enumOr("ReportType", d.type, "monthly"),
        reportNo: String(d.reportNo),
        reportType: String(d.reportType),
        sender: d.sender ?? null,
        senderRole: d.senderRole ?? null,
        periodStart: d.periodStart || null,
        periodEnd: d.periodEnd || null,
        reportPeriod: d.reportPeriod ?? null,
        status: d.status || "Hazir",
        reviewer: d.reviewer ?? null,
        reviewDate: d.reviewDate || null,
        viewStatus: d.viewStatus || "Gorulmedi",
        fileType: d.fileType || "PDF",
        fileUrl: d.fileUrl ?? null,
        title: d.title ?? null,
        contentHTML: d.contentHTML ?? "",
        images: Array.isArray(d.images)
          ? d.images.filter((x) => typeof x === "string")
          : [],
        meta: d.meta ?? {},
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 18) Meeting (Mongo "meeties")
async function migrateMeetings() {
  await migrate({
    mongoColl: "meeties",
    prismaModel: "meeting",
    idMap: idMaps.meetings,
    label: "meetings",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.firmName || !d.status)
        return { skipReason: "firmName/status eksik" };
      return {
        companyId,
        customerId,
        firmName: String(d.firmName),
        mail: d.mail ?? null,
        phone: d.phone ?? null,
        status: String(d.status),
        recordDate: d.recordDate || new Date(),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 19) Reminder
async function migrateReminders() {
  await migrate({
    mongoColl: "reminders",
    prismaModel: "reminder",
    idMap: idMaps.reminders,
    label: "reminders",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.title || !d.date || !d.time)
        return { skipReason: "title/date/time eksik" };
      return {
        companyId,
        customerId,
        createdById: resolve(idMaps.users, d.createdBy),
        title: String(d.title),
        description: d.description ?? "",
        date: d.date,
        time: String(d.time),
        notificationSent: d.notificationSent ?? false,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 20) Note (Mongo "noties")
async function migrateNotes() {
  await migrate({
    mongoColl: "noties",
    prismaModel: "note",
    idMap: idMaps.notes,
    label: "notes",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.title || !d.description)
        return { skipReason: "title/description eksik" };
      return {
        companyId,
        customerId,
        title: String(d.title),
        description: String(d.description),
        date: d.date || new Date(),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 21) Approval
async function migrateApprovals() {
  await migrate({
    mongoColl: "Approval",
    prismaModel: "approval",
    idMap: idMaps.approvals,
    label: "approvals",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const createdById = resolve(idMaps.users, d.createdBy);
      if (!companyId || !createdById)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.entityType || !d.entityId)
        return { skipReason: "entityType/entityId eksik" };
      return {
        companyId,
        createdById,
        entityType: String(d.entityType),
        entityId: hex(d.entityId), // polimorfik: ham hex string olarak sakla
        status: d.status || "pending",
        currentStep: cleanInt(d.currentStep) ?? 1,
        completedAt: d.completedAt || null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 22) ApprovalStep
async function migrateApprovalSteps() {
  await migrate({
    mongoColl: "ApprovalStep",
    prismaModel: "approvalStep",
    idMap: idMaps.approvalSteps,
    label: "approvalSteps",
    mapper: (d) => {
      const approvalId = resolve(idMaps.approvals, d.approvalId);
      if (!approvalId) return { skipReason: "approvalId resolve edilemedi" };
      if (d.stepOrder == null || !d.role)
        return { skipReason: "stepOrder/role eksik" };
      return {
        approvalId,
        stepOrder: cleanInt(d.stepOrder) ?? 1,
        role: String(d.role),
        status: enumOr("ApprovalStepStatus", d.status, "pending"),
        assignedToId: resolve(idMaps.users, d.assignedTo),
        actionById: resolve(idMaps.users, d.actionBy),
        actionAt: d.actionAt || null,
        comment: d.comment ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 23) ApprovalLog
async function migrateApprovalLogs() {
  await migrate({
    mongoColl: "ApprovalLog",
    prismaModel: "approvalLog",
    idMap: idMaps.approvalLogs,
    label: "approvalLogs",
    mapper: (d) => {
      const approvalId = resolve(idMaps.approvals, d.approvalId);
      if (!approvalId) return { skipReason: "approvalId resolve edilemedi" };
      if (!d.action) return { skipReason: "action eksik" };
      return {
        approvalId,
        stepId: resolve(idMaps.approvalSteps, d.stepId),
        userId: resolve(idMaps.users, d.userId),
        action: String(d.action),
        comment: d.comment ?? null,
        createdAt: d.createdAt || new Date(),
      };
    },
  });
}

// 24) Proforma
async function migrateProformas() {
  await migrate({
    mongoColl: "Proforma",
    prismaModel: "proforma",
    idMap: idMaps.proformas,
    label: "proformas",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.quoteNumber || !d.invoiceDate || !d.validUntil)
        return { skipReason: "quoteNumber/invoiceDate/validUntil eksik" };
      return {
        companyId,
        customerId,
        approvalId: resolve(idMaps.approvals, d.approvalId),
        quoteNumber: String(d.quoteNumber),
        invoiceDate: d.invoiceDate,
        validUntil: d.validUntil,
        originCountry: d.originCountry ?? null,
        gtipCode: d.gtipCode ?? null,
        note: d.note ?? null,
        totalNetWeight: cleanFloat(d.totalNetWeight) ?? 0,
        totalGrossWeight: cleanFloat(d.totalGrossWeight) ?? 0,
        totalPackageCount: cleanInt(d.totalPackageCount) ?? 0,
        status: enumOr("DocFlowStatus", d.status, "draft"),
        submittedAt: d.submittedAt || null,
        approvedAt: d.approvedAt || null,
        rejectedAt: d.rejectedAt || null,
        delivery: d.delivery ?? null,
        bankInfo: d.bankInfo ?? null,
        document: d.document ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 25) Invoice
async function migrateInvoices() {
  await migrate({
    mongoColl: "Invoice",
    prismaModel: "invoice",
    idMap: idMaps.invoices,
    label: "invoices",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.invoiceNo || !d.invoiceDate)
        return { skipReason: "invoiceNo/invoiceDate eksik" };
      return {
        companyId,
        customerId,
        approvalId: resolve(idMaps.approvals, d.approvalId),
        invoiceNo: String(d.invoiceNo),
        invoiceDate: d.invoiceDate,
        delivery: d.delivery ?? null,
        destinationCountry: d.destinationCountry ?? null,
        gtip: d.gtip ?? null,
        bank: d.bank ?? null,
        products: d.products ?? null,
        document: d.document ?? null,
        totalAmount: cleanFloat(d.totalAmount) ?? 0,
        status: enumOr("DocFlowStatus", d.status, "draft"),
        documentStatus: enumOr(
          "DocumentGenerationStatus",
          d.documentStatus,
          "pending"
        ),
        submittedAt: d.submittedAt || null,
        approvedAt: d.approvedAt || null,
        rejectedAt: d.rejectedAt || null,
        isDeleted: d.isDeleted ?? false,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 26) Checklist
async function migrateChecklists() {
  await migrate({
    mongoColl: "Checklist",
    prismaModel: "checklist",
    idMap: idMaps.checklists,
    label: "checklists",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.invoiceNumber) return { skipReason: "invoiceNumber eksik" };
      return {
        companyId,
        customerId: resolve(idMaps.customers, d.customerId),
        approvalId: resolve(idMaps.approvals, d.approvalId),
        invoiceNumber: String(d.invoiceNumber),
        truckPlate: d.truckPlate ?? null,
        invoiceDate: d.invoiceDate || null,
        gtipCode: d.gtipCode ?? null,
        originCountry: d.originCountry ?? null,
        masterPackageUnit: d.masterPackageUnit ?? null,
        grandTotalKgs: cleanFloat(d.grandTotalKgs),
        sellerName: d.sellerName ?? null,
        sellerAddress: d.sellerAddress ?? null,
        sellerPhone: d.sellerPhone ?? null,
        sellerEmail: d.sellerEmail ?? null,
        sellerTaxId: d.sellerTaxId ?? null,
        sellerTaxOffice: d.sellerTaxOffice ?? null,
        sellerWebsite: d.sellerWebsite ?? null,
        customerAddress: d.customerAddress ?? null,
        customerEmail: d.customerEmail ?? null,
        customerPhone: d.customerPhone ?? null,
        note: d.note ?? null,
        products: d.products ?? null,
        document: d.document ?? null,
        totalPrice: cleanFloat(d.totalPrice) ?? 0,
        totalNetWeight: cleanFloat(d.totalNetWeight) ?? 0,
        totalGrossWeight: cleanFloat(d.totalGrossWeight) ?? 0,
        totalPackageCount: cleanInt(d.totalPackageCount) ?? 0,
        status: enumOr("DocFlowStatus", d.status, "draft"),
        submittedAt: d.submittedAt || null,
        approvedAt: d.approvedAt || null,
        rejectedAt: d.rejectedAt || null,
        language: enumOr("ChecklistLanguage", d.language, "tr"),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 27) PriceOffer (Mongo "pricequotes")
async function migratePriceOffers() {
  await migrate({
    mongoColl: "pricequotes",
    prismaModel: "priceOffer",
    idMap: idMaps.priceOffers,
    label: "priceOffers",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!companyId || !customerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.destinationCountry)
        return { skipReason: "destinationCountry eksik" };
      return {
        companyId,
        customerId,
        approvalId: resolve(idMaps.approvals, d.approvalId),
        destinationCountry: String(d.destinationCountry),
        products: d.products ?? null,
        delivery: d.delivery ?? null,
        priceInfo: d.priceInfo ?? null,
        document: d.document ?? null,
        status: enumOr("DocFlowStatus", d.status, "draft"),
        submittedAt: d.submittedAt || null,
        approvedAt: d.approvedAt || null,
        rejectedAt: d.rejectedAt || null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 28) WorkOrder
async function migrateWorkOrders() {
  await migrate({
    mongoColl: "workorders",
    prismaModel: "workOrder",
    idMap: idMaps.workOrders,
    label: "workOrders",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const senderId = resolve(idMaps.users, d.senderId);
      const receiverId = resolve(idMaps.users, d.receiverId);
      if (!companyId || !senderId || !receiverId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.title || !d.content) return { skipReason: "title/content eksik" };
      return {
        companyId,
        senderId,
        receiverId,
        title: String(d.title),
        content: String(d.content),
        status: enumOr("WorkOrderStatus", d.status, "pending"),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 29) WorkerNote (tenantId -> Company; customerId -> Customer)
async function migrateWorkerNotes() {
  await migrate({
    mongoColl: "WorkerNote",
    prismaModel: "workerNote",
    idMap: idMaps.workerNotes,
    label: "workerNotes",
    mapper: (d) => {
      const tenantId = resolve(idMaps.companies, d.tenantId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!tenantId || !customerId)
        return { skipReason: "tenantId/customerId resolve edilemedi" };
      if (!d.title || !d.description)
        return { skipReason: "title/description eksik" };
      return {
        tenantId,
        customerId,
        title: String(d.title),
        description: String(d.description),
        createdDate: d.createdDate || new Date(),
        status: enumOr("WorkerNoteStatus", d.status, "open"),
        read: d.read ?? false,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 30) CalendarEvent
async function migrateCalendarEvents() {
  await migrate({
    mongoColl: "CalendarEvent",
    prismaModel: "calendarEvent",
    idMap: idMaps.calendarEvents,
    label: "calendarEvents",
    mapper: (d) => {
      const tenantId = resolve(idMaps.companies, d.tenantId);
      const customerId = resolve(idMaps.customers, d.customerId);
      if (!tenantId || !customerId)
        return { skipReason: "tenantId/customerId resolve edilemedi" };
      if (!d.title) return { skipReason: "title eksik" };
      return {
        tenantId,
        customerId,
        assignedToId: resolve(idMaps.users, d.assignedTo),
        title: String(d.title),
        description: d.description ?? null,
        date: d.date || null,
        startDate: d.startDate || null,
        endDate: d.endDate || null,
        assignedToName: d.assignedToName ?? null,
        creatorName: d.creatorName ?? null,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 31) RoleAssignmentLog (polimorfik refPath -> 2 ayri FK)
async function migrateRoleAssignmentLogs() {
  await migrate({
    mongoColl: "roleassignmentlogs",
    prismaModel: "roleAssignmentLog",
    idMap: idMaps.roleAssignmentLogs,
    label: "roleAssignmentLogs",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const targetUserId = resolve(idMaps.users, d.targetUserId);
      const performedById = resolve(idMaps.users, d.performedBy);
      if (!companyId || !targetUserId || !performedById)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.roleName || !d.roleType || !d.roleModel)
        return { skipReason: "roleName/roleType/roleModel eksik" };

      const roleModel = enumOr(
        "RoleAssignmentRoleModel",
        d.roleModel,
        "roletemplates"
      );
      const roleTemplateId =
        roleModel === "roletemplates"
          ? resolve(idMaps.roleTemplates, d.roleId)
          : null;
      const customRoleId =
        roleModel === "customroles"
          ? resolve(idMaps.customRoles, d.roleId)
          : null;

      return {
        companyId,
        targetUserId,
        performedById,
        roleTemplateId,
        customRoleId,
        roleName: String(d.roleName),
        roleType: enumOr("RoleAssignmentRoleType", d.roleType, "template"),
        roleModel,
        permissions: Array.isArray(d.permissions)
          ? d.permissions.filter((p) => typeof p === "string")
          : [],
        action: enumOr("RoleAssignmentAction", d.action, "assigned"),
        details: d.details ?? {},
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 32) PotentialCustomerPackage
async function migratePotentialCustomerPackages() {
  await migrate({
    mongoColl: "potentialcustomerpackages",
    prismaModel: "potentialCustomerPackage",
    idMap: idMaps.potentialCustomerPackages,
    label: "potentialCustomerPackages",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const createdById = resolve(idMaps.users, d.createdBy);
      if (!companyId || !createdById)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.sourceCatalogId || d.catalogSnapshot == null)
        return { skipReason: "sourceCatalogId/catalogSnapshot eksik" };
      return {
        companyId,
        createdById,
        sourceCatalogId: String(d.sourceCatalogId),
        catalogSnapshot: d.catalogSnapshot,
        displayName: d.displayName ?? "",
        managerNotes: d.managerNotes ?? "",
        isActive: d.isActive ?? true,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 33) MailAiUsageLog
async function migrateMailAiUsageLogs() {
  await migrate({
    mongoColl: "mailaiusagelogs",
    prismaModel: "mailAiUsageLog",
    idMap: idMaps.mailAiUsageLogs,
    label: "mailAiUsageLogs",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const userId = resolve(idMaps.users, d.userId);
      if (!companyId || !userId) return { skipReason: "FK resolve edilemedi" };
      if (!d.operation) return { skipReason: "operation eksik" };
      return {
        companyId,
        userId,
        operation: enumOr("MailAiOperation", d.operation, "proofread"),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 34) MonthlyUsageMinute
async function migrateMonthlyUsageMinutes() {
  await migrate({
    mongoColl: "monthlyusageminutes",
    prismaModel: "monthlyUsageMinute",
    idMap: idMaps.monthlyUsageMinutes,
    label: "monthlyUsageMinutes",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const userId = resolve(idMaps.users, d.userId);
      if (!companyId || !userId) return { skipReason: "FK resolve edilemedi" };
      if (!d.yearMonth) return { skipReason: "yearMonth eksik" };
      return {
        companyId,
        userId,
        customerScopeKey: d.customerScopeKey || "_",
        yearMonth: String(d.yearMonth),
        minutes: cleanInt(d.minutes) ?? 0,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 35) UsageLastPing
async function migrateUsageLastPings() {
  await migrate({
    mongoColl: "usagelastpings",
    prismaModel: "usageLastPing",
    idMap: idMaps.usageLastPings,
    label: "usageLastPings",
    mapper: (d) => {
      const userId = resolve(idMaps.users, d.userId);
      if (!userId) return { skipReason: "userId resolve edilemedi" };
      if (!d.lastBeatAt) return { skipReason: "lastBeatAt eksik" };
      return {
        userId,
        lastBeatAt: d.lastBeatAt,
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 36) MandatoryReport
async function migrateMandatoryReports() {
  await migrate({
    mongoColl: "MandatoryReport",
    prismaModel: "mandatoryReport",
    idMap: idMaps.mandatoryReports,
    label: "mandatoryReports",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      const workerId = resolve(idMaps.users, d.workerId);
      if (!companyId || !workerId)
        return { skipReason: "FK resolve edilemedi" };
      if (!d.deadlineDate) return { skipReason: "deadlineDate eksik" };
      return {
        companyId,
        workerId,
        deadlineDate: d.deadlineDate,
        periodType: enumOr("MandatoryReportPeriod", d.periodType, "aylik"),
        periodMonth: cleanInt(d.periodMonth),
        periodYear: cleanInt(d.periodYear),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 37) InterviewReminderSettings
async function migrateInterviewReminderSettings() {
  await migrate({
    mongoColl: "interview_reminder_settings",
    prismaModel: "interviewReminderSettings",
    idMap: idMaps.interviewReminderSettings,
    label: "interviewReminderSettings",
    mapper: (d) => {
      const companyId = resolve(idMaps.companies, d.companyId);
      if (!companyId) return { skipReason: "companyId resolve edilemedi" };
      if (!d.descriptionKey || d.value == null || !d.unit)
        return { skipReason: "descriptionKey/value/unit eksik" };
      return {
        companyId,
        descriptionKey: String(d.descriptionKey),
        value: cleanInt(d.value) ?? 0,
        unit: enumOr("InterviewReminderUnit", d.unit, "gun"),
        createdAt: d.createdAt || new Date(),
        updatedAt: d.updatedAt || new Date(),
      };
    },
  });
}

// 38) Scope (Mongo "data" collection)
async function migrateScopes() {
  await migrate({
    mongoColl: "data",
    prismaModel: "scope",
    idMap: idMaps.scopes,
    label: "scopes",
    mapper: (d) => {
      const userId = resolve(idMaps.users, d.user);
      if (!userId) return { skipReason: "user resolve edilemedi" };
      return {
        userId,
        tarih: d.tarih ?? null,
        title: d.title ?? null,
        cartype: d.cartype ?? null,
        subtitle: d.subtitle ?? null,
        situation: d.situation ?? null,
        sehir: d.sehir ?? null,
        ulke: d.ulke ?? null,
        ilce: d.ilce ?? null,
        birim: d.birim ?? null,
        miktar: cleanFloat(d.miktar),
        kaynak: d.kaynak ?? null,
        tesis: d.tesis ?? null,
        type: d.type ?? null,
        yakitturu: d.yakitturu ?? null,
        plaka: d.plaka ?? null,
        gasType: d.gasType ?? null,
      };
    },
  });
}

// ============================================================================
//  MAIN
// ============================================================================
async function main() {
  console.log("=== Mongo -> PG Migration ===");
  console.log(`DRY:     ${DRY}`);
  console.log(`VERBOSE: ${VERBOSE}`);
  console.log(`ONLY:    ${ONLY.length ? ONLY.join(", ") : "(hepsi)"}`);
  console.log("");

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI .env'de tanimli degil");
  }

  console.log("[mongo] baglaniliyor...");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log("[mongo] OK");

  console.log("[prisma] baglaniliyor...");
  await prisma.$connect();
  console.log("[prisma] OK\n");

  // PHASE 1 — temel
  await migrateCompanies();
  await migrateUsersPass1();
  await migrateRoleTemplates();
  await migrateCustomRoles();
  await migrateUsersPass2();
  await migrateCustomRoleUserJoin();

  // PHASE 2 — domain
  await migrateCustomers();
  await migrateWorkersPass1();
  await migrateWorkersPass2();
  await migrateFacilities();
  await migrateFacilityInfo();
  await migrateProducts();
  await migrateProductDiscounts();

  // PHASE 3 — iletisim / log / temel CRUD
  await migrateBankInfo();
  await migrateMailTemplates();
  await migrateNotifications();
  await migrateMessages();
  await migrateReports();
  await migrateMeetings();
  await migrateReminders();
  await migrateNotes();

  // PHASE 4 — approval flow
  await migrateApprovals();
  await migrateApprovalSteps();
  await migrateApprovalLogs();

  // PHASE 5 — dokumanlar (approval'a bagli)
  await migrateProformas();
  await migrateInvoices();
  await migrateChecklists();
  await migratePriceOffers();

  // PHASE 6 — diger
  await migrateWorkOrders();
  await migrateWorkerNotes();
  await migrateCalendarEvents();
  await migrateRoleAssignmentLogs();
  await migratePotentialCustomerPackages();
  await migrateMailAiUsageLogs();
  await migrateMonthlyUsageMinutes();
  await migrateUsageLastPings();
  await migrateMandatoryReports();
  await migrateInterviewReminderSettings();
  await migrateScopes();

  // ÖZET
  console.log("\n========== ÖZET ==========");
  const totalOk = stats.reduce((s, x) => s + x.ok, 0);
  const totalSkip = stats.reduce((s, x) => s + x.skipped, 0);
  const totalErr = stats.reduce((s, x) => s + x.errors, 0);
  const totalSrc = stats.reduce((s, x) => s + x.mongoCount, 0);
  console.table(stats);
  console.log(
    `TOPLAM: ${totalOk}/${totalSrc} ok  (skip=${totalSkip} err=${totalErr})`
  );
  console.log(DRY ? "DRY mode — PG'ye hicbir sey yazilmadi." : "PG'ye yazildi.");

  await mongoose.disconnect();
  await prisma.$disconnect();
  console.log("\n[mongo+prisma] baglantilar kapatildi. BITTI.");
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  try {
    await prisma.$disconnect();
  } catch (_) {}
  process.exit(1);
});
