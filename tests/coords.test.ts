import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(__dirname + "/../config/coords.json", "utf-8")) as {
  coords: Record<string, { lat: number; lng: number; src: string; ref: string }>;
};

test("近い順の位置: 奈良県・京都府南部の範囲にあり、出典がある", () => {
  const all = Object.entries(cfg.coords);
  assert.ok(all.length >= 50);
  for (const [k, v] of all) {
    assert.ok(v.lat > 34.3 && v.lat < 34.9 && v.lng > 135.6 && v.lng < 136.1, k);
    assert.ok(["tennisnavi", "gsi"].includes(v.src), k);
    assert.ok(v.ref.length > 5, k);
    assert.match(k, /^[^|]+\|.+/);
  }
});
