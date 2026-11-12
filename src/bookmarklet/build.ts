/**
 * 空きの取り込み用ブックマークレットを生成する(木津川市・奈良市・生駒市)。
 *   npm run bookmarklet            (APP_URL を環境変数で上書き可能)
 * 出力: public/bookmarklet.html(登録用ページ)
 *
 * ブックマークレットは、ユーザーが自分のブラウザで開いている空き状況画面の HTML を読み、
 * アプリの URL の #import=<base64> に載せて開くだけ。サイトへの追加リクエストはしない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as ts from "typescript";

/**
 * ブックマークレットに入れるファイル(依存の順)。import 文は取り除いて、1つにつなげる。
 * ここにないファイルの関数は、ブックマークレットの中では使えない(tests/bookmarklet.test.ts が、実際に動かして確かめる)
 */
const SOURCES = ["src/courts/keys.ts", "src/courts/kizugawa.ts", "src/courts/kashikan.ts", "src/courts/kashikan-page.ts"];

const transpile = (file: string) =>
  ts
    .transpileModule(readFileSync(file, "utf-8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.ESNext, removeComments: true },
    })
    .outputText.replace(/^import [^;]*;\s*$/gm, "") // 型の import と、上でつなげるファイルからの import だけなので除去
    .replace(/\bexport\s+/g, "");

/** ブックマークレットの中身(JavaScript)。appUrl は、取り込んだ結果を渡すアプリの住所 */
export function bookmarkletCode(appUrl: string): string {
  const entry = `
var html = document.documentElement.outerHTML;
var site = kashikanSiteOf(location.href);
var payload = null;
if (site) {
  var page = parseKashikanPage(html, site);
  if (!page) {
    alert("読み取れませんでした。「目的で検索」でテニスを選び、表示を「1日」にした、○や×の表が出ている画面で押してください。(日付: " + kashikanPageDate(html) + " / 表の数: " + (html.split('class="koma-area"').length - 1) + ")");
  } else {
    payload = { source: "import", importedAt: new Date().toISOString(), slots: page.slots, covers: [{ s: page.site, d: page.date }] };
  }
} else {
  var slots = parseKizugawaHtml(html);
  if (!slots.length) {
    alert("空き情報が見つかりませんでした。木津川市の「施設別空き状況照会」の表、または、奈良市・生駒市の「目的で検索」の結果(1日表示)が出ている画面で押してください。");
  } else {
    var sites = {}; slots.forEach(function (x) { sites[x.site] = 1; });
    payload = { source: "import", importedAt: new Date().toISOString(), slots: slots, covers: Object.keys(sites).map(function (s) { return { s: s }; }) };
  }
}
if (payload) {
  var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  location.href = ${JSON.stringify(appUrl)} + "#import=" + b64;
}`;
  return `(function(){${SOURCES.map(transpile).join("\n")}\n${entry}\n})();`;
}

function main() {
  const APP_URL = process.env.APP_URL ?? "https://saikoro86-boop.github.io/-/";
  const oneLine = bookmarkletCode(APP_URL).replace(/\n\s*/g, " ");
  const bookmarklet = "javascript:" + encodeURIComponent(oneLine);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  writeFileSync(
    "public/bookmarklet.html",
    `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>空きを取り込む</title>
<style>body{font:16px/1.6 -apple-system,"Hiragino Sans",sans-serif;margin:0;padding:16px;max-width:640px}
a.bm{display:inline-block;padding:10px 18px;border-radius:999px;background:#1a7a43;color:#fff;text-decoration:none;font-weight:600}
textarea{width:100%;height:8em;font:12px monospace}h2{font-size:18px;margin-top:1.6em}li{margin:.3em 0}</style></head>
<body>
<h1>空きを取り込む(奈良市・生駒市・木津川市)</h1>
<p>この3つの市の予約サイトは、自動で空きを取りに行けません。代わりに、<b>あなたが自分のスマホで開いた画面</b>から、ボタン1つで空きを読み取ります。予約サイトへの追加のアクセスはしません。ログインも不要です。</p>
<h2>1. 最初に1回だけ: ブックマークに登録する</h2>
<p><b>iPhone(Safari):</b></p>
<ol>
<li>下の枠の文字を長押しして、「すべてを選択」→「コピー」。</li>
<li>このページを、共有ボタン →「ブックマークを追加」で保存する(名前は「空きを取り込む」など)。</li>
<li>ブックマークの一覧を開き、「編集」→ いま保存したブックマーク → 2行目(住所)を全部消して、コピーした文字を貼り付けて「完了」。</li>
</ol>
<textarea readonly onclick="this.select()">${esc(bookmarklet)}</textarea>
<p><b>パソコン:</b> 下のボタンを、ブックマークバーへドラッグします。</p>
<p><a class="bm" href="${esc(bookmarklet)}">空きを取り込む</a></p>
<h2>2. 使う</h2>
<p><b>奈良市・生駒市:</b></p>
<ol>
<li>予約サイトを開き、「目的で検索」でテニス(硬式テニスなど)と、見たい日を選んで検索する。</li>
<li>表示が<b>「1日」</b>で、○や×の表が出ている画面で、登録したブックマークを押す。</li>
<li>このアプリが開き、その日の空きが出ます。ほかの日も見たいときは、日を変えて、もう一度押します(取り込んだ日は、たまっていきます)。</li>
</ol>
<p><b>木津川市:</b></p>
<ol>
<li>予約システムで、「施設別空き状況照会」の表(○と×の画像)が出ている画面を開く。</li>
<li>ブックマークを押す。画面に出ている期間(7日間または31日間)が、まとめて取り込まれます。</li>
</ol>
<p>取り込んだ空きは、<b>このスマホにだけ</b>保存されます(ほかの人の画面には出ません)。24時間たつと「古い可能性」と表示されます。</p>
<p>押しても何も起きないときは、予約サイトがこの仕組みを止めている可能性があります。そのときは教えてください。</p>
<p><a href="./">アプリに戻る</a></p>
</body></html>`,
  );
  console.log(`public/bookmarklet.html を生成(${bookmarklet.length} 文字, APP_URL=${APP_URL})`);
}

if (require.main === module) main();
