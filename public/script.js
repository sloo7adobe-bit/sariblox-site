/* ==========================================================
   管理画面で保存した内容の読み込み(無ければ初期値のまま)
   ========================================================== */
// 再読み込みしたときに途中位置から始まらないように、必ず一番上から
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
if (!location.hash && !location.search) window.scrollTo(0, 0);

const CONTENT_READY = (function () {
  const timeout = new Promise(function (r) { setTimeout(function () { r(null); }, 900); });
  const req = fetch("/api/content", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (j) { return j && j.ok ? j.content : null; })
    .catch(function () { return null; });
  return Promise.race([req, timeout]).then(function (c) {
    window.SITE_CONTENT = c || null;
    return c || null;
  });
})();

// ループ動画(編集の見本)の一覧。無ければ空
const LOOPS_READY = (function () {
  const timeout = new Promise(function (r) { setTimeout(function () { r([]); }, 900); });
  const req = fetch("loops/manifest.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) { return m && m.clips ? m.clips : []; })
    .catch(function () { return []; });
  return Promise.race([req, timeout]);
})();

function esc(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ==========================================================
   応募フォーム(モーダル)
   送信内容は /api/apply 経由で Discord に届く
   ========================================================== */
(function () {
  const modal = document.getElementById("apply-modal");
  const form = document.getElementById("apply-form");
  const done = document.getElementById("apply-done");
  if (!modal || !form) return;

  const nameEl = document.getElementById("f-name");
  const discordEl = document.getElementById("f-discord");
  const videoEl = document.getElementById("f-video");
  const videoAdd = document.getElementById("f-video-add");
  const videoErr = document.getElementById("f-video-error");
  const videoList = document.getElementById("f-video-list");
  const reasonEl = document.getElementById("f-reason");
  const formErr = document.getElementById("f-form-error");
  const submitBtn = document.getElementById("f-submit");

  const videos = []; // { id, title }
  let lastFocus = null;

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toId(v) {
    v = String(v || "").trim();
    const m =
      v.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
      v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
      v.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/) ||
      v.match(/^([A-Za-z0-9_-]{11})$/);
    return m ? m[1] : "";
  }

  // ---- 応募済みチェック(1人1回) ----
  const LS_KEY = "sb_applied";
  function markApplied() {
    try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (e) {}
    form.hidden = true;
    done.hidden = false;
  }
  function isAppliedLocal() {
    try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; }
  }
  if (isAppliedLocal()) {
    form.hidden = true;
    done.hidden = false;
  } else {
    fetch("/api/applied", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.applied) markApplied(); })
      .catch(function () {});
  }

  // ---- 開閉 ----
  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(function () {
      modal.classList.add("is-open");
      (form.hidden ? modal.querySelector("[data-close]") : nameEl).focus();
    });
  }
  function closeModal() {
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    setTimeout(function () {
      modal.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 220);
  }
  document.querySelectorAll(".js-open-apply").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      openModal();
    });
  });
  modal.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });
  // 開発確認用: ?apply=1 でフォームを開いた状態にする(&demo=1 で見本の動画を追加)
  const dbg = new URLSearchParams(location.search);
  if (dbg.has("apply")) {
    window.addEventListener("load", function () {
      openModal();
      if (dbg.has("demo")) {
        nameEl.value = "たろう";
        discordEl.value = "taro_edit";
        videoEl.value = "https://youtu.be/IbyUW3-2kks";
        addVideo();
        reasonEl.value = "サリーぶろっくすの動画をよく見ています。テンポの良いカット編集が得意です。";
      }
    });
  }

  // ---- 動画の追加 ----
  function showVideoError(msg) {
    videoErr.textContent = msg;
    videoErr.hidden = !msg;
  }

  function renderVideos() {
    videoList.innerHTML = videos
      .map(function (v, i) {
        return (
          '<li class="video-card" data-id="' + v.id + '">' +
          '<img class="video-card-thumb" src="https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg" alt="" loading="lazy" />' +
          '<div class="video-card-body">' +
          '<div class="video-card-title">' + (v.title ? esc(v.title) : "タイトルを読み込み中…") + "</div>" +
          '<div class="video-card-meta">' + (v.author ? esc(v.author) : "YouTube") + "</div>" +
          "</div>" +
          '<button type="button" class="video-card-remove" data-remove="' + i + '" aria-label="この動画を削除">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
          "</button>" +
          "</li>"
        );
      })
      .join("");
  }

  function addVideo() {
    const raw = videoEl.value;
    const id = toId(raw);
    if (!raw.trim()) return;
    if (!id) {
      showVideoError("YouTube の動画 URL を貼ってください(例: https://youtu.be/xxxxxxxxxxx)");
      return;
    }
    if (videos.some(function (v) { return v.id === id; })) {
      showVideoError("この動画はもう追加されています。");
      return;
    }
    if (videos.length >= 10) {
      showVideoError("追加できるのは 10 本までです。");
      return;
    }
    showVideoError("");
    const entry = { id: id, title: "", author: "" };
    videos.push(entry);
    renderVideos();
    videoEl.value = "";
    videoEl.focus();

    fetch("/api/video?id=" + id)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          entry.title = j.title || "動画";
          entry.author = j.author || "";
        } else {
          entry.title = "動画(タイトル取得できず)";
        }
        renderVideos();
      })
      .catch(function () {
        entry.title = "動画";
        renderVideos();
      });
  }

  videoAdd.addEventListener("click", addVideo);
  videoEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addVideo();
    }
  });
  // 貼り付けたら自動で追加
  videoEl.addEventListener("paste", function () {
    setTimeout(addVideo, 0);
  });
  videoList.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    videos.splice(parseInt(btn.getAttribute("data-remove"), 10), 1);
    renderVideos();
  });

  // ---- 送信 ----
  function setError(msg) {
    formErr.textContent = msg;
    formErr.hidden = !msg;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    setError("");
    const name = nameEl.value.trim();
    const discord = discordEl.value.trim().replace(/^@/, "");
    const reason = reasonEl.value.trim();

    if (!name) { setError("名前を入れてください。"); nameEl.focus(); return; }
    if (!discord) { setError("Discord のユーザー名を入れてください。"); discordEl.focus(); return; }
    if (videos.length === 0) { setError("自分が編集した動画を 1 本以上追加してください。"); videoEl.focus(); return; }
    if (reason.length < 5) { setError("応募した理由をもう少し書いてください。"); reasonEl.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "送信中…";

    fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: name,
        discord: discord,
        reason: reason,
        videos: videos.map(function (v) { return { id: v.id, title: v.title }; }),
        website: form.elements.website ? form.elements.website.value : "",
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.body && res.body.ok) {
          markApplied();
          done.querySelector("[data-close]").focus();
        } else if (res.body && res.body.duplicate) {
          markApplied();
          done.querySelector(".modal-lead").textContent = "この Discord ユーザー名(またはこの回線)からの応募はすでに受け付けています。応募は1人1回までです。";
          done.querySelector("[data-close]").focus();
        } else {
          setError((res.body && res.body.error) || "送信に失敗しました。時間をおいてもう一度お試しください。");
        }
      })
      .catch(function () {
        setError("通信に失敗しました。電波のいいところでもう一度お試しください。");
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "この内容で応募する";
      });
  });
})();

