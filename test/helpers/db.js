const { createDb, migrate } = require("../../src/db");

// CI sets DATABASE_URL to a real Postgres server. Without it (on a laptop with
// no Postgres), tests use PGlite: real Postgres compiled to run inside Node.
// Either way every test file starts from empty tables.
async function testDb() {
  let db;
  if (process.env.DATABASE_URL) {
    db = createDb(process.env.DATABASE_URL);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    db = { query: (text, params) => pg.query(text, params), close: () => pg.close() };
  }
  await db.query("DROP TABLE IF EXISTS sessions, users");
  await migrate(db);
  return db;
}

module.exports = { testDb };
