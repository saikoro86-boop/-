/**
 * 木津川市の空き取り込み用ブックマークレットを生成する。
 *   npm run bookmarklet            (APP_URL を環境変数で上書き可能)
 * 出力: public/bookmarklet.html(登録用ページ)
 *
 * ブックマークレットは、ユーザーが自分のブラウザで開いている空き状況画面の HTML を読み、
 * アプリの URL の #import=<base64> に載せて開くだけ。サイトへの追加リクエストはしない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as ts from "typescript";

const APP_URL = process.env.APP_URL ?? "https://saikoro86-boop.github.io/-/";

const parser = ts
  .transpileModule(readFileSync("src/courts/kizugawa.ts", "utf-8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext, removeComments: true },
  })
  .outputText.replace(/^import .*$/gm, "") // 型 import だけなので除去
  .replace(/\bexport\s+/g, "");

const entry = `
var slots = parseKizugawaHtml(document.documentElement.outerHTML);
if (!slots.length) {
  alert("空き情報が見つかりませんでした。木津川市の「施設別空き状況照会」の表が出ている画面で押してください。");
} else {
  var payload = { source: "import", importedAt: new Date().toISOString(), slots: slots };
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  location.href = ${JSON.stringify(APP_URL)} + "#import=" + b64;
}`;

const code = `(function(){${parser}\n${entry}\n})();`;
const oneLine = code.replace(/\n\s*/g, " ");
const bookmarklet = "javascript:" + encodeURIComponent(oneLine);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

writeFileSync(
  "public/bookmarklet.html",
  `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>木津川市の空きを取り込む</title>
<style>body{font:16px/1.6 -apple-system,"Hiragino Sans",sans-serif;margin:0;padding:16px;max-width:640px}
a.bm{display:inline-block;padding:10px 18px;border-radius:999px;background:#1f8a4c;color:#fff;text-decoration:none;font-weight:600}
textarea{width:100%;height:8em;font:12px monospace}code{background:#eee;padding:0 4px;border-radius:4px}</style></head>
<body>
<h1>木津川市の空きを取り込む</h1>
<p>木津川市の予約システムは自動アクセスを制限しているため、<b>あなた自身がブラウザで開いた画面</b>から空きを読み取ります。サイトへの追加のアクセスはしません。</p>
<h2>1. ブックマークに登録する</h2>
<p><b>パソコン:</b> 下のボタンをブックマークバーへドラッグします。</p>
<p><a class="bm" href="${esc(bookmarklet)}">木津川市の空きを取り込む</a></p>
<p><b>スマホ:</b> 適当なページをブックマークに追加し、そのURL欄を、下のコードを全部コピーして置き換えます。</p>
<textarea readonly onclick="this.select()">${esc(bookmarklet)}</textarea>
<h2>2. 使う</h2>
<ol>
<li>木津川市の予約システムで、「施設別空き状況照会」の表(○と×の画像)が出ている画面を開く。ログインは不要です。</li>
<li>ブックマークを押す。</li>
<li>このアプリが開き、木津川市の空きが表示されます(この端末にだけ保存されます)。</li>
</ol>
<p>取り込めるのは<b>画面に表示されている期間(7日間または31日間)</b>だけです。古いデータは24時間後に「古い可能性」と表示されます。</p>
<p>動かないときは、サイトがブックマークレットを禁止している可能性があります。その場合は教えてください。別の方法にします。</p>
<p><a href="./">アプリに戻る</a></p>
</body></html>`,
);
console.log(`public/bookmarklet.html を生成(${bookmarklet.length} 文字, APP_URL=${APP_URL})`);
