// アクセスを 1 件記録する(1 アクセス = 1 ファイルを保存。集計は /api/count)

const { put } = require("@vercel/blob");

function jstDay() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000); // 日本時間
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const ua = String(req.headers["user-agent"] || "");
  if (!ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|vercel-screenshot/i.test(ua)) {
    res.status(204).end();
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(204).end();
    return;
  }
  try {
    const day = jstDay();
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua) ? "m" : "d";
    await put(`hits/${day}/${Date.now()}-${isMobile}.json`, "1", {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    });
  } catch (e) {
    console.error("hit failed", e);
  }
  res.status(204).end();
};
