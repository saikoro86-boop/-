import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAvailability, isOpen } from "../src/courts/kashikan";

const html = readFileSync(__dirname + "/fixtures/nara-city-20261114.html", "utf-8");

test("施設とコートを抽出できる", () => {
  const r = parseAvailability(html);
  assert.ok(r.length > 10);
  assert.ok(r.some((c) => c.facility === "奈良市柏木コート" && c.court === "コートA"));
});

test("時間帯は 9時から途切れず並ぶ", () => {
  for (const c of parseAvailability(html)) {
    assert.equal(c.slots[0].start, 9);
    c.slots.slice(1).forEach((s, i) => assert.equal(s.start, c.slots[i].end));
  }
});

test("空き(〇)は時間枠つきで取れる", () => {
  const a = parseAvailability(html).find((c) => c.facility === "奈良市柏木コート" && c.court === "コートB")!;
  const open = a.slots.filter(isOpen);
  assert.deepEqual(open.map((s) => [s.start, s.end]), [[9, 12], [13, 17]]);
});
