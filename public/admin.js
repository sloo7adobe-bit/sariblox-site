/* 管理画面 */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const DEFAULTS = {
    recruiting: true,
    showClips: false,
    headline: ["運命の", "編集者", "募集"],
    cards: [
      { label: "理想", lines: ["編集者より右手大親友🤝", "サリーの動画・配信を見てる"] },
      { label: "本数・納期", lines: ["1本あたり 10〜20 分程度の動画", "週 2〜3 本を目安(相談可)"] },
      { label: "報酬", lines: ["金額は経験・スキルに応じて応相談", "継続・クオリティに応じて昇給あり"] },
    ],
    videos: [
      "https://youtu.be/IbyUW3-2kks", "https://youtu.be/o1ZURH4VXEY", "https://youtu.be/mQGbuXPaPak",
      "https://youtu.be/yNRXvwIkgrg", "https://youtu.be/A1kRe_BP4mM", "https://youtu.be/CymMygkEF6o",
      "https://youtu.be/8jxV8h5b3Vg", "https://www.youtube.com/watch?v=B2GK-L0xMGw", "https://www.youtube.com/watch?v=dNiF_CisHyk",
    ],
    clips: [
      { name: "サリー界隈TV", url: "https://www.youtube.com/@%E3%82%B5%E3%83%AA%E3%83%BC%E7%95%8C%E9%9A%88TV", icon: "clips/clip-1.jpg" },
      { name: "YTジュニア", url: "https://www.youtube.com/@SariClipss", icon: "clips/clip-2.jpg" },
    ],
    social: {
      youtube: "https://www.youtube.com/@サリーぶろっくす",
      tiktok: "https://www.tiktok.com/@sariblox6767",
      x: "https://x.com/YTsarii",
      discord: "https://discord.gg/sari",
      email: "",
    },
  };

  function api(url, body) {
    return fetch(url, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); });
  }
  function msg(id, text, ok) {
    const el = $(id); el.textContent = text; el.className = "admin-msg " + (ok ? "ok" : "ng");
    if (text) setTimeout(function () { el.textContent = ""; }, 4000);
  }
  function n(v) { return Number(v || 0).toLocaleString("ja-JP"); }

  // ---- ログイン確認 ----
  api("/api/auth").then(function (j) {
    if (!j.ok || !j.loggedIn) { location.href = "/login"; return; }
    $("main").hidden = false;
    loadStats();
    api("/api/admin", { action: "get-content" }).then(function (r) { fill(r.content || DEFAULTS, !r.content); });
  }).catch(function () { location.href = "/login"; });

  function loadStats() {
    fetch("/api/count?t=" + Date.now()).then(function (r) { return r.json(); }).then(function (j) {
      $("s-total").textContent = n(j.total); $("s-today").textContent = n(j.today); $("s-yesterday").textContent = n(j.yesterday);
    });
  }

  function syncShowClips() {
    $("c-showclips-text").textContent = $("c-showclips").checked ? "サイトに表示する" : "サイトに表示しない";
  }
  $("c-showclips").addEventListener("change", syncShowClips);

  // ---- フォームに反映 ----
  function fill(c, isDefault) {
    const d = DEFAULTS;
    $("c-recruiting").checked = c.recruiting !== false;
    $("c-showclips").checked = c.showClips === true;
    syncShowClips();
    const h = c.headline && c.headline.length ? c.headline : d.headline;
    $("c-h0").value = h[0] || ""; $("c-h1").value = h[1] || ""; $("c-h2").value = h[2] || "";
    const cards = c.cards && c.cards.length ? c.cards : d.cards;
    $("cards").innerHTML = [0, 1, 2].map(function (i) {
      const card = cards[i] || { label: "", lines: [] };
      return '<div class="card-edit"><input class="field-input" id="c-card-l' + i + '" placeholder="見出し" value="' + esc(card.label) + '" />' +
        '<textarea class="field-input field-textarea" id="c-card-t' + i + '" rows="5">' + esc((card.lines || []).join("\n")) + "</textarea></div>";
    }).join("");
    $("c-videos").value = (c.videos && c.videos.length ? c.videos : d.videos).join("\n");
    $("c-clips").value = (c.clips && c.clips.length ? c.clips : d.clips).map(function (x) { return x.name + ", " + x.url; }).join("\n");
    const s = c.social || d.social;
    ["youtube", "tiktok", "x", "discord", "email"].forEach(function (k) { $("c-" + k).value = s[k] || ""; });
    if (isDefault) msg("save-msg", "まだ編集したことがないので、今のサイトの内容を表示しています。", true);
  }
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---- 保存 ----
  $("save").addEventListener("click", function () {
    const content = {
      recruiting: $("c-recruiting").checked,
      showClips: $("c-showclips").checked,
      headline: [$("c-h0").value, $("c-h1").value, $("c-h2").value],
      cards: [0, 1, 2].map(function (i) {
        return { label: $("c-card-l" + i).value, lines: $("c-card-t" + i).value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean) };
      }),
      videos: $("c-videos").value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean),
      clips: $("c-clips").value.split(/\r?\n/).map(function (line) {
        const parts = line.split(/[,、，]/); if (parts.length < 2) return null;
        return { name: parts[0].trim(), url: parts.slice(1).join(",").trim() };
      }).filter(Boolean),
      social: { youtube: $("c-youtube").value, tiktok: $("c-tiktok").value, x: $("c-x").value, discord: $("c-discord").value, email: $("c-email").value },
    };
    $("save").disabled = true; $("save").textContent = "保存中…";
    api("/api/admin", { action: "save-content", content: content }).then(function (j) {
      if (j.ok) { msg("save-msg", "サイトを更新しました(反映まで最大 10 秒ほど)。", true); fill(j.content); }
      else msg("save-msg", j.error || "保存に失敗しました。", false);
    }).catch(function () { msg("save-msg", "通信に失敗しました。", false); })
      .then(function () { $("save").disabled = false; $("save").textContent = "この内容でサイトを更新"; });
  });

  // ---- リセット ----
  $("reset-count").addEventListener("click", function () {
    if (!confirm("アクセス数を 0 に戻します。元には戻せません。よろしいですか?")) return;
    $("reset-count").disabled = true;
    api("/api/admin", { action: "reset-count" }).then(function (j) {
      if (j.ok) { msg("reset-msg", "リセットしました(" + n(j.deleted) + " 件削除)", true); loadStats(); }
      else msg("reset-msg", j.error || "失敗しました。", false);
    }).catch(function () { msg("reset-msg", "通信に失敗しました。", false); })
      .then(function () { $("reset-count").disabled = false; });
  });

  // ---- パスワード変更 ----
  $("pw-change").addEventListener("click", function () {
    api("/api/auth", { action: "change-password", current: $("p-cur").value, password: $("p-new").value }).then(function (j) {
      if (j.ok) { msg("pw-msg", "変更しました。", true); $("p-cur").value = ""; $("p-new").value = ""; }
      else msg("pw-msg", j.error || "失敗しました。", false);
    });
  });

  // ---- ログアウト ----
  $("logout").addEventListener("click", function () {
    api("/api/auth", { action: "logout" }).then(function () { location.href = "/"; });
  });
})();
