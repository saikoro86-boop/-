#!/usr/bin/env python3
"""曲フォルダ + 画像 -> 長尺BGM動画(mp4)と、説明欄用のチャプター一覧を作る。

使い方:
  python3 build_video.py <songs_dir> <image> [-o out.mp4] [--shuffle] [--fade 3]
"""
import argparse
import random
import subprocess
import sys
import tempfile
from pathlib import Path

EXTS = {".mp3", ".wav", ".m4a", ".flac"}


def duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)], text=True)
    return float(out.strip())


def ts(sec: float) -> str:
    sec = int(sec)
    h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("songs_dir", type=Path)
    ap.add_argument("image", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("output.mp4"))
    ap.add_argument("--shuffle", action="store_true", help="曲順をランダムにする")
    ap.add_argument("--fade", type=float, default=3.0, help="曲ごとのフェード秒数(0で無し)")
    args = ap.parse_args()

    songs = sorted(p for p in args.songs_dir.iterdir() if p.suffix.lower() in EXTS)
    if not songs:
        print(f"曲が見つかりません: {args.songs_dir}", file=sys.stderr)
        return 1
    if not args.image.exists():
        print(f"画像が見つかりません: {args.image}", file=sys.stderr)
        return 1
    if args.shuffle:
        random.shuffle(songs)

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        parts, chapters, t = [], [], 0.0
        for i, song in enumerate(songs, 1):
            dur = duration(song)
            chapters.append(f"{ts(t)} {song.stem}")
            t += dur
            part = tmpdir / f"{i:03d}.wav"
            af = []
            if args.fade > 0 and dur > args.fade * 2:
                af = ["-af", f"afade=t=in:d={args.fade},afade=t=out:st={dur - args.fade}:d={args.fade}"]
            subprocess.check_call(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(song), *af,
                 "-ar", "44100", "-ac", "2", str(part)])
            parts.append(part)

        listfile = tmpdir / "list.txt"
        # ffmpeg は UTF-8 で読むので明示する(Windows の既定は cp932)。パスは / 区切りにする
        listfile.write_text(
            "".join("file '{}'\n".format(p.as_posix().replace("'", "'\\''")) for p in parts),
            encoding="utf-8")

        subprocess.check_call(
            ["ffmpeg", "-y", "-loglevel", "error", "-stats",
             "-loop", "1", "-framerate", "1", "-i", str(args.image),
             "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
             "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "1",
             "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
             str(args.output)])

    chap_file = args.output.with_suffix(".chapters.txt")
    chap_file.write_text("\n".join(chapters) + "\n", encoding="utf-8")
    print(f"動画: {args.output}  (全長 {ts(t)})")
    print(f"チャプター: {chap_file}  <- 説明欄に貼る")
    return 0


if __name__ == "__main__":
    sys.exit(main())
