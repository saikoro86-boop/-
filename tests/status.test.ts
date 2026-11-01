import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatusFilter } from "../src/sns/status";

test("未指定なら絞り込みなし", () => {
  assert.equal(parseStatusFilter(undefined), undefined);
});

test("正しいステータスはそのまま返す", () => {
  assert.equal(parseStatusFilter("failed"), "failed");
  assert.equal(parseStatusFilter("pending"), "pending");
});

test("タイプミスはエラーにする(黙って0件にしない)", () => {
  assert.throws(() => parseStatusFilter("fail"), /未対応のステータス/);
  assert.throws(() => parseStatusFilter(""), /未対応のステータス/);
});
