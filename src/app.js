const fs = require("node:fs");
const path = require("node:path");
const auth = require("./auth");
const views = require("./views");

const STYLE = fs.readFileSync(path.join(__dirname, "style.css"));
const COOKIE = "session";
const MAX_FORM_BYTES = 10 * 1024;

// Sent with every response: only load our own resources, never render inside
// another site's frame, and don't guess content types.
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const html = (res, status, body, headers) => send(res, status, body, { "Content-Type": "text/html; charset=utf-8", ...headers });
const redirect = (res, location, headers) => send(res, 303, "", { Location: location, ...headers });

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return cookies;
}

// HttpOnly: page scripts can't read it. SameSite=Lax: other sites can't make
// the browser send it with their form posts. Secure: HTTPS only (on Render).
function sessionCookie(req, value, maxAgeSeconds) {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_FORM_BYTES) chunks.push(chunk);
      // Stop keeping data but don't cut the connection, so the 413 page can
      // still be sent; the response closes the connection afterwards.
      else reject(Object.assign(new Error("Form too large"), { status: 413 }));
    });
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString())));
    req.on("error", reject);
  });
}

// Render puts the visitor's address first in X-Forwarded-For.
const clientIp = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;

function createApp({ db, version, loginLimiter = auth.createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }) }) {
  async function handle(req, res) {
    const { pathname } = new URL(req.url, "http://localhost");
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const route = `${req.method} ${pathname}`;

    if (route === "GET /health") {
      try {
        await db.query("SELECT 1");
        return send(res, 200, JSON.stringify({ status: "ok", version }), { "Content-Type": "application/json" });
      } catch {
        return send(res, 503, JSON.stringify({ status: "error", version, error: "database unreachable" }), { "Content-Type": "application/json" });
      }
    }
    if (route === "GET /style.css") {
      return send(res, 200, STYLE, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" });
    }

    const user = await auth.findSessionUser(db, token);

    if (route === "GET /") return redirect(res, user ? "/dashboard" : "/login");

    if (route === "GET /login") {
      return user ? redirect(res, "/dashboard") : html(res, 200, views.loginPage());
    }

    if (route === "POST /login") {
      if (!loginLimiter.allow(clientIp(req))) {
        return html(res, 429, views.loginPage({ error: "Too many login attempts. Try again in 15 minutes." }));
      }
      const form = await readForm(req);
      const username = (form.get("username") || "").trim();
      const found = await auth.checkLogin(db, username, form.get("password") || "");
      if (!found) {
        return html(res, 401, views.loginPage({ error: "Invalid username or password.", username }));
      }
      const session = await auth.createSession(db, found.id);
      return redirect(res, "/dashboard", { "Set-Cookie": sessionCookie(req, session.token, auth.SESSION_DAYS * 24 * 60 * 60) });
    }

    if (route === "POST /logout") {
      await auth.deleteSession(db, token);
      return redirect(res, "/login", { "Set-Cookie": sessionCookie(req, "", 0) });
    }

    const pages = { "GET /dashboard": views.dashboardPage, "GET /history": views.historyPage };
    if (pages[route]) {
      return user ? html(res, 200, pages[route]({ user })) : redirect(res, "/login");
    }

    return html(res, 404, views.errorPage({ status: 404, message: "Page not found.", user }));
  }

  return async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      if (err.status === 413) {
        return html(res, 413, views.errorPage({ status: 413, message: "Request too large." }), { Connection: "close" });
      }
      console.error(err);
      if (!res.headersSent) html(res, 500, views.errorPage({ status: 500, message: "Something went wrong." }));
    }
  };
}

module.exports = { createApp, parseCookies };
