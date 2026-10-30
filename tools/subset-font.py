# -*- coding: utf-8 -*-
"""
手書きフォント(Jiyucho)のサブセットを作り直す

サイトの文言(index.html / script.js / idea.html / idea.js)に出てくる文字だけを集めて、
public/font/jiyucho-subset.woff2 を作り直す。
手書きフォントで表示する文字(見出し・札・ボタンなど)を変えたら、これを実行してからデプロイする。

使い方:  python tools/subset-font.py   (fontTools が必要: pip install fonttools brotli)
"""
import os
import string
import sys

sys.stdout.reconfigure(encoding="utf-8")
from fontTools.subset import main as ss

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = ("public/index.html", "public/script.js", "public/idea.html", "public/idea.js")

chars = set()
for f in SOURCES:
    chars.update(open(os.path.join(ROOT, f), encoding="utf-8").read())
chars.update(string.printable)
chars.update("0123456789!?。、・ー〜「」()枚本人回円")
text = "".join(sorted(c for c in chars if ord(c) >= 32))

tmp = os.path.join(ROOT, "tmp-subset-text.txt")
open(tmp, "w", encoding="utf-8").write(text)
ss([
    os.path.join(ROOT, "public", "font", "Jiyucho.ttf"),
    "--text-file=" + tmp,
    "--flavor=woff2",
    "--output-file=" + os.path.join(ROOT, "public", "font", "jiyucho-subset.woff2"),
    "--layout-features=*",
    "--no-hinting",
    "--desubroutinize",
])
os.remove(tmp)
print("文字数:", len(text), "/ サイズ:", os.path.getsize(os.path.join(ROOT, "public", "font", "jiyucho-subset.woff2")), "bytes")
