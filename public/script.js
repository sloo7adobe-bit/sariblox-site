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
  const softsWrap = document.getElementById("f-softs");
  const fieldVideos = document.getElementById("field-videos");
  const fieldThumbs = document.getElementById("field-thumbs");
  const thumbInput = document.getElementById("f-thumb");
  const thumbAdd = document.getElementById("f-thumb-add");
  const thumbErr = document.getElementById("f-thumb-error");
  const thumbList = document.getElementById("f-thumb-list");

  const videos = []; // { id, title }
  const thumbs = []; // { dataUrl }
  const THUMB_MAX = 3;
  const VIDEO_SOFTS = ["premiere", "aftereffects", "ymm4"];
  let lastFocus = null;

  // ---- 使っているソフト(複数選択)----
  function chosenSofts() {
    return Array.prototype.slice
      .call(softsWrap.querySelectorAll("input:checked"))
      .map(function (i) { return i.value; });
  }
  function renumber() {
    let n = 1;
    form.querySelectorAll(".field").forEach(function (f) {
      if (f.hidden) return;
      const num = f.querySelector(".field-num");
      if (num) num.textContent = n++;
    });
  }
  function syncSofts() {
    const chosen = chosenSofts();
    softsWrap.querySelectorAll(".soft-chip").forEach(function (chip) {
      chip.classList.toggle("is-on", chip.querySelector("input").checked);
    });
    fieldVideos.hidden = !chosen.some(function (s) { return VIDEO_SOFTS.indexOf(s) !== -1; });
    fieldThumbs.hidden = chosen.indexOf("photoshop") === -1;
    renumber();
  }
  softsWrap.addEventListener("change", syncSofts);
  syncSofts();

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
        softsWrap.querySelector('input[value="premiere"]').checked = true;
        syncSofts();
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

  // ---- サムネ画像の追加(端末の中で軽い JPEG に変換してから送る) ----
  function showThumbError(msg) {
    thumbErr.textContent = msg;
    thumbErr.hidden = !msg;
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          const MAX_W = 1600;
          const scale = Math.min(1, MAX_W / (img.naturalWidth || 1));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          const ctx = cv.getContext("2d");
          ctx.fillStyle = "#fff"; // 透過 PNG は白背景にする
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.85;
          let data = cv.toDataURL("image/jpeg", q);
          // だいたい 700KB 以下になるまで画質を下げる
          while (data.length > 700 * 1024 * 4 / 3 && q > 0.45) {
            q -= 0.1;
            data = cv.toDataURL("image/jpeg", q);
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("bad image"));
      };
      img.src = url;
    });
  }

  function renderThumbs() {
    thumbList.innerHTML = thumbs
      .map(function (t, i) {
        return (
          '<div class="thumb-item">' +
          '<img src="' + t.dataUrl + '" alt="アップロードしたサムネ ' + (i + 1) + '" />' +
          '<button type="button" class="thumb-remove" data-tremove="' + i + '" aria-label="この画像を削除">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
          "</button>" +
          "</div>"
        );
      })
      .join("");
    thumbAdd.disabled = thumbs.length >= THUMB_MAX;
    thumbAdd.textContent = thumbs.length >= THUMB_MAX ? "3 枚までです" : "画像を選ぶ(最大 3 枚)";
  }

  thumbAdd.addEventListener("click", function () {
    thumbInput.click();
  });

  thumbInput.addEventListener("change", function () {
    const files = Array.prototype.slice.call(thumbInput.files || []);
    thumbInput.value = "";
    if (!files.length) return;
    showThumbError("");
    const room = THUMB_MAX - thumbs.length;
    if (files.length > room) {
      showThumbError("アップロードできるのは 3 枚までです。");
    }
    files.slice(0, Math.max(0, room)).forEach(function (file) {
      if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name)) {
        showThumbError("画像ファイルを選んでください。");
        return;
      }
      compressImage(file)
        .then(function (dataUrl) {
          if (thumbs.length >= THUMB_MAX) return;
          thumbs.push({ dataUrl: dataUrl });
          renderThumbs();
        })
        .catch(function () {
          showThumbError("「" + file.name + "」は読み込めませんでした。スクリーンショットや JPEG で試してみてください。");
        });
    });
  });

  thumbList.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-tremove]");
    if (!btn) return;
    thumbs.splice(parseInt(btn.getAttribute("data-tremove"), 10), 1);
    renderThumbs();
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

    const softs = chosenSofts();
    const needVideos = softs.some(function (s) { return VIDEO_SOFTS.indexOf(s) !== -1; });
    const needThumbs = softs.indexOf("photoshop") !== -1;

    if (!name) { setError("名前を入れてください。"); nameEl.focus(); return; }
    if (!discord) { setError("Discord のユーザー名を入れてください。"); discordEl.focus(); return; }
    if (softs.length === 0) { setError("使っているソフトを 1 つ以上選んでください。"); return; }
    if (needVideos && videos.length === 0) { setError("自分が編集した動画を 1 本以上追加してください。"); videoEl.focus(); return; }
    if (needThumbs && thumbs.length === 0) { setError("自分で作ったサムネを 1 枚以上アップロードしてください。"); return; }
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
        software: softs,
        videos: needVideos ? videos.map(function (v) { return { id: v.id, title: v.title }; }) : [],
        thumbs: needThumbs ? thumbs.map(function (t) { return t.dataUrl; }) : [],
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

  // ---- 編集サンプル: 丘の上の「見本の壁」----
  //  タイルの位置は 1 つも動かない。動くのはタイルの中の映像だけ。全部のタイルが同時に流れる。
  const CLIP_TAG = (content && content.clipTag) || "こんな編集がほしい!";
  const DWELL = 4500; // 見本がタイルの数より多いとき: 1 本を最低これだけ見せてから、ループの切れ目で次の見本にパッと替える
  const fin = document.getElementById("intro-final");
  const titleEl = fin.querySelector(".hero-title");
  const actionsEl = fin.querySelector(".hero-actions");
  const board = fin.querySelector(".job-grid");
  const unit = document.getElementById("clip-parade");
  const grass = intro.querySelector(".grass-strip");
  const wideMQ = window.matchMedia("(min-width: 960px) and (min-aspect-ratio: 5/4)");
  const coarseMQ = window.matchMedia("(pointer: coarse)");
  const conn = navigator.connection;

  const show = {
    clips: [],
    userPaused: false,                                 // 停止ボタンで止めている
    needTap: reduce || !!(conn && conn.saveData),      // 動きを減らす設定・通信量節約: 押されるまで再生しない
    blocked: false,                                    // 端末に自動再生を断られた(省電力モードなど)
    finalOn: false, inView: true, sig: "",
  };
  let wall = null, gridEl = null, toggleBtn = null, slots = [], wallIO = null, startTimers = [], wallTl = null;

  function stopped() { return show.userPaused || show.needTap || show.blocked; }
  function wantPlay() { return show.finalOn && show.inView && !document.hidden && !stopped(); }
  function render() {
    if (!wall) return;
    const s = stopped();
    wall.classList.toggle("is-paused", s);
    toggleBtn.setAttribute("aria-pressed", s ? "true" : "false");
    toggleBtn.setAttribute("aria-label", s ? "動画をぜんぶ再生" : "動画をぜんぶ一時停止");
  }
  function playSlot(s) {
    if (s.dead || !s.video.paused) return;
    const p = s.video.play();
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === "NotAllowedError" && !show.blocked) { // 自動再生を断られた: もう試さない。ポスターの壁 + 再生ボタンにする
        show.blocked = true;
        sync();
      }
    });
  }
  function sync(now) {
    const want = wantPlay();
    startTimers.forEach(clearTimeout);
    startTimers = [];
    let k = 0;
    slots.forEach(function (s) {
      if (want) {
        if (s.video.paused && !s.dead) {
          if (now) playSlot(s); // 押した瞬間(同じ操作の中)で全部を始める
          else startTimers.push(setTimeout(function () { if (wantPlay()) playSlot(s); }, 90 * k++)); // 左上から順に、ぱぱぱっと点く
        }
      } else if (!s.video.paused) s.video.pause();
    });
    render();
  }
  function setClip(s) {
    const c = show.clips[s.queue[s.qi]];
    s.el.classList.remove("has-frame");
    if (c.poster) s.img.src = c.poster; else s.img.removeAttribute("src");
    s.video.loop = s.queue.length === 1; // 1 本だけ受け持つタイルは、そのままループ
    s.video.src = c.src;                 // preload="none" なので、再生するまで読み込まれない
    s.since = 0;
  }
  function nextClip(s) {
    s.qi = (s.qi + 1) % s.queue.length;
    setClip(s);
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
    startTimers.forEach(clearTimeout);
    startTimers = [];
    unit.textContent = "";
    slots = [];
    show.sig = "";
    if (wallIO) { wallIO.disconnect(); wallIO = null; }
    wall = gridEl = toggleBtn = null;
    intro.classList.toggle("has-show", list.length > 0);
    if (!list.length) return;

    wall = document.createElement("div");
    wall.className = "wall";
    wall.innerHTML =
      '<span class="wall-tag"></span>' +
      '<button type="button" class="wall-toggle" aria-pressed="false" aria-label="動画をぜんぶ一時停止"></button>' +
      '<div class="wall-grid"></div>' +
      '<button type="button" class="wall-play" aria-label="動画をぜんぶ再生"></button>';
    unit.appendChild(wall);
    wall.querySelector(".wall-tag").textContent = CLIP_TAG;
    gridEl = wall.querySelector(".wall-grid");
    toggleBtn = wall.querySelector(".wall-toggle");
    const flip = function () {
      if (stopped()) { show.userPaused = false; show.needTap = false; show.blocked = false; sync(true); }
      else { show.userPaused = true; sync(); }
    };
    toggleBtn.addEventListener("click", flip);
    wall.querySelector(".wall-play").addEventListener("click", flip);

    if ("IntersectionObserver" in window) {
      wallIO = new IntersectionObserver(function (es) {
        show.inView = es[es.length - 1].intersectionRatio >= 0.35;
        sync();
      }, { threshold: [0, 0.35, 1] });
      wallIO.observe(wall);
    }
    render();
  }

  // タイルを作り直す(本数や列の数が変わったときだけ)
  function makeTiles(L) {
    startTimers.forEach(clearTimeout);
    startTimers = [];
    slots.forEach(function (s) { s.video.pause(); s.video.removeAttribute("src"); s.video.load(); });
    gridEl.textContent = "";
    slots = [];
    const N = show.clips.length;
    for (let k = 0; k < L.S; k++) {
      const el = document.createElement("div");
      el.className = "tile" + (L.hero && k === 0 ? " is-hero" : "");
      el.innerHTML =
        '<img class="tile-poster" alt="" decoding="async" />' +
        '<video class="tile-video" muted playsinline preload="none" tabindex="-1" aria-hidden="true" disablepictureinpicture></video>';
      const s = { el: el, img: el.firstChild, video: el.lastChild, queue: [], qi: 0, since: 0, fails: 0, dead: false };
      for (let c = k; c < N; c += L.S) s.queue.push(c); // タイル k は 見本 k, k+S, k+2S… を受け持つ(場所は固定)
      s.video.muted = true;
      s.video.defaultMuted = true;
      s.video.playsInline = true;
      s.video.addEventListener("playing", function () {
        s.el.classList.add("has-frame");
        s.fails = 0;
        if (!s.since) s.since = performance.now();
      });
      s.video.addEventListener("ended", function () { // loop を外しているタイル(2 本以上を受け持つ)だけに来る
        if (performance.now() - s.since >= DWELL) nextClip(s);
        else s.video.currentTime = 0;
        if (wantPlay()) playSlot(s);
      });
      s.video.addEventListener("error", function () { // 読めない見本: ポスターのまま。受け持ちが他にあれば次へ
        s.fails++;
        if (s.queue.length > 1 && s.fails < s.queue.length) { nextClip(s); if (wantPlay()) playSlot(s); }
        else s.dead = true;
      });
      setClip(s);
      gridEl.appendChild(el);
      slots.push(s);
    }
    if (wallTl) buildWallTl();
  }
  function buildWallTl() {
    // タイルの登場: 左上から順にポンポンと出る。本数が 4 でも 18 でも、かかる長さは同じ
    wallTl.clear();
    const els = slots.map(function (s) { return s.el; });
    if (!els.length) return;
    gsap.set(els, { autoAlpha: 0, scale: 0.92 });
    wallTl.to(els, { autoAlpha: 1, scale: 1, duration: 0.04, ease: "power3.out", stagger: { amount: 0.06, from: "start" } }, 0);
  }

  document.addEventListener("visibilitychange", function () { sync(); });
  window.addEventListener("pageshow", function (e) { if (e.persisted) { if (st) ScrollTrigger.refresh(); sync(); } });
  const onReduceChange = function () {
    if (!reduceMQ.matches) return;
    show.needTap = true; // 途中で「動きを減らす」に変わったら、すぐ全部止める
    sync();
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);

  // ---- 最後の画面の割り付け ----
  //  見出し・ボタン・条件の文字は絶対に削らない。高さが足りないときに縮む / 減るのは 壁 だけ。
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
    return [stage.clientWidth, ruler.offsetHeight, titleEl.offsetHeight, board.offsetHeight, show.clips.length].join("x");
  }

  // 壁の割り付けを選ぶ: タイルが大きく、同時に見える見本が多い形(全部が同時に出る形を優遇)
  //  1 タイルの幅が min を下回る形は選ばない(小さすぎて編集が分からないため)
  function chooseGrid(N, availW, availH, o) {
    let best = null;
    for (let cols = o.minCols || 1; cols <= o.maxCols; cols++) {
      for (let rows = 1; rows <= o.maxRows; rows++) {
        for (let h = 0; h < 2; h++) {
          const hero = h === 1;
          if (hero && (cols < 2 || rows < 2 || cols * rows < 6)) continue;
          const S = cols * rows - (hero ? 3 : 0);
          if (S > N || S > o.cap) continue;
          const sW = (availW - o.frame - (cols + 1) * o.g) / cols;
          const tH = (availH - 1 - o.frame - (rows + 1) * o.g) / rows; // 1px は端数のゆとり
          if (tH <= 0) continue;
          // 高さがほんの少し足りないだけなら、タイルを縮めずに上下を少しだけ切る(16:9 → 最大 16:8.4)
          let s = Math.min(sW, o.maxTile, hero ? (o.maxHero - o.g) / 2 : 1e9);
          let ar = 16 / 9;
          if (s * 9 / 16 > tH) {
            if (s / tH <= o.maxAr) ar = s / tH;
            else { ar = o.maxAr; s = tH * ar; } // それでも足りなければ、切れる限度の形のまま幅も縮める
          }
          s = Math.floor(s);
          if (s < o.min) continue;
          // 点数 = タイルの幅 ×(同時に見える見本の割合)² 。全部が同時に見える形は 25% 増し、大きい 1 枚がある形はそのぶん加点
          const score = s * (hero ? 1 + 1 / S : 1) * (S / N) * (S / N) * (S === N ? 1.25 : 1);
          const c = { cols: cols, rows: rows, hero: hero, S: S, s: s, ar: ar, score: score };
          if (!best || c.score > best.score + 0.5) best = c;
        }
      }
    }
    return best;
  }

  function layoutFinal() {
    const W = stage.clientWidth;
    const H = ruler.offsetHeight;
    const N = show.clips.length;
    const wide = wideMQ.matches;
    const cs = getComputedStyle(fin);
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const padX = parseFloat(cs.paddingLeft) || 0;
    const g = parseFloat(cs.getPropertyValue("--g")) || 6;
    const colW = Math.floor(Math.min(wide ? 1560 : 560, W - padX * 2));
    const boardMin = wide ? Math.min(colW, 1040) : colW;
    const opts = {
      g: g, frame: 4, min: wide ? 200 : 128, maxTile: 400, maxHero: 720, maxAr: wide ? 1.9 : 2,
      minCols: N < 2 || wide ? 1 : (W >= 640 || N > 2 ? 2 : 1), maxCols: wide ? 8 : 2, maxRows: !wide && W >= 640 ? 4 : 3,
      cap: wide ? (coarseMQ.matches ? 12 : 18) : (W < 640 ? 6 : 8),
    };

    function measure(tall) {
      intro.classList.toggle("is-tallhead", tall);
      intro.style.setProperty("--board-w", colW + "px");
      const head = titleEl.offsetHeight + (parseFloat(getComputedStyle(actionsEl).marginTop) || 0) + actionsEl.offsetHeight;
      const gapBoard = parseFloat(getComputedStyle(board).marginTop) || 0;
      const gapWall = N ? parseFloat(getComputedStyle(unit).paddingTop) || 0 : 0;
      let boardH = board.offsetHeight;
      let L = null, wallW = 0, boardW = colW;
      for (let pass = 0; pass < 2; pass++) {
        const availH = H - padT - padB - head - gapBoard - boardH - gapWall;
        L = N ? chooseGrid(N, colW, availH, opts) : null;
        if (N && !L) break;
        wallW = L ? L.cols * L.s + (L.cols + 1) * g + 4 : 0;
        boardW = Math.max(wallW, boardMin);
        if (boardW === colW) break;
        intro.style.setProperty("--board-w", boardW + "px"); // 壁が細いときは帯も合わせる(細くなりすぎない幅まで)。高さが変わったらもう一度だけ選び直す
        const h2 = board.offsetHeight;
        if (h2 === boardH) break;
        boardH = h2;
      }
      const wallH = L ? 4 + (L.rows + 1) * g + L.rows * (L.s / L.ar) : 0;
      return { L: L, wallW: wallW, boardW: boardW, spare: H - padT - padB - head - gapBoard - boardH - gapWall - wallH };
    }

    let r = measure(false);
    // 背の高いスマホ: 余った高さを見出しに回して 2 行で大きくする(壁が小さくならないときだけ)
    if (!wide && W < 640 && N && r.L && r.spare >= 96) {
      const r2 = measure(true);
      if (r2.L && r2.spare >= 16 && r2.L.S === r.L.S && r2.L.s >= r.L.s) r = r2;
      else r = measure(false);
    }
    let L = r.L;
    if (N && !L) {
      // どう詰めても 1 画面に入らない(横向きのスマホ・管理画面の文章が長い など): タイルは見やすい大きさのまま、入りきらないぶんはスクロールの続きで見せる
      L = chooseGrid(N, colW, 1e5, Object.assign({}, opts, { maxRows: H < 420 ? 1 : 2 }));
      r.wallW = L.cols * L.s + (L.cols + 1) * g + 4;
      r.boardW = Math.max(r.wallW, boardMin);
    }

    intro.style.setProperty("--board-w", (N ? r.boardW : Math.min(colW, wide ? 1040 : 560)) + "px");
    if (L) {
      intro.style.setProperty("--wall-w", r.wallW + "px");
      intro.style.setProperty("--cols", L.cols);
      intro.style.setProperty("--tile-ar", String(L.ar));
      intro.style.setProperty("--hero-ar", L.cols === 2 ? String((2 * L.s + g) / (2 * (L.s / L.ar) + g)) : "auto");
      const sig = [L.cols, L.rows, L.hero ? 1 : 0, L.S, N].join("-");
      if (sig !== show.sig) { show.sig = sig; makeTiles(L); if (show.finalOn) sync(); }
    }

    // 入りきらないぶん(px)。固定中は、演出のあとのスクロールで中身を上へ送って見せる(静的表示ではそのまま下へ続く)
    const last = N ? unit : board;
    overD = Math.max(0, Math.round(topIn(last, fin) + last.offsetHeight + padB - H));
    if (shiftA) {
      const d = Math.max(0.001, (END_T * overD) / (window.innerHeight * 1.3)); // 1px スクロール = 1px 送り
      shiftA.duration(d);
      shiftB.duration(d);
    }

    // 丘の線は壁の後ろを通す(条件の帯は空の中)。見本が無いときは帯の下
    if (N) {
      grassH = Math.max(0, Math.round(stage.clientHeight - (topIn(wall, stage) + (wide ? 0.5 : 0.45) * wall.offsetHeight)));
    } else {
      grassH = Math.max(0, Math.min(ruler2.offsetHeight, Math.round(stage.clientHeight - (topIn(board, stage) + board.offsetHeight + 32))));
    }
    hillR0 = Math.round(ruler2.offsetHeight * 0.6);
    hillR1 = Math.round(Math.min(grassH * 0.6, wide ? 150 : 72));
    intro.style.setProperty("--grass-h", grassH + "px");
    intro.style.setProperty("--hill-r0", hillR0 + "px");
    intro.style.setProperty("--hill-r1", hillR1 + "px");
    lastSizes = sizesKey();
    window.__WALL = L ? { cols: L.cols, rows: L.rows, hero: L.hero, S: L.S, s: L.s, ar: L.ar, wallW: r.wallW, boardW: r.boardW, overD: overD, spare: r.spare } : { overD: overD };
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
  let cued = false;
  function setFinal(on) {
    if (on === show.finalOn) return;
    show.finalOn = on;
    intro.classList.toggle("is-final", on);
    if (on && !cued) { cued = true; setTimeout(function () { board.classList.add("is-cued"); }, 450); } // 条件のマーカーを 1 回だけ引く
    syncCta();
    sync();
  }

  const debugP = qs.get("p");

  buildShowcase(clips);
  // 一覧の読み込みが 0.9 秒より遅れても、届いた時点で壁を作る
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
  gsap.set([titleEl, actionsEl], { autoAlpha: 0, y: 16 });
  gsap.set(board, { autoAlpha: 0, y: 20, rotation: -1.5 });
  gsap.set(unit, { autoAlpha: 0 });
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

  // 0.62-0.84: 見出し → ボタン → 条件の帯(1 枚で、立て札が立つように)→ 壁(台紙 → タイルが左上から順に)
  tl.set(fin, { autoAlpha: 1 }, 0.62);
  tl.to(titleEl, { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.62);
  tl.to(actionsEl, { autoAlpha: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.66);
  tl.to(board, { autoAlpha: 1, y: 0, rotation: 0, duration: 0.07, ease: "power2.out" }, 0.69);
  tl.to(unit, { autoAlpha: 1, duration: 0.03, ease: "power1.out" }, 0.72);
  wallTl = gsap.timeline();
  tl.add(wallTl, 0.74);
  buildWallTl();
  tl.to({}, { duration: 0.12 }, 0.84); // 読める余韻(ここまでの長さ 0.96 は今までと同じ)

  // 0.96 以降: 1 画面に入りきらないときだけ、スクロールの続きで中身を上へ送る(丘の線も一緒に上がる)。入りきるときは何も起きない
  //  注意: tl.to() が返すのはタイムライン自身。長さを後から変えるには、トゥイーンを別に作って add する
  shiftA = gsap.to(fin, { y: function () { return -overD; }, duration: 0.001, ease: "none" });
  shiftB = gsap.to(grass, { height: function () { return grassH + overD; }, duration: 0.001, ease: "none" });
  tl.add(shiftA, END_T);
  tl.add(shiftB, END_T);
  layoutFinal(); // 送りの長さを反映

  // 壁は、最後の画面に着いている間だけ再生する(入る: 0.84 / 出る: 0.78。境目で点いたり消えたりしない)
  gsap.ticker.add(function () { const t = tl.time(); setFinal(show.finalOn ? t >= 0.78 : t >= 0.84); });

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
