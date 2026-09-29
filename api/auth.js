// 管理者ログイン: status / setup / login / logout / change-password

const S = require("../lib/store");

const MAX_FAILS = 8; // 15 分に 8 回失敗でロック
const LOCK_MS = 15 * 60 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!S.hasBlob() || !process.env.ADMIN_SECRET) {
    res.status(503).json({ ok: false, error: "管理機能の準備中です。" });
    return;
  }

  const config = await S.readJson(S.CONFIG_PATH, null);
  const loggedIn = S.sessionValid(req, config);

  if (req.method === "GET") {
    res.status(200).json({ ok: true, setup: !!config, loggedIn });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }

  const body = S.readBody(req);
  const action = String(body.action || "");

  if (action === "logout") {
    res.setHeader("Set-Cookie", S.clearCookies());
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "setup") {
    if (config) {
      res.status(400).json({ ok: false, error: "すでにパスワードは設定されています。" });
      return;
    }
    const pw = String(body.password || "");
    if (pw.length < 6 || pw.length > 100) {
      res.status(400).json({ ok: false, error: "パスワードは 6 文字以上にしてください。" });
      return;
    }
    const rec = S.hashPassword(pw);
    const conf = { salt: rec.salt, hash: rec.hash, version: 1, createdAt: new Date().toISOString() };
    await S.writeJson(S.CONFIG_PATH, conf);
    res.setHeader("Set-Cookie", S.sessionCookies(S.makeSession(1)));
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "login") {
    if (!config) {
      res.status(400).json({ ok: false, error: "まだパスワードが設定されていません。", setup: false });
      return;
    }
    const fails = (await S.readJson(S.FAILS_PATH, null)) || { count: 0, at: 0 };
    if (fails.count >= MAX_FAILS && Date.now() - fails.at < LOCK_MS) {
      res.status(429).json({ ok: false, error: "失敗が続いたため、15 分ほど待ってからお試しください。" });
      return;
    }
    const pw = String(body.password || "");
    if (!S.verifyPassword(pw, config)) {
      const nf = Date.now() - fails.at < LOCK_MS ? fails.count + 1 : 1;
      await S.writeJson(S.FAILS_PATH, { count: nf, at: Date.now() });
      await new Promise((r) => setTimeout(r, 600));
      res.status(401).json({ ok: false, error: "パスワードが違います。" });
      return;
    }
    if (fails.count) await S.writeJson(S.FAILS_PATH, { count: 0, at: 0 });
    res.setHeader("Set-Cookie", S.sessionCookies(S.makeSession(config.version || 1)));
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "change-password") {
    if (!loggedIn) {
      res.status(401).json({ ok: false, error: "ログインしてください。" });
      return;
    }
    const cur = String(body.current || "");
    const next = String(body.password || "");
    if (!S.verifyPassword(cur, config)) {
      res.status(401).json({ ok: false, error: "今のパスワードが違います。" });
      return;
    }
    if (next.length < 6 || next.length > 100) {
      res.status(400).json({ ok: false, error: "新しいパスワードは 6 文字以上にしてください。" });
      return;
    }
    const rec = S.hashPassword(next);
    const version = (config.version || 1) + 1;
    await S.writeJson(S.CONFIG_PATH, { salt: rec.salt, hash: rec.hash, version, createdAt: config.createdAt, changedAt: new Date().toISOString() });
    res.setHeader("Set-Cookie", S.sessionCookies(S.makeSession(version)));
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ ok: false, error: "不明な操作です。" });
};
