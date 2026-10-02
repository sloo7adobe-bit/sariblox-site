// 応募で届いたサムネ画像を返す(管理者ログイン中のみ)
// 例: /api/thumb?id=1730000000000-abc123&n=1

const { get } = require("@vercel/blob");
const S = require("../lib/store");

module.exports = async function handler(req, res) {
  if (!S.hasBlob() || !process.env.ADMIN_SECRET) {
    res.status(503).end();
    return;
  }
  const config = await S.readJson(S.CONFIG_PATH, null);
  if (!S.sessionValid(req, config)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).end();
    return;
  }
  const id = String((req.query && req.query.id) || "");
  const n = parseInt((req.query && req.query.n) || "", 10);
  if (!/^\d{10,16}-[0-9a-f]{6}$/.test(id) || !(n >= 1 && n <= 3)) {
    res.status(400).end();
    return;
  }
  try {
    const r = await get("applications/" + id + "/thumb-" + n + ".jpg", { access: "private" });
    if (!r || r.statusCode !== 200 || !r.stream) {
      res.status(404).end();
      return;
    }
    const chunks = [];
    for await (const c of r.stream) chunks.push(c);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.status(200).end(Buffer.concat(chunks));
  } catch (e) {
    res.status(404).end();
  }
};
