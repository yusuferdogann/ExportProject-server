/**
 * End-to-end smoke test: FAZ 3 Round 3 modulleri
 *   /api/pg/workers
 *   /api/pg/workernotes
 *   /api/pg/messages
 *   /api/pg/meet
 *   /api/pg/reminder
 *   /api/pg/note
 *   /api/pg/calendar
 *   /api/pg/authorization
 *
 * Calistirma:
 *   node scripts/test-pg-modules-round3.js <email> <password>
 *
 * - Her modul icin GET + minimal yazma + temizleme akisi yurutulur.
 * - Yazma testleri MSG/CUSTOMER/WORKER icin idempotent veya silinebilir kayitlar
 *   uretir. Round sonunda gecici kayitlar temizlenir.
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
    console.error("Kullanim: node scripts/test-pg-modules-round3.js <email> <password>");
    process.exit(2);
  }

  // LOGIN
  console.log("== LOGIN ==");
  const login = await req("POST", "/api/pg/auth/login", { email, password });
  expect("login 200", login.status === 200, login.body);
  const token = login.body?.access_token;
  const me = login.body?.data?.detail;
  if (!token) process.exit(1);
  console.log("  user:", me?.email, "role:", me?.role);

  // Setup: gecici Customer
  console.log("\n== SETUP: temp customer ==");
  const tmpCustomer = await req(
    "POST",
    "/api/pg/customer/addcustomer",
    { firmName: "R3_TEST_FIRM_" + Date.now(), country: "TR" },
    token
  );
  expect("temp customer 201", tmpCustomer.status === 201);
  const customerId = tmpCustomer.body?.data?.id;

  // -------- WORKERS
  console.log("\n== WORKERS ==");
  const wList = await req("GET", "/api/pg/workers", null, token);
  expect("GET /workers 200", wList.status === 200);

  const wCreate = await req(
    "POST",
    "/api/pg/workers",
    { name: "R3 Test Calisan", title: "Test", phone: "0000" },
    token
  );
  expect("POST /workers 201", wCreate.status === 201, wCreate.body);
  const workerId = wCreate.body?.data?.id;
  console.log("  workerId:", workerId);

  if (workerId) {
    const wUpd = await req(
      "PUT",
      "/api/pg/workers/" + workerId,
      { title: "Sef" },
      token
    );
    expect("PUT /workers/:id 200", wUpd.status === 200);
  }

  // -------- WORKER NOTES
  console.log("\n== WORKER NOTES ==");
  const wnCreate = await req(
    "POST",
    "/api/pg/workernotes/addworkernote",
    {
      title: "R3 Test Note",
      description: "Test aciklamasi",
      status: "open",
      customerId,
    },
    token
  );
  expect("POST /workernotes/addworkernote 201", wnCreate.status === 201, wnCreate.body);
  const wnId = wnCreate.body?.data?.id;

  const wnList = await req("GET", "/api/pg/workernotes", null, token);
  expect("GET /workernotes 200", wnList.status === 200);

  if (wnId) {
    const wnUpd = await req(
      "PUT",
      "/api/pg/workernotes/" + wnId,
      { status: "completed" },
      token
    );
    expect("PUT /workernotes/:id 200", wnUpd.status === 200);
    expect("status=completed", wnUpd.body?.data?.status === "completed");

    const wnDel = await req("DELETE", "/api/pg/workernotes/" + wnId, null, token);
    expect("DELETE /workernotes/:id 200", wnDel.status === 200);
  }

  // -------- MESSAGES
  console.log("\n== MESSAGES ==");
  const inbox = await req("GET", "/api/pg/messages/inbox", null, token);
  expect("GET /messages/inbox 200", inbox.status === 200);
  const sent = await req("GET", "/api/pg/messages/sent", null, token);
  expect("GET /messages/sent 200", sent.status === 200);

  // mesaj gonderme: kendi kendine
  const sm = await req(
    "POST",
    "/api/pg/messages",
    { receiverId: me?.id, content: "R3 self-msg " + Date.now() },
    token
  );
  expect("POST /messages 201", sm.status === 201, sm.body);
  const selfMsgId = sm.body?.data?.id;
  if (selfMsgId) {
    const readMsg = await req(
      "PATCH",
      "/api/pg/messages/" + selfMsgId + "/read",
      {},
      token
    );
    expect("PATCH /messages/:id/read 200", readMsg.status === 200);
    const delSelf = await req(
      "DELETE",
      "/api/pg/messages/" + selfMsgId,
      null,
      token
    );
    expect("DELETE /messages/:id 200", delSelf.status === 200);
  }

  // -------- MEETINGS
  console.log("\n== MEETINGS ==");
  const meetList0 = await req("GET", "/api/pg/meet", null, token);
  expect("GET /meet 200", meetList0.status === 200);
  const meetBefore = meetList0.body?.data?.length ?? 0;

  const meetCreate = await req(
    "POST",
    "/api/pg/meet/addmeet",
    { customerId, status: "Goruldu", description: "Goruldu" },
    token
  );
  expect("POST /meet/addmeet 201", meetCreate.status === 201, meetCreate.body);

  const meetList1 = await req("GET", "/api/pg/meet", null, token);
  expect("Liste 1 artmis", (meetList1.body?.data?.length ?? 0) === meetBefore + 1);

  // -------- REMINDERS
  console.log("\n== REMINDERS ==");
  const remCreate = await req(
    "POST",
    "/api/pg/reminder/addreminder",
    {
      customerId,
      title: "R3 Test Reminder",
      description: "test",
      time: "09:00",
      date: new Date().toISOString(),
    },
    token
  );
  expect("POST /reminder/addreminder 201", remCreate.status === 201, remCreate.body);

  const remList = await req(
    "GET",
    "/api/pg/reminder?customerId=" + customerId,
    null,
    token
  );
  expect("GET /reminder?customerId= 200", remList.status === 200);
  expect("en az 1 reminder", (remList.body?.data?.length ?? 0) >= 1);

  // -------- NOTES
  console.log("\n== NOTES ==");
  const noteCreate = await req(
    "POST",
    "/api/pg/note/addnote",
    {
      customerId,
      title: "R3 Test Note",
      description: "Bu test notudur",
    },
    token
  );
  expect("POST /note/addnote 201", noteCreate.status === 201, noteCreate.body);

  const noteList = await req(
    "GET",
    "/api/pg/note?customerId=" + customerId,
    null,
    token
  );
  expect("GET /note?customerId= 200", noteList.status === 200);
  expect("en az 1 note", (noteList.body?.data?.length ?? 0) >= 1);

  // -------- CALENDAR
  console.log("\n== CALENDAR ==");
  const calAssign = await req(
    "GET",
    "/api/pg/calendar/assignable-users",
    null,
    token
  );
  // administrator may not have calendar:event:view perm; allow 200 or 403
  if (calAssign.status === 200) {
    expect("GET /calendar/assignable-users 200", true);
  } else {
    expect(
      "GET /calendar/assignable-users 200 or 403",
      calAssign.status === 403,
      calAssign.body
    );
    console.log("   (permission yok, skip event create/list)");
  }
  let calEventId = null;
  if (calAssign.status === 200) {
    const calCreate = await req(
      "POST",
      "/api/pg/calendar/addevent",
      {
        title: "R3 Test Event " + Date.now(),
        startDate: new Date().toISOString(),
      },
      token
    );
    expect("POST /calendar/addevent 201", calCreate.status === 201, calCreate.body);
    calEventId = calCreate.body?.data?.id;
    const calList = await req("GET", "/api/pg/calendar", null, token);
    expect("GET /calendar 200", calList.status === 200);
    if (calEventId) {
      const calDel = await req(
        "DELETE",
        "/api/pg/calendar/" + calEventId,
        null,
        token
      );
      expect("DELETE /calendar/:id 200", calDel.status === 200);
    }
  }

  // -------- AUTHORIZATION
  console.log("\n== AUTHORIZATION ==");
  const hier = await req("GET", "/api/pg/authorization/hierarchy", null, token);
  expect("GET /authorization/hierarchy 200", hier.status === 200);

  const rt = await req(
    "GET",
    "/api/pg/authorization/role-templates",
    null,
    token
  );
  expect("GET /authorization/role-templates 200", rt.status === 200);
  expect("templates >= 4", (rt.body?.data?.length ?? 0) >= 4);

  const cr0 = await req("GET", "/api/pg/authorization/custom-roles", null, token);
  expect("GET /authorization/custom-roles 200", cr0.status === 200);

  const crName = "R3_TEST_ROL_" + Date.now();
  const crCreate = await req(
    "POST",
    "/api/pg/authorization/custom-roles",
    { name: crName, permissions: ["report:report:view"] },
    token
  );
  expect("POST /authorization/custom-roles 201", crCreate.status === 201, crCreate.body);
  const crId = crCreate.body?.data?._id || crCreate.body?.data?.id;

  const pd = await req(
    "GET",
    "/api/pg/authorization/permission-definitions",
    null,
    token
  );
  expect("GET /authorization/permission-definitions 200", pd.status === 200);

  const userDetail = await req(
    "GET",
    "/api/pg/authorization/user/" + me?.id,
    null,
    token
  );
  expect("GET /authorization/user/:id 200", userDetail.status === 200);

  const logs = await req(
    "GET",
    "/api/pg/authorization/user/" + me?.id + "/logs",
    null,
    token
  );
  expect("GET /authorization/user/:id/logs 200", logs.status === 200);

  // -------- CLEANUP
  console.log("\n== CLEANUP ==");
  if (workerId) {
    const wDel = await req("DELETE", "/api/pg/workers/" + workerId, null, token);
    expect("DELETE temp worker 200", wDel.status === 200);
  }
  if (customerId) {
    const cDel = await req(
      "DELETE",
      "/api/pg/customer/" + customerId,
      null,
      token
    );
    // customer'a bagli meet/note/reminder olabilir -> 200 veya 500 olabilir
    // FK Cascade Note ve Reminder icin var, Meeting icin onDelete default(NoAction)
    // bu nedenle hata cikabilir. Bilgi amacli logla.
    console.log("  customer delete status:", cDel.status);
  }
  // crId temizligi
  if (crId) {
    // PG controller'da delete endpoint olmadigi icin DB'den direkt silinmesi temizlik scriptine birakildi.
    console.log("  not: custom role temizligi pg-cleanup ile yapilacak:", crId);
  }

  console.log("\n==========================================");
  if (process.exitCode === 1) {
    console.log("[X] Bazi testler basarisiz.");
  } else {
    console.log("[OK] Tum FAZ 3 Round 3 testleri gecti.");
  }
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
