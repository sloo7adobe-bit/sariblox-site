// 応募フォームの受け取り → Discord のチャンネルに投稿する
// 環境変数 DISCORD_WEBHOOK_URL に Discord の Webhook URL を設定して使う
// 応募の記録は Vercel Blob に保存し、同じ人からの2回目以降は受け付けない

const crypto = require("crypto");
const { put, head } = require("@vercel/blob");

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IP_WINDOW_MS = 24 * 60 * 60 * 1000; // 同じ回線からは 24 時間に 1 回
const COOKIE_NAME = "sb_applied";

function clean(str, max) {
  return String(str || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function sha(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 40);
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(xf) ? xf[0] : (xf || "")).split(",")[0].trim();
  return ip || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "";
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function normDiscord(s) {
  return clean(s, 60).replace(/^@/, "").toLowerCase();
}

async function exists(pathname) {
  try {
    await head(pathname);
    return true;
  } catch (e) {
    return false;
  }
}

async function record(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function fetchTitle(id) {
  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + id + "&format=json",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title || "", author: j.author_name || "" };
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST のみ" });
    return;
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    res.status(503).json({ ok: false, error: "受付の準備中です。少し時間をおいてもう一度お試しください。" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  // ボット対策(見えない欄に何か入っていたら無視して成功扱い)
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  const name = clean(body.name, 60);
  const discordRaw = clean(body.discord, 60).replace(/^@/, "");
  const discord = normDiscord(discordRaw);
  const reason = clean(body.reason, 2000);
  const videosIn = Array.isArray(body.videos) ? body.videos.slice(0, 10) : [];
  const videos = [];
  for (const v of videosIn) {
    const id = clean(v && v.id, 11);
    if (YT_ID.test(id) && !videos.some((x) => x.id === id)) {
      videos.push({ id, title: clean(v && v.title, 120) });
    }
  }

  if (!name || !discord || videos.length === 0 || reason.length < 5) {
    res.status(400).json({ ok: false, error: "入力内容が足りません。" });
    return;
  }

  // ---- 重複チェック(同じ人は 1 回まで) ----
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const ip = getIp(req);
  const ipKey = "applied/ip/" + sha(ip) + ".json";
  const userKey = "applied/discord/" + sha(discord) + ".json";
  const DUP_MSG = "この Discord ユーザー名(またはこの回線)からの応募はすでに受け付けています。1人1回までです。";

  if (getCookie(req, COOKIE_NAME)) {
    res.status(429).json({ ok: false, error: DUP_MSG, duplicate: true });
    return;
  }

  if (hasBlob) {
    try {
      if (await exists(userKey)) {
        res.status(429).json({ ok: false, error: DUP_MSG, duplicate: true });
        return;
      }
      // 同じ回線は 24 時間に 1 回
      if (ip) {
        const r = await head(ipKey).catch(() => null);
        if (r && r.uploadedAt && Date.now() - new Date(r.uploadedAt).getTime() < IP_WINDOW_MS) {
          res.status(429).json({ ok: false, error: DUP_MSG, duplicate: true });
          return;
        }
      }
    } catch (e) {
      console.error("dup check failed", e);
      // 判定に失敗しても応募自体は通す(取りこぼしを防ぐ)
    }
  }

  // タイトルが無いものはこちらで取得
  await Promise.all(
    videos.map(async (v) => {
      if (!v.title) {
        const info = await fetchTitle(v.id);
        if (info) v.title = info.title;
      }
    })
  );

  const videoLines = videos
    .map((v, i) => `${i + 1}. [${v.title || "動画"}](https://www.youtube.com/watch?v=${v.id})`)
    .join("\n")
    .slice(0, 1000);

  const embeds = [
    {
      title: "新しい応募が届きました",
      color: 0xffd60a,
      fields: [
        { name: "名前", value: name, inline: true },
        { name: "Discord", value: "`" + discordRaw + "`", inline: true },
        { name: `編集した動画(${videos.length}本)`, value: videoLines || "-" },
        { name: "応募した理由", value: reason.slice(0, 1024) },
      ],
      thumbnail: { url: `https://i.ytimg.com/vi/${videos[0].id}/mqdefault.jpg` },
      timestamp: new Date().toISOString(),
      footer: { text: "sariblox.com 応募フォーム" },
    },
  ];

  videos.slice(0, 3).forEach((v) => {
    embeds.push({
      title: v.title || "動画",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      color: 0x2a7fd4,
      image: { url: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` },
    });
  });

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "応募フォーム",
        content: `📩 **${name}** さんから応募が届きました(Discord: \`${discordRaw}\`)`,
        embeds,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("discord webhook failed", r.status, t);
      res.status(502).json({ ok: false, error: "送信に失敗しました。時間をおいてもう一度お試しください。" });
      return;
    }
  } catch (e) {
    console.error(e);
    res.status(502).json({ ok: false, error: "送信に失敗しました。時間をおいてもう一度お試しください。" });
    return;
  }

  // ---- 記録(以後は同じ人を弾く) ----
  if (hasBlob) {
    const at = new Date().toISOString();
    try {
      await record(userKey, { discord, at });
      if (ip) await record(ipKey, { at });
    } catch (e) {
      console.error("record failed", e);
    }
  }

  // ブラウザにも「応募済み」の印を 1 年残す
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure; HttpOnly`
  );

  res.status(200).json({ ok: true });
};
