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
    assert.match(f.summary, /\d円|無料/, f.match); // 金額(または「無料」)が入っている
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
  // 奈良市: 公式の使用料(各施設のページに掲載の同一のPDF)で、料金を載せた10施設は、ちょうど1つの料金に当たる
  const naraFee = ["奈良市南部生涯スポーツセンター", "奈良市柏木コート", "奈良市黒谷コート", "奈良市平城第一コート", "奈良市平城第二コート", "奈良市青山コート", "奈良市佐保山コート", "奈良市鴻ノ池コート", "奈良市西部生涯スポーツセンターコート", "都祁生涯スポーツセンター"];
  for (const n of naraFee) assert.equal(feeFor("奈良市", n).length, 1, n);
  // 公民館・サン・アクティブ奈良は、料金が別体系(PDFに載っていない)ので、金額は載せず、公式ページへのリンク
  for (const n of ["サン・アクティブ奈良（勤労者総合福祉センター）", "二名公民館", "京西公民館", "富雄公民館", "富雄南公民館"]) {
    assert.equal(feeFor("奈良市", n).length, 0, n);
    assert.equal(linkFor("奈良市", n).length, 1, n);
  }
});

// 奈良市の公式の使用料(PDF)の表: 庭球場(1面につき) 人工芝 1,350/1,800/3,600、人工芝以外 900/1,200/2,400、ゲートボール場・多目的コート 750/1,000/2,000
test("奈良市: コートの種類に合った料金が当たっている(施設ページの「施設概要」で確認した種類)", () => {
  const f = (n: string) => feeFor("奈良市", n)[0];
  for (const n of ["奈良市青山コート", "奈良市佐保山コート", "都祁生涯スポーツセンター"]) assert.match(f(n).summary, /1,350円.*1,800円.*3,600円/, n); // 砂入り人工芝
  for (const n of ["奈良市黒谷コート", "奈良市柏木コート", "奈良市平城第一コート", "奈良市平城第二コート"]) assert.match(f(n).summary, /900円.*1,200円.*2,400円/, n); // クレー舗装
  for (const n of ["奈良市鴻ノ池コート", "奈良市西部生涯スポーツセンターコート"]) { // 人工芝とクレーの両方
    const t = f(n).lines.join("\n");
    assert.match(t, /1,350円/); assert.match(t, /900円/);
  }
  assert.match(f("奈良市南部生涯スポーツセンター").lines.join("\n"), /多目的コート.*750円.*1,000円.*2,000円/);
  for (const n of ["奈良市青山コート", "奈良市黒谷コート"]) {
    const t = f(n).lines.join("\n");
    assert.match(t, /2割増/); assert.match(t, /半額/); assert.match(t, /市外の方は、2倍/);
  }
});

// ---- 奈良スーパーアプリの施設: 各施設・指定管理者の「公式」ページ・料金表で確認した料金 ----
test("斑鳩町: すこやか斑鳩300円(照明+200円)、神南は無料、斑鳩健民は300円(照明+200円)", () => {
  const f = (n: string) => feeFor("斑鳩町", n);
  assert.equal(f("すこやか斑鳩・スポーツセンター").length, 1);
  assert.match(f("すこやか斑鳩・スポーツセンター")[0].summary, /1面1時間 300円.*\+200円/);
  assert.equal(f("神南テニスコート").length, 1);
  assert.match(f("神南テニスコート")[0].summary, /無料/);
  assert.equal(f("奈良県斑鳩健民運動場").length, 1);
  assert.match(f("奈良県斑鳩健民運動場")[0].summary, /300円.*\+200円/);
});

test("香芝市: 高塚・健民とも1コート2時間1,300円(高塚は照明+500円)。市外は2倍の記載がある", () => {
  const f = (n: string) => feeFor("香芝市", n);
  assert.equal(f("香芝市高塚テニスコート").length, 1);
  assert.equal(f("香芝健民テニスコート").length, 1);
  assert.match(f("香芝市高塚テニスコート")[0].summary, /1,300円.*\+500円/);
  assert.match(f("香芝健民テニスコート")[0].summary, /1,300円/);
  for (const n of ["香芝市高塚テニスコート", "香芝健民テニスコート"]) assert.ok(f(n)[0].lines.some((x) => x.includes("2倍")), n);
});

