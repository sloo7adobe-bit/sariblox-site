// サイトに表示する内容(管理画面で保存したもの)。無ければ空を返し、サイトは初期値を使う

const S = require("../lib/store");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=10, max-age=0, stale-while-revalidate=60");
  if (!S.hasBlob()) {
    res.status(200).json({ ok: true, content: null });
    return;
  }
  const content = await S.readJson(S.CONTENT_PATH, null);
  res.status(200).json({ ok: true, content });
};
