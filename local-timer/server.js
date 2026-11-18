// 家の PC で動かす OBS タイマー
//   操作: スマホで https://sariblox.com/timer-c(どの Wi-Fi・モバイル回線からでも)
//   表示: OBS のブラウザソースで http://localhost:<port>/timer
// この PC は sariblox.com(Vercel の無料キャッシュ)へ設定を取りに行き、OBS にはこの PC の中から出す
//   確認の間隔: スマホでコントローラーを開いている間 1 秒 / OBS がタイマーを表示している間 3 秒 / それ以外 15 秒
//   (無料枠: 読み 100 万回/月 を使い切らないため)。OBS には受け取った瞬間に押し出す(SSE)
// 起動: リポジトリ直下の「タイマーを起動.bat」。設定(合言葉・ポート)は local-timer/config.json(Git に入れない)

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const STATE_FILE = process.env.TIMER_STATE_FILE || path.join(__dirname, "state.json");

const BURST_MS = 400;  // 変更が届いた直後 20 秒(続けて触られることが多いので最速で)
const FAST_MS = 1000;  // スマホでいじっている間
const OBS_MS = 3000;   // OBS がタイマーを表示している間(配信中)
const SLOW_MS = 15000; // OBS も閉じているとき

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
  const burstMs = opts.burstMs || BURST_MS;
  const fastMs = opts.fastMs || FAST_MS;
  const obsMs = opts.obsMs || OBS_MS;
  const slowMs = opts.slowMs || SLOW_MS;
  const isObsActive = opts.isObsActive || (() => false);
  let onChange = () => {};
  const status = { online: false, lastOk: 0, lastError: "", clockOffset: 0, fastUntil: 0, burstUntil: 0 };
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
      onChange(local); // OBS へすぐ押し出す(ファイル保存より先)
      writeLocal(local);
      status.fastUntil = Date.now() + 90 * 1000; // 変更が来たら、続けて触られる前提でしばらく速く確認
      status.burstUntil = Date.now() + 20 * 1000;
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
    const t = Date.now();
    const wait = t < status.burstUntil ? burstMs : t < status.fastUntil ? fastMs : isObsActive() ? obsMs : slowMs;
    timer = setTimeout(loop, wait);
  }

  return {
    start() { loop(); },
    setOnChange(fn) { onChange = fn; },
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
  const clients = new Set(); // OBS の表示ページ(押し出し先)
  let lastObsGet = 0;
  const payload = () => JSON.stringify({ ok: true, state: sync.getLocal(), now: Date.now() + sync.status.clockOffset });

  const EOL2 = "\n\n";
  sync.setOnChange(() => {
    const msg = "data: " + payload() + EOL2;
    clients.forEach((c) => c.write(msg));
  });
  setInterval(() => clients.forEach((c) => c.write(": ping" + EOL2)), 15000).unref(); // つなぎっぱなしを保つ

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://local");

    if (u.pathname === "/api/timer/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 1000" + EOL2);
      res.write("data: " + payload() + EOL2);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (u.pathname === "/api/timer") {
      lastObsGet = Date.now();
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
  // OBS がタイマーを表示しているか(押し出し先がつながっている / 最近確認が来た)
  server.isObsActive = () => clients.size > 0 || Date.now() - lastObsGet < 10000;
  return server;
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
  let server = null;
  const sync = createSync({ cloud, pass: cfg.pass, log: (m) => console.log("  [" + stamp() + "] " + m), isObsActive: () => !!server && server.isObsActive() });
  server = createServer(sync, { cloud });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") console.log("\n  もうタイマーが起動しています(ポート " + port + " が使用中)。この窓は閉じてOKです。");
    else console.error(e);
    setTimeout(() => process.exit(1), 8000);
  });
  // OBS 用なので、この PC の中からだけ受け付ける(外からは開けない)
  // Windows の localhost は先に IPv6(::1)へつなぎに行き、待ち受けていないと約 2 秒待たされる。両方で待ち受ける(どちらもこの PC の中だけ)
  const server6 = http.createServer((req, res) => server.emit("request", req, res));
  server6.on("error", () => {}); // IPv6 が無い PC ではそのまま IPv4 だけで動く
  server6.listen(port, "::1");
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
