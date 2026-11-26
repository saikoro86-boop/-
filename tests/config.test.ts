import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigs } from "../src/courts/config";

const REAL = join(__dirname, "..", "config");

test("実際の設定ファイルは、すべて検査を通る", () => {
  const c = loadConfigs(REAL);
  assert.ok(c.courts.sites.length >= 4);
  assert.ok(c.fees.fees.length >= 40);
  assert.ok(Object.keys(c.coords).length >= 50);
});

/** 設定フォルダを一時的にコピーして、1か所だけ壊す */
function broken(file: string, edit: (json: any) => void) {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  for (const f of readdirSync(REAL)) copyFileSync(join(REAL, f), join(dir, f));
  const j = JSON.parse(readFileSync(join(dir, file), "utf-8"));
  edit(j);
  writeFileSync(join(dir, file), JSON.stringify(j));
  return dir;
}

test("料金に出典がなければ、ファイル名と場所を示して止める", () => {
  const dir = broken("fees.json", (j) => { delete j.fees[3].source; });
  assert.throws(() => loadConfigs(dir), /fees\.json.*fees\.3\.source/s);
});
test("料金に裏付け(crossCheck)がなければ止める", () => {
  const dir = broken("fees.json", (j) => { delete j.fees[0].crossCheck; });
  assert.throws(() => loadConfigs(dir), /fees\.json.*crossCheck/s);
});
test("日付の書き方が違えば止める", () => {
  const dir = broken("fees.json", (j) => { j.fees[0].checkedAt = "11/7"; });
  assert.throws(() => loadConfigs(dir), /YYYY-MM-DD/);
});
test("サイトの種類が不明なら止める", () => {
  const dir = broken("courts.json", (j) => { j.sites[0].type = "unknown"; });
  assert.throws(() => loadConfigs(dir), /courts\.json/);
});
test("取得日数が範囲外なら止める", () => {
  const dir = broken("courts.json", (j) => { j.days = 0; });
  assert.throws(() => loadConfigs(dir), /courts\.json.*days/s);
});
test("位置が日本の外なら止める", () => {
  const dir = broken("coords.json", (j) => { const k = Object.keys(j.coords)[0]; j.coords[k].lat = 0; });
  assert.throws(() => loadConfigs(dir), /coords\.json/);
});
test("JSON として壊れていれば、そう伝える", () => {
  const dir = broken("places.json", () => {});
  writeFileSync(join(dir, "places.json"), "{ ここが壊れている");
  assert.throws(() => loadConfigs(dir), /places\.json: JSON として読めません/);
});
test("公式ページの URL が http(s) でなければ止める", () => {
  const dir = broken("official.json", (j) => { const k = Object.keys(j.urls)[0]; j.urls[k] = "ftp://example.com"; });
  assert.throws(() => loadConfigs(dir), /official\.json.*http\(s\)/s);
});
test("コートの種類(路面)が決まった値でなければ止める", () => {
  const dir = broken("courtinfo.json", (j) => { const k = Object.keys(j.info)[0]; j.info[k].surfaces = ["grass"]; });
  assert.throws(() => loadConfigs(dir), /courtinfo\.json/);
});
test("料金の別資料の裏付けが空なら止める", () => {
  const dir = broken("fees.json", (j) => { j.fees[0].crossCheck.sources = []; });
  assert.throws(() => loadConfigs(dir), /fees\.json.*crossCheck/s);
});
test("検査していない項目(メモなど)は、そのまま通す", () => {
  const dir = broken("courts.json", (j) => { j.memo = "メモ"; j.sites[0].memo = "メモ"; });
  const c = loadConfigs(dir) as any;
  assert.equal(c.courts.memo, "メモ");
  assert.equal(c.courts.sites[0].memo, "メモ");
});
test("設定ファイルが見つからなければ、例外になる", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-empty-"));
  assert.throws(() => loadConfigs(dir), /courts\.json/);
});
