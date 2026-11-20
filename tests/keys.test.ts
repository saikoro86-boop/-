import { test } from "node:test";
import assert from "node:assert/strict";
import { normName, facilityKey, courtKey } from "../src/courts/keys";

test("normName: 全角英数を半角にそろえる", () => {
  assert.equal(normName("テニスコートＡ"), "テニスコートA");
  assert.equal(normName("第１コート"), "第1コート");
});

test("normName: 前後の空白(全角含む)を除く", () => {
  assert.equal(normName("  中央公園　"), "中央公園");
});

test("normName: すでにそろっている名前は変わらない", () => {
  assert.equal(normName("山田池公園"), "山田池公園");
});

test("facilityKey: 「エリア|施設名」の形(利用者の設定の鍵なので変えない)", () => {
  assert.equal(facilityKey("奈良市", "中央公園"), "奈良市|中央公園");
});

test("courtKey: 「エリア|施設名|コート名」の形", () => {
  assert.equal(courtKey("奈良市", "中央公園", "A面"), "奈良市|中央公園|A面");
});

test("courtKey は facilityKey に「|コート名」を足した形", () => {
  assert.equal(courtKey("生駒市", "北コート", "1"), `${facilityKey("生駒市", "北コート")}|1`);
});
