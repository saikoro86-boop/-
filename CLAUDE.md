# CLAUDE.md

このリポジトリで作業するときの前提と決まりです。詳しい仕様は `README.md`、中継役の設置は `worker/README.md` にあります。

## 概要

主役は **テニスコート空き検索**(奈良県・木津川市)です。3人が、ほぼ iPhone だけで使います。

- 各予約サイトの空き状況を GitHub Actions が3時間ごとに取得し、**画面とデータだけ**を公開用の別リポジトリ(GitHub Pages)に書き出します。このリポジトリは非公開です。
- 画面は `public/index.html` 1枚(ビルドなし・ライブラリなしの HTML/CSS/JS)。PWA(`manifest.webmanifest`、`sw.js`)。
- 同じリポジトリに、元のひな形(フォーム自動化 `src/index.ts`、SNS 下書き管理 `src/sns/`)も残っています。頼まれない限り触りません。

### 技術スタック

- Node.js(`.nvmrc` と `package.json` の `engines` に従う)、TypeScript(strict、CommonJS、ES2021)、`ts-node` で直接実行
- テスト: Node 標準の `node:test` + `node:assert/strict`(テスト用ライブラリなし)
- 取得は `fetch` と正規表現・文字列処理(HTML パーサーなし)。Puppeteer は空き検索では使いません
- リンター・フォーマッターは **ありません**。既存の書き方に合わせます

## コマンド

```bash
npm test                 # 全テスト(tests/*.test.ts)
npm run typecheck        # tsc --noEmit(本体と worker の両方)
npm run courts -- 2026-11-14 [市名]   # 指定日の空きを端末で確認(実サイトにアクセスする)
npm run courts:build     # 全サイトを取得して public/data2.json を作る(実サイトにアクセスする。コミットしない)
npm run bookmarklet      # public/bookmarklet.html を作る(木津川市の取り込み用)
npm run worker:build     # worker/src/*.ts → worker/worker.js(Cloudflare に貼る1ファイル)
```

1件だけテストを回す:

```bash
node --require ts-node/register --test tests/fees.test.ts
```

変更したら、**`npm test` と `npm run typecheck` の両方**を通してから commit します(`.github/workflows/ci.yml` が PR で、`courts.yml` が公開の前に、同じ2つを実行します)。

### 取得の部分を変えたとき

`build.ts`・`collect/`・`publish.ts` などを変えて「出力は変わらないはず」のときは、**変更の前後で `data2.json` を比べます**。実サイトには繋がず、`tests/fixtures/` の実物を返す `fetch` の差し替えと、待ち時間を飛ばす `setTimeout` の差し替えを `--require` で読み込んで `build.ts` を動かし、`updatedAt` 以外が同じことを確かめます(奈良スーパーアプリは2建物だけ応答させ、ほかは 503 にします)。日付をまたぐと取得する日が変わるので、前後は同じ日に取ります。

### 画面の確認

画面を変えたら、スマホの大きさで実際に見ます。

- `public/` を別の場所にコピーして `python3 -m http.server` で配信し、Playwright の `devices['iPhone SE']` と `devices['iPhone 13']` で開く(ライト・ダーク両方)。
- 見るもの: 横スクロールが出ない(`scrollWidth` = 画面幅)、コンソールエラーなし、最初の画面に空きの時間が見える。
- `page.clock.install()` で時刻を固定すると、手元の `data2.json` を「今日」のデータとして見られます。
- 外部サイトには飛ばさない(`context.route` で localhost 以外を止める)。

## ディレクトリ

