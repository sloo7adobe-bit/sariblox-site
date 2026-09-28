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
  name: "サリーぶろっくす",
  // YouTube チャンネルの URL
  url: "https://www.youtube.com/@サリーぶろっくす",
  // チャンネルアイコンの画像(空なら頭文字を表示)
  avatar: "avatar.jpg",
  subscribers: "21万人",
  videos: "",           // 空なら非表示
  views: "1.2億回",
};

// 紹介したい横動画の YouTube URL または 動画ID を 9 本まで
// 例: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" または "dQw4w9WgXcQ"
const VIDEOS = [
  "https://youtu.be/IbyUW3-2kks",
  "https://youtu.be/o1ZURH4VXEY",
  "https://youtu.be/mQGbuXPaPak",
  "https://youtu.be/yNRXvwIkgrg",
  "https://youtu.be/A1kRe_BP4mM",
  "https://youtu.be/CymMygkEF6o",
  "https://youtu.be/8jxV8h5b3Vg",
  "https://www.youtube.com/watch?v=B2GK-L0xMGw",
  "https://www.youtube.com/watch?v=dNiF_CisHyk",
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
    .slice(0, 9)
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

  // 保険: 何らかの理由で監視が動かない環境でも 2 秒後には全て表示する
  setTimeout(function () {
    targets.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }, 2000);
})();

/* ==========================================================
   オープニング演出(スクロール連動)
   頭のフタが開いて、動画や言葉が飛び出す
   ========================================================== */
