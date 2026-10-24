import assert from "node:assert/strict";
import { test } from "node:test";
import { assertEditable, lengthWarning } from "../src/sns/rules";
import type { Draft } from "../src/sns/types";

const base: Draft = {
  id: "x-1",
  platform: "x",
  theme: "t",
  text: "hello",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("lengthWarning: 上限内なら警告なし", () => {
  assert.equal(lengthWarning(base), undefined);
  assert.equal(lengthWarning({ ...base, platform: "threads", text: "あ".repeat(500) }), undefined);
});

test("lengthWarning: Threads は500文字超で警告", () => {
  assert.match(lengthWarning({ ...base, platform: "threads", text: "あ".repeat(501) }) ?? "", /Threads/);
});

test("lengthWarning: Instagram は画像必須", () => {
  const d: Draft = { ...base, platform: "instagram" };
  assert.match(lengthWarning(d) ?? "", /画像が必須/);
  assert.equal(lengthWarning({ ...d, imageUrl: "https://example.com/a.jpg" }), undefined);
});

test("assertEditable: 投稿済みは拒否、それ以外は許可", () => {
  assert.throws(() => assertEditable({ ...base, status: "posted" }), /投稿済み/);
  for (const status of ["pending", "approved", "rejected", "failed"] as const) {
    assert.doesNotThrow(() => assertEditable({ ...base, status }));
  }
});
