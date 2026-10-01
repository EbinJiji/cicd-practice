// Smoke tests: a few real requests against a deployed service.
// Unit tests prove the code works; these prove the deployed site does.
//
//   node scripts/smoke.js https://cicd-starter-latest-1.onrender.com

const baseUrl = (process.argv[2] || "").replace(/\/$/, "");
if (!baseUrl) {
  console.error("Usage: node scripts/smoke.js <base-url>");
  process.exit(2);
}

const checks = [
  ["GET /add returns the sum", "/add?a=2&b=3", 200, { result: 5 }],
  ["GET /subtract returns the difference", "/subtract?a=5&b=3", 200, { result: 2 }],
  ["non-numeric input is rejected", "/add?a=abc&b=1", 400],
  ["divide by zero is rejected", "/divide?a=1&b=0", 400],
  ["unknown operation is 404", "/modulo?a=1&b=2", 404],
  [
    "GET / lists the operations",
    "/",
    200,
    (body) => JSON.stringify(body.operations) === '["add","subtract","multiply","divide"]',
  ],
];

async function run([, path, wantStatus, want]) {
  const res = await fetch(baseUrl + path, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json();
  const problems = [];
  if (res.status !== wantStatus) problems.push(`status ${res.status}, expected ${wantStatus}`);
  if (typeof want === "function" && !want(body)) problems.push(`unexpected body ${JSON.stringify(body)}`);
  if (want && typeof want === "object" && JSON.stringify(body) !== JSON.stringify(want)) {
    problems.push(`body ${JSON.stringify(body)}, expected ${JSON.stringify(want)}`);
  }
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
  process.exit(failed ? 1 : 0);
})();
