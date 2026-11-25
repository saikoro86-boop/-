import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommon, fetchPrevious } from "../src/courts/publish";
import { Collected } from "../src/courts/collect/collected";
import { loadConfigs } from "../src/courts/config";

const realFetch = global.fetch;
const restore = () => { global.fetch = realFetch; };

test("fetchPrevious: URL がなければ null(通信しない)", async () => {
  global.fetch = (async () => { throw new Error("呼ばれないはず"); }) as typeof fetch;
  try { assert.equal(await fetchPrevious(undefined), null); } finally { restore(); }
});

test("fetchPrevious: v=2 のデータなら、枠と失敗を返す", async () => {
  const body = { v: 2, courts: [["A", "B"]], byDate: { "2026-11-14": [[0, 9, 11, 0]] }, failures: [{ site: "奈良市", date: "2026-11-14" }] };
  global.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  try {
    const r = await fetchPrevious("https://example.test/data2.json");
    assert.deepEqual(r?.prev, { courts: body.courts, byDate: body.byDate });
    assert.equal(r?.failures.length, 1);
  } finally { restore(); }
});

test("fetchPrevious: 古い形(v≠2)や取得失敗は null", async () => {
  const quiet = console.log; console.log = () => {};
  try {
    global.fetch = (async () => new Response(JSON.stringify({ v: 1 }), { status: 200 })) as typeof fetch;
    assert.equal(await fetchPrevious("https://example.test/x"), null);
    global.fetch = (async () => new Response("x", { status: 404 })) as typeof fetch;
    assert.equal(await fetchPrevious("https://example.test/x"), null);
  } finally { console.log = quiet; restore(); }
});

test("buildCommon: 取得に失敗した回でも、設定から送り先と問い合わせ先を出す", () => {
  const configs = loadConfigs();
  const acc = new Collected();
  acc.errors.push("e");
  const c = buildCommon(configs, acc, null, "2026-11-25T00:00:00.000Z");
  assert.equal(c.updatedAt, "2026-11-25T00:00:00.000Z");
  assert.equal(c.weather, null);
  assert.deepEqual(c.errors, ["e"]);
  const kashikan = configs.courts.sites.filter((s) => s.type === "kashikan");
  assert.ok(kashikan.length > 0);
  for (const s of kashikan) {
    assert.equal(c.postLinks[s.name].url, s.url);
    assert.ok(c.contactRules[s.name]);
  }
});

test("buildCommon: 自動で見つけた市町村は、設定の後ろに足し、重複しない", () => {
  const configs = loadConfigs();
  const acc = new Collected();
  const first = configs.courts.sites.find((s) => s.type !== "nsa-auto")!.name;
  acc.discovered.add(first);
  acc.discovered.add("橿原市");
  const { sites } = buildCommon(configs, acc, null, "x");
  assert.equal(sites.filter((s) => s === first).length, 1);
  assert.equal(sites[sites.length - 1], "橿原市");
});

test("buildCommon: 体育館だけの施設にだけ注記を付ける", () => {
  const acc = new Collected();
  acc.gymFacilities.add("A|体育館");
  acc.gymFacilities.add("A|公園");
  acc.namedFacilities.add("A|公園");
  const c = buildCommon(loadConfigs(), acc, null, "x");
  assert.ok(c.facilityNotes["A|体育館"]);
  assert.equal(c.facilityNotes["A|公園"], undefined);
});

test("buildCommon: 位置は [緯度, 経度]、コートの種類は 0/1 に直す", () => {
  const configs = loadConfigs();
  const c = buildCommon(configs, new Collected(), null, "x");
  for (const [k, v] of Object.entries(configs.coords)) assert.deepEqual(c.coords[k], [v.lat, v.lng]);
  for (const [k, v] of Object.entries(configs.courtInfo)) {
    assert.equal(c.courtInfo[k].i, v.indoor ? 1 : 0);
    assert.equal(c.courtInfo[k].n, v.nighter == null ? null : v.nighter ? 1 : 0);
  }
});
