import { test } from "node:test";
import assert from "node:assert/strict";
import { normName, facilityKey, courtKey } from "../src/courts/keys";

test("normName: 全角英数を半角にそろえ、前後の空白を除く", () => {
  assert.equal(normName("テニスコートＡ"), "テニスコートA");
  assert.equal(normName("　第１コート \n"), "第1コート");
});

test("normName: 半角カナは全角カナにそろう(表記ゆれの吸収)", () => {
  assert.equal(normName("ﾃﾆｽｺｰﾄ"), "テニスコート");
});

test("facilityKey: 「エリア|施設名」の形(利用者の設定の鍵なので変えない)", () => {
  assert.equal(facilityKey("奈良市", "鴻ノ池運動公園"), "奈良市|鴻ノ池運動公園");
});

test("courtKey: 施設の鍵の末尾に「|コート名」が付く", () => {
  assert.equal(courtKey("奈良市", "鴻ノ池運動公園", "Aコート"), `${facilityKey("奈良市", "鴻ノ池運動公園")}|Aコート`);
});