/* ==========================================================
   オープニングで飛び出すサムネイル用の動画(ループ動画が無いときに使う)
   ========================================================== */
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

/* ==========================================================
   フッターの SNS リンクとメール
   URL を入れたものだけ表示されます(空欄は非表示)
   ========================================================== */
const SOCIAL = {
  youtube: "https://www.youtube.com/@サリーぶろっくす",
  tiktok: "https://www.tiktok.com/@sariblox6767",
  x: "https://x.com/YTsarii",
  discord: "https://discord.gg/sari",
  email: "",
};

CONTENT_READY.then(function (content) {
  const ul = document.getElementById("social-links");
  if (!ul) return;
  const SOC = content && content.social ? content.social : SOCIAL;
  const icons = {
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21.5l-7.5 8.57L22.8 22h-6.9l-5.4-7.06L4.3 22H1.04l8.02-9.17L1.2 2h7.08l4.88 6.45L18.244 2zm-1.21 18h1.8L7.05 3.9H5.12L17.03 20z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.5 1.5 15 15 0 0 0-15.4 0A18 18 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.5C.6 9.1-.2 13.7.2 18.2a20 20 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.3 14.3 0 0 0 12 0l.5.4-2 1 1.3 2a20 20 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.8zM8.7 15.4c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s1-2.4 2.1-2.4 2.2 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/></svg>',
  };
  const labels = { youtube: "YouTube", tiktok: "TikTok", x: "X", discord: "Discord" };
  ul.innerHTML = ["youtube", "tiktok", "x", "discord"]
    .filter(function (k) { return SOC[k]; })
    .map(function (k) {
      return '<li><a class="social-btn" href="' + esc(SOC[k]) + '" target="_blank" rel="noopener noreferrer" aria-label="' + labels[k] + '">' + icons[k] + "</a></li>";
    })
    .join("");
  const mail = document.getElementById("footer-mail");
  if (mail && SOC.email) {
    mail.href = "mailto:" + SOC.email;
    document.getElementById("footer-mail-text").textContent = SOC.email;
    mail.hidden = false;
  }
});

