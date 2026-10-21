#!/usr/bin/env python3
"""テーマ名から 1920x1080 のカバー画像(グラデーション + 文字)を作る。

使い方:
  python3 make_cover.py "雨の日のLofi" -o cover.png [--theme rain|cafe|night|morning|sleep] [--font FONT.ttc]
依存: pip install pillow
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

THEMES = {  # (上の色, 下の色)
    "rain": ((38, 50, 72), (120, 140, 165)),
    "cafe": ((70, 45, 35), (190, 140, 95)),
    "night": ((15, 18, 45), (70, 55, 110)),
    "morning": ((250, 205, 150), (255, 240, 210)),
    "sleep": ((10, 15, 35), (35, 50, 90)),
}
FONTS = [
    "C:/Windows/Fonts/meiryo.ttc", "C:/Windows/Fonts/YuGothB.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]
W, H = 1920, 1080


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("title")
    ap.add_argument("-o", "--output", type=Path, default=Path("cover.png"))
    ap.add_argument("--theme", choices=THEMES, default="rain")
    ap.add_argument("--font", type=Path)
    args = ap.parse_args()

    font_path = args.font or next((Path(f) for f in FONTS if Path(f).exists()), None)
    if font_path is None:
        print("日本語フォントが見つかりません。--font でフォントファイルを指定してください", file=sys.stderr)
        return 1

    top, bottom = THEMES[args.theme]
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))

    light = args.theme == "morning"
    color = (60, 45, 35) if light else (245, 245, 250)
    size = 150
    font = ImageFont.truetype(str(font_path), size)
    while draw.textlength(args.title, font=font) > W * 0.85 and size > 40:
        size -= 6
        font = ImageFont.truetype(str(font_path), size)
    w = draw.textlength(args.title, font=font)
    draw.text(((W - w) / 2, H / 2 - size / 2), args.title, font=font, fill=color)

    img.save(args.output)
    print(f"画像: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
