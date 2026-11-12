# 中継役(手動更新ボタン + 3時間おきの時計)の設置手順

画面の「⟳ 空き状況を取得し直す」ボタンを、動くようにするための手順です。
画面(誰でも見られる公開ページ)に GitHub の鍵を置けないので、鍵を持つ**中継役**を、Cloudflare(無料)に1つ置きます。

```
[画面のボタン] → [中継役(鍵と合言葉を持つ)] → [GitHub で取得を実行]
```

- 合言葉を知っている人だけが、実行できます。
- 前回の実行から10分以内は、受け付けません(連打しても、GitHub の無料枠を使い切りません)。
- 画面だけ(①「↻ 最新を読み込む」)は、この設置をしなくても、使えます。

## 準備するもの(3つ)
1. **合言葉**: 3人で共有するもの。**12文字以上**にしてください(例: 好きな単語を3つつなげる)。
2. **GitHub の鍵(トークン)**: 下の手順Aで作ります。
3. **Cloudflare のアカウント**: 無料です。

## 手順A: GitHub の鍵を作る
1. https://github.com/settings/personal-access-tokens/new を開きます。
2. 次のとおり入力します。
   - Token name: `courts-refresh`
   - Expiration: 90 days(切れたら、同じ手順で作り直します)
   - Repository access: **Only select repositories** → 取得プログラムのリポジトリ(`-`)**だけ**を選ぶ
   - Permissions → Repository permissions → **Actions: Read and write**(ほかは、変えない)
3. 「Generate token」を押して、表示された `github_pat_…` を、**コピー**します(一度しか表示されません)。
   - **この文字列は、チャットやメールに貼らないでください。** 手順Cの入力欄にだけ貼ります。

## 手順B: Cloudflare に、中継役を置く
1. https://dash.cloudflare.com/ でアカウントを作ります(無料)。
2. 左のメニュー「Workers & Pages」→「Create」→「Create Worker」を押します。
3. 名前を入れます(例: `courts-refresh-xxxx`。わかりにくい名前にしてください)。「Deploy」を押します。
4. 「Edit code」を押して、**中のコードをすべて消し**、このフォルダの `worker/worker.js` の中身を、**全部コピーして貼り付け**ます。右上の「Deploy」を押します。

## 手順C: 設定(変数と秘密)を入れる
Worker の画面で「Settings」→「Variables and Secrets」→「Add」から、次の7つを入れます。

| 種類 | 名前 | 値 |
|---|---|---|
| Text(文字) | `GH_OWNER` | `saikoro86-boop` |
| Text | `GH_REPO` | `-` |
| Text | `GH_WORKFLOW` | `courts.yml` |
| Text | `GH_REF` | `claude/puppeteer-form-automation-dd1dmz`(メインのブランチ名) |
| Text | `ALLOWED_ORIGIN` | `https://saikoro86-boop.github.io` |
| **Secret(秘密)** | `GH_TOKEN` | 手順Aの `github_pat_…` |
| **Secret(秘密)** | `REFRESH_PASSCODE` | 決めた合言葉 |

入れたら「Deploy」を押します。

## 手順D: 画面に、中継役のURLを教える
1. Worker の画面の上に出ている URL(`https://courts-refresh-xxxx.〇〇.workers.dev`)を、コピーします。
2. GitHub の取得プログラムのリポジトリ → Settings → Secrets and variables → Actions → **Variables** → New repository variable
   - Name: `REFRESH_URL`
   - Value: コピーした URL(最後に `/` を付けない)
3. 「Actions」タブから、ワークフロー「テニスコート空き状況の更新」を、1回、手動で実行します。
4. 終わったら、公開サイトを再読み込みします。**「⟳ 空き状況を取得し直す」ボタンが出ます。**

## 手順E: 3時間おきの時計を入れる(これが、更新を確実に3時間おきにするための設定です)
GitHub の定期実行は、混んでいると遅れたり飛ばされたりして、実際には8〜10時間おきにしか動いていません。中継役に「時計」を持たせて、**GitHub の定期実行が動かなかったときだけ**、補います。
1. Worker の画面で「Settings」→「Trigger Events」(または「Triggers」)→「Cron Triggers」→「Add」を押します。
2. 次を入れて保存します(時刻は世界標準時(UTC)です)。
   ```
   22 */3 * * *
   ```
   (毎日 0:22・3:22・6:22 … の3時間おき。GitHub の定期実行(毎時17分)の5分あとです)
3. 動き:
   - 直近の取得が、終わって2時間30分以内、または実行中なら、**何もしません**(GitHub の定期実行が動いたということです)。
   - それより古ければ、取得を起動します(GitHub の定期実行が飛ばされたということです)。
   - 結果は、Worker の「Logs」(または「Observability」)に、「時計 …: 見送り / 起動しました」と残ります。
4. 動いているかの確認: GitHub の「Actions」タブで、実行の「Event」が `workflow_dispatch` のものが、定期実行(`schedule`)が飛ばされた回に増えます。
5. **鍵(GitHub のトークン)は90日で切れます。** 切れると、時計も手動更新ボタンも、静かに動かなくなります(Logs に「応答 401」と出ます)。手順Aで作り直して、`GH_TOKEN` を入れ替えてください。

## 使い方
- ボタンを押す → 初回だけ、合言葉を聞かれます(その端末に覚えます)。
- 「取得を開始しました」と出ます。**約5〜10分**で、画面が新しい内容に変わります(自動で確認します)。
- 「さきほど更新したばかり」と出たら、表示された分だけ待ってください。

## 困ったとき
| 症状 | 原因と対処 |
|---|---|
| ボタンが出ない | 手順Dの `REFRESH_URL` が未設定、または、ワークフローの実行がまだ。もう一度、手動で実行して、再読み込みする |
| 「合言葉が違います」 | `REFRESH_PASSCODE` と、入力した合言葉が違う。大文字小文字・空白も同じにする |
| 「依頼に失敗しました」 | `ALLOWED_ORIGIN` が、公開サイトのアドレス(`https://〇〇.github.io`。末尾の `/` や、その後ろのパスは付けない)と違う。または、`GH_TOKEN` の期限切れ・権限不足(Actions: Read and write) |
| 取得が、いつまでも終わらない | GitHub の「Actions」タブで、実行が赤い×になっていないか見る |

## 安全のために
- 合言葉と鍵は、画面にも、このリポジトリにも、書かれません。Cloudflare の「Secret」にだけ入ります。
- 鍵は、取得プログラムのリポジトリの「Actions」だけを操作できる権限にしてください(他の権限を付けない)。
- 合言葉が漏れたら、Cloudflare で `REFRESH_PASSCODE` を変えるだけで、無効にできます。
- コードは `worker/src/*.ts` が元です。変更したら `npm run worker:build` で `worker/worker.js` を作り直し、Cloudflare に貼り直します。
