// このブラウザ(または回線)がすでに応募済みかを返す(フォームを開く前の確認用)

const COOKIE_NAME = "sb_applied";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const raw = req.headers.cookie || "";
  const applied = raw.split(";").some((p) => p.trim().split("=")[0] === COOKIE_NAME);
  res.status(200).json({ applied });
};
