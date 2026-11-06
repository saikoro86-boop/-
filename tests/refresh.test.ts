import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRefresh, isAllowedOrigin, parseCooldown, safeEqual, type Env } from "../worker/src/logic";
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

test("COOLDOWN_SEC が壊れていても、連続実行の制限は外れない", () => {
  assert.equal(parseCooldown(undefined), 600);
  assert.equal(parseCooldown(""), 600);
  assert.equal(parseCooldown("abc"), 600);
  assert.equal(parseCooldown("-5"), 600);
  assert.equal(parseCooldown("120"), 120);
  assert.equal(parseCooldown("0"), 0);
  // 前回の時刻が読めない時も、すぐには起動しない
  assert.equal(decideRefresh(run("completed", "not-a-date"), NOW).result, "cooldown");
});
