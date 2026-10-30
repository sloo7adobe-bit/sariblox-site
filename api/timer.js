// OBS オーバーレイ用タイマー
// GET  : 今の状態を返す(誰でも見られる)
// POST : パスワードが合っているときだけ操作できる(set / start / pause / adjust / reset / auth)

const S = require("../lib/store");

const PATH = "timer/state.json";
const PASS = String(process.env.TIMER_PASS || "").trim(); // 操作用パスワード(Vercel の環境変数に設定)
const MAX_MS = 100 * 60 * 60 * 1000; // 最長 100 時間

const DEF = {
  label: "", shadow: true, running: false, remainMs: 0, endAt: 0,
  // 見た目(コントローラーから変えられる)
  font: "maru", labelSize: 100, timeSize: 100, labelColor: "#ffd60a", timeColor: "#ffffff",
  outline: true, outlineW: 100, drop: true, dropW: 100, glow: 0,
  theme: "normal",
};
const FONTS = ["maru", "gothic", "pop", "dot", "mincho"];
const THEMES = ["normal", "halloween"];

function clampPct(v, def) {
  v = Math.round(Number(v));
  if (!isFinite(v)) return def;
  return Math.max(30, Math.min(300, v));
}

function color(v, def) {
  v = String(v || "");
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : def;
}

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
    const state = Object.assign({}, DEF, await S.readJson(PATH, DEF)); // 古い保存データに新しい項目が無くても既定値で埋める
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

  const state = Object.assign({}, DEF, await S.readJson(PATH, DEF)); // 古い保存データに新しい項目が無くても既定値で埋める
  const action = String(body.action || "");
  const now = Date.now();

  if (action === "auth") {
    res.status(200).json({ ok: true, state, now });
    return;
  }

  if (action === "set") {
    if (body.label !== undefined) state.label = clean(body.label, 40);
    if (body.shadow !== undefined) state.shadow = !!body.shadow;
    if (body.outline !== undefined) state.outline = !!body.outline;
    if (body.font !== undefined) state.font = FONTS.indexOf(String(body.font)) !== -1 ? String(body.font) : state.font || "maru";
    if (body.theme !== undefined) state.theme = THEMES.indexOf(String(body.theme)) !== -1 ? String(body.theme) : state.theme || "normal";
    if (body.labelSize !== undefined) state.labelSize = clampPct(body.labelSize, state.labelSize || 100);
    if (body.timeSize !== undefined) state.timeSize = clampPct(body.timeSize, state.timeSize || 100);
    if (body.outlineW !== undefined) {
      const w = Math.round(Number(body.outlineW));
      state.outlineW = isFinite(w) ? Math.max(10, Math.min(300, w)) : state.outlineW || 100;
    }
    if (body.drop !== undefined) state.drop = !!body.drop;
    if (body.glow !== undefined) {
      const g = Math.round(Number(body.glow));
      state.glow = isFinite(g) ? Math.max(0, Math.min(100, g)) : state.glow || 0;
    }
    if (body.dropW !== undefined) {
      const w2 = Math.round(Number(body.dropW));
      state.dropW = isFinite(w2) ? Math.max(10, Math.min(300, w2)) : state.dropW || 100;
    }
    if (body.labelColor !== undefined) state.labelColor = color(body.labelColor, state.labelColor || "#ffd60a");
    if (body.timeColor !== undefined) state.timeColor = color(body.timeColor, state.timeColor || "#ffffff");
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
