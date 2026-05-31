/**
 * End-to-end smoke test: FAZ 3 Round 2 modulleri
 *   - /api/pg/customer
 *   - /api/pg/products
 *   - /api/pg/product-discounts
 *   - /api/pg/bank
 *   - /api/pg/mail-templates
 *   - /api/pg/notifications
 *
 * Calistirma:
 *   node scripts/test-pg-modules-round2.js <email> <password>
 *
 * Strateji:
 * - Read-only ana akis: her endpoint icin GET cagrisi statu kontrolu.
 * - Yazma akisi: yalnizca idempotent ve geri donulebilir minimum islemler.
 *   - MailTemplate: olustur -> guncelle -> sil
 *   - BankInfo: olustur -> guncelle -> sil
 *   - Customer: olustur -> sil
 *   - Product: olustur -> (id'ye dokunmadan)
 *   - ProductDiscount: upsert (idempotent)
 *   - Notification: list / read-all (silme yok)
 *
 * Test kullanicisinin verisi disinda hicbir global state'e dokunmaz.
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
  if (cond) {
    console.log(`  [OK]    ${label}`);
  } else {
    console.log(`  [FAIL]  ${label}`, extra ?? "");
    process.exitCode = 1;
  }
}

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Kullanim: node scripts/test-pg-modules-round2.js <email> <password>");
    process.exit(2);
  }

  // -------- LOGIN
  console.log("== LOGIN ==");
  const login = await req("POST", "/api/pg/auth/login", { email, password });
  expect("login 200", login.status === 200, login.body);
  const token = login.body?.access_token;
  const me = login.body?.data?.detail;
  if (!token) process.exit(1);
  console.log("  user:", me?.email, "role:", me?.role, "companyId:", me?.companyId);

  // -------- CUSTOMERS
  console.log("\n== CUSTOMERS ==");
  let list1 = await req("GET", "/api/pg/customer", null, token);
  expect("GET /customer 200", list1.status === 200, list1.body);
  const beforeCount = list1.body?.data?.length ?? 0;
  console.log("  beforeCount:", beforeCount);

  const c = await req(
    "POST",
    "/api/pg/customer/addcustomer",
    {
      firmName: "PG_TEST_FIRMA_" + Date.now(),
      country: "TR",
      mail: "pg-test@example.com",
    },
    token
  );
  expect("POST /customer/addcustomer 201", c.status === 201, c.body);
  const customerId = c.body?.data?.id;
  console.log("  created customerId:", customerId);

  list1 = await req("GET", "/api/pg/customer", null, token);
  expect(
    "Liste sayisi 1 artmis",
    (list1.body?.data?.length ?? 0) === beforeCount + 1
  );

  // cleanup
  if (customerId) {
    const del = await req("DELETE", "/api/pg/customer/" + customerId, null, token);
    expect("DELETE /customer/:id 200", del.status === 200);
  }

  // -------- PRODUCTS
  console.log("\n== PRODUCTS ==");
  const pl0 = await req("GET", "/api/pg/products", null, token);
  expect("GET /products 200", pl0.status === 200);
  const pBefore = pl0.body?.data?.length ?? 0;
  console.log("  beforeCount:", pBefore);

  const code = "PG_TEST_" + Date.now();
  const pCreate = await req(
    "POST",
    "/api/pg/products",
    { code, name: "PG Test Urun", defaultPrice: 100, unit: "Adet" },
    token
  );
  expect("POST /products 201", pCreate.status === 201, pCreate.body);
  const productId = pCreate.body?.data?.id;
  console.log("  created productId:", productId, "code:", code);

  // duplicate
  const pDup = await req(
    "POST",
    "/api/pg/products",
    { code, name: "x", defaultPrice: 1 },
    token
  );
  expect("Ayni kod -> 400", pDup.status === 400);

  // -------- PRODUCT DISCOUNTS
  console.log("\n== PRODUCT DISCOUNTS ==");
  if (productId && me?.id) {
    const up = await req(
      "POST",
      "/api/pg/product-discounts/upsert",
      { productId, userId: me.id, discountPercent: 15 },
      token
    );
    expect("upsert 200", up.status === 200, up.body);
    expect("discountPercent=15", up.body?.data?.discountPercent === 15);

    // idempotent: ayni veri tekrar
    const up2 = await req(
      "POST",
      "/api/pg/product-discounts/upsert",
      { productId, userId: me.id, discountPercent: 25 },
      token
    );
    expect("upsert tekrar 200 (idempotent)", up2.status === 200);
    expect("discountPercent=25 update", up2.body?.data?.discountPercent === 25);

    const byw = await req(
      "GET",
      "/api/pg/product-discounts/by-worker?userId=" + me.id,
      null,
      token
    );
    expect("by-worker 200", byw.status === 200);

    const byp = await req(
      "GET",
      "/api/pg/product-discounts/by-product?productId=" + productId,
      null,
      token
    );
    expect("by-product 200", byp.status === 200);
  } else {
    console.log("  [skip] productId/me.id yok");
  }

  // -------- BANKINFO
  console.log("\n== BANKINFO ==");
  const bList = await req("GET", "/api/pg/bank", null, token);
  expect("GET /bank 200", bList.status === 200);

  const bCreate = await req(
    "POST",
    "/api/pg/bank",
    {
      bankName: "PG_TEST_BANK_" + Date.now(),
      iban: "TR000000000000000000000000",
      sube: "Test",
      switch: "TESTBNKXXX",
      accountHolder: "Test Hesap",
      status: "bekliyor",
    },
    token
  );
  expect("POST /bank 201", bCreate.status === 201, bCreate.body);
  const bankId = bCreate.body?.data?.id;

  if (bankId) {
    const bUpd = await req(
      "PUT",
      "/api/pg/bank/" + bankId,
      { status: "onaylandi", sube: "Guncel" },
      token
    );
    expect("PUT /bank/:id 200", bUpd.status === 200);
    expect("status=onaylandi", bUpd.body?.data?.status === "onaylandi");

    const bDel = await req("DELETE", "/api/pg/bank/" + bankId, null, token);
    expect("DELETE /bank/:id 200", bDel.status === 200);
  }

  // -------- MAIL TEMPLATES
  console.log("\n== MAIL TEMPLATES ==");
  const mList0 = await req("GET", "/api/pg/mail-templates", null, token);
  expect("GET /mail-templates 200", mList0.status === 200);
  const mBefore = mList0.body?.data?.length ?? 0;

  const mCreate = await req(
    "POST",
    "/api/pg/mail-templates",
    {
      name: "PG Test Sablon " + Date.now(),
      subject: "Konu",
      body: "Govde",
    },
    token
  );
  expect("POST /mail-templates 201", mCreate.status === 201, mCreate.body);
  const tplId = mCreate.body?.data?.id;

  if (tplId) {
    const mUpd = await req(
      "PUT",
      "/api/pg/mail-templates/" + tplId,
      { subject: "Yeni Konu" },
      token
    );
    expect("PUT /mail-templates/:id 200", mUpd.status === 200);
    expect("subject guncel", mUpd.body?.data?.subject === "Yeni Konu");

    const mDel = await req(
      "DELETE",
      "/api/pg/mail-templates/" + tplId,
      null,
      token
    );
    expect("DELETE /mail-templates/:id 200", mDel.status === 200);
  }

  const mList1 = await req("GET", "/api/pg/mail-templates", null, token);
  expect(
    "Sablon sayisi geri donmus",
    (mList1.body?.data?.length ?? 0) === mBefore
  );

  // -------- NOTIFICATIONS
  console.log("\n== NOTIFICATIONS ==");
  const nList = await req("GET", "/api/pg/notifications", null, token);
  expect("GET /notifications 200", nList.status === 200);
  console.log("  count:", nList.body?.data?.length);

  const nReadAll = await req(
    "PATCH",
    "/api/pg/notifications/read-all",
    {},
    token
  );
  expect("PATCH /notifications/read-all 200", nReadAll.status === 200);

  // -------- RESULT
  console.log("\n==========================================");
  if (process.exitCode === 1) {
    console.log("[X] Bazi testler basarisiz.");
  } else {
    console.log("[OK] Tum FAZ 3 Round 2 testleri gecti.");
  }
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