/* ==========================================================
   公認切り抜きチャンネル
   name: 表示名 / url: チャンネル URL / icon: アイコン画像
   ========================================================== */
const CLIPS = [
  { name: "サリー界隈TV", url: "https://www.youtube.com/@%E3%82%B5%E3%83%AA%E3%83%BC%E7%95%8C%E9%9A%88TV", icon: "clips/clip-1.jpg" },
  { name: "YTジュニア", url: "https://www.youtube.com/@SariClipss", icon: "clips/clip-2.jpg" },
];

CONTENT_READY.then(function (content) {
  const ul = document.getElementById("clip-list");
  if (!ul) return;
  const CLIP_LIST = content && content.clips && content.clips.length ? content.clips : CLIPS;
  const yt = '<svg viewBox="0 0 24 17" fill="#fff" aria-hidden="true"><path d="M9.5 12.5v-8l7 4-7 4z"/></svg>';
  ul.innerHTML = CLIP_LIST.filter(function (c) { return c.url; })
    .map(function (c) {
      return (
        '<li><a class="clip" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="clip-avatar"><img src="' + esc(c.icon) + '" alt="" width="120" height="120" loading="lazy" />' +
        '<span class="yt-badge" aria-hidden="true">' + yt + "</span></span>" +
        '<span class="clip-name">' + esc(c.name) + "</span>" +
        "</a></li>"
      );
    })
    .join("");
});

