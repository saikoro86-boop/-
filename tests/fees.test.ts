import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

interface Fee { site: string; match: string; summary: string; lines: string[]; source: { label: string; url: string }; checkedAt: string }
interface Link { site: string; match: string; url: string }
const cfg: { fees: Fee[]; links: Link[] } = JSON.parse(readFileSync(__dirname + "/../config/fees.json", "utf-8"));
const feeFor = (site: string, facility: string) => cfg.fees.filter((r) => r.site === site && facility.includes(r.match));
const linkFor = (site: string, facility: string) => cfg.links.filter((r) => r.site === site && facility.includes(r.match));

test("料金の設定: 出典(https)・確認日・説明が、すべてそろっている", () => {
  assert.ok(cfg.fees.length >= 12);
  for (const f of cfg.fees) {
    assert.match(f.source.url, /^https:\/\//, f.match);
    assert.match(f.checkedAt, /^\d{4}-\d{2}-\d{2}$/, f.match);
    assert.ok(f.summary.length > 0 && f.lines.length > 0 && f.source.label.length > 0, f.match);
    assert.match(f.summary, /\d円/, f.match); // 金額が入っている
  }
  for (const l of cfg.links) assert.match(l.url, /^https:\/\//, l.match);
});

// 公式の原本(木津川市の利用案内 11ページ、生駒市の体育施設条例 別表第3)の表を見て確認した金額。打ち間違いを防ぐ
test("木津川市: 兜谷・木津川台・梅美台・城址は600円、塚穴は500円。照明(500円)は兜谷・木津川台・梅美台だけ", () => {
  const f = (n: string) => feeFor("木津川市", n)[0];
  for (const n of ["兜谷公園", "木津川台公園", "梅美台テニスコート", "城址公園"]) assert.match(f(n).summary, /600円/, n);
  assert.match(f("塚穴公園").summary, /500円/);
  assert.ok(!/600円/.test(f("塚穴公園").summary));
  for (const n of ["兜谷公園", "木津川台公園", "梅美台テニスコート"]) assert.match(f(n).summary, /夜間照明 \+500円/, n);
  for (const n of ["城址公園", "塚穴公園"]) assert.ok(f(n).lines.some((x) => x.includes("夜間照明の設備は、ありません")), n);
});

test("生駒市: 山麓・むかいやま・総合は1,260円(全枠)、イモ山・滝寺・高山は17〜19時が1,050円、井出山は730円〜1,260円", () => {
  const f = (n: string) => feeFor("生駒市", n)[0];
  for (const n of ["山麓公園テニスコート", "むかいやま公園スポーツ施設", "生駒市体育協会総合S.C.（総合公園体育施設）"]) {
    assert.equal(f(n).summary, "1コート2時間 1,260円", n);
  }
  for (const n of ["イモ山公園スポーツ施設", "生駒市体育協会滝寺S.C.（滝寺公園体育施設）", "生駒市体育協会高山S.C.（生駒北スポーツセンター）"]) {
    assert.match(f(n).summary, /1,260円.*17〜19時は 1,050円/, n);
  }
  assert.match(f("TAC井出山スポーツパーク（井出山体育施設）").summary, /730円〜1,260円/);
});

test("施設名は、ちょうど1つの規則に当たる(料金・リンクが重複したり、抜けたりしない)", () => {
  const kizu = ["兜谷公園", "木津川台公園", "梅美台テニスコート", "城址公園", "塚穴公園"];
  const ikoma = ["山麓公園テニスコート", "むかいやま公園スポーツ施設", "生駒市体育協会総合S.C.（総合公園体育施設）", "イモ山公園スポーツ施設", "生駒市体育協会滝寺S.C.（滝寺公園体育施設）", "生駒市体育協会高山S.C.（生駒北スポーツセンター）", "TAC井出山スポーツパーク（井出山体育施設）"];
  for (const n of kizu) assert.equal(feeFor("木津川市", n).length, 1, n);
  for (const n of ikoma) assert.equal(feeFor("生駒市", n).length, 1, n);
  const nara = ["奈良市南部生涯スポーツセンター", "奈良市柏木コート", "奈良市黒谷コート", "奈良市平城第一コート", "奈良市平城第二コート", "奈良市青山コート", "奈良市佐保山コート", "奈良市鴻ノ池コート", "奈良市西部生涯スポーツセンターコート", "サン・アクティブ奈良（勤労者総合福祉センター）", "二名公民館", "京西公民館", "富雄公民館", "富雄南公民館", "都祁生涯スポーツセンター"];
  for (const n of nara) {
    assert.equal(linkFor("奈良市", n).length, 1, n);
    assert.equal(feeFor("奈良市", n).length, 0, n + "(奈良市は、原本を確認できていないので、金額は載せない)");
  }
});
