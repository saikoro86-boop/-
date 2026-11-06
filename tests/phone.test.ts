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
