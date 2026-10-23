import { test } from "node:test";
import assert from "node:assert/strict";
import { graphPost, xWeightedLength } from "../src/sns/publishers";

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

test("graphPost: JSON以外のレスポンスでもステータス付きのエラーになる", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html>Bad Gateway</html>", { status: 502 })) as typeof fetch;
  try {
    await assert.rejects(() => graphPost("https://example.test/x", {}), /^Error: 502 /);
  } finally {
    globalThis.fetch = original;
  }
});

test("graphPost: 成功時は id を返す", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ id: "123" })) as typeof fetch;
  try {
    assert.deepEqual(await graphPost("https://example.test/x", {}), { id: "123" });
  } finally {
    globalThis.fetch = original;
  }
});