/* ---------- アクセス数の記録(/count で確認できる) ---------- */
(function () {
  if (navigator.webdriver) return;
  const q = new URLSearchParams(location.search);
  if (q.has("p") || q.has("nointro") || q.has("apply") || q.has("scroll") || q.has("go")) return; // 確認用の表示は数えない
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/hit", new Blob([""], { type: "text/plain" }));
    } else {
      fetch("/api/hit", { method: "POST", keepalive: true }).catch(function () {});
    }
  } catch (e) {}
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
Promise.all([CONTENT_READY, LOOPS_READY]).then(function (res) {
  const content = res[0];
  const clips = res[1] || [];
  const intro = document.getElementById("intro");
  const stage = document.getElementById("intro-stage");
  const burst = document.getElementById("burst");
  if (!intro || !stage || !burst) return;
  const VIDEO_LIST = content && content.videos && content.videos.length ? content.videos : VIDEOS;
  // 開発確認用: ?nointro=1 でオープニングを外して本文だけ表示
  if (new URLSearchParams(location.search).has("nointro")) {
    intro.remove();
    return;
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  const animated = !reduce && hasGsap;

  // ---- ループ動画の見せ方 ----
  //  広い画面: 最後の画面のまわりに、頭から飛び出した動画がぐるっと並ぶ(ring)
  //  狭い画面: 見出しの上を、動画の列が左右にゆっくり流れる(marquee)
  const ringMode = animated && clips.length > 0 && window.matchMedia("(min-width: 1200px)").matches;
  const marqueeMode = clips.length > 0 && !ringMode;

  const clipTiles = []; // { el, v, inView }
  let clipsActive = false;
  function makeClipVideo(c) {
    const v = document.createElement("video");
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    v.preload = "none";
    v.disablePictureInPicture = true;
    if (c.poster) v.poster = c.poster;
    v.src = c.src;
    return v;
  }
  function syncClips() {
    clipTiles.forEach(function (c) {
      const want = clipsActive && c.inView;
      if (want && c.v.paused) c.v.play().catch(function () {});
      else if (!want && !c.v.paused) c.v.pause();
    });
  }
  const clipIO =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              const c = clipTiles.find(function (x) { return x.el === e.target; });
              if (c) c.inView = e.isIntersecting;
            });
            syncClips();
          },
          { threshold: 0.05 }
        )
      : null;
  function registerClip(el, v) {
    const c = { el: el, v: v, inView: !clipIO };
    clipTiles.push(c);
    if (clipIO) clipIO.observe(el);
  }

  if (marqueeMode) {
    const box = document.getElementById("clip-marquee");
    if (box) {
      intro.classList.add("has-marquee");
      const rows = stage.clientHeight >= 720 && clips.length >= 6 ? 2 : 1; // 画面が低いときは 1 列にして、カードがはみ出さないようにする
      const per = Math.ceil(clips.length / rows);
      for (let r = 0; r < rows; r++) {
        const row = document.createElement("div");
        row.className = "marquee-row";
        const track = document.createElement("div");
        track.className = "marquee-track" + (r % 2 ? " is-reverse" : "");
        const part = clips.slice(r * per, (r + 1) * per);
        track.style.animationDuration = Math.max(18, part.length * 4.5) + "s";
        part.forEach(function (c) {
          const tile = document.createElement("div");
          tile.className = "marquee-tile";
          const v = makeClipVideo(c);
          tile.appendChild(v);
          track.appendChild(tile);
          registerClip(tile, v);
        });
        row.appendChild(track);
        box.appendChild(row);
      }
    }
  }

  if (!animated) {
    intro.classList.add("is-static");
    document.querySelectorAll(".js-scroll-intro").forEach(function (b) { b.classList.add("js-open-apply"); });
    clipsActive = !reduce; // 動きを減らす設定の人には自動再生しない
    syncClips();
    return;
  }

  intro.classList.add("is-animated");
  if (ringMode) intro.classList.add("has-ring");
  gsap.registerPlugin(ScrollTrigger);

  // ---- 飛び出す要素を作る ----
  function toId(v) {
    const m =
      v.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
      v.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
      v.match(/^([A-Za-z0-9_-]{11})$/);
    return m ? m[1] : "";
  }
  const ids = VIDEO_LIST.map(toId).filter(Boolean).slice(0, 9);

  // 位置は頭の位置(舞台の上から 30%)からの % (x: 幅, y: 高さ)
  const thumbTargets = [
    [-40, -34], [40, -32], [-46, 6], [46, 4], [-32, 38], [32, 36], [0, -44], [-16, 46], [18, 44],
  ];
  const words = ["カット", "テロップ", "効果音", "BGM", "サムネ", "企画", "ネタ", "テンポ", "ワクワク", "神編集"];
  const wordTargets = [
    [-24, -20], [24, -24], [-30, 20], [28, 20], [8, -38], [-8, 34], [38, -10], [-38, -8], [12, 22], [-14, -36],
  ];
  const shapeTargets = [
    [-18, -30], [20, -14], [-34, 30], [34, 26], [4, -28], [-30, 44], [44, -22], [-44, 18], [30, 42], [-26, -40], [40, 14],
  ];

  // ループ動画を、中央の見出しとカードを囲むように並べる位置(舞台の中心からの %)
  function ringLayout(n) {
    const sideEach = n >= 16 ? 3 : n >= 8 ? 2 : n >= 5 ? 1 : 0;
    const rest = n - sideEach * 2;
    const top = Math.ceil(rest / 2);
    const bottom = rest - top;
    const pos = [];
    // arc: 中央に近いほど外側(上の段は上、下の段は下)へ少しふくらませて、見出しやカードから離す
    function row(count, y, arc) {
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0 : -40 + (80 * i) / (count - 1);
        pos.push([x, y + arc * (1 - Math.abs(x) / 40) + (i % 2 ? 0.8 : -0.8)]);
      }
    }
    row(top, -37, -3);
    const sideY = sideEach === 3 ? [-17, 3.5, 24] : sideEach === 2 ? [-12, 13] : [1];
    for (let i = 0; i < sideEach; i++) {
      pos.push([-42, sideY[i]]);
      pos.push([42, sideY[i] + 1.5]);
    }
    row(bottom, 39, 1);
    return { pos: pos, maxRow: Math.max(top, bottom, 1) };
  }

  const items = [];

  if (ringMode) {
    const layout = ringLayout(clips.length);
    const setClipW = function () {
      const w = stage.clientWidth;
      // 本数が少ないときは 1 枚を大きめに
      const frac = clips.length <= 12 ? 0.13 : 0.115;
      const size = Math.min(Math.max(w * frac, 120), 230, (w * 0.86) / layout.maxRow - 16);
      burst.style.setProperty("--clip-w", Math.round(size) + "px");
    };
    setClipW();
    window.addEventListener("resize", setClipW);
    clips.forEach(function (c, i) {
      const t = layout.pos[i];
      const el = document.createElement("div");
      el.className = "burst-item burst-clip";
      const v = makeClipVideo(c);
      el.appendChild(v);
      burst.appendChild(el);
      registerClip(el, v);
      // 舞台の中心基準 → 頭の位置(上から 30%)基準に直すため y に 20 を足す
      items.push({ el: el, tx: t[0], ty: t[1] + 20, rot: (i % 2 ? 1 : -1) * (2 + ((i * 5) % 5)), scale: 1, order: (i % 9) * 0.035 + 0.02, keep: true });
    });
  } else {
    // ループ動画があるときは、その 1 コマ目を飛び出すサムネイルに使う。無ければ YouTube のサムネイル
    const thumbs = clips.length
      ? clips.slice(0, 9).map(function (c) { return c.poster; }).filter(Boolean)
      : ids.map(function (id) { return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"; });
    thumbs.forEach(function (src, i) {
      const t = thumbTargets[i % thumbTargets.length];
      const el = document.createElement("div");
      el.className = "burst-item burst-thumb";
      el.innerHTML = '<img src="' + esc(src) + '" alt="" loading="eager" decoding="async" />';
      burst.appendChild(el);
      items.push({ el: el, tx: t[0], ty: t[1], rot: (i % 2 ? 1 : -1) * (6 + (i * 5) % 14), scale: 1, order: i * 0.045 + 0.02 });
    });
  }

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
  gsap.set(figure, { xPercent: -50, x: 0, yPercent: 0, y: 0 });
  gsap.set([copy, hint], { xPercent: -50, x: 0, y: 0 });
  gsap.set(inner, { xPercent: -50, yPercent: -50, x: 0, y: 0, scaleX: 0.2, scaleY: 1, autoAlpha: 0 }); // 中央ぞろえは GSAP 側で管理(iPhone でずれるのを防ぐ)
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
            start: "top 64px", // 固定ヘッダーの下に貼り付ける(頭が隠れないように)
            end: "+=130%",
            pin: true,
            scrub: 0.7,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            // 一番上まで戻ったら、途中の状態が残らないように必ず最初の状態にする
            onLeaveBack: function (self) {
              const t = self.getTween && self.getTween();
              if (t) t.progress(1); // 追従アニメを最後まで進めて、確実に最初の状態にする
              else tl.progress(0);
            },
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
  tl.fromTo(
    inner,
    { autoAlpha: 0, scaleX: 0.2, scaleY: 1 },
    { autoAlpha: 0.7, scaleX: 1, scaleY: 1.3, duration: 0.08, ease: "power2.out", immediateRender: false },
    0.08
  );
  tl.to(inner, { autoAlpha: 0, scaleY: 0.6, duration: 0.1, ease: "power1.in" }, 0.2);
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
    if (it.keep) return; // ループ動画は見出しのまわりに残す
    tl.to(
      it.el,
      {
        x: function () { return (stage.clientWidth * it.tx * 1.25) / 100; },
        y: function () { return (stage.clientHeight * it.ty * 1.25) / 100; },
        opacity: ringMode ? 0 : 0.2, // 動画が並ぶときは、言葉や飾りは消して画面をすっきりさせる
        scale: it.scale * 0.9,
        duration: 0.22,
        ease: "power1.inOut",
      },
      0.54
    );
  });

  // ループ動画が並ぶときは、雲の飾りを消して動画とかぶらないようにする
  if (clips.length) {
    tl.to(intro.querySelectorAll(".cloud-deco"), { autoAlpha: 0, duration: 0.12 }, ringMode ? 0.16 : 0.6);
  }

  // 0.64-0.86: 見出しが浮かび上がる
  tl.to(finalBlock, { autoAlpha: 1, y: 0, duration: 0.18, ease: "power2.out" }, 0.64);
  tl.to({}, { duration: 0.14 }); // 読める余韻

  // ループ動画は、画面に出ている間だけ再生する
  if (clipTiles.length) {
    const activeAt = ringMode ? 0.14 : 0.62;
    gsap.ticker.add(function () {
      const a = tl.progress() >= activeAt;
      if (a !== clipsActive) {
        clipsActive = a;
        syncClips();
      }
    });
  }

  // 最初の画面の「応募する」: 演出を最後まで再生しながら下へスクロールする
  function scrollToIntroEnd() {
    const st = tl.scrollTrigger;
    if (!st) return;
    const from = window.scrollY;
    const to = st.end;
    if (to - from <= 0) return;
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto"; // CSS の smooth scroll と干渉しないように一時的に切る
    const pos = { y: from };
    gsap.to(pos, {
      y: to,
      duration: 1.7,
      ease: "power2.inOut",
      onUpdate: function () {
        window.scrollTo({ top: pos.y, left: 0, behavior: "instant" });
      },
      onComplete: function () {
        root.style.scrollBehavior = prevBehavior;
      },
    });
  }
  document.querySelectorAll(".js-scroll-intro").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      scrollToIntroEnd();
    });
  });
  // 開発確認用: ?go=1 で読み込み後にボタンを押したのと同じ動きをする
  if (new URLSearchParams(location.search).has("go")) {
    window.addEventListener("load", function () {
      setTimeout(function () { ScrollTrigger.refresh(); scrollToIntroEnd(); }, 600);
    });
  }

  // 画像読み込み後に位置を再計算(すでに読み込み済みなら今すぐ)
  function afterLoad(fn) {
    if (document.readyState === "complete") setTimeout(fn, 0);
    else window.addEventListener("load", fn);
  }
  afterLoad(function () {
    ScrollTrigger.refresh();
    if (window.scrollY <= 1 && tl.scrollTrigger) {
      const t = tl.scrollTrigger.getTween && tl.scrollTrigger.getTween();
      if (t) t.progress(1);
    }
    if (debugP !== null) tl.progress(parseFloat(debugP) || 0);
    // 開発確認用: ?scroll=400 で読み込み後にその位置へ移動
    const sc = new URLSearchParams(location.search).get("scroll");
    if (sc !== null) setTimeout(function () { window.scrollTo({ top: parseInt(sc, 10) || 0, behavior: "instant" }); }, 400);
  });
});