(function () {
  const intro = document.getElementById("intro");
  const stage = document.getElementById("intro-stage");
  const burst = document.getElementById("burst");
  if (!intro || !stage || !burst) return;
  // 開発確認用: ?nointro=1 でオープニングを外して本文だけ表示
  if (new URLSearchParams(location.search).has("nointro")) {
    intro.remove();
    return;
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  if (reduce || !hasGsap) {
    intro.classList.add("is-static");
    return;
  }

  intro.classList.add("is-animated");
  gsap.registerPlugin(ScrollTrigger);

  // ---- 飛び出す要素を作る ----
  function toId(v) {
    const m =
      v.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
      v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
      v.match(/^([A-Za-z0-9_-]{11})$/);
    return m ? m[1] : "";
  }
  const ids = (typeof VIDEOS !== "undefined" ? VIDEOS : []).map(toId).filter(Boolean).slice(0, 9);

  // 位置は舞台の中心からの % (x: 幅, y: 高さ)
  const thumbTargets = [
    [-40, -34], [40, -32], [-46, 6], [46, 4], [-32, 38], [32, 36], [0, -44], [-16, 46], [18, 44],
  ];
  const words = ["カット", "テロップ", "効果音", "BGM", "サムネ", "企画", "ネタ", "テンポ", "ワクワク", "神編集"];
  const wordTargets = [
    [-24, -20], [24, -24], [-30, 20], [28, 20], [8, -38], [-8, 34], [38, -10], [-38, -8], [12, 22], [-14, -36],
  ];
  const shapeTargets = [
    [-18, -30], [20, -14], [-34, 30], [34, 26], [4, -28], [-6, 44], [44, -22], [-44, 18], [26, 40], [-26, -40], [0, 30], [40, 14],
  ];

  const items = [];

  ids.forEach(function (id, i) {
    const t = thumbTargets[i % thumbTargets.length];
    const el = document.createElement("div");
    el.className = "burst-item burst-thumb";
    el.innerHTML = '<img src="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg" alt="" loading="eager" decoding="async" />';
    burst.appendChild(el);
    items.push({ el: el, tx: t[0], ty: t[1], rot: (i % 2 ? 1 : -1) * (6 + (i * 5) % 14), scale: 1, order: i * 0.045 + 0.02 });
  });

  words.forEach(function (w, i) {
    const t = wordTargets[i % wordTargets.length];
    const el = document.createElement("div");
    el.className = "burst-item burst-word" + (i % 3 === 1 ? " white" : "");
    el.textContent = w;
    el.style.fontSize = "clamp(" + (18 + (i % 3) * 6) + "px, " + (3.2 + (i % 4) * 0.8) + "vw, " + (40 + (i % 3) * 10) + "px)";
    burst.appendChild(el);
    items.push({ el: el, tx: t[0], ty: t[1], rot: (i % 2 ? -1 : 1) * (4 + (i * 7) % 18), scale: 1, order: i * 0.04 + 0.01 });
  });

  shapeTargets.forEach(function (t, i) {
    const el = document.createElement("div");
    el.className = "burst-item " + ["burst-dot", "burst-ring", "burst-bar"][i % 3];
    burst.appendChild(el);
    items.push({ el: el, tx: t[0], ty: t[1], rot: (i * 37) % 180, scale: 0.8 + (i % 3) * 0.3, order: i * 0.03 });
  });

  const figure = document.getElementById("intro-figure");
  const lid = intro.querySelector(".me-lid");
  const closed = intro.querySelector(".me-closed");
  const opened = intro.querySelector(".me-open");
  const inner = intro.querySelector(".head-inner");
  const copy = document.getElementById("intro-copy");
  const finalBlock = document.getElementById("intro-final");
  const hint = document.getElementById("scroll-hint");
  const glow = intro.querySelector(".intro-glow");

  // 初期状態(中央配置は GSAP 側で管理する)
  gsap.set(figure, { xPercent: -50, yPercent: 0 });
  gsap.set(opened, { opacity: 0, clipPath: "inset(28.5% 0 0 0)" }); // フタが上がるまで中身は隠す
  gsap.set(lid, { opacity: 0 }); // 最初は1枚の写真だけを見せる(フタは動く瞬間に出す)
  gsap.set(finalBlock, { autoAlpha: 0, y: 40 });
  gsap.set(items.map(function (i) { return i.el; }), { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0, opacity: 0, rotation: 0 });

  // ---- タイムライン(スクロールに完全連動) ----
  // 開発確認用: ?p=0.5 のように指定すると、その進行度で静止表示する
  const debugP = new URLSearchParams(location.search).get("p");
  if (debugP !== null) document.documentElement.style.scrollBehavior = "auto";
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    paused: debugP !== null,
    scrollTrigger:
      debugP !== null
        ? undefined
        : {
            trigger: intro,
            start: "top top",
            end: "+=130%",
            pin: true,
            scrub: 0.7,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
  });

  // 0.00-0.10: 名前とヒントが消え、少し寄る
  tl.to([copy, hint], { autoAlpha: 0, y: -16, duration: 0.08 }, 0);
  tl.to(figure, { scale: 1.05, yPercent: 2, duration: 0.25, ease: "power1.inOut" }, 0);

  // 0.06: フタを出すのと同時に写真を「開いた状態」へ切り替える(見た目は変わらない)
  tl.set(lid, { opacity: 1 }, 0.06);
  tl.to(closed, { opacity: 0, duration: 0.03 }, 0.06);
  tl.to(opened, { opacity: 1, duration: 0.03 }, 0.06);

  // 0.07-0.32: 髪のフタが「ぱかっ」と外れて上へ飛ぶ
  tl.to(lid, { y: "-3%", rotation: -2, duration: 0.04, ease: "power2.out" }, 0.07);
  tl.to(lid, { y: "-34%", rotateX: -30, rotation: -10, duration: 0.1, ease: "power3.out" }, 0.11);
  tl.to(opened, { clipPath: "inset(0% 0 0 0)", duration: 0.1, ease: "power2.out" }, 0.11);
  tl.to(lid, { y: "-130%", rotateX: -60, rotation: -18, autoAlpha: 0, duration: 0.16, ease: "power2.in" }, 0.2);
  tl.to(inner, { opacity: 0.7, scaleX: 1, scaleY: 1.3, duration: 0.08, ease: "power2.out" }, 0.08);
  tl.to(inner, { opacity: 0, scaleY: 0.6, duration: 0.1, ease: "power1.in" }, 0.2);
  tl.to(glow, { scale: 1.5, opacity: 1.2, duration: 0.4, ease: "power1.out" }, 0.1);

  // 0.14-0.55: 中身が「どばっ」と飛び出す
  items.forEach(function (it) {
    tl.to(
      it.el,
      {
        x: function () { return (stage.clientWidth * it.tx) / 100; },
        y: function () { return (stage.clientHeight * it.ty) / 100; },
        rotation: it.rot,
        scale: it.scale,
        opacity: 1,
        duration: 0.26,
        ease: "power3.out",
      },
      0.14 + it.order * 0.7
    );
  });

  // 0.52-0.70: 主役が引いて、飛び出したものは奥へ
  tl.to(figure, { scale: 0.92, yPercent: 8, autoAlpha: 0.16, duration: 0.18, ease: "power2.inOut" }, 0.52);
  items.forEach(function (it) {
    tl.to(
      it.el,
      {
        x: function () { return (stage.clientWidth * it.tx * 1.25) / 100; },
        y: function () { return (stage.clientHeight * it.ty * 1.25) / 100; },
        opacity: 0.2,
        scale: it.scale * 0.9,
        duration: 0.22,
        ease: "power1.inOut",
      },
      0.54
    );
  });

  // 0.64-0.86: 見出しが浮かび上がる
  tl.to(finalBlock, { autoAlpha: 1, y: 0, duration: 0.18, ease: "power2.out" }, 0.64);
  tl.to({}, { duration: 0.14 }); // 読める余韻

  // 画像読み込み後に位置を再計算
  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
    if (debugP !== null) tl.progress(parseFloat(debugP) || 0);
  });
})();
