const http = require("node:http");
const calculator = require("./calculator");

// GET /add?a=2&b=3  ->  {"result":5}
function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const op = url.pathname.slice(1);

  if (op === "") {
    return send(res, 200, {
      message: "Calculator API",
      usage: "/<operation>?a=<number>&b=<number>",
      operations: Object.keys(calculator),
      example: "/add?a=2&b=3",
    });
  }
  if (op === "health") {
    return send(res, 200, { status: "ok", version: process.env.GIT_SHA || "dev" });
  }
  if (!Object.hasOwn(calculator, op)) {
    return send(res, 404, { error: `Unknown operation: ${op}` });
  }

  const a = Number(url.searchParams.get("a"));
  const b = Number(url.searchParams.get("b"));
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return send(res, 400, { error: "a and b must be numbers" });
  }

  try {
    send(res, 200, { result: calculator[op](a, b) });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(handle);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Listening on port ${port}`));
}

module.exports = server;
