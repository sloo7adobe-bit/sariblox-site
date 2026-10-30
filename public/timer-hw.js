/* ハロウィンテーマの文字の影(フチ + 立体の厚み)を作る。オーバーレイとコントローラーで共通
   単位は em なので、文字サイズを変えても形がそのまま拡大縮小される */
(function () {
  var RING = "#2b0d40";
  var NEAR = [125, 52, 178]; // 厚みの手前側(明るい紫)
  var FAR = [43, 13, 64];    // 厚みの奥側(深い紫)

  function em(v) { return v.toFixed(4) + "em"; }

  // opt: { k: フチの太さ(1 = 標準), kd: 立体の深さ(1 = 標準), outline: bool, drop: bool }
  function shadow(opt) {
    var parts = [];
    var r = 0.05 * opt.k;
    var i, a;
    if (opt.outline) {
      for (i = 0; i < 12; i++) {
        a = (i * Math.PI) / 6;
        parts.push(em(Math.cos(a) * r) + " " + em(Math.sin(a) * r) + " 0 " + RING);
      }
    }
    if (opt.drop) {
      var n = 8, s = 0.016 * opt.kd, dx = 0.45;
      for (i = 1; i <= n; i++) {
        var t = (i - 1) / (n - 1);
        var c = NEAR.map(function (v, j) { return Math.round(v + (FAR[j] - v) * t); });
        parts.push(em(dx * s * i) + " " + em(s * i) + " 0 rgb(" + c.join(",") + ")");
      }
      if (opt.outline) { // 厚みの一番奥にもフチをつけて、立体の輪郭を締める
        var ex = dx * s * n, ey = s * n;
        for (i = 0; i < 8; i++) {
          a = (i * Math.PI) / 4;
          parts.push(em(ex + Math.cos(a) * r) + " " + em(ey + Math.sin(a) * r) + " 0 " + RING);
        }
      }
    }
    return parts.length ? parts.join(", ") : "none";
  }

  window.TimerHW = {
    shadow: shadow,
  };
})();
