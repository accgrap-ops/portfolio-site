// Шаг 2 входа в админку: GitHub вернул код — меняем его на токен и отдаём Decap CMS.
module.exports = async (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  const url = new URL(req.url, origin);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = (req.headers.cookie || "").split(";").map(s => s.trim())
    .find(s => s.startsWith("decap_oauth_state="))?.split("=")[1];

  let status = "error";
  let content = { message: "Не получилось войти. Закрой окно и попробуй ещё раз." };

  if (!code || !state || state !== saved) {
    content = { message: "Сессия входа устарела. Закрой окно и нажми «Войти» ещё раз." };
  } else {
    try {
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: process.env.OAUTH_GITHUB_CLIENT_ID,
          client_secret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/api/callback`,
        }),
      });
      const data = await r.json();
      if (data.access_token) {
        status = "success";
        content = { token: data.access_token, provider: "github" };
      } else {
        content = { message: data.error_description || "GitHub не выдал токен — проверь Client ID и Secret в Vercel." };
      }
    } catch (e) {
      content = { message: "Ошибка связи с GitHub: " + e.message };
    }
  }

  const message = `authorization:github:${status}:${JSON.stringify(content)}`;
  const js = s => JSON.stringify(s).replace(/</g, "\\u003c");
  res.setHeader("Set-Cookie", "decap_oauth_state=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход…</title>
<body style="font-family:sans-serif;background:#0C020A;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
<p>Вход в админку…</p>
<script>
(function () {
  var origin = ${js(origin)}, message = ${js(message)};
  function receive(e) {
    if (e.origin !== origin) return;
    window.removeEventListener("message", receive, false);
    window.opener.postMessage(message, origin);
    setTimeout(function () { window.close(); }, 400);
  }
  window.addEventListener("message", receive, false);
  if (window.opener) window.opener.postMessage("authorizing:github", origin);
})();
</script></body></html>`);
};
