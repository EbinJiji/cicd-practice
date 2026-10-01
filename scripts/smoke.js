// Smoke tests: a few real requests against a deployed portal.
// Unit tests prove the code works; these prove the deployed site does.
// They never log in, so they need no password.
//
//   node scripts/smoke.js https://<your-service>.onrender.com

const baseUrl = (process.argv[2] || "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("Usage: node scripts/smoke.js <base-url>");
  process.exit(2);
}

const checks = [
  ["health check is ok (database reachable)", "GET", "/health", 200, (r, body) => JSON.parse(body).status === "ok"],
  ["start page sends visitors to log in", "GET", "/", 303, (r) => r.headers.get("location") === "/login"],
  ["login page shows the form", "GET", "/login", 200, (r, body) => body.includes('name="password"')],
  ["dashboard requires login", "GET", "/dashboard", 303, (r) => r.headers.get("location") === "/login"],
  ["stylesheet is served", "GET", "/style.css", 200, (r) => /text\/css/.test(r.headers.get("content-type"))],
  ["security headers are set", "GET", "/login", 200, (r) => /default-src 'self'/.test(r.headers.get("content-security-policy"))],
  ["unknown page is 404", "GET", "/no-such-page", 404],
];

async function run([, method, path, wantStatus, check]) {
  const res = await fetch(baseUrl + path, { method, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  const problems = [];
  if (res.status !== wantStatus) problems.push(`status ${res.status}, expected ${wantStatus}`);
  else if (check && !check(res, body)) problems.push(`unexpected response: ${body.slice(0, 120)}`);
  return problems;
}

(async () => {
  console.log(`Smoke testing ${baseUrl}`);
  let failed = 0;
  for (const check of checks) {
    let problems;
    try {
      problems = await run(check);
    } catch (err) {
      problems = [err.message];
    }
    if (problems.length) {
      failed++;
      console.log(`  ✗ ${check[0]}: ${problems.join("; ")}`);
    } else {
      console.log(`  ✓ ${check[0]}`);
    }
  }
  console.log(failed ? `${failed} of ${checks.length} checks failed` : `All ${checks.length} checks passed`);
  // Set the exit code and let Node finish on its own: calling process.exit()
  // right after fetch can crash Node on Windows.
  process.exitCode = failed ? 1 : 0;
})();
