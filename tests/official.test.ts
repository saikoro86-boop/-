import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(__dirname + "/../config/official.json", "utf-8")) as { urls: Record<string, string> };

test("施設の公式ページ: https で、キーは「エリア|施設名」", () => {
  const all = Object.entries(cfg.urls);
  assert.ok(all.length >= 30);
  for (const [k, u] of all) {
    assert.match(k, /^[^|]+\|.+/);
    assert.match(u, /^https:\/\//, k);
    assert.doesNotMatch(u, /nsa\.pref\.nara\.jp/, k); // 予約サイトではなく、案内ページ
  }
});
