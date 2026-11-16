import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRefresh, isAllowedOrigin, safeEqual, type Env } from "../worker/src/logic";
import worker from "../worker/src/index";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const run = (status: string, updated: string, created = updated) => ({ status, created_at: created, updated_at: updated });

test("実行中なら受け付けない、終わってから10分未満なら待たせる、10分以上なら起動する", () => {
  assert.deepEqual(decideRefresh(undefined, NOW), { result: "go" });
  assert.equal(decideRefresh(run("in_progress", "2026-11-06T11:58:00Z"), NOW).result, "running");
  assert.equal(decideRefresh(run("queued", "2026-11-06T11:59:00Z"), NOW).result, "running");
  assert.deepEqual(decideRefresh(run("completed", "2026-11-06T11:58:00Z"), NOW), { result: "cooldown", waitSec: 480 });
  assert.deepEqual(decideRefresh(run("completed", "2026-11-06T11:49:00Z"), NOW), { result: "go" });
});

test("呼び出し元は、設定したサイトだけ許可する", () => {
  assert.ok(isAllowedOrigin("https://a.github.io", "https://a.github.io"));
  assert.ok(!isAllowedOrigin("https://evil.example", "https://a.github.io"));
  assert.ok(!isAllowedOrigin(null, "https://a.github.io"));
  assert.ok(!isAllowedOrigin("https://a.github.io", ""));
});

test("合言葉の比較", async () => {
  assert.ok(await safeEqual("correct horse battery", "correct horse battery"));
  assert.ok(!(await safeEqual("correct horse batter", "correct horse battery")));
  assert.ok(!(await safeEqual("", "x")));
});

// ---- 中継役の全体(GitHub への通信は、偽物に差し替える) ----
const env: Env = {
  GH_TOKEN: "ghp_TESTTOKEN", REFRESH_PASSCODE: "my-long-passcode-123", GH_OWNER: "owner", GH_REPO: "repo",
  GH_WORKFLOW: "courts.yml", GH_REF: "main-branch", ALLOWED_ORIGIN: "https://site.example",
};
const ORIGIN = { origin: "https://site.example" };
const post = (body: unknown, headers: Record<string, string> = ORIGIN) =>
  new Request("https://w.example/refresh", { method: "POST", headers, body: JSON.stringify(body) });

async function withGithub(runs: unknown[], fn: (calls: { url: string; init?: RequestInit }[]) => Promise<void>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/dispatches")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ workflow_runs: runs }), { status: 200 });
  }) as typeof fetch;
  try { await fn(calls); } finally { globalThis.fetch = orig; }
}

test("別のサイトからの呼び出しは、403で断る", async () => {
  const r = await worker.fetch(post({ passcode: env.REFRESH_PASSCODE }, { origin: "https://evil.example" }), env);
  assert.equal(r.status, 403);
});

test("合言葉が違うと401。GitHubは呼ばない", async () => {
  await withGithub([], async (calls) => {
    const r = await worker.fetch(post({ passcode: "wrong" }), env);
    assert.equal(r.status, 401);
    assert.equal(calls.length, 0);
  });
});

test("合言葉が合っていて、前回が10分以上前なら、実行を起動する(鍵と、起動するブランチを渡す)", async () => {
  await withGithub([run("completed", "2026-01-01T00:00:00Z")], async (calls) => {
    const r = await worker.fetch(post({ passcode: env.REFRESH_PASSCODE }), env);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { result: "started" });
    const d = calls.find((c) => c.url.includes("/dispatches"))!;
    assert.ok(d.url.endsWith("/repos/owner/repo/actions/workflows/courts.yml/dispatches"));
    assert.equal((d.init!.headers as Record<string, string>).authorization, "Bearer ghp_TESTTOKEN");
    assert.equal(JSON.parse(String(d.init!.body)).ref, "main-branch");
    assert.equal(r.headers.get("access-control-allow-origin"), "https://site.example");
  });
});

test("実行中・直後は、起動しない(連続で押されても、無料枠を使い切らない)", async () => {
  await withGithub([run("in_progress", new Date().toISOString())], async (calls) => {
    const r = await worker.fetch(post({ passcode: env.REFRESH_PASSCODE }), env);
    assert.equal(((await r.json()) as { result: string }).result, "running");
    assert.ok(!calls.some((c) => c.url.includes("/dispatches")));
  });
  await withGithub([run("completed", new Date(Date.now() - 60_000).toISOString())], async (calls) => {
    const r = await worker.fetch(post({ passcode: env.REFRESH_PASSCODE }), env);
    const j = (await r.json()) as { result: string; waitSec: number };
    assert.equal(j.result, "cooldown");
    assert.ok(j.waitSec > 400 && j.waitSec <= 540);
    assert.ok(!calls.some((c) => c.url.includes("/dispatches")));
  });
});

test("状態の確認は、合言葉なしで、実行中かどうかだけ返す。鍵は返さない", async () => {
  await withGithub([run("in_progress", "2026-11-06T11:59:00Z")], async () => {
    const r = await worker.fetch(new Request("https://w.example/status", { headers: ORIGIN }), env);
    const text = await r.text();
    assert.equal(JSON.parse(text).running, true);
    assert.ok(!text.includes("ghp_") && !text.includes(env.REFRESH_PASSCODE));
  });
});

