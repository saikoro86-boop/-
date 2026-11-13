import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfigs } from "../src/courts/config";
import { Collected } from "../src/courts/collect/collected";
import { buildCommon, fetchPrevious } from "../src/courts/publish";

const configs = loadConfigs("config");
const realFetch = global.fetch;
const restore = () => { global.fetch = realFetch; };

test("buildCommon: エリアのボタンは、設定の順に自動で見つけた市町村を五十音順で足し、重複しない", () => {
  const acc = new Collected();
  acc.discovered.add("設定にない市");
  acc.discovered.add(configs.courts.sites.find((s) => s.type !== "nsa-auto")!.name);
  const c = buildCommon(configs, acc, null, "2026-11-13T00:00:00Z");
  assert.equal(new Set(c.sites).size, c.sites.length);
  assert.equal(c.sites[c.sites.length - 1], "設定にない市");
  assert.equal(c.updatedAt, "2026-11-13T00:00:00Z");
});

test("buildCommon: 体育館だけの施設にだけ注記が付き、テニスコートと同居する施設には付かない", () => {
  const acc = new Collected();
  acc.gymFacilities.add("A市|体育館");
  acc.gymFacilities.add("A市|総合公園");
  acc.namedFacilities.add("A市|総合公園");
  const c = buildCommon(configs, acc, null, "x");
  assert.deepEqual(Object.keys(c.facilityNotes), ["A市|体育館"]);
});

test("buildCommon: 位置とコートの種類は、画面が読む短い形に変わる", () => {
  const c = buildCommon(configs, new Collected(), null, "x");
  const [k, v] = Object.entries(configs.coords)[0];
  assert.deepEqual(c.coords[k], [v.lat, v.lng]);
  for (const info of Object.values(c.courtInfo)) {
    assert.ok(info.i === 0 || info.i === 1);
    assert.ok(info.n === null || info.n === 0 || info.n === 1);
  }
});

test("buildCommon: 奈良市・生駒市の送り先は、取得できていなくても設定から出る", () => {
  const c = buildCommon(configs, new Collected(), null, "x");
  const names = configs.courts.sites.filter((s) => s.type === "kashikan").map((s) => s.name);
  assert.ok(names.length > 0);
  assert.deepEqual(Object.keys(c.postLinks), names);
  assert.deepEqual(Object.keys(c.contactRules), names);
});

test("fetchPrevious: URL がなければ null(通信しない)", async () => {
  global.fetch = (async () => { throw new Error("呼ばれないはず"); }) as typeof fetch;
  try { assert.equal(await fetchPrevious(undefined), null); } finally { restore(); }
});

test("fetchPrevious: v2 のデータは枠と失敗を取り出し、失敗がなければ空配列", async () => {
  global.fetch = (async () => new Response(JSON.stringify({ v: 2, courts: [], byDate: {} }))) as typeof fetch;
  try {
    assert.deepEqual(await fetchPrevious("https://example.test/d.json"), { prev: { courts: [], byDate: {} }, failures: [] });
  } finally { restore(); }
});

test("fetchPrevious: 古い形・通信失敗のときは null で続ける", async () => {
  const log = console.log;
  console.log = () => {};
  try {
    global.fetch = (async () => new Response(JSON.stringify({ v: 1 }))) as typeof fetch;
    assert.equal(await fetchPrevious("https://example.test/d.json"), null);
    global.fetch = (async () => new Response("x", { status: 404 })) as typeof fetch;
    assert.equal(await fetchPrevious("https://example.test/d.json"), null);
  } finally { restore(); console.log = log; }
});