| 場所 | 中身 |
|---|---|
| `src/courts/` | 取得・整形・公開データの組み立て。`build.ts`(全体の流れだけ: 設定を読む → 集める → 組み立てる → 書き出す)、`collect/`(サイトの種類ごとの取得: `kashikan.ts`・`nsa.ts`、結果の入れ物 `collected.ts`)、`publish.ts`(公開データの形 `PublishedCommon` と前回データの取得)、`config.ts`(設定の読み込みと検査)、`http.ts`(時間制限・やり直し・待ち)、`guard.ts`(公開を見送る判断)、`keys.ts`(施設の鍵と名前のそろえ方)。低レベルの取得・解析は `kashikan.ts`(奈良市・生駒市)、`narasuperapp.ts`、`kizugawa.ts`(木津川市・HTML の解析だけ)。ほかに `status.ts`(空きなしの理由)、`compact.ts`(配信用の圧縮と 🆕)、`weather.ts`、`phone.ts`、`cli.ts` |
| `src/bookmarklet/` | 木津川市の取り込み用ブックマークレットの生成 |
| `config/` | 手で管理するデータ。`courts.json`(対象サイト・電話番号)、`fees.json`(料金)、`official.json`(公式ページ)、`places.json`・`coords.json`(場所)、`courtinfo.json`(コートの種類) |
| `public/` | 公開される画面。`index.html`(画面の組み立て)、`app-logic.js`(画面に触らない処理: 日付・時間・距離・枠のまとめ・カレンダーの文。`tests/app-logic.test.ts` でテスト)、`sw.js`、`manifest.webmanifest`、`icons/` |
| `tests/` | `*.test.ts` と `fixtures/`(実サイトの画面・応答を保存したもの) |
| `worker/` | 手動更新ボタンの中継役(Cloudflare Worker)。`src/` が元、`worker.js` は生成物 |
| `.github/workflows/courts.yml` | 3時間ごとの取得と公開 |

生成物は手で編集せず、`public/data2.json` と `dist/` はコミットもしません: `worker/worker.js`、`public/bookmarklet.html`、`public/data2.json`、`dist/`。画面を確かめるときのデータは、`npm run courts:build` で作るか、公開サイトの `data2.json` を `public/` に置きます。

## 設計と書き方

- **解析は純粋関数にする。** 「取得する関数」と「HTML/JSON を読む関数」を分け、読む側は `tests/fixtures/` の実物でテストします。新しいサイトや画面の変更に対応するときは、まず実物を fixtures に保存します(ファイル名は `サイト-YYYYMMDD.拡張子`)。
- **1つの失敗で全体を止めない。** `collect/` はサイト・建物・日付ごとに `try/catch` し、`acc.fail(...)` で記録して先へ進みます。記録は2つ: `errors`(画面の件数)と `failures`(取得できなかったエリア・日。画面が「空きなしではありません」と知らせ、`markNew` が偽の 🆕 を避けるのに使う)。公開するデータに、取得元の URL・ID・エラーの詳細は入れません。
- **失敗が多い回は公開しない。** 失敗があって、しかも枠が0件、または前回の3割未満に減ったら、`guard.ts` が公開を見送ります(ジョブが失敗し、前回のデータが残る)。
- **通信は `http.ts` を通す**(`fetchChecked` は20秒の時間制限と応答コードの確認、`withRetry` は最大3回)。`fetch` を直接書かないこと。
- **設定は `config.ts` の `loadConfigs()` で読む。** `JSON.parse(...) as {...}` で直接読まない。設定の項目を足すときは、そこのスキーマも直します(料金は、出典・確認日・裏付けが必須)。
- **先方に負荷をかけない。** リクエストの間に待ち時間(300ms〜1.5秒)を入れ、やり直しは最大3回。並列に投げません。
- 配信データは `data2.json`(コートの表 + `byDate` の `[ci, start, end, off, new?]`)。形を変えるときは `compact.ts`、`publish.ts`、`index.html` の `expandV2`、テストを同時に直します。
- 時刻は「時」の小数(9.5 = 9:30)。日付は `YYYY-MM-DD` の文字列のまま扱い、端末のタイムゾーンに頼りません(画面は日本時間を自前で計算)。
- 施設は「エリア名|施設名」で識別します(作るのは `keys.ts` の `facilityKey()`。名前のそろえ方は `normName()`)(お気に入り・非表示・`official.json`・`coords.json` の鍵)。施設名の表記を変えると、利用者の設定が外れます。
- 命名: 変数・関数は camelCase、型は PascalCase、ファイルは小文字。export する関数・型には、日本語で1〜2行の説明を付けます。
- **コメント・テスト名・コミットメッセージ・PR・画面の文言は日本語**。コメントは「なぜそうしているか」を書きます。
- 画面の処理は、DOM・`localStorage`・通信に触らないものを `public/app-logic.js` に置き、`index.html` はそれを使う(テストできるように)。ビルドなしの素の JavaScript で書く。`public/` にファイルを足したら、`courts.yml` のコピーと `sw.js`(保存するもの・ネット優先にするもの)も直す。
- `public/index.html`: 外から来た文字列(施設名など)は `textContent` で入れます。`innerHTML` は固定の文字列だけ。色は CSS 変数(`--accent`、`--on-accent` など)を使い、`@media (prefers-color-scheme: dark)` でも読めることを確かめます。

