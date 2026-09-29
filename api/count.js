// アクセス数の集計(合計・今日・日別)

const { list } = require("@vercel/blob");

function jstDay(offsetDays) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - (offsetDays || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=20, max-age=0");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(200).json({ ok: true, total: 0, today: 0, days: {} });
    return;
  }
  const days = {};
  let total = 0;
  let mobile = 0;
  let cursor;
  try {
    do {
      const page = await list({ prefix: "hits/", limit: 1000, cursor });
      for (const b of page.blobs) {
        const m = b.pathname.match(/^hits\/(\d{4}-\d{2}-\d{2})\/\d+-([md])/);
        if (!m) continue;
        days[m[1]] = (days[m[1]] || 0) + 1;
        total += 1;
        if (m[2] === "m") mobile += 1;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error("count failed", e);
    res.status(502).json({ ok: false, error: "集計に失敗しました" });
    return;
  }
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = jstDay(i);
    last14.push({ day: d, count: days[d] || 0 });
  }
  res.status(200).json({
    ok: true,
    total,
    today: days[jstDay(0)] || 0,
    yesterday: days[jstDay(1)] || 0,
    mobile,
    desktop: total - mobile,
    last14,
    updatedAt: new Date().toISOString(),
  });
};
