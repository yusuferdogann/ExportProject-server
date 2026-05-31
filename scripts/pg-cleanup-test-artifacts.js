/**
 * Test artiklarini PG'den temizler:
 *  - code "PG_TEST_" urunler + iliskili discount'lar
 *  - firmName "PG_TEST_FIRMA_" veya "R3_TEST_FIRM_" musteriler
 *    (ve cascade etmeyen Meeting/WorkerNote'lar)
 *  - bankName "PG_TEST_BANK_" bankalar
 *  - name "PG Test Sablon" mail template'ler
 *  - customRole.name "R3_TEST_ROL_" ve iliskili joins/loglar
 *  - calendar event title "R3 Test Event"
 *
 * Idempotent — istenildigi kadar calistirilabilir.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { code: { startsWith: "PG_TEST_" } },
    select: { id: true, code: true },
  });
  console.log("[products]", products.length, products.map((p) => p.code));
  for (const p of products) {
    await prisma.productDiscount.deleteMany({ where: { productId: p.id } });
    await prisma.product.delete({ where: { id: p.id } });
  }

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { firmName: { startsWith: "PG_TEST_FIRMA_" } },
        { firmName: { startsWith: "R3_TEST_FIRM_" } },
        { firmName: { startsWith: "R4 Test Co " } },
      ],
    },
    select: { id: true, firmName: true },
  });
  console.log("[customers]", customers.length, customers.map((c) => c.firmName));
  for (const c of customers) {
    // cascade etmeyen FK'leri once temizle
    await prisma.meeting.deleteMany({ where: { customerId: c.id } });
    await prisma.workerNote.deleteMany({ where: { customerId: c.id } });
    // R4 dokuman FK'leri
    await prisma.proforma.deleteMany({ where: { customerId: c.id } });
    await prisma.invoice.deleteMany({ where: { customerId: c.id } });
    await prisma.checklist.deleteMany({ where: { customerId: c.id } });
    await prisma.priceOffer.deleteMany({ where: { customerId: c.id } });
    await prisma.customer.delete({ where: { id: c.id } });
  }

  // R4 approval (entityType: invoice|proforma|checklist|pricequote) artiklari -
  // genelde docs cascade ile temizlenmis olur ama orphan approval kaldiysa:
  const orphanApprovals = await prisma.approval.findMany({
    where: {
      OR: [
        { entityType: "invoice" },
        { entityType: "proforma" },
        { entityType: "checklist" },
        { entityType: "pricequote" },
      ],
    },
    select: { id: true, entityType: true, entityId: true },
  });
  let orphanCount = 0;
  for (const a of orphanApprovals) {
    let exists = false;
    if (a.entityType === "invoice")
      exists = !!(await prisma.invoice.findUnique({ where: { id: a.entityId } }));
    else if (a.entityType === "proforma")
      exists = !!(await prisma.proforma.findUnique({ where: { id: a.entityId } }));
    else if (a.entityType === "checklist")
      exists = !!(await prisma.checklist.findUnique({ where: { id: a.entityId } }));
    else if (a.entityType === "pricequote")
      exists = !!(await prisma.priceOffer.findUnique({ where: { id: a.entityId } }));
    if (!exists) {
      await prisma.approval.delete({ where: { id: a.id } });
      orphanCount++;
    }
  }
  console.log("[orphanApprovals]", orphanCount);

  // R4 WorkOrder test kayitlari (title prefix R4-WO-)
  const wos = await prisma.workOrder.findMany({
    where: { title: { startsWith: "R4-WO-" } },
    select: { id: true, title: true },
  });
  console.log("[workOrders]", wos.length);
  for (const w of wos) {
    await prisma.workOrder.delete({ where: { id: w.id } });
  }

  // R4 Report test kayitlari (title prefix R4-REP-)
  const reports = await prisma.report.findMany({
    where: {
      OR: [
        { title: { startsWith: "R4-REP-" } },
        { title: { startsWith: "R4-REP-UPDATED-" } },
      ],
    },
    select: { id: true, title: true },
  });
  console.log("[reports]", reports.length);
  for (const r of reports) {
    await prisma.report.delete({ where: { id: r.id } });
  }

  // Calendar event'leri (R3)
  const evts = await prisma.calendarEvent.findMany({
    where: { title: { startsWith: "R3 Test Event" } },
    select: { id: true, title: true },
  });
  console.log("[calendarEvents]", evts.length, evts.map((e) => e.title));
  for (const e of evts) {
    await prisma.calendarEvent.delete({ where: { id: e.id } });
  }

  // Custom roller (R3)
  const customRoles = await prisma.customRole.findMany({
    where: { name: { startsWith: "R3_TEST_ROL_" } },
    select: { id: true, name: true },
  });
  console.log("[customRoles]", customRoles.length, customRoles.map((c) => c.name));
  for (const cr of customRoles) {
    // assigned user'larin primary linkini kopar
    await prisma.user.updateMany({
      where: { customRoleId: cr.id },
      data: { customRoleId: null },
    });
    await prisma.customRoleUser.deleteMany({ where: { customRoleId: cr.id } });
    await prisma.roleAssignmentLog.deleteMany({ where: { customRoleId: cr.id } });
    await prisma.customRole.delete({ where: { id: cr.id } });
  }

  const banks = await prisma.bankInfo.findMany({
    where: { bankName: { startsWith: "PG_TEST_BANK_" } },
    select: { id: true, bankName: true },
  });
  console.log("[banks]", banks.length, banks.map((b) => b.bankName));
  for (const b of banks) {
    await prisma.bankInfo.delete({ where: { id: b.id } });
  }

  const tpls = await prisma.mailTemplate.findMany({
    where: { name: { startsWith: "PG Test Sablon" } },
    select: { id: true, name: true },
  });
  console.log("[mailTemplates]", tpls.length, tpls.map((t) => t.name));
  for (const t of tpls) {
    await prisma.mailTemplate.delete({ where: { id: t.id } });
  }

  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("cleanup failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
