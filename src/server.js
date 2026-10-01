const http = require("node:http");
const { createApp } = require("./app");
const { createDb, migrate } = require("./db");
const { ensureAdmin } = require("./auth");

const REQUIRED = ["DATABASE_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD"];

async function main() {
  // Fail fast with a clear message rather than start a portal nobody can use.
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing required settings: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.ADMIN_PASSWORD.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters");
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);
  await migrate(db);
  await ensureAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);

  const server = http.createServer(createApp({ db, version: process.env.GIT_SHA || "dev" }));
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`QA Portal listening on port ${port}`));
}

main().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});
