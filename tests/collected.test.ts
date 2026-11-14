import { test } from "node:test";
import assert from "node:assert/strict";
import { Collected } from "../src/courts/collect/collected";

test("setStatus: 空き(open)は記録しない", () => {
  const acc = new Collected();
  acc.setStatus("奈良市", "A公園", "2026-11-14", "open");
  assert.deepEqual(acc.status, []);
});
test("setStatus: 理由とラベルを記録し、ラベルなしなら l を持たない", () => {
  const acc = new Collected();
  acc.setStatus("奈良市", "A公園", "2026-11-14", "full", "満");
  acc.setStatus("奈良市", "B公園", "2026-11-14", "closed");
  assert.deepEqual(acc.status, [
    { d: "2026-11-14", s: "奈良市", f: "A公園", t: "full", l: "満" },
    { d: "2026-11-14", s: "奈良市", f: "B公園", t: "closed" },
  ]);
});
test("setStatus: 同じ施設・日の複数の建物は、空きに近い状態にまとめる(full が closed に勝つ)", () => {
  const acc = new Collected();
  acc.setStatus("奈良市", "A公園", "2026-11-14", "closed", "休");
  acc.setStatus("奈良市", "A公園", "2026-11-14", "full", "満");
  acc.setStatus("奈良市", "A公園", "2026-11-14", "unpub");
  assert.equal(acc.status.length, 1);
  assert.equal(acc.status[0].t, "full");
  assert.equal(acc.status[0].l, "満");
});
test("setStatus: 日が違えば別々に記録する", () => {
  const acc = new Collected();
  acc.setStatus("奈良市", "A公園", "2026-11-14", "full");
  acc.setStatus("奈良市", "A公園", "2026-11-15", "closed");
  assert.equal(acc.status.length, 2);
});
test("fail: 日付ありは {s, d}、日付なしは {s} を failures に積み、errors にも積む", () => {
  const acc = new Collected();
  acc.fail("生駒市", "生駒市 2026-11-14: 取得に失敗", "2026-11-14");
  acc.fail("生駒市", "生駒市: 先方に断られたため、取得を中止");
  assert.deepEqual(acc.failures, [{ s: "生駒市", d: "2026-11-14" }, { s: "生駒市" }]);
  assert.equal(acc.errors.length, 2);
});
