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
//  LOOPS_READY: 最初の表示を待たせないよう 0.9 秒で見切る / LOOPS_REQ: 遅れて届いた一覧も使えるように残しておく
const LOOPS_REQ = fetch("loops/manifest.json", { cache: "no-cache" })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (m) { return m && m.clips ? m.clips : []; })
  .catch(function () { return []; });
const LOOPS_READY = Promise.race([
  LOOPS_REQ,
  new Promise(function (r) { setTimeout(function () { r([]); }, 900); }),
]);

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
  // 管理画面で「表示する」にしたときだけ出す(初期状態は非表示)
  if (!content || content.showClips !== true) return;
  const section = document.getElementById("clips");
  const navLink = document.getElementById("nav-clips");
  if (section) section.hidden = false;
  if (navLink) navLink.hidden = false;
  document.body.classList.add("has-clips");
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
   → 最後の画面: 空に見出しとボタン、丘の上にテレビ 1 台と立て看板
   ========================================================== */
Promise.all([CONTENT_READY, LOOPS_READY]).then(function (res) {
  const content = res[0];
  const clips = res[1] || [];
  const intro = document.getElementById("intro");
  const stage = document.getElementById("intro-stage");
  const burst = document.getElementById("burst");
  if (!intro || !stage || !burst) return;
  const VIDEO_LIST = content && content.videos && content.videos.length ? content.videos : VIDEOS;
  const qs = new URLSearchParams(location.search);
  // 開発確認用: ?nointro=1 でオープニングを外して本文だけ表示
  if (qs.has("nointro")) {
    intro.remove();
    return;
  }

  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = reduceMQ.matches;
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  const animated = !reduce && hasGsap;

  // ---- 編集サンプル: 丘の上のテレビ 1 台 + 静止サムネイルの棚 ----
  //  位置が動くものは 1 つも無い。再生するのは常に 1 本だけ(テレビの中)。
  const AUTO_ADVANCE = true; // false にすると 1 本目がループするだけ(ほかはサムネイルで選ぶ)
  const CLIP_TAG = (content && content.clipTag) || "こんな編集がほしい!";
  const fin = document.getElementById("intro-final");
  const titleEl = fin.querySelector(".hero-title");
  const actionsEl = fin.querySelector(".hero-actions");
  const scene = document.getElementById("scene");
  const board = fin.querySelector(".job-grid");
  const unit = document.getElementById("clip-parade");
  const reel = document.getElementById("clip-reel");
  const grass = intro.querySelector(".grass-strip");
  const sideMQ = window.matchMedia("(min-width: 960px) and (min-aspect-ratio: 5/4)");
  const fineMQ = window.matchMedia("(hover: hover) and (pointer: fine)");

  const show = {
    clips: [], index: 0,
    auto: AUTO_ADVANCE && !reduce, // 自動で次の見本へ進むか(一度でも操作されたら、その訪問中はずっと止める)
    userPaused: false,             // 一時停止ボタンで止めている
    needTap: reduce,               // 動きを減らす設定: 押されるまで再生しない
    blocked: false,                // 端末に自動再生を断られた(省電力モードなど)
    finalOn: false, inView: true, held: false,
    loops: 0, need: 1, last: 0,
  };
  let tv = null, posterEl = null, videoEl = null, toggleBtn = null, countEl = null, thumbs = [], warm = null, tvIO = null;

  function autoOK() { return show.auto && show.clips.length > 1; }
  function applyLoop() {
    // 決めた回数ぶんループしたら loop を外す → 最後まで再生すると ended が来て、次の見本へパッと切り替わる
    if (videoEl) videoEl.loop = !(autoOK() && show.loops >= show.need - 1);
  }
  function render() {
    if (!tv) return;
    const stopped = show.userPaused || show.needTap || show.blocked;
    tv.classList.toggle("is-paused", stopped);
    toggleBtn.setAttribute("aria-label", stopped ? "再生" : "一時停止");
  }
  function sync() {
    if (!videoEl) return;
    const want = show.finalOn && show.inView && !document.hidden && !show.userPaused && !show.needTap;
    if (want && videoEl.paused) {
      const p = videoEl.play();
      if (p && p.catch) p.catch(function () { if (videoEl.paused && show.finalOn && !document.hidden) { show.blocked = true; render(); } });
    } else if (!want && !videoEl.paused) {
      videoEl.pause();
    }
    render();
  }
  function warmNext() {
    // 次の 1 本だけ先に読み込んでおく(通信量を節約する設定のときはやらない)
    if (!autoOK()) return;
    const conn = navigator.connection;
    if (conn && conn.saveData) return;
    const nx = show.clips[(show.index + 1) % show.clips.length];
    if (warm && warm.getAttribute("src") === nx.src) return;
    warm = document.createElement("video");
    warm.muted = true;
    warm.preload = "auto";
    warm.src = nx.src;
  }
  function select(i, byUser) {
    const n = show.clips.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    show.index = i;
    show.loops = 0;
    show.last = 0;
    show.need = 1;
    show.blocked = false;
    if (byUser) { show.auto = false; show.userPaused = false; show.needTap = false; }
    const c = show.clips[i];
    tv.classList.remove("has-frame");
    if (c.poster) posterEl.src = c.poster; else posterEl.removeAttribute("src");
    videoEl.loop = true;
    videoEl.src = c.src; // preload="none" なので、再生するまで読み込まれない
    thumbs.forEach(function (t, k) {
      if (k === i) t.setAttribute("aria-current", "true");
      else t.removeAttribute("aria-current");
    });
    countEl.textContent = i + 1 + " / " + n;
    // 選ばれたサムネイルが棚の見えている範囲の外なら、棚の位置をパッと合わせる(なめらかには動かさない)
    const t = thumbs[i];
    if (t && reel.scrollWidth > reel.clientWidth + 1) {
      const l = t.offsetLeft; // .reel は position: relative なので、棚の中での位置になる
      if (l < reel.scrollLeft || l + t.offsetWidth > reel.scrollLeft + reel.clientWidth) reel.scrollLeft = Math.max(0, l - 3);
    }
    sync();
  }

  function buildShowcase(list) {
    // 開発確認用: ?clips=4 や ?clips=18 で本数を変えて試す(0 で「見本なし」)
    const forced = parseInt(qs.get("clips"), 10);
    if (!isNaN(forced) && list.length) {
      const src = list;
      list = [];
      for (let i = 0; i < forced; i++) list.push(src[i % src.length]);
    }
    show.clips = list;
    unit.textContent = "";
    reel.textContent = "";
    thumbs = [];
    if (tvIO) { tvIO.disconnect(); tvIO = null; }
    tv = posterEl = videoEl = toggleBtn = countEl = null;
    intro.classList.toggle("has-show", list.length > 0);
    intro.classList.toggle("has-reel", list.length > 1);
    if (!list.length) return;

    const arrow = function (d) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    };
    tv = document.createElement("div");
    tv.className = "tv";
    tv.innerHTML =
      '<span class="tv-tag"></span>' +
      '<div class="tv-screen">' +
      '<img class="tv-poster" alt="" decoding="async" />' +
      '<video class="tv-video" muted playsinline preload="none" tabindex="-1" aria-hidden="true" disablepictureinpicture></video>' +
      '<button type="button" class="tv-toggle" aria-label="一時停止"></button>' +
      '<span class="tv-count" aria-hidden="true"></span>' +
      "</div>" +
      '<button type="button" class="tv-nav tv-prev" aria-label="前の編集サンプル">' + arrow("m15 5-7 7 7 7") + "</button>" +
      '<button type="button" class="tv-nav tv-next" aria-label="次の編集サンプル">' + arrow("m9 5 7 7-7 7") + "</button>";
    unit.appendChild(tv);
    tv.querySelector(".tv-tag").textContent = CLIP_TAG;
    posterEl = tv.querySelector(".tv-poster");
    videoEl = tv.querySelector(".tv-video");
    toggleBtn = tv.querySelector(".tv-toggle");
    countEl = tv.querySelector(".tv-count");
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;

    videoEl.addEventListener("loadedmetadata", function () {
      // 1 本あたり 5 秒以上は見せる: 2 秒の見本は 3 回、7 秒の見本は 1 回
      show.need = Math.max(1, Math.min(3, Math.ceil(5 / (videoEl.duration || 5))));
      applyLoop();
    });
    videoEl.addEventListener("playing", function () {
      tv.classList.add("has-frame");
      show.blocked = false;
      render();
      warmNext();
    });
    videoEl.addEventListener("timeupdate", function () {
      if (videoEl.currentTime + 0.3 < show.last) { show.loops++; applyLoop(); } // 頭に戻った = 1 回ループした
      show.last = videoEl.currentTime;
    });
    videoEl.addEventListener("ended", function () {
      if (autoOK() && !show.held) { select(show.index + 1, false); return; }
      videoEl.currentTime = 0; // マウスを乗せている間・フォーカス中は同じ見本を見せ続ける
      show.last = 0;
      applyLoop();
      sync();
    });

    toggleBtn.addEventListener("click", function () {
      if (show.userPaused || show.needTap || show.blocked) { show.userPaused = false; show.needTap = false; show.blocked = false; }
      else show.userPaused = true;
      show.auto = false; // 一度さわったら、自動で次へは進めない
      applyLoop();
      sync();
    });
    tv.querySelector(".tv-prev").addEventListener("click", function () { select(show.index - 1, true); });
    tv.querySelector(".tv-next").addEventListener("click", function () { select(show.index + 1, true); });

    list.forEach(function (c, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "reel-thumb";
      b.setAttribute("aria-label", "編集サンプル " + (i + 1) + " を再生");
      b.innerHTML = '<img src="' + esc(c.poster || "") + '" alt="" loading="lazy" decoding="async" />';
      b.addEventListener("click", function () { select(i, true); });
      reel.appendChild(b);
      thumbs.push(b);
    });

    if ("IntersectionObserver" in window) {
      tvIO = new IntersectionObserver(function (es) {
        show.inView = es[es.length - 1].intersectionRatio >= 0.5;
        sync();
      }, { threshold: [0, 0.5, 1] });
      tvIO.observe(tv);
    }
    select(0, false);
  }

  // マウスを乗せている間・キーボードで操作している間は、自動で次へ進めない
  [unit, reel].forEach(function (el) {
    el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") show.held = true; });
    el.addEventListener("pointerleave", function () { show.held = false; });
    el.addEventListener("focusin", function () { show.held = true; });
    el.addEventListener("focusout", function () { show.held = false; });
    el.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (show.clips.length < 2) return;
      e.preventDefault();
      const onThumb = thumbs.indexOf(document.activeElement) >= 0;
      select(show.index + (e.key === "ArrowRight" ? 1 : -1), true);
      if (onThumb && thumbs[show.index]) thumbs[show.index].focus({ preventScroll: true });
    });
  });
  document.addEventListener("visibilitychange", sync);
  const onReduceChange = function () {
    if (!reduceMQ.matches) return;
    show.auto = false; // 途中で「動きを減らす」に変わったら、すぐ止める
    show.needTap = true;
    applyLoop();
    sync();
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);

  // ---- 最後の画面の割り付け ----
  //  見出し・ボタン・看板の文字は絶対に削らない。縮むのは すき間 → テレビ の順。
  //  位置は offsetTop / offsetHeight だけで測る(GSAP の transform の影響を受けない)。
  const ruler = document.createElement("div"); // 舞台 1 画面ぶんの高さと、最初の丘の高さ(26vh / 最低150px)を測るものさし
  ruler.setAttribute("aria-hidden", "true");
  ruler.style.cssText = "position:absolute;left:0;top:0;width:1px;height:calc(100vh - 64px);height:calc(100svh - 64px);visibility:hidden;pointer-events:none";
  const ruler2 = document.createElement("div");
  ruler2.style.cssText = "position:absolute;left:0;top:0;width:1px;height:26vh;min-height:150px;visibility:hidden;pointer-events:none";
  ruler.appendChild(ruler2);
  document.body.appendChild(ruler);

  let grassH = 0, hillR0 = 0, hillR1 = 0, overD = 0, lastSizes = "";
  let tl = null, st = null, shiftA = null, shiftB = null;
  const END_T = 0.96; // 最後の画面が出そろう時刻(ここまでの長さは今までと同じ)

  function topIn(el, root) {
    let y = 0;
    while (el && el !== root) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }
  function sizesKey() {
    return [stage.clientWidth, ruler.offsetHeight, titleEl.offsetHeight, board.offsetWidth, board.offsetHeight, show.clips.length].join("x");
  }

  function layoutFinal() {
    const W = stage.clientWidth;
    const H = ruler.offsetHeight;
    const N = show.clips.length;
    const side = sideMQ.matches;
    const cs = getComputedStyle(fin);
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const padX = parseFloat(cs.paddingLeft) || 0;
    const gapRail = parseFloat(getComputedStyle(reel).marginTop) || 0;
    const colW = Math.min(side ? 1120 : 560, W - padX * 2);
    const frame = side ? 18 : 12; // テレビの白ふち + 黒ふち(上下の合計)
    const gapCol = 32;
    const g = side ? 10 : 8;
    const thumbMax = Math.max(64, Math.min(112, Math.round(H * 0.135)));

    function thumbFor(RW) {
      // 入りきるなら全部見せる(マウス 64px / タッチ 72px まで縮める)。入りきらないときだけ「k 枚 + 半分」で続きを見せる
      let w = Math.floor((RW - 6 - (N - 1) * g) / N);
      let over = false;
      if (w >= (side ? 64 : 72)) w = Math.min(w, thumbMax);
      else {
        const minW = side ? 88 : 80;
        const k = Math.max(1, Math.floor((RW - 6 - minW / 2) / (minW + g)));
        w = Math.floor((RW - 6 - k * g) / (k + 0.5));
        over = true;
      }
      return { w: w, over: over, h: Math.round((w * 9) / 16) + 10 }; // 10 = 棚の上下の余白
    }

    function fit(railOn) {
      const head = titleEl.offsetHeight + (parseFloat(getComputedStyle(actionsEl).marginTop) || 0) + actionsEl.offsetHeight;
      const boardH = board.offsetHeight;
      const boardW = board.offsetWidth;
      const gapBoard = side ? 0 : parseFloat(getComputedStyle(board).marginTop) || 0;
      if (!N) return { tvH: 0, rail: null, over: padT + head + boardH + padB - H, railOn: false };
      const maxTvW = side ? Math.min(640, Math.max(W * 0.4, boardW + 40), colW - gapCol - boardW - frame) : Math.min(640, colW - frame);
      const rail = N > 1 && railOn ? thumbFor(side ? Math.min(colW, maxTvW + frame + gapCol + boardW) : colW) : null;
      const railH = rail ? rail.h + gapRail : 0;
      const floor = side ? 170 : 130;
      const free = side
        ? H - padT - padB - head - frame - railH
        : H - padT - padB - head - frame - railH - gapBoard - boardH;
      const tvH = Math.max(floor, Math.min(free, (maxTvW * 9) / 16));
      const sceneH = side ? Math.max(tvH + frame, boardH) + railH : tvH + frame + railH + gapBoard + boardH;
      return { tvH: tvH, rail: rail, free: free, over: padT + head + sceneH + padB - H, railOn: !!rail, boardW: boardW };
    }

    function choose() {
      let r = fit(true);
      // 棚を入れるとテレビが小さくなりすぎるときは、棚をやめてテレビに前へ / 次へボタンを出す
      if (N > 1 && (r.over > 0.5 || r.free < (side ? 170 : 150))) r = fit(false);
      return r;
    }

    intro.classList.remove("is-tallhead");
    let r = choose();
    // 背の高いスマホ: 余った高さを見出しに回して 2 行で大きくする
    if (!side && W < 640 && N && -r.over >= 96) {
      intro.classList.add("is-tallhead");
      const r2 = choose();
      if (r2.over <= -16 && r2.railOn === r.railOn && r2.tvH >= r.tvH - 0.5) r = r2;
      else { intro.classList.remove("is-tallhead"); r = choose(); }
    }

    if (r.over > 0.5 && N) {
      // どう詰めても 1 画面に入らない(横向きのスマホ・管理画面の文章が長い など):
      // 無理に縮めず、テレビは見やすい大きさのままにして、入りきらないぶんはスクロールの続きで見せる
      const maxTvW = side ? Math.min(640, Math.max(W * 0.4, r.boardW + 40), colW - gapCol - r.boardW - frame) : Math.min(640, colW - frame);
      r = { tvH: Math.max(side ? 170 : 130, Math.min((maxTvW * 9) / 16, window.innerHeight * 0.62)), railOn: N > 1, boardW: r.boardW };
      r.rail = N > 1 ? thumbFor(side ? Math.min(colW, maxTvW + frame + gapCol + r.boardW) : colW) : null;
    }

    const tvW = Math.round((r.tvH * 16) / 9);
    intro.style.setProperty("--tv-w", tvW + "px");
    intro.classList.toggle("is-norail", N > 1 && !r.railOn);
    let overflow = false;
    if (r.rail) {
      // 横並びのときは、実際の幅(テレビ + 看板)でもう一度サムネイルの幅を出す。高さの予算は超えない
      const real = side ? thumbFor(Math.min(colW, tvW + frame + gapCol + r.boardW)) : r.rail;
      intro.style.setProperty("--thumb-w", (real.h <= r.rail.h ? real.w : Math.min(real.w, r.rail.w)) + "px");
      overflow = real.over;
    }
    reel.classList.toggle("is-overflow", overflow);
    const noRail = N > 1 && !r.railOn;
    intro.classList.toggle("has-count", N > 1 && (noRail || overflow));
    intro.classList.toggle("has-nav", N > 1 && (noRail || (overflow && fineMQ.matches)));

    // 入りきらないぶん(px)。固定中は、演出のあとのスクロールで中身を上へ送って見せる(静的表示ではそのまま下へ続く)
    overD = Math.max(0, Math.round(scene.offsetTop + scene.offsetHeight + padB - H));
    if (shiftA) {
      const d = Math.max(0.001, (END_T * overD) / (window.innerHeight * 1.3)); // 1px スクロール = 1px 送り
      shiftA.duration(d);
      shiftB.duration(d);
    }

    // 丘の線は、テレビ(と看板)の後ろを通す。文字やふちに線が触れない高さにする
    const anchor = N ? tv : board;
    const k = N && !side ? 0.45 : 0.5;
    grassH = Math.max(0, Math.round(stage.clientHeight - (topIn(anchor, stage) + k * anchor.offsetHeight)));
    hillR0 = Math.round(ruler2.offsetHeight * 0.6);              // 最初の画面の丘の丸み(今までと同じ形)
    hillR1 = Math.round(Math.min(grassH * 0.6, side ? 150 : 72)); // 最後の画面の丘の丸み(高くなってもドームにしない)
    intro.style.setProperty("--grass-h", grassH + "px");
    intro.style.setProperty("--hill-r0", hillR0 + "px");
    intro.style.setProperty("--hill-r1", hillR1 + "px");
    lastSizes = sizesKey();
  }

  function relayout() {
    if (st) ScrollTrigger.refresh(); // refreshInit で layoutFinal が走り、タイムラインの数値も読み直される
    else {
      layoutFinal();
      if (tl) {
        const t = tl.time();
        tl.progress(0).invalidate().time(t);
      }
    }
  }
  let relayoutTimer = 0;
  function relayoutSoon() {
    clearTimeout(relayoutTimer);
    relayoutTimer = setTimeout(function () { if (sizesKey() !== lastSizes) relayout(); }, 150);
  }

  // 最後の画面の「応募する」が見えている間だけ、ヘッダーのボタンを白にする
  const heroCta = actionsEl.querySelector(".js-open-apply");
  let ctaInView = true;
  function syncCta() { document.body.classList.toggle("cta-on", show.finalOn && ctaInView); }
  if (heroCta && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { ctaInView = es[es.length - 1].isIntersecting; syncCta(); }, { rootMargin: "-64px 0px 0px 0px" }).observe(heroCta);
  }
  function setFinal(on) {
    if (on === show.finalOn) return;
    show.finalOn = on;
    intro.classList.toggle("is-final", on);
    syncCta();
    sync();
  }

  const debugP = qs.get("p");

  buildShowcase(clips);
  // 一覧の読み込みが 0.9 秒より遅れても、届いた時点でテレビを作る(今までは黙って出なかった)
  if (!clips.length) {
    LOOPS_REQ.then(function (late) {
      if (!late || !late.length || show.clips.length) return;
      buildShowcase(late);
      relayout();
    });
  }
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(relayoutSoon); // 管理画面の文章が後から届いて高さが変わったとき
    ro.observe(titleEl);
    ro.observe(board);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayoutSoon);

  if (!animated) {
    intro.classList.add("is-static");
    document.querySelectorAll(".js-scroll-intro").forEach(function (b) { b.classList.add("js-open-apply"); });
    layoutFinal();
    setFinal(true); // 動きを減らす設定の人には自動再生しない(show.needTap)。押せば再生できる
    window.addEventListener("resize", relayoutSoon);
    window.addEventListener("load", layoutFinal);
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

  const items = [];

  {
    // 頭から飛び出すのは YouTube 動画のサムネイル(管理画面の動画一覧)
    const thumbSrcs = ids.map(function (id) { return "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg"; });
    thumbSrcs.forEach(function (src, i) {
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
  const hint = document.getElementById("scroll-hint");
  const glow = intro.querySelector(".intro-glow");
  const clouds = intro.querySelectorAll(".cloud-deco");

  // 初期状態(中央配置は GSAP 側で管理する)
  gsap.set(figure, { xPercent: -50, x: 0, yPercent: 0, y: 0 });
  gsap.set([copy, hint], { xPercent: -50, x: 0, y: 0 });
  gsap.set(inner, { xPercent: -50, yPercent: -50, x: 0, y: 0, scaleX: 0.2, scaleY: 1, autoAlpha: 0 }); // 中央ぞろえは GSAP 側で管理(iPhone でずれるのを防ぐ)
  gsap.set(opened, { opacity: 0, clipPath: "inset(28.5% 0 0 0)" }); // フタが上がるまで中身は隠す
  gsap.set(lid, { opacity: 0 }); // 最初は1枚の写真だけを見せる(フタは動く瞬間に出す)
  gsap.set(fin, { autoAlpha: 0, y: 0 });
  gsap.set([titleEl, actionsEl, scene], { autoAlpha: 0, y: 16 }); // 最後の画面は 見出し → ボタン → 丘の一式 の順に出す
  gsap.set(items.map(function (i) { return i.el; }), { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0, opacity: 0, rotation: 0 });

  // 最後の画面の割り付けを先に決める(丘の高さをタイムラインが読む)
  layoutFinal();

  // ---- タイムライン(スクロールに完全連動) ----
  // 開発確認用: ?p=0.5 のように指定すると、その進行度で静止表示する
  if (debugP !== null) document.documentElement.style.scrollBehavior = "auto";
  tl = gsap.timeline({
    defaults: { ease: "none" },
    paused: debugP !== null,
    scrollTrigger:
      debugP !== null
        ? undefined
        : {
            trigger: intro,
            start: "top 64px", // 固定ヘッダーの下に貼り付ける(頭が隠れないように)
            end: function () { return "+=" + Math.round(window.innerHeight * 1.3 + overD); }, // 今までと同じ 130% + 入りきらないぶん
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
  st = tl.scrollTrigger || null;

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

  // 0.50-0.62: 主役も、飛び出したものも、光も、すっかり消える(最後の画面には半透明のものを残さない)
  tl.to(figure, { scale: 0.92, yPercent: 8, autoAlpha: 0, duration: 0.12, ease: "power2.in" }, 0.5);
  items.forEach(function (it) {
    tl.to(
      it.el,
      {
        x: function () { return (stage.clientWidth * it.tx * 1.25) / 100; },
        y: function () { return (stage.clientHeight * it.ty * 1.25) / 100; },
        autoAlpha: 0,
        scale: it.scale * 0.9,
        duration: 0.12,
        ease: "power1.in",
      },
      0.5
    );
  });
  tl.to(glow, { autoAlpha: 0, duration: 0.12 }, 0.5);
  tl.set(burst, { autoAlpha: 0 }, 0.62);

  // 0.50-0.68: 丘が高くなる(線はテレビの後ろへ)。丸みも一緒に変えて、最初の丘の形はそのまま
  tl.to(grass, { height: function () { return grassH; }, minHeight: 0, duration: 0.18, ease: "power2.inOut" }, 0.5);
  tl.to(grass, { "--hill-r": function () { return hillR1 + "px"; }, duration: 0.18, ease: "power2.inOut" }, 0.5);
  // 雲: 広い画面(1440px 以上)だけ上のすみへ。それより狭い画面では消す(見出しに近すぎるため)
  tl.to(
    clouds,
    {
      autoAlpha: function () { return stage.clientWidth >= 1440 ? 1 : 0; },
      y: function (i) { return -stage.clientHeight * (i === 0 ? 0.06 : 0.07); },
      duration: 0.12,
      ease: "power1.inOut",
    },
    0.5
  );

  // 0.62-0.82: 見出し → ボタン → 丘の一式(テレビ・棚・看板は 1 つのかたまりで)
  tl.set(fin, { autoAlpha: 1 }, 0.62);
  tl.to(titleEl, { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.62);
  tl.to(actionsEl, { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.66);
  tl.to(scene, { autoAlpha: 1, y: 0, duration: 0.12, ease: "power2.out" }, 0.7);
  tl.to({}, { duration: 0.14 }, 0.82); // 読める余韻(ここまでの長さ 0.96 は今までと同じ)

  // 0.96 以降: 1 画面に入りきらないときだけ、スクロールの続きで中身を上へ送る(丘の線も一緒に上がる)。入りきるときは何も起きない
  shiftA = tl.to(fin, { y: function () { return -overD; }, duration: 0.001 }, END_T);
  shiftB = tl.to(grass, { height: function () { return grassH + overD; }, duration: 0.001 }, END_T);
  layoutFinal(); // 送りの長さを反映

  // テレビは、最後の画面に着いている間だけ再生する
  gsap.ticker.add(function () { setFinal(tl.time() >= 0.82); });

  ScrollTrigger.addEventListener("refreshInit", layoutFinal); // 画面サイズが変わるたび、再計算の直前に割り付け直す
  if (!st) window.addEventListener("resize", relayoutSoon);

  // 最初の画面の「応募する」: 演出を最後まで再生しながら下へスクロールする
  function scrollToIntroEnd() {
    if (!st) return;
    const from = window.scrollY;
    const to = st.start + (st.end - st.start) * (END_T / tl.duration()); // 最後の画面が出そろう位置まで
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
  if (qs.has("go")) {
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
    relayout();
    if (window.scrollY <= 1 && st) {
      const t = st.getTween && st.getTween();
      if (t) t.progress(1);
    }
    if (debugP !== null) tl.time((parseFloat(debugP) || 0) * END_T); // ?p=1 = 最後の画面(1 より大きい値で、入りきらないぶんの送りも確認できる)
    // 開発確認用: ?scroll=400 で読み込み後にその位置へ移動
    const sc = qs.get("scroll");
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
