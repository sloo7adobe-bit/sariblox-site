// OBS オーバーレイ用タイマー
// GET  : 今の状態を返す(誰でも見られる)
// POST : パスワードが合っているときだけ操作できる(set / start / pause / adjust / reset / auth)

const S = require("../lib/store");

const PATH = "timer/state.json";
const PASS = String(process.env.TIMER_PASS || "").trim(); // 操作用パスワード(Vercel の環境変数に設定)
const MAX_MS = 100 * 60 * 60 * 1000; // 最長 100 時間

const DEF = { label: "", shadow: true, running: false, remainMs: 0, endAt: 0 };

function clean(str, max) {
  return String(str == null ? "" : str)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function clampMs(v) {
  v = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(MAX_MS, v));
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const state = await S.readJson(PATH, DEF);
    res.status(200).json({ ok: true, state, now: Date.now() });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST のみ" });
    return;
  }

  if (!PASS) {
    res.status(503).json({ ok: false, error: "操作用パスワードが未設定です。" });
    return;
  }
  const body = S.readBody(req);
  if (String(body.pass || "") !== PASS) {
    res.status(401).json({ ok: false, error: "パスワードが違います。" });
    return;
  }
  if (!S.hasBlob()) {
    res.status(503).json({ ok: false, error: "保存先の準備中です。" });
    return;
  }

  const state = await S.readJson(PATH, DEF);
  const action = String(body.action || "");
  const now = Date.now();

  if (action === "auth") {
    res.status(200).json({ ok: true, state, now });
    return;
  }

  if (action === "set") {
    if (body.label !== undefined) state.label = clean(body.label, 40);
    if (body.shadow !== undefined) state.shadow = !!body.shadow;
    if (body.remainMs !== undefined) {
      state.remainMs = clampMs(body.remainMs);
      if (state.running) state.endAt = now + state.remainMs; // 動いている最中のセットは、そこから数え直す
    }
  } else if (action === "start") {
    if (!state.running && state.remainMs > 0) {
      state.endAt = now + state.remainMs;
      state.running = true;
    }
  } else if (action === "pause") {
    if (state.running) {
      state.remainMs = Math.max(0, state.endAt - now);
      state.running = false;
      state.endAt = 0;
    }
  } else if (action === "adjust") {
    const d = Math.round(Number(body.deltaMs) || 0);
    if (state.running) state.endAt = Math.min(now + MAX_MS, Math.max(now, state.endAt + d));
    else state.remainMs = clampMs(state.remainMs + d);
  } else if (action === "reset") {
    state.running = false;
    state.remainMs = 0;
    state.endAt = 0;
  } else {
    res.status(400).json({ ok: false, error: "不明な操作です。" });
    return;
  }

  state.updatedAt = new Date(now).toISOString();
  await S.writeJson(PATH, state);
  res.status(200).json({ ok: true, state, now });
};
