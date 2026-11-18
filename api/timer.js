// OBS オーバーレイ用タイマーの中継(スマホ → sariblox.com → 家の PC)
// GET  : 今の状態を返す。合言葉(x-timer-pass ヘッダー)が必要。家の PC は x-timer-pc: 1 を付けて「生きている」合図も兼ねる
// POST : 合言葉が合っているときだけ操作できる(set / start / pause / adjust / reset / auth / wake / seed)
// 状態は lib/timer-store(Vercel Runtime Cache)。家の PC が 10 秒ごと、スマホが開いている間は 1 秒ごとに取りに来る

const T = require("../lib/timer-store");

const ACTIVE_MS = 90 * 1000; // スマホが触ってから、家の PC が 1 秒ごとの確認を続ける長さ
const PING_EVERY_MS = 50 * 1000; // 家の PC の「生きている」合図を書く間隔(書き込み回数を抑える)
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

// 家の PC から書き戻された状態は、知っている項目を同じ型のものだけ受け取る
function sanitizeSeed(input) {
  const out = Object.assign({}, DEF);
  input = input || {};
  Object.keys(DEF).forEach((k) => {
    if (typeof input[k] === typeof DEF[k]) out[k] = input[k];
  });
  out.label = clean(out.label, 40);
  out.remainMs = clampMs(out.remainMs);
  out.endAt = Math.max(0, Math.round(Number(input.endAt) || 0));
  out.v = Math.max(1, Math.round(Number(input.v) || 1));
  return out;
}

let lastPingWrite = 0; // 同じインスタンス内での最後の合図の書き込み(書き込みすぎ防止の目安)

function passOf(req, body) {
  const h = req.headers && (req.headers["x-timer-pass"] || req.headers["X-Timer-Pass"]);
  return String((body && body.pass) || h || "");
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body || {};
}

function down(res, e) {
  console.error("timer cache failed", e);
  res.status(503).json({ ok: false, storeDown: true, error: "中継(Vercel のキャッシュ)が一時的に使えません。少し待ってからもう一度お試しください。" });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "GET / POST のみ" });
    return;
  }
  if (!PASS) {
    res.status(503).json({ ok: false, error: "操作用パスワードが未設定です。" });
    return;
  }
  const body = req.method === "POST" ? readBody(req) : {};
  // 合言葉が違うときはキャッシュを一切読まない(知らない人の連打で無料枠を減らされないように)
  if (passOf(req, body) !== PASS) {
    res.status(401).json({ ok: false, error: "パスワードが違います。" });
    return;
  }
  const now = Date.now();

  if (req.method === "GET") {
    try {
      const state = await T.readState();
      const isPc = String(req.headers["x-timer-pc"] || "") === "1";
      let pc = null;
      if (isPc) {
        if (now - lastPingWrite > PING_EVERY_MS) {
          lastPingWrite = now;
          await T.writePc({ seen: now });
        }
      } else {
        pc = await T.readPc();
      }
      res.status(200).json({ ok: true, state: state ? Object.assign({}, DEF, state) : null, pc, now });
    } catch (e) {
      down(res, e);
    }
    return;
  }

  const action = String(body.action || "");
  let stored;
  try {
    stored = await T.readState();
  } catch (e) {
    down(res, e);
    return;
  }

  // 家の PC からの書き戻し: 中継が空のとき(消えた・初回)だけ受け取る
  if (action === "seed") {
    if (stored) {
      res.status(200).json({ ok: true, state: Object.assign({}, DEF, stored), now });
      return;
    }
    const seeded = sanitizeSeed(body.state);
    try { await T.writeState(seeded); } catch (e) { down(res, e); return; }
    res.status(200).json({ ok: true, state: seeded, now });
    return;
  }

  const state = Object.assign({}, DEF, stored || {}); // 古い保存データに新しい項目が無くても既定値で埋める
  const prevV = Number(state.v) || 0;

  if (action === "auth" || action === "wake") {
    // スマホでコントローラーを開いている合図: 家の PC をしばらく 1 秒ごとの確認にする(見た目は変えないので v は上げない)
    state.activeUntil = now + ACTIVE_MS;
    try { await T.writeState(state); } catch (e) { down(res, e); return; }
    let pc = null;
    try { pc = await T.readPc(); } catch (e) {}
    res.status(200).json({ ok: true, state, pc, now });
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
  state.v = prevV + 1; // 家の PC はこの番号が変わったら取り込む
  state.activeUntil = now + ACTIVE_MS;
  try {
    await T.writeState(state);
  } catch (e) {
    down(res, e);
    return;
  }
  res.status(200).json({ ok: true, state, now });
};
