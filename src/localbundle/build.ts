/**
 * 自宅PC用の「1ファイル版」を作る。
 *   npm run bundle:local   → local-dist/fetch-local.js と local-dist/run-fetch.bat
 *
 * 自宅PCに、リポジトリの取得(clone / ZIP)や `npm ci` をせずに済むよう、local-fetch.ts と
 * 必要な部品(zod など)・courts.json の中身を、Node だけで動く1つの JS ファイルにまとめる。
 * 自宅PCに必要なのは Node(22以降)だけ。合言葉は含めない(run-fetch.bat に、利用者が書く)。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

/** local-fetch を、Node だけで動く1つの JS にして、文字列で返す */
export async function buildLocalBundle(): Promise<string> {
  const courts = JSON.stringify(JSON.parse(readFileSync("config/courts.json", "utf-8"))); // 空白を詰めた1行にして埋め込む
  const r = await build({
    entryPoints: ["src/courts/local-fetch.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    write: false,
    legalComments: "none",
    define: { __COURTS_JSON__: JSON.stringify(courts) },
    banner: { js: "// 自動生成: npm run bundle:local(src/courts/local-fetch.ts から作られます。直接は編集しないでください)\n// 使い方: README.md「奈良市・生駒市: 自宅PCから取得して中継役へ送る」" },
  });
  return r.outputFiles[0].text;
}

/**
 * 自宅PCで動かす .bat(ASCII だけ。日本語を入れると、Windows のコマンドが文字を誤読するため)。
 * 引数 auto を付けると、終了時に止まらない(タスクスケジューラ用)。付けないと、結果を見せて止まる(初回の確認用)。
 */
export function runFetchBat(workerUrl: string): string {
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    "rem === Put this file and fetch-local.js in the same folder. ===",
    "rem === Edit REFRESH_PASSCODE below (the passcode set in Cloudflare). Keep this file private. ===",
    `set WORKER_URL=${workerUrl}`,
    "set REFRESH_PASSCODE=CHANGE-ME",
    'cd /d "%~dp0"',
    "node fetch-local.js > fetch.log 2>&1",
    "set RESULT=%ERRORLEVEL%",
    "type fetch.log",
    'if /i not "%~1"=="auto" pause',
    "exit /b %RESULT%",
  ];
  return lines.join("\r\n") + "\r\n";
}

async function main() {
  mkdirSync("local-dist", { recursive: true });
  const js = await buildLocalBundle();
  writeFileSync("local-dist/fetch-local.js", js);
  writeFileSync("local-dist/run-fetch.bat", runFetchBat(process.env.WORKER_URL ?? "https://sweet-bird-6d99.saikoro86.workers.dev"));
  console.log(`local-dist/fetch-local.js(${Math.round(Buffer.byteLength(js) / 1024)}KB)と run-fetch.bat を生成しました`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
