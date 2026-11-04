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

import { graphPost } from "../src/sns/publishers";

async function withFetch(res: Response, fn: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => res) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("graphPost: 成功時は id を返す", async () => {
  await withFetch(new Response(JSON.stringify({ id: "123" }), { status: 200 }), async () => {
    assert.deepEqual(await graphPost("https://example.test/x", { a: "b" }), { id: "123" });
  });
});

test("graphPost: APIのエラーメッセージをステータス付きで投げる", async () => {
  const res = new Response(JSON.stringify({ error: { message: "bad token" } }), { status: 400 });
  await withFetch(res, async () => {
    await assert.rejects(graphPost("https://example.test/x", {}), /^Error: 400 bad token$/);
  });
});

test("graphPost: JSON以外(HTML)の5xxでもステータスが分かるエラーになる", async () => {
  await withFetch(new Response("<html>Bad Gateway</html>", { status: 502 }), async () => {
    await assert.rejects(graphPost("https://example.test/x", {}), /^Error: 502 <html>Bad Gateway/);
  });
});
