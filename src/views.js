// Every value placed into HTML goes through esc(), so user input is shown as
// text and never runs as markup or script.
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/history", "History"],
];

function layout({ title, user, active, body }) {
  const nav = user
    ? `<nav>
        ${NAV.map(([href, label]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        <span class="spacer"></span>
        <span class="user">${esc(user.username)}</span>
        <form method="post" action="/logout"><button class="link">Log out</button></form>
      </nav>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · QA Portal</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header><a class="brand" href="/">QA Portal</a>${nav}</header>
  <main>${body}</main>
</body>
</html>`;
}

function loginPage({ error = "", username = "" } = {}) {
  return layout({
    title: "Log in",
    body: `<section class="card narrow">
      <h1>Log in</h1>
      ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
      <form method="post" action="/login">
        <label>Username <input name="username" value="${esc(username)}" autocomplete="username" required autofocus></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
        <button>Log in</button>
      </form>
    </section>`,
  });
}

function dashboardPage({ user }) {
  return layout({
    title: "Dashboard",
    user,
    active: "/dashboard",
    body: `<h1>Dashboard</h1>
      <div class="stats">
        <div class="card stat"><span class="value">0</span><span class="label">Test runs</span></div>
        <div class="card stat"><span class="value">–</span><span class="label">Pass rate</span></div>
        <div class="card stat"><span class="value">0</span><span class="label">Failures (7 days)</span></div>
      </div>
      <p class="empty">No test runs yet. Running tests arrives in the next version.</p>`,
  });
}

function historyPage({ user }) {
  return layout({
    title: "History",
    user,
    active: "/history",
    body: `<h1>History</h1><p class="empty">No test runs yet.</p>`,
  });
}

function errorPage({ status, message, user }) {
  return layout({
    title: String(status),
    user,
    body: `<section class="card narrow"><h1>${status}</h1><p>${esc(message)}</p><p><a href="/">Go to the start page</a></p></section>`,
  });
}

module.exports = { esc, loginPage, dashboardPage, historyPage, errorPage };
