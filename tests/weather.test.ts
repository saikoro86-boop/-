import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJma, iconOf } from "../src/courts/weather";

const nara = JSON.parse(readFileSync(__dirname + "/fixtures/jma-290000-20261108.json", "utf-8"));
const kyoto = JSON.parse(readFileSync(__dirname + "/fixtures/jma-260000-20261108.json", "utf-8"));

test("奈良県北部: 今日〜7日分の降水確率が取れる(0〜100)", () => {
  const w = parseJma(nara, "北部", "奈良県");
  const days = Object.keys(w).sort();
  assert.ok(days.length >= 7, days.join(","));
  assert.equal(days[0], "2026-11-08");
  for (const d of days.slice(0, 2)) { const p = w[d].pop; assert.ok(p != null && p >= 0 && p <= 100, d); }
  for (const d of days) assert.ok(["☀", "☁", "☔", "❄", ""].includes(w[d].icon), d);
});

test("京都府南部(木津川市)も取れる", () => {
  const w = parseJma(kyoto, "南部", "南部");
  assert.ok(Object.keys(w).length >= 7);
});

test("天気コードのマーク", () => {
  assert.equal(iconOf("100"), "☀"); assert.equal(iconOf("201"), "☁"); assert.equal(iconOf("313"), "☔"); assert.equal(iconOf(undefined), "");
});
