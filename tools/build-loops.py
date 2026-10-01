# -*- coding: utf-8 -*-
"""
ループ動画の変換ツール

「ループ動画」フォルダに入れた動画を全部、サイト用に軽く変換して public/loops/ に出力する。
サイトの「こんな動画を作っています」は、ここで出力した動画が GIF のように並ぶ。

- ファイル名は何でも OK。並び順は名前の最後の数字順(数字なしが先頭)。
  例: 名前.mp4 → 名前_1.mp4 → 名前_2.mp4 …(Premiere の連番書き出しそのままで良い)
- 音は消える。MAX_SECONDS より長いものは先頭から切る。

使い方:  python tools/build-loops.py
"""
import json, os, re, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ループ動画")
OUT = os.path.join(ROOT, "public", "loops")
MAX_SECONDS = 8      # これより長い動画は先頭からこの秒数で切る
WIDTH = 640          # 横幅(高さは比率を保って自動)
CRF = "28"           # 画質(小さいほど高画質・重い)
EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi", ".gif")


def sort_key(name):
    stem = os.path.splitext(name)[0]
    m = re.search(r"(\d+)\s*$", stem)
    return (re.sub(r"[_\-\s]*\d+\s*$", "", stem), int(m.group(1)) if m else -1)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")


def main():
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    files = sorted((f for f in os.listdir(SRC) if f.lower().endswith(EXTS)), key=sort_key)
    clips, keep, total = [], {"manifest.json"}, 0
    for i, f in enumerate(files, 1):
        src = os.path.join(SRC, f)
        name = f"clip-{i:02d}"
        mp4, jpg = os.path.join(OUT, name + ".mp4"), os.path.join(OUT, name + ".jpg")
        r = run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", str(MAX_SECONDS), "-an",
            "-vf", f"scale={WIDTH}:-2:flags=lanczos,fps=30",
            "-c:v", "libx264", "-preset", "slow", "-crf", CRF, "-profile:v", "main",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
        ])
        if r.returncode != 0 or not os.path.exists(mp4):
            print(f"  失敗: {f}\n{r.stderr.strip()[:300]}")
            continue
        # 読み込み前に見せる 1 コマ目の画像
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-frames:v", "1", "-q:v", "5", jpg])
        v = int(os.path.getmtime(mp4))
        size = os.path.getsize(mp4)
        total += size
        keep.update({name + ".mp4", name + ".jpg"})
        clips.append({"src": f"loops/{name}.mp4?v={v}", "poster": f"loops/{name}.jpg?v={v}"})
        print(f"  {i:2d}. {f}  →  {name}.mp4  {size / 1024:.0f} KB")
    for f in os.listdir(OUT):
        if f not in keep:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump({"clips": clips}, fp, ensure_ascii=False, indent=2)
    print(f"完了: {len(clips)} 本(合計 {total / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
