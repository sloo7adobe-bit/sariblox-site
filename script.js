/* ==========================================================
   応募先の設定
   ここの URL を書き換えるだけで応募ボタンが変わります。
   空文字 "" のままにした項目のボタンは表示されません。
   ========================================================== */
const CONFIG = {
  // Google フォームの URL(例: "https://forms.gle/xxxxx")
  formUrl: "",
  // X(旧Twitter)のプロフィール URL(例: "https://x.com/sari_blox")
  xUrl: "",
  // 応募受付用メールアドレス(例: "apply@example.com")
  email: "",
  // Discord の招待 URL や ユーザー名(例: "https://discord.gg/xxxxx")
  discordUrl: "",
};

/* ==========================================================
   チャンネル情報と紹介動画
   ========================================================== */
const CHANNEL = {
  name: "サリ",
  // YouTube チャンネルの URL(例: "https://www.youtube.com/@xxxx")
  url: "",
  // チャンネルアイコンの画像 URL(空なら頭文字を表示)
  avatar: "",
  subscribers: "",   // 例: "12.3万"
  videos: "",        // 例: "253"
  views: "",         // 例: "3.7億"
};

// 紹介したい横動画の YouTube URL または 動画ID を 6 本まで
// 例: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" または "dQw4w9WgXcQ"
const VIDEOS = [
  "",
  "",
  "",
  "",
  "",
  "",
];

(function () {
  const card = document.getElementById("channel-card");
  const grid = document.getElementById("video-grid");
  if (!card || !grid) return;

  const ytIcon =
    '<svg width="16" height="12" viewBox="0 0 24 17" fill="#fff" aria-hidden="true"><path d="M9.5 12.5v-8l7 4-7 4z"/></svg>';
  const playIcon =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- チャンネルカード ----
  const initial = esc((CHANNEL.name || "S").trim().charAt(0).toUpperCase());
  const avatarHtml = CHANNEL.avatar
    ? '<img src="' + esc(CHANNEL.avatar) + '" alt="' + esc(CHANNEL.name) + ' のアイコン" width="96" height="96" loading="lazy" />'
    : '<span class="avatar-placeholder" aria-hidden="true">' + initial + "</span>";
  const nameHtml = CHANNEL.url
    ? '<a href="' + esc(CHANNEL.url) + '" target="_blank" rel="noopener noreferrer">' + esc(CHANNEL.name) + "</a>"
    : esc(CHANNEL.name);
  const stats = [
    { num: CHANNEL.subscribers, lbl: "登録者" },
    { num: CHANNEL.videos, lbl: "動画数" },
    { num: CHANNEL.views, lbl: "総再生数" },
  ].filter(function (s) {
    return s.num;
  });
  const statsHtml = stats.length
    ? '<ul class="channel-stats" aria-label="チャンネル実績">' +
      stats
        .map(function (s) {
          return "<li><span class=\"num\">" + esc(s.num) + "</span><span class=\"lbl\">" + s.lbl + "</span></li>";
        })
        .join("") +
      "</ul>"
    : "";

  card.innerHTML =
    '<div class="channel-avatar">' +
    avatarHtml +
    '<span class="yt-badge" aria-hidden="true">' +
    ytIcon +
    "</span></div>" +
    '<div class="channel-body"><p class="channel-name">' +
    nameHtml +
    "</p>" +
    statsHtml +
    "</div>";

  // ---- 動画グリッド ----
  function toId(v) {
    if (!v) return "";
    v = v.trim();
    const m =
      v.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
      v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
      v.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/) ||
      v.match(/^([A-Za-z0-9_-]{11})$/);
    return m ? m[1] : "";
  }

  const ids = VIDEOS.map(toId);
  const hasAny = ids.some(Boolean);

  grid.innerHTML = ids
    .slice(0, 6)
    .map(function (id, i) {
      if (!id) {
        return '<div class="video-item placeholder" aria-hidden="true">' + (hasAny ? "" : "動画 " + (i + 1)) + "</div>";
      }
      return (
        '<a class="video-item" href="https://www.youtube.com/watch?v=' +
        id +
        '" target="_blank" rel="noopener noreferrer" aria-label="動画 ' +
        (i + 1) +
        ' を YouTube で見る">' +
        '<img src="https://i.ytimg.com/vi/' +
        id +
        '/hqdefault.jpg" alt="" loading="lazy" />' +
        '<span class="play"><span>' +
        playIcon +
        "</span></span></a>"
      );
    })
    .join("");
})();

(function () {
  const actions = document.getElementById("apply-actions");
  const note = document.getElementById("apply-note");
  if (!actions) return;

  const icons = {
    form: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L22.8 22h-6.9l-5.4-7.06L4.3 22H1.04l8.02-9.17L1.2 2h7.08l4.88 6.45L18.244 2zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20z"/></svg>',
    mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>',
    discord: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.5 1.5 15 15 0 0 0-15.4 0A18 18 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.5C.6 9.1-.2 13.7.2 18.2a20 20 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.3 14.3 0 0 0 12 0l.5.4-2 1 1.3 2a20 20 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.8zM8.7 15.4c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/></svg>',
  };

  const buttons = [];

  if (CONFIG.formUrl) {
    buttons.push({ href: CONFIG.formUrl, label: "応募フォームを開く", icon: icons.form, primary: true, external: true });
  }
  if (CONFIG.xUrl) {
    buttons.push({ href: CONFIG.xUrl, label: "X の DM で応募", icon: icons.x, primary: !CONFIG.formUrl, external: true });
  }
  if (CONFIG.discordUrl) {
    buttons.push({ href: CONFIG.discordUrl, label: "Discord で応募", icon: icons.discord, primary: false, external: true });
  }
  if (CONFIG.email) {
    const subject = encodeURIComponent("【編集者応募】");
    const body = encodeURIComponent(
      "■ 作例のURL:\n\n■ 使用ソフト:\n\n■ 週に対応できる本数:\n\n■ 自己紹介:\n"
    );
    buttons.push({
      href: "mailto:" + CONFIG.email + "?subject=" + subject + "&body=" + body,
      label: "メールで応募",
      icon: icons.mail,
      primary: buttons.length === 0,
      external: false,
    });
  }

  if (buttons.length === 0) {
    actions.innerHTML = '<span class="apply-pending">応募受付を準備中です</span>';
    if (note) note.textContent = "まもなく応募方法を公開します。";
    return;
  }

  actions.innerHTML = buttons
    .map(function (b) {
      const cls = "btn btn-lg " + (b.primary ? "btn-primary" : "btn-ghost");
      const target = b.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return '<a class="' + cls + '" href="' + b.href + '"' + target + ">" + b.icon + b.label + "</a>";
    })
    .join("");

  if (note) note.textContent = "返信には数日いただく場合があります。";
})();

/* ---------- 年号 ---------- */
(function () {
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();

/* ---------- スクロールで表示 ---------- */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = document.querySelectorAll(".card, .req-block, .step, .faq, .apply-box, .channel-card, .video-item");
  if (reduce || !("IntersectionObserver" in window)) return;

  targets.forEach(function (el) {
    el.classList.add("reveal");
  });

  const io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach(function (el) {
    io.observe(el);
  });
})();
