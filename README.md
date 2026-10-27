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
- X への画像付き投稿に対応しています(`--image` の URL から取得して添付)。JPEG / PNG / GIF / WebP、5MB 以下が対象で、取得失敗・非対応形式・サイズ超過はエラーになります。
- 下書きは `drafts/` に保存されます(`.gitignore` 済み)。
