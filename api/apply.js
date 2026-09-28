// 応募フォームの受け取り → Discord のチャンネルに投稿する
// 環境変数 DISCORD_WEBHOOK_URL に Discord の Webhook URL を設定して使う

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function clean(str, max) {
  return String(str || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
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
  const discord = clean(body.discord, 60);
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
        { name: "Discord", value: "`" + discord + "`", inline: true },
        { name: `編集した動画(${videos.length}本)`, value: videoLines || "-" },
        { name: "応募した理由・一緒に目指したいこと", value: reason.slice(0, 1024) },
      ],
      thumbnail: { url: `https://i.ytimg.com/vi/${videos[0].id}/mqdefault.jpg` },
      timestamp: new Date().toISOString(),
      footer: { text: "sariblox.com 応募フォーム" },
    },
  ];

  // 動画は最大3本までサムネ付きで並べる
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
        content: `📩 **${name}** さんから応募が届きました(Discord: \`${discord}\`)`,
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

  res.status(200).json({ ok: true });
};
