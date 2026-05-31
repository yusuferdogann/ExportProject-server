/**
 * Enterprise mail API smoke test (auth + config flags).
 * Usage: node scripts/test-enterprise-mail-api.js <email> <password>
 */
const http = require("http");

const BASE = process.env.TEST_BASE || "http://localhost:3000";

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
    console.error("Usage: node scripts/test-enterprise-mail-api.js <email> <password>");
    process.exit(2);
  }

  console.log("BASE:", BASE);

  const login = await req("POST", "/api/pg/auth/login", { email, password });
  console.log("\n== login =="), console.log(login.status, login.body?.success ? "OK" : login.body);
  const token = login.body?.access_token || login.body?.token;
  if (login.status !== 200 || !token) {
    console.log("login body keys:", login.body && Object.keys(login.body));
    process.exit(1);
  }

  const accounts = await req("GET", "/api/pg/enterprise-mail/accounts", null, token);
  console.log("\n== GET /accounts =="), console.log(accounts.status);
  console.log("config:", accounts.body?.config);
  console.log("accounts:", (accounts.body?.data || []).length);

  const oauth = await req("GET", "/api/pg/enterprise-mail/oauth/gmail/start", null, token);
  console.log("\n== GET /oauth/gmail/start =="), console.log(oauth.status);
  if (oauth.body?.data?.url) {
    console.log("oauth url prefix:", String(oauth.body.data.url).slice(0, 80) + "...");
  } else {
    console.log(oauth.body);
  }

  process.exit(0);
})();
