const { Pool } = require("pg");

// Each statement is safe to run on every start, so the schema is created on
// first boot and left alone afterwards.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at TIMESTAMPTZ NOT NULL
   )`,
];

// The rest of the app only uses db.query(text, params) -> { rows } and db.close(),
// so tests can pass in a different Postgres (see test/helpers/db.js).
function createDb(connectionString) {
  const pool = new Pool({ connectionString, max: 5 });
  return {
    query: (text, params) => pool.query(text, params),
    close: () => pool.end(),
  };
}

async function migrate(db) {
  for (const statement of SCHEMA) {
    await db.query(statement);
  }
}

module.exports = { createDb, migrate };
