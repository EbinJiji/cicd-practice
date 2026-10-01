const test = require("node:test");
const assert = require("node:assert");
const auth = require("../src/auth");

test("a hashed password verifies, a wrong one doesn't", async () => {
  const stored = await auth.hashPassword("correct horse battery");
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.strictEqual(await auth.verifyPassword("correct horse battery", stored), true);
  assert.strictEqual(await auth.verifyPassword("wrong password", stored), false);
});

test("the same password hashes differently each time (random salt)", async () => {
  assert.notStrictEqual(await auth.hashPassword("same"), await auth.hashPassword("same"));
});

test("malformed stored hashes never verify", async () => {
  for (const stored of ["", "plaintext", "md5$aa$bb", "scrypt$$", undefined]) {
    assert.strictEqual(await auth.verifyPassword("x", stored), false);
  }
});

test("rate limiter allows max attempts per key, then blocks", () => {
  const limiter = auth.createRateLimiter({ max: 3, windowMs: 60_000 });
  assert.deepStrictEqual([1, 2, 3, 4].map(() => limiter.allow("1.2.3.4")), [true, true, true, false]);
  assert.strictEqual(limiter.allow("5.6.7.8"), true, "other addresses are counted separately");
});
