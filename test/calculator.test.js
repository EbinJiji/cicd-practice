const test = require("node:test");
const assert = require("node:assert");
const { add, subtract, multiply, divide } = require("../src/calculator");

test("add", () => {
  assert.strictEqual(add(2, 3), 5);
});

test("subtract", () => {
  assert.strictEqual(subtract(5, 3), 2);
});

test("multiply", () => {
  assert.strictEqual(multiply(4, 3), 12);
});

test("divide", () => {
  assert.strictEqual(divide(10, 2), 5);
});

test("divide by zero throws", () => {
  assert.throws(() => divide(1, 0), /Cannot divide by zero/);
});
