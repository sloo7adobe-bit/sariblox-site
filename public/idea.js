/* ==========================================================
   アイディア箱: テキストを書いて送るだけ
   ========================================================== */
(function () {
  const form = document.getElementById("idea-form");
  if (!form) return;
  const ta = document.getElementById("idea-text");
  const btn = document.getElementById("idea-send");
  const err = document.getElementById("idea-error");
  const done = document.getElementById("idea-done");
  const count = document.getElementById("idea-count");
  const LS_KEY = "sb_idea_at";
  let doneTimer = 0;

  function setError(msg) {
    err.textContent = msg;
    err.hidden = !msg;
  }

  ta.addEventListener("input", function () {
    count.textContent = ta.value.length + " / 500";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    setError("");
    done.hidden = true;
    const text = ta.value.trim();
    if (text.length < 5) {
      setError("もう少し書いてください(5文字以上)。");
      ta.focus();
      return;
    }
    // 連投防止(端末側でも 60 秒あける)
    try {
      const last = parseInt(localStorage.getItem(LS_KEY), 10);
      if (last && Date.now() - last < 60 * 1000) {
        setError("続けて送るときは 1 分あけてください。");
        return;
      }
    } catch (e2) {}

    btn.disabled = true;
    btn.textContent = "送信中…";
    fetch("/api/idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ text: text, website: form.elements.website ? form.elements.website.value : "" }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.body && res.body.ok) {
          ta.value = "";
          count.textContent = "0 / 500";
          done.hidden = false;
          try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (e2) {}
          clearTimeout(doneTimer);
          doneTimer = setTimeout(function () { done.hidden = true; }, 5000);
        } else {
          setError((res.body && res.body.error) || "送信に失敗しました。時間をおいてもう一度お試しください。");
        }
      })
      .catch(function () {
        setError("通信に失敗しました。電波のいいところでもう一度お試しください。");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "送る";
      });
  });
})();