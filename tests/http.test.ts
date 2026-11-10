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
  try { await assert.rejects(fetchChecked("https://example.test/slow", {}, 20), /timeout/); } finally { restore(); }
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
