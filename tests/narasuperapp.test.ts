import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listNaraSuperAppDates, parseNaraSuperApp, type NaraSuperAppResponse } from "../src/courts/narasuperapp";
import { isOpen } from "../src/courts/kashikan";

const raw: NaraSuperAppResponse = JSON.parse(readFileSync(__dirname + "/fixtures/nsa-yatayama-20261106.json", "utf-8"));

test("日付は 11/14〜11/30 で、休館の火曜(17日・24日)は含まれない", () => {
  const d = listNaraSuperAppDates(raw);
  assert.equal(d[0], "2026-11-14");
  assert.equal(d[d.length - 1], "2026-11-30");
  assert.ok(!d.includes("2026-11-17") && !d.includes("2026-11-24"));
});

test("施設名・コート名は半角にそろえる(テニスコートＡ → テニスコートA)", () => {
  const r = parseNaraSuperApp(raw, "2026-11-14");
  assert.equal(r.length, 7); // テニスコートA〜G
  assert.ok(r.every((c) => c.facility === "大和郡山市総合公園施設"));
  assert.deepEqual(r.map((c) => c.court), ["A", "B", "C", "D", "E", "F", "G"].map((x) => `テニスコート${x}`));
});

test("時刻は日本時間の 9:00〜18:00 の1時間枠", () => {
  const slots = parseNaraSuperApp(raw, "2026-11-14")[0].slots;
  assert.equal(slots[0].start, 9);
  assert.equal(slots[0].end, 10);
  assert.ok(slots.every((s) => s.end - s.start === 1));
});

test("予約の明細がある枠は ×、ない枠は ○(全日付・全コートで枠数が一致)", () => {
  let open = 0, total = 0;
  for (const d of listNaraSuperAppDates(raw)) for (const c of parseNaraSuperApp(raw, d)) {
    total += c.slots.length; open += c.slots.filter(isOpen).length;
  }
  assert.equal(total, raw.returnValue.rsvSlotResultList.length); // 840
  assert.equal(total - open, raw.returnValue.rsvItemResultList.length); // 予約済み 624
});

test("11/14 テニスコートAは全枠が予約済み(実データ)", () => {
  const a = parseNaraSuperApp(raw, "2026-11-14").find((c) => c.court === "テニスコートA")!;
  assert.ok(a.slots.every((s) => s.mark === "×"));
});

// ---- 香芝健民テニスコート(施設名あり・2時間枠・夜明け前のUTC時刻を含む実データ) ----
const kashiba: NaraSuperAppResponse = JSON.parse(readFileSync(__dirname + "/fixtures/nsa-kashiba-20261106.json", "utf-8"));

test("香芝: 施設名は施設名、コート名は半角にそろう", () => {
  const r = parseNaraSuperApp(kashiba, listNaraSuperAppDates(kashiba)[0]);
  assert.ok(r.every((c) => c.facility === "香芝健民テニスコート"));
  assert.deepEqual(r.map((c) => c.court), ["テニスコートAコート", "テニスコートBコート"]);
});

test("香芝: 2時間枠で、日本時間に直した時刻が日付内に収まる(22:00Z → 7:00)", () => {
  const all = listNaraSuperAppDates(kashiba).flatMap((d) => parseNaraSuperApp(kashiba, d).flatMap((c) => c.slots));
  assert.equal(all.length, kashiba.returnValue.rsvSlotResultList.length);
  assert.ok(all.every((s) => s.start >= 7 && s.end <= 24 && s.end > s.start));
  assert.ok(all.some((s) => s.start === 7 && s.end === 9));
});

test("香芝: 空き枠数 = 枠数 − 予約の明細数", () => {
  const all = listNaraSuperAppDates(kashiba).flatMap((d) => parseNaraSuperApp(kashiba, d).flatMap((c) => c.slots));
  assert.equal(all.filter(isOpen).length, kashiba.returnValue.rsvSlotResultList.length - kashiba.returnValue.rsvItemResultList.length);
});
