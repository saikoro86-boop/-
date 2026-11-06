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
  assert.ok(tels.length >= 19);
  for (const t of tels) assert.match(t, /^0\d{1,4}-\d{1,4}-\d{4}$/, t);
});

test("奈良市: 施設ごとに、公式ページ掲載の窓口が当たる(未登録の施設は undefined)", () => {
  const cfg = JSON.parse(readFileSync(__dirname + "/../config/courts.json", "utf-8"));
  const c = cfg.sites.find((s: any) => s.id === "nara-city").contacts;
  const tel = (f: string) => findContact(c, f)?.tel;
  assert.equal(tel("奈良市青山コート"), "0742-26-2996");
  assert.equal(tel("奈良市鴻ノ池コート"), "0742-27-4880");
  assert.equal(tel("奈良市柏木コート"), "0742-61-7029"); // 申込先: 南部生涯スポーツセンター
  assert.equal(tel("奈良市南部生涯スポーツセンター"), "0742-61-7029");
  assert.equal(tel("奈良市黒谷コート"), "0742-52-0100"); // 申込先: 西部生涯スポーツセンター
  assert.equal(tel("奈良市西部生涯スポーツセンターコート"), "0742-47-4118");
  assert.equal(tel("富雄南公民館"), "0742-48-3066"); // 「富雄」より先に「富雄南」が当たる
  assert.equal(tel("富雄公民館"), "0742-43-5386");
  // 施設自身の番号が確認できないものは、窓口の番号で代用し、未確認と表示する
  assert.equal(tel("奈良市平城第一コート"), "0742-34-4862"); // 担当課: スポーツ振興課
  assert.equal(findContact(c, "奈良市平城第一コート")?.unconfirmed, true);
  assert.equal(tel("奈良市佐保山コート"), "0742-34-4862"); // 平城と同じ担当課。施設自身の番号は未確認
  assert.equal(findContact(c, "奈良市佐保山コート")?.unconfirmed, true);
  assert.equal(findContact(c, "奈良市青山コート")?.unconfirmed, undefined); // 青山は、青山自身の番号だけ(他施設の窓口にはしない)
  assert.equal(tel("二名公民館"), "0742-46-9113");
  assert.equal(tel("京西公民館"), "0742-44-2669");
  assert.equal(tel("サン・アクティブ奈良（勤労者総合福祉センター）"), "0742-71-2444");
  assert.equal(tel("都祁生涯スポーツセンター"), "0743-82-0201"); // 予約の問い合わせ先: 都祁行政センター地域振興課
  assert.equal(findContact(c, "都祁生涯スポーツセンター")?.unconfirmed, undefined);
  // 奈良市の全施設に、何らかの連絡先がある
  for (const f of ["奈良市南部生涯スポーツセンター","奈良市柏木コート","奈良市黒谷コート","奈良市平城第一コート","奈良市平城第二コート","奈良市青山コート","奈良市佐保山コート","奈良市鴻ノ池コート","奈良市西部生涯スポーツセンターコート","サン・アクティブ奈良（勤労者総合福祉センター）","二名公民館","京西公民館","富雄公民館","富雄南公民館","都祁生涯スポーツセンター"]) assert.ok(findContact(c, f), f);
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
