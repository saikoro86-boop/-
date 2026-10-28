import { test } from "node:test";
import assert from "node:assert/strict";
import { randomDelay } from "../src/utils";

test("randomDelay: 指定した範囲(min〜max)の時間だけ待機する", async () => {
  const start = Date.now();
  await randomDelay(20, 40);
  const elapsed = Date.now() - start;
  // タイマーの誤差を見込んで下限は少しゆるめに確認する
  assert.ok(elapsed >= 15, `短すぎる: ${elapsed}ms`);
  assert.ok(elapsed < 500, `長すぎる: ${elapsed}ms`);
});

test("randomDelay: min と max が同じなら固定時間になる", async () => {
  const start = Date.now();
  await randomDelay(10, 10);
  assert.ok(Date.now() - start < 500);
});
