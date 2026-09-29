// Blob を JSON の簡易保存先として使うための共通処理 + 管理者ログインの検証

const crypto = require("crypto");
const { put, get, del, list } = require("@vercel/blob");

const SESSION_COOKIE = "sb_admin_session";
const FLAG_COOKIE = "sb_admin";
const SESSION_DAYS = 7;

function hasBlob() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

async function readJson(pathname, fallback) {
  try {
    const r = await get(pathname, { access: "private", useCache: false }); // 常に最新を読む(保存直後の反映のため)
    if (!r || r.statusCode !== 200 || !r.stream) return fallback;
    const chunks = [];
    for await (const c of r.stream) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) {
    return fallback;
  }
}

async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function deleteByPrefix(prefix) {
  let cursor;
  let n = 0;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    if (page.blobs.length) {
      await del(page.blobs.map((b) => b.url));
      n += page.blobs.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return n;
}

// ---- パスワード ----
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const { hash } = hashPassword(password, rec.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(rec.hash, "hex"));
}

// ---- セッション(署名付き cookie) ----
function secret() {
  return process.env.ADMIN_SECRET || "";
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function makeSession(version) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = exp + "." + (version || 1);
  return payload + "." + sign(payload);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "")
    .split(";")
    .forEach((p) => {
      const i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
  return out;
}

function sessionValid(req, config) {
  if (!secret()) return false;
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = parts[0] + "." + parts[1];
  const expect = sign(payload);
  if (expect.length !== parts[2].length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(parts[2]))) return false;
  if (Number(parts[0]) < Date.now()) return false;
  if (config && Number(parts[1]) !== Number(config.version || 1)) return false; // パスワード変更で無効化
  return true;
}

function sessionCookies(token) {
  const maxAge = SESSION_DAYS * 86400;
  return [
    `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure; HttpOnly`,
    `${FLAG_COOKIE}=1; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`,
  ];
}

function clearCookies() {
  return [
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure; HttpOnly`,
    `${FLAG_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`,
  ];
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  return body || {};
}

module.exports = {
  hasBlob,
  readJson,
  writeJson,
  deleteByPrefix,
  hashPassword,
  verifyPassword,
  makeSession,
  sessionValid,
  sessionCookies,
  clearCookies,
  parseCookies,
  readBody,
  CONFIG_PATH: "admin/config.json",
  CONTENT_PATH: "admin/content.json",
  FAILS_PATH: "admin/fails.json",
};
