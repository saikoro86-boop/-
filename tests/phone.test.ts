import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findContact } from "../src/courts/phone";
import { parseAvailability } from "../src/courts/kashikan";

test("施設名に合う連絡先を返す。なければ undefined", () => {
  const contacts = [{ match: "山麓", tel: "0743-73-8880" }, { match: "滝寺", tel: "0743-74-4701" }];
  assert.equal(findContact(contacts, "山麓公園テニスコート")?.tel, "0743-73-8880");
  assert.equal(findContact(contacts, "生駒市体育協会滝寺S.C.（滝寺公園体育施設）")?.tel, "0743-74-4701");
  assert.equal(findContact(contacts, "TAC井出山スポーツパーク"), undefined);
});

test("実画面(生駒市 2026-11-09)の ● は、記号のまま取れる(凡例: ●=空き・ネット予約は受付外)", () => {
  const html = readFileSync(__dirname + "/fixtures/ikoma-20261109.html", "utf-8");
  const marks = parseAvailability(html).flatMap((c) => c.slots.map((s) => s.mark));
  assert.ok(marks.includes("●"));
  assert.ok(!marks.includes("○")); // この日は、ネットで予約できる枠(○)が1つもない
});

// ---- 設定ファイルの電話番号が、形式として正しいこと(打ち間違いの防止) ----
test("config の電話番号は、市外局番-市内局番-番号の形になっている", () => {
  const cfg = JSON.parse(readFileSync(__dirname + "/../config/courts.json", "utf-8"));
  const tels: string[] = [];
  for (const s of cfg.sites) {
    for (const c of s.contacts ?? []) tels.push(c.tel);
    if (s.fallbackContact) tels.push(s.fallbackContact.tel);
  }
  assert.ok(tels.length >= 8);
  for (const t of tels) assert.match(t, /^0\d{1,4}-\d{1,4}-\d{4}$/, t);
});

test("奈良市: 青山と鴻ノ池は個別の番号、ほかは青山コート(事務所)を案内する", () => {
  const cfg = JSON.parse(readFileSync(__dirname + "/../config/courts.json", "utf-8"));
  const nara = cfg.sites.find((s: any) => s.id === "nara-city");
  assert.equal(findContact(nara.contacts, "奈良市青山コート")?.tel, "0742-26-2996");
  assert.equal(findContact(nara.contacts, "奈良市鴻ノ池コート")?.tel, "0742-27-4880");
  assert.equal(findContact(nara.contacts, "奈良市柏木コート"), undefined);
  assert.equal(nara.fallbackContact.tel, "0742-26-2996");
});

test("生駒市: 全施設に個別の番号がある(TAC井出山はテニスコート管理事務所の番号で、プールの番号ではない)", () => {
  const cfg = JSON.parse(readFileSync(__dirname + "/../config/courts.json", "utf-8"));
  const ik = cfg.sites.find((s: any) => s.id === "ikoma-city");
  const facilities = [
    "山麓公園テニスコート", "生駒市体育協会滝寺S.C.（滝寺公園体育施設）", "生駒市体育協会高山S.C.（生駒北スポーツセンター）",
    "生駒市体育協会総合S.C.（総合公園体育施設）", "むかいやま公園スポーツ施設", "イモ山公園スポーツ施設", "TAC井出山スポーツパーク（井出山体育施設）",
  ];
  for (const f of facilities) assert.ok(findContact(ik.contacts, f), f);
  assert.equal(findContact(ik.contacts, "TAC井出山スポーツパーク（井出山体育施設）")?.tel, "0743-76-6091");
});
