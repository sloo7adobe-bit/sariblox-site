// 家の PC で動かす OBS タイマー
//   操作: スマホで https://sariblox.com/timer-c(どの Wi-Fi・モバイル回線からでも)
//   表示: OBS のブラウザソースで http://localhost:<port>/timer
// この PC は sariblox.com(Vercel の無料キャッシュ)へ設定を取りに行き、OBS にはこの PC の中から出す
//   ふだんは 10 秒ごと、スマホでコントローラーを開いている間は 1 秒ごとに確認(無料枠を使い切らないため)
// 起動: リポジトリ直下の「タイマーを起動.bat」。設定(合言葉・ポート)は local-timer/config.json(Git に入れない)

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const STATE_FILE = process.env.TIMER_STATE_FILE || path.join(__dirname, "state.json");

const FAST_MS = 1000;
const SLOW_MS = 10000;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

// ---- この PC の中の状態(OBS に出すもの。再起動しても続きから) ----
function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    return null;
  }
}

function writeLocal(state) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

// ---- sariblox.com との同期 ----
function createSync(opts) {
  const cloud = String(opts.cloud || "https://sariblox.com").replace(/\/$/, "");
  const pass = String(opts.pass || "").trim();
  const log = opts.log || (() => {});
  const fastMs = opts.fastMs || FAST_MS;
  const slowMs = opts.slowMs || SLOW_MS;
  const status = { online: false, lastOk: 0, lastError: "", clockOffset: 0, fastUntil: 0 };
  let local = readLocal();
  let timer = null;
  let stopped = false;

  async function once() {
    const r = await fetch(cloud + "/api/timer", {
      headers: { "x-timer-pass": pass, "x-timer-pc": "1" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) throw new Error("合言葉が sariblox.com と合っていません(local-timer/config.json の pass を確認)");
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "HTTP " + r.status);
    if (j.now) status.clockOffset = j.now - Date.now(); // sariblox.com の時計に合わせる(PC の時計がずれていても正確に)

    if (!j.state) {
      // 中継が空(初回 or 消えた): この PC の状態を書き戻す
      if (local) {
        await fetch(cloud + "/api/timer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pass, action: "seed", state: local }),
          signal: AbortSignal.timeout(8000),
        });
        log("中継が空だったので、この PC の設定を書き戻しました");
      }
    } else if (!local || Number(j.state.v || 0) !== Number(local.v || 0)) {
      local = j.state;
      writeLocal(local);
      status.fastUntil = Date.now() + 90 * 1000; // 変更が来たら、続けて触られる前提でしばらく速く確認
      log("設定を受け取りました(v" + (local.v || 0) + ")");
    }
    if (j.state && Number(j.state.activeUntil || 0) > Date.now() + status.clockOffset) {
      status.fastUntil = Math.max(status.fastUntil, Date.now() + 5000);
    }
    if (!status.online) log("sariblox.com とつながりました");
    status.online = true;
    status.lastOk = Date.now();
    status.lastError = "";
  }

  async function loop() {
    if (stopped) return;
    try {
      await once();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (status.online || status.lastError !== msg) log("sariblox.com に届きません: " + msg + "(この PC の設定のまま表示を続けます)");
      status.online = false;
      status.lastError = msg;
    }
    if (stopped) return;
    timer = setTimeout(loop, Date.now() < status.fastUntil ? fastMs : slowMs);
  }

  return {
    start() { loop(); },
    stop() { stopped = true; clearTimeout(timer); },
    status,
    getLocal: () => local,
  };
}

// ---- OBS に配るもの(タイマーに必要なファイルだけ) ----
const FILES = {
  "/timer": ["timer.html", "text/html; charset=utf-8"],
  "/timer-hw.css": ["timer-hw.css", "text/css; charset=utf-8"],
  "/timer-hw.js": ["timer-hw.js", "text/javascript; charset=utf-8"],
  "/favicon.ico": ["favicon.ico", "image/x-icon"],
};

function createServer(sync, opts) {
  const cloud = String((opts && opts.cloud) || "https://sariblox.com").replace(/\/$/, "");
  return http.createServer((req, res) => {
    const u = new URL(req.url, "http://local");

    if (u.pathname === "/api/timer") {
      if (req.method !== "GET") {
        res.writeHead(410, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "操作はスマホで " + cloud + "/timer-c からどうぞ。" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, state: sync.getLocal(), now: Date.now() + sync.status.clockOffset }));
      return;
    }

    if (u.pathname === "/" || u.pathname === "/timer-c") {
      res.writeHead(302, { Location: cloud + "/timer-c" });
      res.end();
      return;
    }

    const f = FILES[u.pathname];
    if (!f) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    fs.readFile(path.join(PUB, f[0]), (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": f[1], "Cache-Control": "no-store" });
      res.end(buf);
    });
  });
}

module.exports = { createSync, createServer };

if (require.main === module) {
  const cfg = loadConfig();
  const port = Number(cfg.port) || 3939;
  const cloud = cfg.cloud || "https://sariblox.com";
  if (!String(cfg.pass || "").trim()) {
    console.log("local-timer/config.json に合言葉(pass)を書いてください。例: { \"pass\": \"1234\", \"port\": 3939 }");
    setTimeout(() => process.exit(1), 15000);
    return;
  }
  const stamp = () => new Date().toLocaleTimeString("ja-JP", { hour12: false });
  const sync = createSync({ cloud, pass: cfg.pass, log: (m) => console.log("  [" + stamp() + "] " + m) });
  const server = createServer(sync, { cloud });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") console.log("\n  もうタイマーが起動しています(ポート " + port + " が使用中)。この窓は閉じてOKです。");
    else console.error(e);
    setTimeout(() => process.exit(1), 8000);
  });
  // OBS 用なので、この PC の中からだけ受け付ける(外からは開けない)
  server.listen(port, "127.0.0.1", () => {
    console.log("");
    console.log("  ===== サリーぶろっくす タイマー 起動中 =====");
    console.log("");
    console.log("  OBS(ブラウザソース):  http://localhost:" + port + "/timer   (幅 1920 × 高さ 1080 で追加)");
    console.log("  スマホで操作:          " + cloud + "/timer-c   (どの Wi-Fi・モバイル回線からでもOK)");
    console.log("");
    console.log("  この窓を閉じるとタイマーも止まります(最小化はOK)。");
    console.log("");
    sync.start();
  });
}
