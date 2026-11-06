import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseKizugawaHtml } from "../src/courts/kizugawa";

const html = readFileSync(__dirname + "/fixtures/kizugawa-20261106.html", "utf-8");

test("空きの総数が画面の「空いています」の数と一致する", () => {
  const imgs = html.match(/alt="空いています"/g)!.length;
  assert.equal(parseKizugawaHtml(html).length, imgs); // 241
});

test("公園とコートを抽出できる(全角Ａ/Ｂ/Ｃは半角にそろえる)", () => {
  const set = new Set(parseKizugawaHtml(html).map((s) => `${s.facility}/${s.court}`));
  assert.deepEqual([...set].sort(), [
    "兜谷公園/テニスコートA", "兜谷公園/テニスコートB",
    "木津川台公園/テニスコートA", "木津川台公園/テニスコートB", "木津川台公園/テニスコートC",
  ].sort());
});

test("画面で確認した値: 兜谷公園Aの11/9(月)は 11:00-12:00 が空き、9時は予約済み", () => {
  const s = parseKizugawaHtml(html).filter(
    (x) => x.facility === "兜谷公園" && x.court === "テニスコートA" && x.date === "2026-11-09",
  );
  assert.ok(s.some((x) => x.start === 11 && x.end === 12));
  assert.ok(!s.some((x) => x.start === 9)); // 9時は予約済み
});

test("日付は2026-11-06から7日間", () => {
  const d = [...new Set(parseKizugawaHtml(html).map((s) => s.date))].sort();
  assert.equal(d[0] >= "2026-11-06", true);
  assert.equal(d[d.length - 1] <= "2026-11-12", true);
});

test("関係のないHTMLでは何も返さない", () => {
  assert.deepEqual(parseKizugawaHtml("<html><body>hello</body></html>"), []);
});

// ---- 4公園(兜谷・木津川台・梅美台・城址)をまとめて表示した実画面 ----
const html4 = readFileSync(__dirname + "/fixtures/kizugawa-4parks-20261106.html", "utf-8");

test("4公園: 空きの総数が画面の「空いています」の数と一致する", () => {
  assert.equal(parseKizugawaHtml(html4).length, html4.match(/alt="空いています"/g)!.length); // 372
});

test("4公園: 梅美台(施設名は「梅美台テニスコート」)と城址が読める", () => {
  const set = new Set(parseKizugawaHtml(html4).map((s) => `${s.facility}/${s.court}`));
  for (const k of [
    "梅美台テニスコート/テニスコートA", "梅美台テニスコート/テニスコートB",
    "城址公園/テニスコートA", "城址公園/テニスコートB", "城址公園/テニスコートC",
  ]) assert.ok(set.has(k), k);
});

test("「施設を利用できません」のマスは空きとして数えない", () => {
  const unavailable = html4.match(/alt="施設を利用できません"/g)!.length;
  assert.ok(unavailable > 0);
  const total = html4.match(/<td[^>]*>\s*<img[^>]*alt="/g)!.length;
  assert.equal(parseKizugawaHtml(html4).length + html4.match(/alt="予約済みです"/g)!.length + unavailable, total);
});
