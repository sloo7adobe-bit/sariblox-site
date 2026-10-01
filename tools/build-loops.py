# -*- coding: utf-8 -*-
"""
ループ動画の変換ツール

「ループ動画」フォルダに入れた動画を、サイト用に軽く変換して public/loops/ に出力する。

ファイル名の付け方(どちらでも OK):
  - 番号:  1.mp4, 2.mp4 ...  → 「こんな動画を作っています」の左上から数えた順番
  - 動画ID: IbyUW3-2kks.mp4  → その YouTube 動画のタイルに入る

使い方:  python tools/build-loops.py
"""
import json, os, re, subprocess, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ループ動画")
OUT = os.path.join(ROOT, "public", "loops")
MAX_SECONDS = 8      # これより長い動画は先頭からこの秒数で切る
WIDTH = 720          # 横幅(高さは比率を保って自動)
EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi", ".gif")
ID_RE = re.compile(r"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")


def to_id(v):
    v = (v or "").strip()
    for pat in (r"[?&]v=([A-Za-z0-9_-]{11})", r"youtu\.be/([A-Za-z0-9_-]{11})", r"^([A-Za-z0-9_-]{11})$"):
        m = re.search(pat, v)
        if m:
            return m.group(1)
    return ""


def current_video_ids():
    """今サイトに並んでいる動画の ID を順番どおりに返す(管理画面の保存内容 → 無ければ初期値)"""
    try:
        with urllib.request.urlopen("https://sariblox.com/api/content", timeout=20) as r:
            c = (json.loads(r.read().decode("utf-8")) or {}).get("content") or {}
        ids = [to_id(v) for v in (c.get("videos") or [])]
        ids = [i for i in ids if i]
        if ids:
            return ids
    except Exception:
        pass
    js = open(os.path.join(ROOT, "public", "script.js"), encoding="utf-8").read()
    block = re.search(r"const VIDEOS = \[(.*?)\];", js, re.S).group(1)
    return [i for i in (to_id(x) for x in re.findall(r'"([^"]+)"', block)) if i]


def main():
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    ids = current_video_ids()
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(EXTS))
    manifest = {}
    used = set()
    for f in files:
        stem = os.path.splitext(f)[0].strip()
        vid = ""
        if re.fullmatch(r"\d{1,2}", stem):
            n = int(stem)
            if 1 <= n <= len(ids):
                vid = ids[n - 1]
            else:
                print(f"  スキップ: {f}(番号 {n} のタイルがありません。今は {len(ids)} 本)")
                continue
        else:
            m = ID_RE.search(stem)
            if m and m.group(1) in ids:
                vid = m.group(1)
        if not vid:
            print(f"  スキップ: {f}(番号か動画 ID の名前にしてください)")
            continue
        if vid in used:
            print(f"  スキップ: {f}(同じ動画のファイルが 2 つあります)")
            continue
        used.add(vid)
        src = os.path.join(SRC, f)
        dst = os.path.join(OUT, vid + ".mp4")
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", str(MAX_SECONDS), "-an",
            "-vf", f"scale={WIDTH}:-2:flags=lanczos,fps=30",
            "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "main",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        if r.returncode != 0 or not os.path.exists(dst):
            print(f"  失敗: {f}\n{r.stderr.strip()[:300]}")
            continue
        size = os.path.getsize(dst)
        manifest[vid] = f"loops/{vid}.mp4?v={int(os.path.getmtime(dst))}"
        print(f"  OK: {f} → タイル {ids.index(vid) + 1}({vid})  {size / 1024:.0f} KB")
    # 使われなくなった変換済みファイルを消す
    for f in os.listdir(OUT):
        if f.endswith(".mp4") and f[:-4] not in manifest:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)
    print(f"完了: {len(manifest)} 本のループ動画を設定しました(タイルは全 {len(ids)} 本)")


if __name__ == "__main__":
    main()
