const test = require("node:test");
const assert = require("node:assert");
const server = require("../src/server");

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => server.close());

test("GET /add returns the sum", async () => {
  const res = await fetch(`${baseUrl}/add?a=2&b=3`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { result: 5 });
});

test("GET /divide by zero returns 400", async () => {
  const res = await fetch(`${baseUrl}/divide?a=1&b=0`);
  assert.strictEqual(res.status, 400);
});

test("GET / lists the available operations", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.deepStrictEqual(body.operations, ["add", "subtract", "multiply", "divide"]);
});

test("unknown operation returns 404", async () => {
  const res = await fetch(`${baseUrl}/modulo?a=1&b=2`);
  assert.strictEqual(res.status, 404);
});

test("GET /health returns ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  const body = await res.json();
  assert.strictEqual(body.status, "ok");
  assert.ok(body.version);
});

test("non-numeric input returns 400", async () => {
  const res = await fetch(`${baseUrl}/add?a=abc&b=1`);
  assert.strictEqual(res.status, 400);
});
