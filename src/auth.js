const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 7;

// Stored as "scrypt$<salt hex>$<key hex>" so the format can change later.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

// Checked when the username doesn't exist, so a wrong username takes as long
// as a wrong password and response times don't reveal which users exist.
let dummyHash;

async function checkLogin(db, username, password) {
  const { rows } = await db.query(
    "SELECT id, username, password_hash FROM users WHERE username = $1",
    [username],
  );
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString("hex"));
  const ok = await verifyPassword(password, rows[0] ? rows[0].password_hash : dummyHash);
  return ok && rows[0] ? { id: rows[0].id, username: rows[0].username } : null;
}

// Creates the admin user from settings, or updates its password if the
// setting changed. This is also how to reset a forgotten admin password.
async function ensureAdmin(db, username, password) {
  await db.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, await hashPassword(password)],
  );
}

// The browser gets a random token; only its SHA-256 is stored, so a leaked
// sessions table can't be used to log in.
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expires],
  );
  return { token, expires };
}

async function findSessionUser(db, token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

async function deleteSession(db, token) {
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

// Allows `max` attempts per key (an IP address) in each time window.
function createRateLimiter({ max, windowMs }) {
  const attempts = new Map();
  return {
    allow(key) {
      const now = Date.now();
      if (attempts.size > 1000) {
        for (const [k, e] of attempts) if (now - e.start > windowMs) attempts.delete(k);
      }
      const entry = attempts.get(key);
      if (!entry || now - entry.start > windowMs) {
        attempts.set(key, { start: now, count: 1 });
        return true;
      }
      entry.count++;
      return entry.count <= max;
    },
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  checkLogin,
  ensureAdmin,
  createSession,
  findSessionUser,
  deleteSession,
  createRateLimiter,
  SESSION_DAYS,
};
