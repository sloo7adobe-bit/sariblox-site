// YouTube の動画 ID からタイトルとチャンネル名を返す(応募フォームのカード表示用)

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || "");
  if (!YT_ID.test(id)) {
    res.status(400).json({ ok: false, error: "id が不正です" });
    return;
  }
  res.setHeader("Cache-Control", "public, s-maxage=86400, max-age=3600");
  try {
    const r = await fetch(
      "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + id + "&format=json",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) {
      res.status(404).json({ ok: false, error: "動画が見つかりません" });
      return;
    }
    const j = await r.json();
    res.status(200).json({
      ok: true,
      id,
      title: j.title || "",
      author: j.author_name || "",
      thumb: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg",
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: "取得に失敗しました" });
  }
};
