import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { facilitiesWithMarks, findContact } from "../src/courts/phone";
import { parseAvailability } from "../src/courts/kashikan";

test("●表示の施設だけを拾う(○・×だけの施設は含めない)", () => {
  const courts = [
    { facility: "山麓公園テニスコート", court: "A", slots: [{ start: 9, end: 10, mark: "●" }] },
    { facility: "むかいやま公園スポーツ施設", court: "A", slots: [{ start: 9, end: 10, mark: "×" }, { start: 10, end: 11, mark: "○" }] },
  ];
  assert.deepEqual(facilitiesWithMarks(courts, ["●"]), ["山麓公園テニスコート"]);
  assert.deepEqual(facilitiesWithMarks(courts, []), []);
});

test("施設名に合う連絡先を返す。なければ undefined", () => {
  const contacts = [{ match: "山麓", tel: "0743-73-8880" }, { match: "滝寺", tel: "0743-74-4701" }];
  assert.equal(findContact(contacts, "山麓公園テニスコート")?.tel, "0743-73-8880");
  assert.equal(findContact(contacts, "生駒市体育協会滝寺S.C.（滝寺公園体育施設）")?.tel, "0743-74-4701");
  assert.equal(findContact(contacts, "TAC井出山スポーツパーク"), undefined);
});

test("実画面(生駒市 2026-11-09 の ●)を解析しても ● がそのまま取れる", () => {
  const html = readFileSync(__dirname + "/fixtures/ikoma-20261109.html", "utf-8");
  const courts = parseAvailability(html);
  assert.ok(facilitiesWithMarks(courts, ["●"]).length > 0);
});