/* ==========================================================
   見出し・カード・募集状態の反映(管理画面で保存した内容)
   ========================================================== */
CONTENT_READY.then(function (content) {
  if (!content) return;
  // 見出し
  if (content.headline && content.headline.some(Boolean)) {
    const spans = document.querySelectorAll(".hero-title .hero-title-line");
    content.headline.forEach(function (t, i) {
      if (spans[i] && t) spans[i].textContent = t;
    });
  }
  // カード
  if (content.cards && content.cards.length) {
    const html = content.cards
      .filter(function (c) { return c && (c.label || (c.lines && c.lines.length)); })
      .map(function (c) {
        return (
          '<div class="job-item"><h3 class="job-label">' + esc(c.label) + "</h3>" +
          '<div class="job-card"><ul class="list">' +
          (c.lines || []).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") +
          "</ul></div></div>"
        );
      })
      .join("");
    document.querySelectorAll(".job-grid").forEach(function (g) { g.innerHTML = html; });
  }
  // 募集終了
  if (content.recruiting === false) {
    document.body.classList.add("is-closed");
    document.querySelectorAll(".js-open-apply, .js-scroll-intro").forEach(function (b) {
      b.textContent = "募集は終了しました";
      b.classList.add("is-disabled");
      b.setAttribute("aria-disabled", "true");
    });
    const form = document.getElementById("apply-form");
    const done = document.getElementById("apply-done");
    if (form && done) {
      form.hidden = true;
      done.hidden = false;
      done.querySelector(".modal-title").textContent = "募集は終了しました";
      done.querySelector(".modal-lead").textContent = "たくさんのご応募ありがとうございました。次回の募集はサリーの配信や SNS でお知らせします。";
    }
  }
});

