/* 応募者一覧(管理者専用) */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  let items = [];
  let filter = "all";
  let query = "";

  const STATUS = {
    new: { label: "未確認", cls: "st-new" },
    star: { label: "気になる", cls: "st-star" },
    hired: { label: "採用", cls: "st-hired" },
    pass: { label: "見送り", cls: "st-pass" },
  };

  function api(body) {
    return fetch("/api/admin", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // ---- ログイン確認 → 読み込み ----
  fetch("/api/auth", { credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.ok || !j.loggedIn) { location.href = "/login"; return; }
    $("main").hidden = false;
    load();
  }).catch(function () { location.href = "/login"; });

  function load() {
    $("hint").textContent = "読み込み中…";
    api({ action: "list-applicants" }).then(function (j) {
      if (!j.ok) { $("hint").textContent = j.error || "読み込みに失敗しました。"; return; }
      items = j.items || [];
      render();
    }).catch(function () { $("hint").textContent = "通信に失敗しました。"; });
  }

  function counts() {
    const c = { all: items.length, new: 0, star: 0, hired: 0, pass: 0 };
    items.forEach(function (it) { c[it.status || "new"] = (c[it.status || "new"] || 0) + 1; });
    Object.keys(c).forEach(function (k) { const el = $("n-" + k); if (el) el.textContent = c[k]; });
  }

  function visible() {
    const q = query.trim().toLowerCase();
    return items.filter(function (it) {
      if (filter !== "all" && (it.status || "new") !== filter) return false;
      if (!q) return true;
      const softNames = (it.software || []).map(function (s) { return SOFT_NAMES[s] || s; }).join(" ");
      return [it.name, it.discord, it.reason, it.memo, softNames].join(" ").toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    counts();
    const list = visible();
    $("hint").textContent = items.length === 0 ? "まだ応募はありません。" : list.length + " 件を表示(全 " + items.length + " 件)";
    $("list").innerHTML = list.map(card).join("");
  }

  const SOFT_NAMES = { premiere: "Premiere Pro", aftereffects: "After Effects", ymm4: "YMM4", photoshop: "Photoshop" };

  function card(it) {
    const st = STATUS[it.status] || STATUS.new;
    const softs = (it.software || [])
      .filter(function (s) { return SOFT_NAMES[s]; })
      .map(function (s) { return '<span class="soft-tag' + (s === "photoshop" ? " soft-tag-ps" : "") + '">' + SOFT_NAMES[s] + "</span>"; })
      .join("");
    const thumbs = (it.thumbs || []).map(function (p, i) {
      const url = "/api/thumb?id=" + encodeURIComponent(it.id) + "&n=" + (i + 1);
      return (
        '<a class="app-thumb" href="' + url + '" target="_blank" rel="noopener noreferrer" title="クリックで大きく表示">' +
        '<img src="' + url + '" alt="応募サムネ ' + (i + 1) + '" loading="lazy" />' +
        "</a>"
      );
    }).join("");
    const vids = (it.videos || []).map(function (v) {
      return (
        '<a class="app-video" href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener noreferrer">' +
        '<img src="https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg" alt="" loading="lazy" />' +
        '<span class="app-video-title">' + esc(v.title || "動画") + "</span>" +
        (v.author ? '<span class="app-video-author">' + esc(v.author) + "</span>" : "") +
        "</a>"
      );
    }).join("");
    return (
      '<article class="app-card ' + st.cls + '" data-id="' + esc(it.id) + '">' +
      '<div class="app-head">' +
      '<div class="app-who">' +
      '<span class="app-name">' + esc(it.name) + "</span>" +
      '<button type="button" class="app-discord" data-copy="' + esc(it.discord) + '" title="クリックでコピー">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.5 1.5 15 15 0 0 0-15.4 0A18 18 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.5C.6 9.1-.2 13.7.2 18.2a20 20 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.3 14.3 0 0 0 12 0l.5.4-2 1 1.3 2a20 20 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.8zM8.7 15.4c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/></svg>' +
      esc(it.discord) + "</button>" +
      '<span class="app-meta">' + fmtDate(it.at) + (it.device ? " · " + esc(it.device) : "") + "</span>" +
      "</div>" +
      '<div class="app-status">' +
      Object.keys(STATUS).map(function (k) {
        return '<button type="button" class="st-btn ' + STATUS[k].cls + (k === (it.status || "new") ? " is-on" : "") + '" data-status="' + k + '">' + STATUS[k].label + "</button>";
      }).join("") +
      "</div>" +
      "</div>" +
      (softs ? '<div class="app-softs">' + softs + "</div>" : "") +
      '<div class="app-videos">' + (vids || "") + thumbs + (!vids && !thumbs ? '<span class="admin-help">作品なし</span>' : "") + "</div>" +
      '<p class="app-reason">' + esc(it.reason).replace(/\n/g, "<br>") + "</p>" +
      '<div class="app-foot">' +
      '<input class="field-input app-memo" data-memo placeholder="メモ(自分用。保存は自動)" value="' + esc(it.memo || "") + '" />' +
      '<button type="button" class="app-del" data-del title="削除">削除</button>' +
      "</div>" +
      "</article>"
    );
  }

  // ---- 操作 ----
  $("filters").addEventListener("click", function (e) {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.getAttribute("data-f");
    $("filters").querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("is-on", c === b); });
    render();
  });
  $("search").addEventListener("input", function () { query = $("search").value; render(); });
  $("reload").addEventListener("click", load);

  $("list").addEventListener("click", function (e) {
    const card = e.target.closest(".app-card"); if (!card) return;
    const id = card.getAttribute("data-id");
    const it = items.find(function (x) { return x.id === id; });
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      const text = copy.getAttribute("data-copy");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        copy.classList.add("copied"); setTimeout(function () { copy.classList.remove("copied"); }, 1200);
      }, function () { prompt("コピーしてください", text); });
      return;
    }
    const sb = e.target.closest("[data-status]");
    if (sb && it) {
      const status = sb.getAttribute("data-status");
      it.status = status; render();
      api({ action: "update-applicant", id: id, status: status });
      return;
    }
    if (e.target.closest("[data-del]") && it) {
      if (!confirm(it.name + " さんの応募を削除します。元に戻せません。よろしいですか?")) return;
      items = items.filter(function (x) { return x.id !== id; }); render();
      api({ action: "delete-applicant", id: id });
    }
  });

  let memoTimer = null;
  $("list").addEventListener("input", function (e) {
    const inp = e.target.closest("[data-memo]"); if (!inp) return;
    const card = inp.closest(".app-card"); const id = card.getAttribute("data-id");
    const it = items.find(function (x) { return x.id === id; }); if (!it) return;
    it.memo = inp.value;
    clearTimeout(memoTimer);
    memoTimer = setTimeout(function () { api({ action: "update-applicant", id: id, memo: it.memo }); }, 600);
  });
})();
