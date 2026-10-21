# YouTube BGM 制作キット (Suno + ffmpeg)

週1回、まとめて作る運用を想定しています。

## 流れ
1. `prompts.md` のスタイルを Suno (Custom / Instrumental オン) に貼って約30曲生成
2. 聴いて良い曲だけ `songs/<テーマ名>/` にダウンロード(ファイル名は曲名にすると説明欄のチャプターに出ます)
3. 画像を1枚用意(商用利用OKの画像生成か自作)
4. 動画化:
   ```
   python3 youtube-bgm/build_video.py songs/rain-lofi cover.png -o rain-lofi.mp4 --shuffle
   ```
   `rain-lofi.chapters.txt` が一緒に出るので説明欄に貼る
5. YouTube Studio で予約投稿(週2〜3本に分ける)

必要なもの: `ffmpeg` / `python3`
注意: Suno は有料プラン加入中に作った曲だけ商用利用可。AI生成の開示や、似た動画の量産(収益化審査で不利)に注意。
