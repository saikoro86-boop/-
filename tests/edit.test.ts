import test from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/sns/edit";
import type { Draft } from "../src/sns/types";

function draft(status: Draft["status"]): Draft {
  return { id: "x-1", platform: "x", theme: "t", text: "old", status, createdAt: "2026-01-01T00:00:00Z" };
}

test("編集すると本文が変わり pending に戻り、エラーも消える", () => {
  const d = draft("failed");
  d.error = "boom";
  applyEdit(d, "new");
  assert.equal(d.text, "new");
  assert.equal(d.status, "pending");
  assert.equal(d.error, undefined);
});

test("投稿済みの下書きは編集できない", () => {
  const d = draft("posted");
  assert.throws(() => applyEdit(d, "new"), /投稿済み/);
  assert.equal(d.text, "old");
  assert.equal(d.status, "posted");
});
