import { test } from "node:test";
import assert from "node:assert/strict";
import { xWeightedLength } from "../src/sns/publishers";

test("xWeightedLength: 半角英数は1文字=1", () => {
  assert.equal(xWeightedLength("hello"), 5);
  assert.equal(xWeightedLength(""), 0);
});

test("xWeightedLength: 日本語などの全角文字は1文字=2", () => {
  assert.equal(xWeightedLength("こんにちは"), 10);
  assert.equal(xWeightedLength("aあ"), 3);
});

test("xWeightedLength: サロゲートペア(絵文字)は1文字=2として数える", () => {
  assert.equal(xWeightedLength("😀"), 2);
});

import { isTransientError, withRetry } from "../src/sns/publishers";

test("isTransientError: 5xx / 429 / ネットワーク失敗は一時的、それ以外は違う", () => {
  assert.equal(isTransientError(new Error("503 Service Unavailable")), true);
  assert.equal(isTransientError(new Error("429 Too many requests")), true);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: 500 })), true);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: "ECONNRESET" })), true);
  assert.equal(isTransientError(new TypeError("fetch failed")), true);
  assert.equal(isTransientError(new Error("401 Invalid token")), false);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: 403 })), false);
  assert.equal(isTransientError("oops"), false);
});

test("withRetry: 一時的な失敗は再試行して成功すれば結果を返す", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await withRetry(
    async () => {
      if (++calls < 3) throw new Error("503 down");
      return "ok";
    },
    [10, 20],
    async (ms) => void waits.push(ms)
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test("withRetry: 回数を使い切ったら最後のエラーを投げる", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw new Error("500 boom"); }, [1, 1], async () => {}),
    /500 boom/
  );
  assert.equal(calls, 3);
});

test("withRetry: 一時的でないエラーは再試行しない", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw new Error("401 bad"); }, [1, 1], async () => {}),
    /401 bad/
  );
  assert.equal(calls, 1);
});
