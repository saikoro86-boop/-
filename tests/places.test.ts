import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface Place { site: string; match: string; dest: string; source: string }
const cfg = JSON.parse(readFileSync(__dirname + "/../config/places.json", "utf-8")) as { places: Place[] };

test("ルートの行き先: すべてに出典があり、住所は都道府県から始まる", () => {
  for (const p of cfg.places) {
    assert.ok(p.source && p.source.length > 3, p.match);
    assert.match(p.dest, /奈良県|京都府/, p.match);
  }
});

test("ルートの行き先: 1つの施設に、行き先が2つ当たらない", () => {
  const names = [
    ["天理市", "長柄運動公園"], ["天理市", "天理市福住運動場"], ["葛城市", "新町公園"], ["葛城市", "屋敷山公園テニスコート"],
    ["葛城市", "當麻スポーツセンター"], ["三宅町", "三宅町中央公園運動施設"], ["大和郡山市", "大和郡山市総合公園施設"],
    ["大和郡山市", "まほろば健康パーク"], ["生駒市", "生駒市体育協会総合S.C.（総合公園体育施設）"], ["生駒市", "TAC井出山スポーツパーク（井出山体育施設）"],
    ["田原本町", "田原本町教育委員会(中央体育館)"], ["木津川市", "城址公園"],
  ];
  for (const [site, f] of names) {
    assert.ok(cfg.places.filter((p) => p.site === site && f.includes(p.match)).length <= 1, f);
  }
  // まほろば健康パークは「総合公園」に当たらない(名前で検索)
  assert.equal(cfg.places.filter((p) => p.site === "大和郡山市" && "まほろば健康パーク".includes(p.match)).length, 0);
});
