import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransientError, withRetry, MAX_ATTEMPTS } from "../src/sns/retry";

const noSleep = async () => {};

test("isTransientError: 5xx / 429 / ネットワークエラーは一時的", () => {
  assert.equal(isTransientError(new Error("502 Bad Gateway")), true);
  assert.equal(isTransientError(new Error("429 rate limited")), true);
  assert.equal(isTransientError(new TypeError("fetch failed")), true);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: "ECONNRESET" })), true);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: 503 })), true);
});

test("isTransientError: 4xx や設定ミスは一時的ではない", () => {
  assert.equal(isTransientError(new Error("400 invalid image")), false);
  assert.equal(isTransientError(Object.assign(new Error("x"), { code: 403 })), false);
  assert.equal(isTransientError(new Error("環境変数 X_API_KEY が .env に設定されていません")), false);
  assert.equal(isTransientError("500"), false);
});

test("withRetry: 一時的な失敗は再試行して成功すれば結果を返す", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new Error("503 unavailable");
    return "ok";
  }, noSleep);
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry: 一時的な失敗が続くと MAX_ATTEMPTS 回で諦める", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error("500 boom");
    }, noSleep),
    /500 boom/
  );
  assert.equal(calls, MAX_ATTEMPTS);
});

test("withRetry: 一時的でない失敗は再試行しない", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new Error("400 bad request");
    }, noSleep)
  );
  assert.equal(calls, 1);
});
