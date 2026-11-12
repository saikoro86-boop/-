import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bookmarkletCode } from "../src/bookmarklet/build";
import { kashikanPageDate, kashikanSiteOf, parseKashikanPage } from "../src/courts/kashikan-page";
import { fetchDay, isOpen, isTennisCourt, parseAvailability } from "../src/courts/kashikan";

const fx = (n: string) => readFileSync(__dirname + "/fixtures/" + n, "utf-8");
const APP = "https://app.test/";

/** 生成したブックマークレットを、ブラウザの代わりの入れ物で実際に動かす(つなげ忘れた関数があれば、ここで落ちる) */
function run(html: string, href: string) {
  const location = { href };
  let alerted: string | null = null;
  const btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
  new Function("document", "location", "alert", "btoa", bookmarkletCode(APP))({ documentElement: { outerHTML: html } }, location, (m: string) => { alerted = m; }, btoa);
  const m = location.href.match(/^https:\/\/app\.test\/#import=(.+)$/);
  const payload = m ? JSON.parse(decodeURIComponent(escape(Buffer.from(m[1], "base64").toString("binary")))) : null;
  return { payload, alerted: alerted as string | null };
}

test("ブックマークレット: 木津川市の画面を読んで、アプリに渡す", () => {
  const { payload, alerted } = run(fx("kizugawa-20261106.html"), "https://example.test/kizugawa");
  assert.equal(alerted, null);
  assert.ok(payload.slots.length > 0);
  assert.ok(payload.slots.every((s: { site: string }) => s.site === "木津川市"));
  assert.deepEqual(payload.covers, [{ s: "木津川市" }]); // 木津川市は、取り込むたびに全部を入れ替える
});

test("ブックマークレット: 奈良市の「目的で検索」(1日表示)を読んで、その日の分として渡す", () => {
  const { payload, alerted } = run(fx("nara-city-20261114.html"), "https://k6.p-kashikan.jp/nara-city/index.php");
  assert.equal(alerted, null);
  assert.deepEqual(payload.covers, [{ s: "奈良市", d: "2026-11-14" }]);
  const b = payload.slots.filter((s: { facility: string; court: string }) => s.facility === "奈良市柏木コート" && s.court === "コートB");
  assert.deepEqual(b.map((s: { start: number; end: number }) => [s.start, s.end]), [[9, 12], [13, 17]]);
  assert.ok(payload.slots.every((s: { site: string; date: string }) => s.site === "奈良市" && s.date === "2026-11-14"));
});

test("ブックマークレット: 生駒市の ●(空きだが、ネット予約の受付外)は offline つきで渡す", () => {
  const { payload } = run(fx("ikoma-20261109.html"), "https://k5.p-kashikan.jp/ikoma-city/index.php");
  assert.deepEqual(payload.covers, [{ s: "生駒市", d: "2026-11-09" }]);
  assert.ok(payload.slots.some((s: { offline?: boolean }) => s.offline === true));
});

test("ブックマークレット: 関係ない画面では、何も渡さず、やり方を知らせる", () => {
  const a = run("<html><body>こんにちは</body></html>", "https://k6.p-kashikan.jp/nara-city/index.php");
  assert.equal(a.payload, null); assert.match(a.alerted!, /1日/);
  const b = run("<html><body>こんにちは</body></html>", "https://example.test/");
  assert.equal(b.payload, null); assert.match(b.alerted!, /木津川市/);
});

test("kashikanSiteOf / kashikanPageDate", () => {
  assert.equal(kashikanSiteOf("https://k6.p-kashikan.jp/nara-city/index.php?x=1"), "奈良市");
  assert.equal(kashikanSiteOf("https://k5.p-kashikan.jp/ikoma-city/index.php"), "生駒市");
  assert.equal(kashikanSiteOf("https://example.test/nara-city/"), null);
  assert.equal(kashikanPageDate(fx("nara-city-20261114.html")), "2026-11-14");
});

test("parseKashikanPage: 自動取得のとき(parseAvailability)と、同じ施設・コート・時間になる", () => {
  const html = fx("nara-city-20261114.html");
  const page = parseKashikanPage(html, "奈良市")!;
  const expected = parseAvailability(html).filter(isTennisCourt).flatMap((c) => c.slots.filter((s) => isOpen(s) || s.mark.trim() === "●").map((s) => `${c.facility}|${c.court}|${s.start}-${s.end}`));
  assert.deepEqual(page.slots.map((s) => `${s.facility}|${s.court}|${s.start}-${s.end}`).sort(), [...new Set(expected)].sort());
  assert.ok(page.courts > 10);
});

test("parseKashikanPage: 1週間・1か月表示は、形を確かめていないので読まない", () => {
  const html = fx("nara-city-20261114.html").replace('id="span_day" checked', 'id="span_day"').replace('id="span_week"', 'id="span_week" checked');
  assert.equal(parseKashikanPage(html, "奈良市"), null);
});

test("parseKashikanPage: ブラウザが書き直した形(width: 49px)でも、同じ結果", () => {
  const html = fx("nara-city-20261114.html");
  const a = parseKashikanPage(html, "奈良市")!, b = parseKashikanPage(html.replace(/width:(\d+)px/g, "width: $1px"), "奈良市")!;
  assert.deepEqual(a.slots, b.slots);
});

test("fetchDay は、ブックマークレットの中では呼ばれない(通信をしない)", () => {
  assert.ok(!/fetchDay\(/.test(bookmarkletCode(APP).split("var html = document")[1]));
  assert.equal(typeof fetchDay, "function");
});