/* ==========================================================
   管理者モード(ログイン中だけ): ハンマーカーソルとバッジ
   ========================================================== */
(function () {
  const isAdmin = document.cookie.split(";").some(function (c) { return c.trim().indexOf("sb_admin=1") === 0; });
  if (!isAdmin) return;
  document.body.classList.add("is-admin");
  const badge = document.createElement("div");
  badge.className = "admin-badge";
  badge.innerHTML =
    '<span class="admin-badge-icon" aria-hidden="true">🔨</span>' +
    '<span class="admin-badge-text">管理者モード</span>' +
    '<a href="/applicants">応募者</a><a href="/admin">編集</a><a href="/count">アクセス数</a>' +
    '<button type="button" id="admin-logout">ログアウト</button>';
  document.body.appendChild(badge);
  document.getElementById("admin-logout").addEventListener("click", function () {
    fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) })
      .then(function () { location.reload(); });
  });
  // クリックでハンマーが振り下ろされる演出
  document.addEventListener("pointerdown", function (e) {
    const fx = document.createElement("span");
    fx.className = "admin-hit";
    fx.style.left = e.clientX + "px";
    fx.style.top = e.clientY + "px";
    fx.textContent = "💥";
    document.body.appendChild(fx);
    setTimeout(function () { fx.remove(); }, 500);
  });
})();
