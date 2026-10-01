const test = require("node:test");
const assert = require("node:assert");
const views = require("../src/views");

test("esc turns HTML special characters into text", () => {
  assert.strictEqual(views.esc(`<script>alert("x")</script> & 'y'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
});

test("a username containing HTML is shown as text, not markup", () => {
  const page = views.dashboardPage({ user: { username: "<img src=x onerror=alert(1)>" } });
  assert.ok(!page.includes("<img src=x"));
  assert.ok(page.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("login page has a username and password form posting to /login", () => {
  const page = views.loginPage();
  assert.ok(page.includes('action="/login"'));
  assert.ok(page.includes('name="username"'));
  assert.ok(page.includes('type="password"'));
});

test("login page keeps the typed username and shows the error, escaped", () => {
  const page = views.loginPage({ error: "Invalid <b>", username: `a"b` });
  assert.ok(page.includes("Invalid &lt;b&gt;"));
  assert.ok(page.includes('value="a&quot;b"'));
});
