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

// ---- 施設一覧から、テニス対応の建物を自動で拾う ----
import { pickNaraSuperAppTargets, isNsaTennisCourt, type NaraSuperAppTopResponse } from "../src/courts/narasuperapp";
const top: NaraSuperAppTopResponse = JSON.parse(readFileSync(__dirname + "/fixtures/nsa-top-20261106.json", "utf-8"));

test("テニス対応の建物を拾う(2026-11-06 時点で35件)", () => {
  const t = pickNaraSuperAppTargets(top);
  assert.equal(t.length, 35);
  const names = t.map((x) => x.facilityName);
  for (const n of ["まほろば健康パーク", "大和郡山市総合公園施設", "香芝健民テニスコート", "橿原運動公園"]) assert.ok(names.includes(n), n);
  assert.ok(!names.includes("カルム五條（五條市保健福祉センター）")); // テニス目的ではない
});

test("市町村名が付く(エリア表示用)", () => {
  const t = pickNaraSuperAppTargets(top);
  assert.equal(t.find((x) => x.facilityName === "香芝健民テニスコート")?.municipality, "香芝市");
});

test("テニスコート判定: 体育館・会議室・バドミントンなどは除く", () => {
  const c = (facility: string, court: string) => ({ facility, court, slots: [] });
  assert.ok(isNsaTennisCourt(c("天理市立総合体育館", "テニスコート1")));
  assert.ok(isNsaTennisCourt(c("田原本町中央体育館", "庭球場1")));
  assert.ok(isNsaTennisCourt(c("ワタキューテニスパーク明日香", "オムニコート09")));
  assert.ok(!isNsaTennisCourt(c("田原本町中央体育館", "体育館")));
  assert.ok(!isNsaTennisCourt(c("大和郡山市総合公園施設", "研修室")));
  assert.ok(!isNsaTennisCourt(c("三宅町中央公園運動施設", "ゲートボール場（西）")));
  assert.ok(!isNsaTennisCourt(c("何かの体育館", "バドミントンコート")));
});

import { nsaReservationUrl } from "../src/courts/narasuperapp";
test("予約画面のURLは、施設と建物のIDから作る(実際に教えてもらったURLと同じ形)", () => {
  assert.equal(
    nsaReservationUrl("a0nJ30000006tEoIAI", "a0hJ30000005nP6IAI"),
    "https://nsa.pref.nara.jp/fre/rsvApplication?retType=0&facilitiesId=a0nJ30000006tEoIAI&buildingId=a0hJ30000005nP6IAI",
  );
});
