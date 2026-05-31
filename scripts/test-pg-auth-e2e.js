/**
 * End-to-end test: /api/pg/auth/login -> /api/pg/auth/profile -> /api/pg/users/company -> /api/pg/companies/mine
 *
 * Calistirma:
 *   node scripts/test-pg-auth-e2e.js <email> <password>
 *
 * Sifresini bilmediginiz bir kullanici varsa scripts/reset-user-password.js
 * ile sifirlayabilirsiniz; bcrypt hash hem Mongo hem PG'de ayni oldugu icin
 * ayni sifreyle giris yapabilirsiniz.
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

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Kullanim: node scripts/test-pg-auth-e2e.js <email> <password>");
    process.exit(2);
  }

  console.log("== 1) POST /api/pg/auth/login ==");
  const login = await req("POST", "/api/pg/auth/login", { email, password });
  console.log("  status:", login.status);
  if (login.status !== 200) {
    console.log("  body:", login.body);
    process.exit(1);
  }
  console.log("  access_token:", String(login.body.access_token).slice(0, 30) + "…");
  console.log("  user:", login.body.data?.detail);
  const token = login.body.access_token;

  console.log("\n== 2) GET /api/pg/auth/profile ==");
  const profile = await req("GET", "/api/pg/auth/profile", null, token);
  console.log("  status:", profile.status);
  console.log("  data:", profile.body.data);

  console.log("\n== 3) GET /api/pg/users/company ==");
  const users = await req("GET", "/api/pg/users/company", null, token);
  console.log("  status:", users.status);
  console.log("  user count:", users.body.data?.length);
  if (Array.isArray(users.body.data)) {
    users.body.data.forEach((u) =>
      console.log("    -", u.username, u.email, "(", u.role, ")")
    );
  }

  console.log("\n== 4) GET /api/pg/companies/mine ==");
  const company = await req("GET", "/api/pg/companies/mine", null, token);
  console.log("  status:", company.status);
  console.log("  data:", company.body.data);

  console.log("\n[OK] all good");
})().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
