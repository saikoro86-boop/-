import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchChecked, withRetry } from "../src/courts/http";

const realFetch = global.fetch;
const restore = () => { global.fetch = realFetch; };

test("fetchChecked: 200 台以外は、URL とコードつきの例外", async () => {
  global.fetch = (async () => new Response("x", { status: 503 })) as typeof fetch;
  try { await assert.rejects(fetchChecked("https://example.test/a"), /example\.test\/a -> HTTP 503/); } finally { restore(); }
});

test("fetchChecked: 応答がないときは、時間制限で止まる", async () => {
  global.fetch = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("timeout"))))) as typeof fetch;
  const keepAlive = setTimeout(() => {}, 1000); // AbortSignal.timeout のタイマーだけでは、テストが先に終わってしまう
  try { await assert.rejects(fetchChecked("https://example.test/slow", {}, 20), /timeout/); } finally { clearTimeout(keepAlive); restore(); }
});

test("withRetry: 2回失敗して3回目に成功すれば、結果を返す", async () => {
  let n = 0;
  const quiet = console.error; console.error = () => {};
  try {
    const r = await withRetry("t", async () => { if (++n < 3) throw new Error("一時的"); return "ok"; }, 3, 1);
    assert.equal(r, "ok"); assert.equal(n, 3);
  } finally { console.error = quiet; }
});

test("withRetry: 回数を使い切ったら、最後の例外を投げる", async () => {
  let n = 0;
  const quiet = console.error; console.error = () => {};
  try {
    await assert.rejects(withRetry("t", async () => { n++; throw new Error("だめ"); }, 2, 1), /だめ/);
    assert.equal(n, 2);
  } finally { console.error = quiet; }
});

// ---- 先方に断られたとき(403 など)は、やり直さず、早めにやめる ----
import { BlockCounter, HttpError, isBlocked, isRetryable } from "../src/courts/http";

test("withRetry: 403 は、やり直さない(同じ結果になるだけで、先方の負荷になる)", async () => {
  let n = 0;
  await assert.rejects(withRetry("t", async () => { n++; throw new HttpError("https://example.test", 403); }, 3, 1), /HTTP 403/);
  assert.equal(n, 1);
});
test("withRetry: 503 と通信の失敗は、やり直す", async () => {
  const quiet = console.error; console.error = () => {};
  try {
    let n = 0;
    await assert.rejects(withRetry("t", async () => { n++; throw new HttpError("https://example.test", 503); }, 3, 1));
    assert.equal(n, 3);
  } finally { console.error = quiet; }
  assert.equal(isRetryable(new Error("fetch failed")), true);
  assert.equal(isRetryable(new HttpError("u", 404)), false);
  assert.equal(isRetryable(new HttpError("u", 408)), true);
});
test("isBlocked: 401・403・429 だけ", () => {
  for (const s of [401, 403, 429]) assert.equal(isBlocked(new HttpError("u", s)), true);
  for (const s of [404, 500, 503]) assert.equal(isBlocked(new HttpError("u", s)), false);
  assert.equal(isBlocked(new Error("timeout")), false);
});
test("BlockCounter: 断られた応答が2回続いたら「やめる」。間に成功や別の失敗があれば、数え直す", () => {
  const b = new BlockCounter();
  assert.equal(b.failed(new HttpError("u", 403)), false);
  assert.equal(b.failed(new HttpError("u", 403)), true);
  const c = new BlockCounter();
  assert.equal(c.failed(new HttpError("u", 403)), false);
  c.ok();
  assert.equal(c.failed(new HttpError("u", 403)), false);
  assert.equal(c.failed(new Error("timeout")), false); // 通信の失敗は、断られたのとは違う
  assert.equal(c.failed(new HttpError("u", 403)), false);
});
