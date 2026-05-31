require("dotenv").config();
const http = require("http");
const { getPrisma } = require("../db/prisma");

const BASE = process.env.TEST_BASE || "http://127.0.0.1:5000";
const PASS = process.env.TEST_PASSWORD || "1234";

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

(async () => {
  const prisma = getPrisma();
  const u = await prisma.user.findFirst({ select: { email: true } });
  if (!u) throw new Error("No user in PG");

  const login = await req("POST", "/api/pg/auth/login", {
    email: u.email,
    password: PASS,
  });
  console.log("login", login.status, login.body?.message || "ok");
  const token = login.body?.access_token;
  if (!token) process.exit(1);

  const wn = await req(
    "POST",
    "/api/pg/workernotes/addworkernote",
    { title: "test", description: "desc", status: "open" },
    token
  );
  console.log("workernote POST", wn.status, wn.body);

  const note = await req(
    "POST",
    "/api/pg/note/addnote",
    { title: "t", description: "d" },
    token
  );
  console.log("note POST (no customerId)", note.status, note.body);

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
