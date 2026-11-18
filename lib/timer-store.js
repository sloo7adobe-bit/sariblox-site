// タイマーの状態の置き場所: Vercel Runtime Cache(Hobby で無料。読み 100 万回 / 書き 20 万回 / 月)
// Blob は使わない(頻繁な確認で月の上限を使い切り、サイト全体のストレージが止まったため)
// 消えても困らないよう、正本は家の PC(local-timer/state.json)が持ち、空になったら PC が書き戻す

const { getCache } = require("@vercel/functions");

const STATE_KEY = "timer-state";
const PC_KEY = "timer-pc";
const TTL = 60 * 60 * 24 * 30; // 30 日

function cache() {
  return getCache({ namespace: "sariblox" });
}

module.exports = {
  readState: async () => (await cache().get(STATE_KEY)) || null,
  writeState: (s) => cache().set(STATE_KEY, s, { ttl: TTL, name: "timer state" }),
  readPc: async () => (await cache().get(PC_KEY)) || null,
  writePc: (p) => cache().set(PC_KEY, p, { ttl: TTL, name: "timer pc heartbeat" }),
};
