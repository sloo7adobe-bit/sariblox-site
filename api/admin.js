// 管理者専用の操作: reset-count / get-content / save-content

const S = require("../lib/store");

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function toId(v) {
  v = clean(v, 200);
  const m =
    v.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    v.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/) ||
    v.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : "";
}

function safeUrl(u) {
  u = clean(u, 300);
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const p = new URL(u);
    if (p.protocol !== "https:" && p.protocol !== "http:") return "";
    return p.toString();
  } catch (e) {
    return "";
  }
}

async function fetchChannelIcon(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ja" } });
    if (!r.ok) return "";
    const html = await r.text();
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!m) return "";
    return m[1].split("=")[0] + "=s240-c-k-c0x00ffffff-no-rj";
  } catch (e) {
    return "";
  }
}

function sanitizeContent(input) {
  input = input || {};
  const out = {};
  out.recruiting = input.recruiting !== false;
  const h = Array.isArray(input.headline) ? input.headline : [];
  out.headline = [clean(h[0], 20), clean(h[1], 20), clean(h[2], 20)];
  const cards = Array.isArray(input.cards) ? input.cards.slice(0, 3) : [];
  out.cards = cards.map((c) => ({
    label: clean(c && c.label, 30),
    lines: (Array.isArray(c && c.lines) ? c.lines : [])
      .map((l) => clean(l, 80))
      .filter(Boolean)
      .slice(0, 6),
  }));
  out.videos = (Array.isArray(input.videos) ? input.videos : [])
    .map(toId)
    .filter(Boolean)
    .filter((id, i, a) => a.indexOf(id) === i)
    .slice(0, 12)
    .map((id) => "https://youtu.be/" + id);
  out.clips = (Array.isArray(input.clips) ? input.clips : [])
    .map((c) => ({ name: clean(c && c.name, 40), url: safeUrl(c && c.url), icon: safeUrl(c && c.icon) }))
    .filter((c) => c.url)
    .slice(0, 20);
  const so = input.social || {};
  out.social = {
    youtube: safeUrl(so.youtube),
    tiktok: safeUrl(so.tiktok),
    x: safeUrl(so.x),
    discord: safeUrl(so.discord),
    email: clean(so.email, 100).replace(/[^\w.@+\-]/g, ""),
  };
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!S.hasBlob() || !process.env.ADMIN_SECRET) {
    res.status(503).json({ ok: false, error: "管理機能の準備中です。" });
    return;
  }
  const config = await S.readJson(S.CONFIG_PATH, null);
  if (!S.sessionValid(req, config)) {
    res.status(401).json({ ok: false, error: "ログインしてください。" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  const body = S.readBody(req);
  const action = String(body.action || "");

  if (action === "reset-count") {
    const n = await S.deleteByPrefix("hits/");
    res.status(200).json({ ok: true, deleted: n });
    return;
  }

  if (action === "get-content") {
    const content = await S.readJson(S.CONTENT_PATH, null);
    res.status(200).json({ ok: true, content });
    return;
  }

  if (action === "save-content") {
    const content = sanitizeContent(body.content);
    // 切り抜きのアイコンが空なら YouTube から取ってくる
    for (const c of content.clips) {
      if (!c.icon) c.icon = await fetchChannelIcon(c.url);
      if (!c.name) c.name = "チャンネル";
    }
    content.savedAt = new Date().toISOString();
    await S.writeJson(S.CONTENT_PATH, content);
    res.status(200).json({ ok: true, content });
    return;
  }

  if (action === "list-applicants") {
    const { list } = require("@vercel/blob");
    const paths = [];
    let cursor;
    do {
      const page = await list({ prefix: "applications/", limit: 1000, cursor });
      page.blobs.forEach((b) => paths.push(b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    paths.sort().reverse(); // 新しい順
    const items = [];
    for (let i = 0; i < paths.length; i += 20) {
      const chunk = await Promise.all(paths.slice(i, i + 20).map((p) => S.readJson(p, null)));
      chunk.forEach((x) => x && items.push(x));
    }
    res.status(200).json({ ok: true, items });
    return;
  }

  if (action === "update-applicant") {
    const id = clean(body.id, 40);
    if (!/^\d{10,16}-[0-9a-f]{6}$/.test(id)) {
      res.status(400).json({ ok: false, error: "id が不正です" });
      return;
    }
    const path = "applications/" + id + ".json";
    const rec = await S.readJson(path, null);
    if (!rec) {
      res.status(404).json({ ok: false, error: "見つかりません" });
      return;
    }
    if (body.status !== undefined) {
      const st = clean(body.status, 20);
      if (["new", "star", "hired", "pass"].includes(st)) rec.status = st;
    }
    if (body.memo !== undefined) rec.memo = clean(body.memo, 500);
    rec.updatedAt = new Date().toISOString();
    await S.writeJson(path, rec);
    res.status(200).json({ ok: true, item: rec });
    return;
  }

  if (action === "delete-applicant") {
    const id = clean(body.id, 40);
    if (!/^\d{10,16}-[0-9a-f]{6}$/.test(id)) {
      res.status(400).json({ ok: false, error: "id が不正です" });
      return;
    }
    const { del, list } = require("@vercel/blob");
    const page = await list({ prefix: "applications/" + id + ".json", limit: 1 });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url));
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ ok: false, error: "不明な操作です。" });
};
