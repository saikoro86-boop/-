import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kashikanPageDate, kashikanSiteOf, parseKashikanPage } from "../src/courts/kashikan-page";

const html = readFileSync("tests/fixtures/nara-city-20261114.html", "utf8");

test("予約サイトの住所から、奈良市・生駒市を見分ける。ほかは null", () => {
  assert.equal(kashikanSiteOf("https://www.p-kashikan.jp/nara-city/index.php"), "奈良市");
  assert.equal(kashikanSiteOf("https://www.p-kashikan.jp/ikoma-city/index.php"), "生駒市");
  assert.equal(kashikanSiteOf("https://example.com/nara-city/"), null);
});

test("画面の日付(UseDate)を YYYY-MM-DD で読む。なければ null", () => {
  assert.equal(kashikanPageDate(html), "2026-11-14");
  assert.equal(kashikanPageDate("<html></html>"), null);
});

test("1日表示の実物から、空き枠を読む(重複なし・日付と市名つき)", () => {
  const page = parseKashikanPage(html, "奈良市");
  assert.ok(page);
  assert.equal(page.date, "2026-11-14");
  assert.ok(page.courts > 0);
  assert.ok(page.slots.length > 0);
  assert.ok(page.slots.every((s) => s.date === "2026-11-14" && s.site === "奈良市" && s.start < s.end));
  const keys = page.slots.map((s) => `${s.facility}|${s.court}|${s.start}|${s.end}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("日付がない画面は読まない(null)", () => {
  assert.equal(parseKashikanPage(html.replace('name="UseDate"', 'name="X"'), "奈良市"), null);
});

test("1週間表示・1か月表示が選ばれている画面は読まない(null)", () => {
  assert.equal(parseKashikanPage(html.replace('id="span_week"', 'id="span_week" checked'), "奈良市"), null);
  assert.equal(parseKashikanPage(html.replace('id="span_month"', 'id="span_month" checked'), "奈良市"), null);
});

test("コートが1つもない画面は読まない(null)", () => {
  assert.equal(parseKashikanPage('<input type="hidden" name="UseDate" value="20261114">', "奈良市"), null);
});