## 守ること(このプロジェクト独自の制約)

### 予約サイトとの付き合い方

- **サイトの防御を回避しない。** 403、WAF、Cloudflare に止められたら、そこでやめて報告します。User-Agent の偽装、ヘッドレスブラウザでのすり抜け、プロキシなどは使いません。木津川市は Cloudflare の内側なので、自動取得はせず、利用者が自分のブラウザで開いた画面をブックマークレットで取り込む方式です。
- **ログイン・予約操作をしない。予約サイトの ID・パスワードを保存しない。** 4サイトとも、利用規約で ID・パスワードを他人に使わせることを禁じています。「ツール上で予約まで」は作りません。画面からは予約サイトへ案内するだけです。
- 取得するのは、ログインなしで誰でも見られる空き状況だけです。

### 表示するデータの確かさ

- **料金は、公式の資料で確かめたものだけ**を `config/fees.json` に入れます。各項目に `source`(出典 URL)、`checkedAt`(確認日)、`crossCheck`(別の資料での裏付け。食い違えば `conflict`)が必須です。推測の金額は入れません。確かめられない施設は、公式ページへのリンクにします。
- 電話番号、公式ページ、コートの種類、位置も同じです。出典と確認日を付け、未確認のものは未確認と表示します。
- 「空き」の読み方を変えるとき(記号の意味など)は、公式の画面と突き合わせて、根拠を README に書きます。
- 天気は気象庁の予報(奈良県北部・京都府南部)。取得に失敗しても、空き状況の公開は続けます。

### 画面

- **機能や情報を増やすより、減らす・短くする。** 利用者から「複雑になると見にくく、使いにくい」と言われています。ボタンや説明文を足す前に、既存のものにまとめられないか考えます。
- スマホが基準です。押す場所は 36px 以上、文字は 12px 以上、iPhone SE(幅 320px)で横にはみ出さないこと。
- 行き先の決まり: **時間の枠 → 予約サイト、施設名 → 施設の公式ページ、☎(点線)の枠 → 同じカードの電話番号**。コート名はリンクにしません。
- お気に入り・非表示・前回の選択は、**そのスマホの `localStorage` だけ**に保存します(`courtPrefs`、`courtUI` など)。利用者どうしで共有しません。鍵の名前や形を変えるときは、既存の設定が消えないようにします。
- 奈良スーパーアプリは、日付を指定して予約画面を開けません(調査済み。README 参照)。

### 秘密と公開範囲

- トークン・合言葉・`.env` の中身は、コード・コミット・PR・チャットに書きません。GitHub の Secrets / Variables(`SITE_REPO_TOKEN`、`SITE_REPO`、`REFRESH_URL`)と Cloudflare の Secret にだけ置きます。
- 公開されるのは `public/` のうち、`courts.yml` がコピーするファイルだけです。**`public/` に新しいファイルを足したら、`courts.yml` の公開の手順にも足す**必要があります(忘れると公開サイトに出ません)。
- 公開サイトの URL は推測されにくい名前にしてあります。README やコミットで不用意に広めません。

### Git と公開の流れ

- 既定のブランチは `claude/puppeteer-form-automation-dd1dmz`。作業は指定された作業ブランチで行い、PR をこのブランチに向けます。
- **マージは、利用者が「はい」と言ってから。** PR は squash でマージします。
- マージ後は、`courts.yml` を既定のブランチで手動実行し、成功と公開を確かめます(画面の変更は、この実行で初めて公開サイトに出ます)。
- squash のあと、作業ブランチが既定のブランチと食い違います。次の PR の前に `git merge -s ours origin/<既定のブランチ>` で合わせます(中身が同じことを `git diff` で確かめてから。force push はしません)。
- 利用者への報告は日本語で、専門用語を避け、できたこと・確かめたこと・確かめられていないことを分けて書きます。