test("広陵町: 第二浄化センターは1面1時間560円(ナイターなし)", () => {
  const f = feeFor("広陵町", "奈良県第二浄化センター スポーツ広場");
  assert.equal(f.length, 1);
  assert.match(f[0].summary, /560円/);
});

test("斑鳩町「健民」と香芝市「健民」は、エリアが違うので、取り違えない", () => {
  assert.equal(feeFor("斑鳩町", "香芝健民テニスコート").length, 0);
  assert.equal(feeFor("香芝市", "奈良県斑鳩健民運動場").length, 0);
});

test("大和郡山市: まほろば健康パークは1面1時間560円(照明+500円)", () => {
  const f = feeFor("大和郡山市", "まほろば健康パーク");
  assert.equal(f.length, 1);
  assert.match(f[0].summary, /560円.*\+500円/);
});

test("宇陀・橿原運動公園・大渕池・天理・葛城・田原本の料金(公式ページ・公式PDFで確認)", () => {
  const one = (site: string, name: string, re: RegExp) => {
    const f = feeFor(site, name);
    assert.equal(f.length, 1, `${site} ${name}`);
    assert.match(f[0].summary, re, `${site} ${name}`);
  };
  one("宇陀市", "宇陀市榛原グリーンテニスコート", /520円.*1,040円.*\+410円/);
  one("橿原市", "橿原運動公園", /730円.*\+410円/);
  one("奈良市", "大渕池公園", /1,150円.*1,460円.*2,500円/);
  one("天理市", "長柄運動公園", /510円.*\+300円/);
  one("天理市", "天理市福住運動場", /510円/);
  one("葛城市", "屋敷山公園テニスコート", /800円.*1,600円/);
  one("葛城市", "新町公園", /800円.*1,600円/);
  one("葛城市", "當麻スポーツセンター", /400円.*800円/);
  one("田原本町", "田原本町教育委員会(中央体育館)", /500円.*\+600円/);
  // 体育館だけの施設・心身障害者福祉センターには、テニスの料金を付けない
  assert.equal(feeFor("田原本町", "心身障害者福祉センター").length, 0);
  assert.equal(feeFor("宇陀市", "宇陀市総合体育館").length, 0);
  assert.equal(feeFor("橿原市", "県立橿原公苑").length, 0);
});

test("大和郡山市総合公園・三宅町中央公園・明日香の料金", () => {
  const one = (site: string, name: string, re: RegExp) => {
    const f = feeFor(site, name);
    assert.equal(f.length, 1, `${site} ${name}`);
    assert.match(f[0].summary, re, `${site} ${name}`);
  };
  one("大和郡山市", "大和郡山市総合公園施設", /385円.*440円/);
  one("大和郡山市", "まほろば健康パーク", /560円/); // 総合公園の料金と取り違えない
  one("三宅町", "三宅町中央公園運動施設", /300円.*500円/);
  one("明日香村", "ワタキューテニスパーク明日香(橿原公苑明日香庭球場)", /750円/);
});

test("すべての料金に、別の資料での裏付け(crossCheck)があり、出典はhttps", () => {
  for (const f of cfg.fees as any[]) {
    assert.ok(f.crossCheck, `${f.site} ${f.match}`);
    assert.ok(["match", "conflict"].includes(f.crossCheck.status));
    assert.ok(f.crossCheck.sources.length >= 1);
    for (const s of f.crossCheck.sources) assert.match(s.url, /^https:\/\//);
  }
});

test("南部は多目的コートの料金も出す / 新町公園の照明は1回1,100円", () => {
  const n = feeFor("奈良市", "奈良市南部生涯スポーツセンター")[0];
  assert.match(n.summary, /多目的コート 午前750円/);
  assert.match(feeFor("葛城市", "新町公園")[0].summary, /1,100円/);
});
