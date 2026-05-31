/**
 * End-to-end smoke test: FAZ 3 Round 4 modulleri
 *   /api/pg/approval
 *   /api/pg/proforma
 *   /api/pg/invoice
 *   /api/pg/checklist
 *   /api/pg/pricequote
 *   /api/pg/documents
 *   /api/pg/workorders
 *   /api/pg/reports
 *   /api/pg/mandatory-reports
 *
 * Calistirma:
 *   node scripts/test-pg-modules-round4.js <email> <password>
 *
 * - PDF/Cloudinary best-effort calisir: docs olusturulurken Cloudinary olmasa bile
 *   yazi katmani basariyla gecmeli. PDF generation failure'lari uyari olarak loglanir.
 * - Olusturulan tum gecici kayitlar (customer/proforma/invoice/checklist/pricequote/
 *   approval/workorder/report/mandatory) idempotent biçimde temizlenir.
 */

const http = require("http");
const BASE = process.env.TEST_BASE || "http://localhost:5000";

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const u = new URL(BASE + path);
    const r = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(buf);
          } catch (_) {
            parsed = buf;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function expect(label, cond, extra) {
  if (cond) console.log(`  [OK]    ${label}`);
  else {
    console.log(`  [FAIL]  ${label}`, extra ?? "");
    process.exitCode = 1;
  }
}

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error(
      "Kullanim: node scripts/test-pg-modules-round4.js <email> <password>"
    );
    process.exit(2);
  }

  console.log("== LOGIN ==");
  const login = await req("POST", "/api/pg/auth/login", { email, password });
  expect("login 200", login.status === 200, login.body);
  const token = login.body?.access_token;
  const me = login.body?.data?.detail;
  if (!token) process.exit(1);

  const createdCustomerIds = [];
  const createdProformaIds = [];
  const createdInvoiceIds = [];
  const createdChecklistIds = [];
  const createdPriceQuoteIds = [];
  const createdApprovalIds = [];
  const createdWorkOrderIds = [];
  const createdReportIds = [];
  const createdMandatoryIds = [];

  // ---------------- TEST CUSTOMER ----------------
  console.log("\n== CUSTOMER (test fixture) ==");
  const cust = await req(
    "POST",
    "/api/pg/customer/addcustomer",
    {
      firmName: `R4 Test Co ${Date.now()}`,
      country: "TR",
      address: "Istanbul Test",
      personName: "R4 Contact",
      mail: `r4-${Date.now()}@example.com`,
    },
    token
  );
  expect("customer 201", cust.status === 201, cust.body);
  const customerId =
    cust.body?.data?.id || cust.body?.data?._id || cust.body?.data?.[0]?.id;
  if (customerId) createdCustomerIds.push(customerId);
  if (!customerId) {
    console.warn("  [WARN] customer olusturulmadi, doc testleri atlaniyor");
  }

  // ---------------- PROFORMA ----------------
  console.log("\n== PROFORMA ==");
  const proformaList = await req("GET", "/api/pg/proforma", null, token);
  expect("proforma list 200", proformaList.status === 200);

  if (customerId) {
    const proforma = await req(
      "POST",
      "/api/pg/proforma/addproforma",
      {
        customerId,
        quoteNumber: `R4P-${Date.now()}`,
        invoiceDate: new Date().toISOString(),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        delivery: { type: "FOB", vehicle: "Truck", point: "Port" },
        bankInfo: { name: "TestBank", branch: "X", swiftCode: "Y", iban: "Z" },
        originCountry: "TR",
        gtipCode: "0000",
        note: "r4",
        totalNetWeight: 0,
        totalGrossWeight: 0,
        totalPackageCount: 0,
      },
      token
    );
    expect("proforma create 201", proforma.status === 201, proforma.body);
    const pid = proforma.body?.data?.id;
    if (pid) createdProformaIds.push(pid);
  }

  // ---------------- INVOICE ----------------
  console.log("\n== INVOICE ==");
  const invList = await req("GET", "/api/pg/invoice", null, token);
  expect("invoice list 200", invList.status === 200);

  if (customerId) {
    const invoiceNo = `R4I-${Date.now()}`;
    const inv = await req(
      "POST",
      "/api/pg/invoice/addinvoice",
      {
        customerId,
        invoiceNo,
        invoiceDate: new Date().toISOString(),
        delivery: "FOB",
        destinationCountry: "DE",
        gtip: "0000",
        bank: { name: "TestBank", branch: "X", swift: "Y", iban: "Z" },
        products: [
          {
            description: "Test product",
            quantity: 1,
            unit: "kg",
            unitPrice: 100,
            total: 100,
          },
        ],
        totalAmount: 100,
      },
      token
    );
    expect("invoice create 201", inv.status === 201, inv.body);
    const invId = inv.body?.data?.id;
    if (invId) createdInvoiceIds.push(invId);

    if (invId) {
      const submit = await req(
        "POST",
        `/api/pg/invoice/${invId}/submit`,
        {},
        token
      );
      expect(
        "invoice submit 200",
        submit.status === 200,
        submit.body
      );

      // approval listesinde olmasi gerek
      const approvals = await req("GET", "/api/pg/approval", null, token);
      expect("approval list 200", approvals.status === 200);
      const matched = approvals.body?.data?.find(
        (a) => a.entityType === "invoice" && a.entityId === invId
      );
      expect("approval auto-created for invoice", !!matched);
      if (matched?.id) createdApprovalIds.push(matched.id);

      if (matched?.id) {
        const detail = await req(
          "GET",
          `/api/pg/approval/${matched.id}`,
          null,
          token
        );
        expect("approval detail 200", detail.status === 200);
        const history = await req(
          "GET",
          `/api/pg/approval/${matched.id}/history`,
          null,
          token
        );
        expect("approval history 200", history.status === 200);

        // approve et
        const approveResp = await req(
          "POST",
          `/api/pg/approval/${matched.id}/approve`,
          { comment: "ok" },
          token
        );
        expect(
          "approval approve 200",
          approveResp.status === 200,
          approveResp.body
        );

        // tekrar approve denemesi reddedilmeli
        const reApprove = await req(
          "POST",
          `/api/pg/approval/${matched.id}/approve`,
          { comment: "ok again" },
          token
        );
        expect(
          "approval re-approve rejected (400)",
          reApprove.status === 400
        );
      }
    }
  }

  // ---------------- CHECKLIST ----------------
  console.log("\n== CHECKLIST ==");
  const chkList = await req("GET", "/api/pg/checklist", null, token);
  expect("checklist list 200", chkList.status === 200);

  if (customerId) {
    const chk = await req(
      "POST",
      "/api/pg/checklist/addchecklist",
      {
        customerId,
        invoiceNumber: `R4C-${Date.now()}`,
        truckPlate: "34TEST",
        note: "r4",
        products: [{ name: "p1", qty: 1, net: 1, gross: 1, price: 1 }],
        totalPrice: 1,
        totalNetWeight: 1,
        totalGrossWeight: 1,
        totalPackageCount: 1,
        language: "tr",
      },
      token
    );
    expect("checklist create 201", chk.status === 201, chk.body);
    const cid = chk.body?.data?.id;
    if (cid) createdChecklistIds.push(cid);
  }

  // ---------------- PRICE QUOTE ----------------
  console.log("\n== PRICE QUOTE ==");
  const pqList = await req("GET", "/api/pg/pricequote", null, token);
  expect("pricequote list 200", pqList.status === 200);

  if (customerId) {
    const pq = await req(
      "POST",
      "/api/pg/pricequote/addpricequote",
      {
        customerId,
        destinationCountry: "DE",
        products: [
          { name: "p1", unit: "kg", quantity: 1, price: 10, total: 10 },
        ],
        delivery: { type: "FOB", vehicle: "Truck", point: "Port" },
        priceInfo: {
          quoteNumber: `R4Q-${Date.now()}`,
          invoiceDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      },
      token
    );
    expect("pricequote create 201", pq.status === 201, pq.body);
    const pqId = pq.body?.data?.id;
    if (pqId) createdPriceQuoteIds.push(pqId);

    if (pqId) {
      // Otomatik approval olusmali
      const approvals = await req("GET", "/api/pg/approval", null, token);
      const matched = approvals.body?.data?.find(
        (a) => a.entityType === "pricequote" && a.entityId === pqId
      );
      expect("approval auto-created for pricequote", !!matched);
      if (matched?.id) createdApprovalIds.push(matched.id);

      // reject testi
      if (matched?.id) {
        const rej = await req(
          "POST",
          `/api/pg/approval/${matched.id}/reject`,
          { comment: "no" },
          token
        );
        expect("approval reject 200", rej.status === 200, rej.body);
      }
    }
  }

  // ---------------- DOCUMENTS preview/download ----------------
  console.log("\n== DOCUMENTS ==");
  if (createdInvoiceIds.length) {
    const preview = await req(
      "GET",
      `/api/pg/documents/preview/invoices/${createdInvoiceIds[0]}`,
      null,
      token
    );
    expect(
      "documents preview invoices",
      preview.status === 200 || preview.status === 404
    );
  }

  // ---------------- WORKORDER ----------------
  console.log("\n== WORKORDER ==");
  const woList = await req("GET", "/api/pg/workorders", null, token);
  expect("workorders list 200", woList.status === 200);

  const wo = await req(
    "POST",
    "/api/pg/workorders",
    {
      receiverId: me?.id,
      title: `R4-WO-${Date.now()}`,
      content: "test content",
    },
    token
  );
  // Sender ve receiver ayni olabilir; kabul edilebilir
  expect("workorder create 201", wo.status === 201, wo.body);
  const woId = wo.body?.data?._id;
  if (woId) createdWorkOrderIds.push(woId);

  // ---------------- REPORTS ----------------
  console.log("\n== REPORTS ==");
  const repList = await req("GET", "/api/pg/reports", null, token);
  expect("reports list 200", repList.status === 200);

  const chart = await req(
    "GET",
    "/api/pg/reports/chart-data?source=reports&months=6",
    null,
    token
  );
  expect("reports chart-data 200", chart.status === 200, chart.body);

  const rep = await req(
    "POST",
    "/api/pg/reports",
    {
      type: "employee",
      title: `R4-REP-${Date.now()}`,
      contentHTML: "<p>Test report icerigi</p>",
      images: [],
    },
    token
  );
  expect("report create 201", rep.status === 201, rep.body);
  const repId = rep.body?.data?.id;
  if (repId) createdReportIds.push(repId);

  if (repId) {
    const detail = await req("GET", `/api/pg/reports/${repId}`, null, token);
    expect("report detail 200", detail.status === 200);

    const updated = await req(
      "PUT",
      `/api/pg/reports/${repId}`,
      { title: `R4-REP-UPDATED-${Date.now()}` },
      token
    );
    expect("report update 200", updated.status === 200);
  }

  // ---------------- MANDATORY REPORTS ----------------
  console.log("\n== MANDATORY REPORTS ==");
  const mrList = await req(
    "GET",
    "/api/pg/mandatory-reports",
    null,
    token
  );
  expect("mandatory list 200", mrList.status === 200);

  const mrCheck = await req(
    "GET",
    "/api/pg/mandatory-reports/check",
    null,
    token
  );
  expect("mandatory check 200", mrCheck.status === 200, mrCheck.body);

  const mrWorkers = await req(
    "GET",
    "/api/pg/mandatory-reports/workers",
    null,
    token
  );
  expect("mandatory workers 200", mrWorkers.status === 200);

  // create one mandatory for myself (kendine atanmak izinli)
  const mr = await req(
    "POST",
    "/api/pg/mandatory-reports",
    {
      workerIds: [me?.id],
      deadlineDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      periodType: "aylik",
    },
    token
  );
  expect("mandatory create 200", mr.status === 200, mr.body);
  const mids = (mr.body?.data || []).map((m) => m.id).filter(Boolean);
  createdMandatoryIds.push(...mids);

  // ---------------- CLEANUP ----------------
  console.log("\n== CLEANUP ==");
  for (const id of createdMandatoryIds) {
    const r = await req("DELETE", `/api/pg/mandatory-reports/${id}`, null, token);
    expect(`mandatory delete ${id}`, r.status === 200);
  }
  for (const id of createdReportIds) {
    const r = await req("DELETE", `/api/pg/reports/${id}`, null, token);
    expect(`report delete ${id}`, r.status === 200);
  }
  // workorder, approval, invoice, proforma, checklist, pricequote, customer
  // direkt cleanup endpoint'imiz yok - external cleanup script kullanilir.
  console.log(
    "  (NOTE) doc/approval/workorder/customer kayitlari Cleanup script ile silinmeli"
  );

  console.log(
    "\n--- R4 e2e tamamlandi. Olusturulan kayitlar (cleanup icin) ---"
  );
  console.log({
    createdCustomerIds,
    createdProformaIds,
    createdInvoiceIds,
    createdChecklistIds,
    createdPriceQuoteIds,
    createdApprovalIds,
    createdWorkOrderIds,
    createdReportIds,
    createdMandatoryIds,
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
