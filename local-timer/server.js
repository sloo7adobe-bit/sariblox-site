// OBS タイマーをこの PC の中だけで動かすサーバー(Vercel もストレージも使わない、無料・上限なし)
//   OBS のブラウザソース:  http://localhost:<port>/timer
//   スマホ(同じ Wi-Fi):   http://<この PC の IP>:<port>/timer-c
// 起動: リポジトリ直下の「タイマーを起動.bat」をダブルクリック(中身は node local-timer/server.js)
// 設定(合言葉・ポート)は local-timer/config.json。Git には入れない(.gitignore 済み)

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const STATE_FILE = process.env.TIMER_STATE_FILE || path.join(__dirname, "state.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

// ---- api/timer.js の保存先を、この PC のファイルに差し替える ----
// 状態は小さいので、メモリに持ちつつ、変わったらファイルにも書く(再起動しても続きから)
let memory = null;
const fileStore = {
  hasBlob: () => true,
  readBody: (req) => req.body || {},
  readJson: async (p, fallback) => {
    if (memory) return JSON.parse(JSON.stringify(memory));
    try {
      memory = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return JSON.parse(JSON.stringify(memory));
    } catch (e) {
      return fallback;
    }
  },
  writeJson: async (p, data) => {
    memory = JSON.parse(JSON.stringify(data));
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  },
};
const storePath = require.resolve(path.join(ROOT, "lib", "store.js"));
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: fileStore };

// ---- 配るファイル(タイマーに必要なものだけ) ----
const FILES = {
  "/timer": ["timer.html", "text/html; charset=utf-8"],
  "/timer-c": ["timer-c.html", "text/html; charset=utf-8"],
  "/timer-hw.css": ["timer-hw.css", "text/css; charset=utf-8"],
  "/timer-hw.js": ["timer-hw.js", "text/javascript; charset=utf-8"],
  "/favicon.ico": ["favicon.ico", "image/x-icon"],
};

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((n) => {
      if (n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")) out.push(n.address);
    });
  });
  return out;
}

function createServer(opts) {
  const pass = String(opts.pass || "").trim();
  process.env.TIMER_PASS = pass;
  delete require.cache[require.resolve(path.join(ROOT, "api", "timer.js"))];
  const handler = require(path.join(ROOT, "api", "timer.js"));

  return http.createServer((req, res) => {
    const u = new URL(req.url, "http://local");

    if (u.pathname === "/api/timer") {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 20000) req.destroy(); // 変に大きい送信は切る
      });
      req.on("end", async () => {
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
        const fake = {
          code: 200,
          headers: {},
          setHeader(k, v) { this.headers[k] = v; },
          status(c) { this.code = c; return this; },
          json(j) {
            res.writeHead(this.code, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, this.headers));
            res.end(JSON.stringify(j));
          },
        };
        try {
          await handler({ method: req.method, headers: req.headers, body, socket: req.socket }, fake);
        } catch (e) {
          console.error(e);
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end('{"ok":false,"error":"タイマーでエラーが起きました。"}');
        }
      });
      return;
    }

    if (u.pathname === "/") {
      res.writeHead(302, { Location: "/timer-c" });
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

module.exports = { createServer, lanAddresses };

if (require.main === module) {
  const cfg = loadConfig();
  const port = Number(cfg.port) || 3939;
  if (!String(cfg.pass || "").trim()) {
    console.log("local-timer/config.json に合言葉(pass)を書いてください。例: { \"pass\": \"1234\", \"port\": 3939 }");
    process.exit(1);
  }
  const server = createServer({ pass: cfg.pass });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") console.log("\nもうタイマーが起動しています(ポート " + port + " が使用中)。この窓は閉じてOKです。");
    else console.error(e);
    setTimeout(() => process.exit(1), 8000);
  });
  server.listen(port, "0.0.0.0", () => {
    const ips = lanAddresses();
    console.log("");
    console.log("  ===== サリーぶろっくす タイマー 起動中 =====");
    console.log("");
    console.log("  OBS(ブラウザソース):  http://localhost:" + port + "/timer");
    ips.forEach((ip) => console.log("  スマホ(同じ Wi-Fi):    http://" + ip + ":" + port + "/timer-c"));
    console.log("");
    console.log("  この窓を閉じるとタイマーも止まります(最小化はOK)。");
    console.log("");
  });
}
