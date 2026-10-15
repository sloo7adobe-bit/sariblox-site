// アイディア箱: テキストを受け取って Discord に送る + Blob に保存する
// 応募と違って何回でも送れる(同じ回線からは 60 秒に 1 回まで)

const crypto = require("crypto");
const { head } = require("@vercel/blob");
const S = require("../lib/store");

const COOLDOWN_MS = 60 * 1000;

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

  const body = S.readBody(req);
  // ボット対策(見えない欄に何か入っていたら無視して成功扱い)
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  const text = clean(body.text, 500);
  if (text.length < 5) {
    res.status(400).json({ ok: false, error: "もう少し書いてください(5文字以上)。" });
    return;
  }

  const hasBlob = S.hasBlob();
  const ip = getIp(req);
  const ipKey = "ideas/ip/" + sha(ip) + ".json";

  // 同じ回線からは 60 秒に 1 回まで
  if (hasBlob && ip) {
    try {
      const r = await head(ipKey).catch(() => null);
      if (r && r.uploadedAt && Date.now() - new Date(r.uploadedAt).getTime() < COOLDOWN_MS) {
        res.status(429).json({ ok: false, error: "続けて送るときは 1 分あけてください。" });
        return;
      }
    } catch (e) {}
  }

  // 保存(Discord への送信に失敗しても残る)
  const id = Date.now() + "-" + crypto.randomBytes(3).toString("hex");
  if (hasBlob) {
    try {
      await S.writeJson("ideas/" + id + ".json", {
        id,
        text,
        at: new Date().toISOString(),
        device: /Mobi|Android|iPhone|iPad/i.test(String(req.headers["user-agent"] || "")) ? "スマホ" : "PC",
      });
    } catch (e) {
      console.error("save idea failed", e);
    }
  }

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "アイディア箱",
        content: "💡 新しいアイディアが届きました",
        embeds: [
          {
            description: text.slice(0, 1024),
            color: 0xffd60a,
            timestamp: new Date().toISOString(),
            footer: { text: "sariblox.com アイディア箱" },
          },
        ],
        allowed_mentions: { parse: [] },
      }),
    });
    if (!r.ok) {
      console.error("discord webhook failed", r.status, await r.text());
      if (!hasBlob) {
        res.status(502).json({ ok: false, error: "送信に失敗しました。時間をおいてもう一度お試しください。" });
        return;
      }
    }
  } catch (e) {
    console.error(e);
    if (!hasBlob) {
      res.status(502).json({ ok: false, error: "送信に失敗しました。時間をおいてもう一度お試しください。" });
      return;
    }
  }

  if (hasBlob && ip) {
    try {
      await S.writeJson(ipKey, { at: new Date().toISOString() });
    } catch (e) {}
  }

  res.status(200).json({ ok: true });
};