test("プリフライト(OPTIONS)は、許可したサイトにだけ通る", async () => {
  const ok = await worker.fetch(new Request("https://w.example/refresh", { method: "OPTIONS", headers: ORIGIN }), env);
  assert.equal(ok.status, 204);
  const ng = await worker.fetch(new Request("https://w.example/refresh", { method: "OPTIONS", headers: { origin: "https://x.example" } }), env);
  assert.equal(ng.status, 403);
});

// ---- 時計(3時間おき)。GitHub の定期実行が動かなかったときだけ、補う ----
import { decideScheduled } from "../worker/src/logic";
import { runScheduled } from "../worker/src/index";

test("時計: 直近の実行が新しければ見送り、古ければ(定期実行が飛ばされたなら)起動する", () => {
  assert.deepEqual(decideScheduled(undefined, NOW), { result: "go" });
  assert.equal(decideScheduled(run("in_progress", "2026-11-06T11:58:00Z"), NOW).result, "running");
  assert.equal(decideScheduled(run("completed", "2026-11-06T11:50:00Z"), NOW).result, "cooldown");   // 10分前に終わった
  assert.equal(decideScheduled(run("completed", "2026-11-06T09:31:00Z"), NOW).result, "cooldown");   // 2時間29分前
  assert.deepEqual(decideScheduled(run("completed", "2026-11-06T09:29:00Z"), NOW), { result: "go" }); // 2時間31分前
  assert.deepEqual(decideScheduled(run("completed", "2026-11-05T22:00:00Z"), NOW), { result: "go" }); // 14時間前(実際に起きた間隔)
});

test("時計: 起動するときは、鍵とブランチを渡して GitHub に頼む。見送るときは何も頼まない", async () => {
  await withGithub([run("completed", "2026-11-05T22:00:00Z")], async (calls) => {
    assert.equal(await runScheduled(env, NOW), "起動しました");
    const d = calls.find((c) => c.url.includes("/dispatches"))!;
    assert.equal((d.init!.headers as Record<string, string>).authorization, "Bearer ghp_TESTTOKEN");
    assert.equal(JSON.parse(String(d.init!.body)).ref, "main-branch");
  });
  await withGithub([run("completed", "2026-11-06T11:40:00Z")], async (calls) => {
    assert.match(await runScheduled(env, NOW), /見送り/);
    assert.ok(!calls.some((c) => c.url.includes("/dispatches")));
  });
});

test("時計: GitHub に繋がらなくても、例外を投げない(ログに理由だけ残す)", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network"); }) as typeof fetch;
  try { assert.match(await runScheduled(env, NOW), /失敗/); } finally { globalThis.fetch = orig; }
});

test("時計: 鍵の期限が切れて GitHub が拒んだら、応答コードをログに残す。合言葉は不要", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request) => String(u).includes("/dispatches") ? new Response("x", { status: 401 }) : new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })) as typeof fetch;
  try { assert.match(await runScheduled({ ...env, REFRESH_PASSCODE: "" }, NOW), /応答 401/); } finally { globalThis.fetch = orig; }
});

test("時計: scheduled から呼ばれ、完了まで待たせる(waitUntil)", async () => {
  await withGithub([run("completed", "2026-11-05T22:00:00Z")], async (calls) => {
    const waits: Promise<unknown>[] = [];
    const log = console.log; console.log = () => {};
    try { await worker.scheduled({ cron: "22 */3 * * *" }, env, { waitUntil: (p) => { waits.push(p); } }); await Promise.all(waits); } finally { console.log = log; }
    assert.equal(waits.length, 1);
    assert.ok(calls.some((c) => c.url.includes("/dispatches")));
  });
});

// ---- Cloudflare に貼る1ファイル(worker/worker.js)を、実際に動かして確かめる ----
import { readFileSync } from "node:fs";
test("貼り付け用の worker.js: 単体で動き、default の fetch と scheduled だけを公開する", async () => {
  const text = readFileSync(__dirname + "/../worker/worker.js", "utf-8");
  assert.equal((text.match(/^export /gm) ?? []).length, 1);               // export default だけ
  const w = new Function(text.replace(/^export default/m, "return ") + "\n")();
  assert.equal(typeof w.fetch, "function");
  assert.equal(typeof w.scheduled, "function");
  await withGithub([run("completed", "2026-11-05T22:00:00Z")], async (calls) => {
    const waits: Promise<unknown>[] = [];
    const log = console.log; console.log = () => {};
    try { await w.scheduled({ cron: "22 */3 * * *" }, env, { waitUntil: (p: Promise<unknown>) => { waits.push(p); } }); await Promise.all(waits); } finally { console.log = log; }
    assert.ok(calls.some((c) => c.url.includes("/dispatches")));
  });
  const r = await w.fetch(new Request("https://w.example/refresh", { method: "OPTIONS", headers: { origin: "https://x.example" } }), env);
  assert.equal(r.status, 403);
});
