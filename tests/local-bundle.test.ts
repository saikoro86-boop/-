import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLocalBundle, runFetchBat } from "../src/localbundle/build";

const FIX = join(__dirname, "fixtures");

/** 「ブラウザの代わり」の偽の fetch。予約サイトへは繋がず、保存した実物を返す。自分の中継役(127.0.0.1)への通信だけ、本物を通す */
const stubSource = (mode: "ok" | "blocked") => `
const fs = require("fs");
const real = global.fetch;
const seen = [];
const realST = global.setTimeout;
global.setTimeout = ((fn, ms, ...a) => realST(fn, ms >= 300 && ms <= 5000 ? 0 : ms, ...a));   // 取得の待ち時間(sleep)だけを飛ばす
global.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes("p-kashikan.jp")) {
    const h = new Headers(init.headers || {});
    seen.push({ url, ua: h.get("user-agent") });
    if (${JSON.stringify(mode)} === "blocked") return new Response("403", { status: 403 });
    if ((init.method || "GET") === "GET") return new Response("", { status: 200 });
    const ikoma = url.includes("ikoma");
    return new Response(fs.readFileSync(${JSON.stringify(FIX)} + (ikoma ? "/ikoma-20261109.html" : "/nara-city-20261114.html")), { status: 200 });
  }
  return real(url, init);
};
process.on("exit", () => fs.writeFileSync(process.env.SEEN_FILE, JSON.stringify(seen)));
`;

/** 受け取り役(中継役の代わり)を立て、バンドルを実行して、届いたものを返す */
async function runBundle(mode: "ok" | "blocked") {
  const dir = mkdtempSync(join(tmpdir(), "lb-"));
  const bundle = join(dir, "fetch-local.js"), stub = join(dir, "stub.js"), seenFile = join(dir, "seen.json");
  writeFileSync(bundle, await buildLocalBundle());
  writeFileSync(stub, stubSource(mode));
  const got: { path: string; body: any }[] = [];
  const server: Server = createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got.push({ path: req.url ?? "", body: JSON.parse(b || "null") }); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true })); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const out = await new Promise<{ code: number; text: string }>((resolve) => {
    execFile(process.execPath, ["--require", stub, bundle], { cwd: dir, timeout: 60000, env: { ...process.env, WORKER_URL: `http://127.0.0.1:${port}`, REFRESH_PASSCODE: "test-pass-123456", SEEN_FILE: seenFile } },
      (err, stdout, stderr) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, text: stdout + stderr }));
  });
  server.close();
  const seen = JSON.parse(readFileSync(seenFile, "utf-8")) as { url: string; ua: string | null }[];
  return { ...out, got, seen };
}

test("1ファイル版: Node だけで動き、奈良市・生駒市を取って /ingest に合言葉つきで送る。名乗りは正直なもの", async () => {
  const r = await runBundle("ok");
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /送信しました: 奈良市・生駒市/);
  assert.equal(r.got.length, 1);
  assert.equal(r.got[0].path, "/ingest");
  assert.equal(r.got[0].body.passcode, "test-pass-123456");
  assert.deepEqual([...r.got[0].body.sites].sort(), ["奈良市", "生駒市"]);
  assert.ok(r.got[0].body.slots.length > 0);
  // 予約サイトへの通信は、すべて、正直な名乗り(ブラウザ偽装ではない)
  assert.ok(r.seen.length > 0);
  assert.ok(r.seen.every((s) => /tennis-court-finder/.test(s.ua ?? "")), JSON.stringify(r.seen.slice(0, 2)));
  assert.ok(!r.seen.some((s) => /Mozilla|Chrome|Safari/i.test(s.ua ?? "")));
});

test("1ファイル版: 自宅でも 403 なら、何も送らず、止まって知らせる(回避しない)", async () => {
  const r = await runBundle("blocked");
  assert.equal(r.code, 1);
  assert.match(r.text, /すべてのエリアで断られました/);
  assert.equal(r.got.length, 0);                       // 送っていない
  assert.ok(r.seen.length <= 8, `断られたあと、追撃していない(通信 ${r.seen.length} 回)`);
});

test("1ファイル版: 合言葉や鍵は、ファイルに入らない", async () => {
  const js = await buildLocalBundle();
  assert.ok(!/github_pat_|cfut_/.test(js));
  assert.ok(!/REFRESH_PASSCODE\s*=\s*["'][^"']{8,}/.test(js));
});

test("run-fetch.bat: ASCII だけ・改行は CRLF・合言葉は書き換え用の印。auto 付きなら止まらない", () => {
  const bat = runFetchBat("https://w.example");
  assert.ok(/^[\x00-\x7f]*$/.test(bat));                // 日本語を含まない
  assert.ok(bat.includes("\r\n") && !/[^\r]\n/.test(bat));
  assert.ok(bat.includes("set WORKER_URL=https://w.example"));
  assert.ok(bat.includes("set REFRESH_PASSCODE=CHANGE-ME"));
  assert.ok(bat.includes('if /i not "%~1"=="auto" pause'));
});
