const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { createApp } = require("../src/app");
const { ensureAdmin, createRateLimiter } = require("../src/auth");
const { testDb } = require("./helpers/db");

const USER = "admin";
const PASSWORD = "test-password-123";

let db;
let server;
let baseUrl;

test.before(async () => {
  db = await testDb();
  await ensureAdmin(db, USER, PASSWORD);
  const loginLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });
  server = http.createServer(createApp({ db, version: "test-sha", loginLimiter }));
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

// redirect: "manual" so tests can check where the app sends the browser.
const get = (path, cookie) => fetch(baseUrl + path, { redirect: "manual", headers: cookie ? { cookie } : {} });

function postForm(path, fields, { cookie, ip = "10.0.0.1" } = {}) {
  return fetch(baseUrl + path, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields),
  });
}

async function logIn() {
  const res = await postForm("/login", { username: USER, password: PASSWORD });
  return res.headers.get("set-cookie").split(";")[0];
}

test("GET /health reports ok and the version", async () => {
  const res = await get("/health");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: "ok", version: "test-sha" });
});

test("signed-out visitors are sent to the login page", async () => {
  for (const path of ["/", "/dashboard", "/history"]) {
    const res = await get(path);
    assert.strictEqual(res.status, 303, path);
    assert.strictEqual(res.headers.get("location"), "/login", path);
  }
});

test("GET /login shows the login form", async () => {
  const res = await get("/login");
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /name="password"/);
});

test("wrong password and unknown user both get the same 401 message", async () => {
  for (const fields of [{ username: USER, password: "nope" }, { username: "nobody", password: "nope" }]) {
    const res = await postForm("/login", fields, { ip: "10.0.0.2" });
    assert.strictEqual(res.status, 401);
    assert.match(await res.text(), /Invalid username or password/);
    assert.strictEqual(res.headers.get("set-cookie"), null);
  }
});

test("correct login sets a safe session cookie and opens the dashboard", async () => {
  const res = await postForm("/login", { username: USER, password: PASSWORD });
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get("location"), "/dashboard");
  const setCookie = res.headers.get("set-cookie");
  assert.match(setCookie, /^session=[\w-]{43};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  const dashboard = await get("/dashboard", setCookie.split(";")[0]);
  assert.strictEqual(dashboard.status, 200);
  const body = await dashboard.text();
  assert.match(body, /<h1>Dashboard<\/h1>/);
  assert.match(body, new RegExp(`class="user">${USER}<`));
});

test("only a hash of the session token is stored", async () => {
  const cookie = await logIn();
  const token = cookie.split("=")[1];
  const { rows } = await db.query("SELECT token_hash FROM sessions");
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash)));
});

test("logging out ends the session", async () => {
  const cookie = await logIn();
  const out = await postForm("/logout", {}, { cookie });
  assert.strictEqual(out.status, 303);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.strictEqual((await get("/dashboard", cookie)).status, 303, "old cookie no longer works");
});

test("a made-up or expired session cookie is not accepted", async () => {
  assert.strictEqual((await get("/dashboard", "session=made-up-token")).status, 303);
  const cookie = await logIn();
  await db.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
  assert.strictEqual((await get("/dashboard", cookie)).status, 303);
});

test("too many login attempts from one address are blocked", async () => {
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await postForm("/login", { username: USER, password: "nope" }, { ip: "10.0.0.99" })).status);
  }
  assert.deepStrictEqual(statuses, [401, 401, 401, 401, 401, 429]);
});

test("oversized forms are rejected", async () => {
  const res = await postForm("/login", { username: "x".repeat(20_000), password: "y" }, { ip: "10.0.0.3" });
  assert.strictEqual(res.status, 413);
});

test("every page carries the security headers", async () => {
  for (const path of ["/login", "/health", "/nope"]) {
    const res = await get(path);
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/, path);
    assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff", path);
  }
});

test("unknown pages are 404 and the stylesheet is served", async () => {
  assert.strictEqual((await get("/nope")).status, 404);
  const css = await get("/style.css");
  assert.strictEqual(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
});
