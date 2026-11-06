# puppeteer-form-automation

Puppeteer (stealth) + TypeScript によるフォーム自動化のボイラープレートと、SNS 投稿を「下書き → 承認 → 予約投稿」で管理する AI 社員(`npm run sns`)です。

## セットアップ

```bash
npm install
cp .env.example .env   # 値を入れる(.env は .gitignore 済み。コミットしないこと)
npm run typecheck
```

## 1. フォーム自動化

```bash
npm start
```

- `.env` の `TARGET_URL` を開き、`LOGIN_ID` / `LOGIN_PASSWORD` でログインします。
- フォームのセレクタは `src/index.ts` の `SELECTORS` を対象サイトに合わせて書き換えてください。
- セッション情報は `USER_DATA_DIR`(既定 `./user_data`)に保持されます。

## 2. SNS 管理 AI 社員

Claude が投稿文を下書きし、人が承認したものだけを X / Threads / Instagram に投稿します。

### 事前準備

- `.env` に `ANTHROPIC_API_KEY` と、使う媒体の認証情報を設定します(`.env.example` 参照)。
- `config/brand.md` に自社のトーンや禁止事項を書くと、投稿文に反映されます。

### 使い方

```bash
# 下書きを作る(媒体は省略すると x,threads,instagram すべて)
npm run sns -- draft "10/10から秋の新メニュー販売開始" --image https://example.com/menu.jpg --at "2026-10-10T09:00+09:00" --platforms x,threads

npm run sns -- list [pending|approved|rejected|posted|failed]   # 一覧
npm run sns -- show <id>                                        # 1件表示
npm run sns -- edit <id> "<新しい本文>"                          # 編集(pending に戻る)
npm run sns -- approve <id> [<id> ...]                          # 承認
npm run sns -- reject <id> [<id> ...]                           # 却下
npm run sns -- publish [--dry-run]                              # 投稿時刻を過ぎた承認済みを投稿
```

### 流れ

1. `draft` で下書きを作る(`pending`)
2. 内容を確認し、`approve` で承認(`approved`)
3. `publish` を実行すると、予約時刻(`--at`)を過ぎた承認済みの下書きが投稿される(`posted`)
   - `--at` を付けなかった場合は、承認後の次回 `publish` ですぐ投稿されます。
   - `publish` は自動では動かないので、予約投稿として使うなら cron などで定期実行してください。
   - 失敗すると `failed` になり、原因は `show` で確認できます。直して `approve` し直すと再投稿されます。

### 注意点

- 文字数上限: X は 280(全角は 2 として換算)、Threads は 500 文字、Instagram は 2200 文字。超えると承認できません。
- Instagram は画像が必須です(`--image` に公開 URL を指定)。
- X への画像付き投稿は未対応です。
- 下書きは `drafts/` に保存されます(`.gitignore` 済み)。

## 3. テニスコート空き検索

奈良市・生駒市(「いつでも貸館」方式の予約サイト)のテニスコート空き状況をまとめて調べ、スマホ向けページに表示します。ログインは不要です。

```bash
npm run courts -- 2026-11-14 [市名]   # 指定日の空きをコマンドで確認
npm run courts:build                  # 今後30日分を public/data.json に出力
```

- `public/index.html` が画面です。`data.json` と同じ場所に置いて開きます(日付・エリア・時間帯で絞り込み)。
- 対象サイトは `config/courts.json` で追加できます。同じ「いつでも貸館」方式の市なら URL を足すだけです。
- `.github/workflows/courts.yml` が3時間ごとに取得して GitHub Pages に公開します。リポジトリの Settings → Pages で Source を「GitHub Actions」にしてください。
- 空き状況の取得にはログインや予約操作を行いません。サーバに負荷をかけないよう、1リクエストごとに待ち時間を入れています。

### 木津川市(自動取得なし)
京都府の予約システムは自動アクセスを制限しているため、自動取得はしません(防御の回避もしません)。
- `config/courts.json` の `type: "link"` で、画面に「公式サイトで空きを確認」のカードを出します。`entryUrl` は普段開く空き状況ページに差し替えてください。
- 自分のブラウザで見た空き情報を、アプリに取り込む入口があります。アプリURLの `#import=<base64>` に次の JSON を載せて開くと、この端末の localStorage にだけ保存されます(サーバには送られません)。
  ```json
  {"source":"import","importedAt":"2026-11-06T07:20:00Z","slots":[{"date":"2026-11-14","site":"木津川市","facility":"木津川台公園","court":"テニスコートA","start":9,"end":12}]}
  ```
- 受け取った JSON は、型・範囲を検証してから使います。24時間以上前の取り込みは「古い可能性」と表示します。
- 公式画面から JSON を作るブックマークレット(解析部分)は、公式の空き画面を確認してから作ります。

### 未対応
- 奈良県営(奈良スーパーアプリ)・大和郡山市は未対応です。
