// 管理者専用ページ(/admin, /applicants)をログイン済みのときだけ返す
// ログインしていなければ /login へ。ページの HTML は private/ に置いてあり、直接は見られない

const fs = require("fs");
const path = require("path");
const S = require("../lib/store");

const PAGES = {
  admin: "admin.html",
  applicants: "applicants.html",
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const p = String((req.query && req.query.p) || "");
  const file = PAGES[p];
  if (!file) {
    res.status(404).end("Not Found");
    return;
  }
  const config = S.hasBlob() ? await S.readJson(S.CONFIG_PATH, null) : null;
  if (!S.sessionValid(req, config)) {
    res.setHeader("Location", "/login");
    res.status(302).end();
    return;
  }
  const html = fs.readFileSync(path.join(__dirname, "..", "private", file), "utf8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).end(html);
};
