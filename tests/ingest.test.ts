import { test } from "node:test";
import assert from "node:assert/strict";
import { Collected } from "../src/courts/collect/collected";
import { buildIngestPayload, fetchIngest, mergeIngest, type IngestData } from "../src/courts/ingest";

const slot = (site: string, date: string, start = 9, end = 10, extra: object = {}) =>
  ({ date, site, facility: `${site}施設`, court: "A", start, end, ...extra });

/** 奈良市は取れた、生駒市は 403 で中止、という状態の acc を作る */
function sampleAcc() {
  const acc = new Collected();
  acc.slots.push(slot("奈良市", "2026-11-20"), slot("奈良市", "2026-11-21", 13, 17, { offline: true }));
  acc.setStatus("奈良市", "奈良市施設", "2026-11-22", "full");
  acc.contacts["奈良市|奈良市施設"] = { tel: "0742-00-0000" };
  acc.courtCodes["奈良市|奈良市施設|A"] = "035";
  acc.facilityUrls["奈良市|奈良市施設"] = "https://k6.example/";
  // 生駒市: 2日失敗して中止(whole-area failure が入る)
  acc.fail("生駒市", "生駒市 2026-11-20: 取得に失敗", "2026-11-20");
  acc.fail("生駒市", "生駒市: 先方に断られたため、取得を中止");
  return acc;
}

test("buildIngestPayload: 断られたエリアは送らない。取れたエリアだけを、そのまま詰める", () => {
  const { payload, blocked } = buildIngestPayload(sampleAcc(), ["奈良市", "生駒市"]);
  assert.deepEqual(blocked, ["生駒市"]);
  assert.deepEqual(payload.sites, ["奈良市"]);
  assert.equal(payload.slots.length, 2);
  assert.ok(payload.slots.every((s) => s.site === "奈良市"));
  assert.equal(payload.slots[1].offline, true);
  assert.deepEqual(payload.status, [{ d: "2026-11-22", s: "奈良市", f: "奈良市施設", t: "full" }]);
  assert.deepEqual(Object.keys(payload.contacts), ["奈良市|奈良市施設"]);
  assert.deepEqual(payload.courtCodes, { "奈良市|奈良市施設|A": "035" });
});

test("buildIngestPayload: 両方取れたら両方、両方断られたら空", () => {
  const ok = new Collected();
  ok.slots.push(slot("奈良市", "2026-11-20"), slot("生駒市", "2026-11-20"));
  assert.deepEqual(buildIngestPayload(ok, ["奈良市", "生駒市"]).payload.sites, ["奈良市", "生駒市"]);
  const blocked = new Collected();
  blocked.fail("奈良市", "奈良市: 中止");
  blocked.fail("生駒市", "生駒市: 中止");
  const r = buildIngestPayload(blocked, ["奈良市", "生駒市"]);
  assert.deepEqual(r.payload.sites, []);
  assert.deepEqual(r.blocked, ["奈良市", "生駒市"]);
});

/** ビルド側: 自宅PCの取得に 403 で失敗した acc を作る(奈良市・生駒市とも中止) */
function blockedAcc() {
  const acc = new Collected();
  for (const site of ["奈良市", "生駒市"]) {
    acc.slots.push(slot("橿原市", "2026-11-20")); // ほかのエリアは関係なく残る
    acc.fail(site, `${site} 2026-11-20: 取得に失敗`, "2026-11-20");
    acc.fail(site, `${site}: 先方に断られたため、取得を中止`);
    acc.setStatus(site, `${site}施設`, "2026-11-20", "unpub"); // 本来は出ないが、消えることの確認用
  }
  return acc;
}

const ingestData = (updatedAt: string): IngestData => ({
  updatedAt,
  sites: ["奈良市", "生駒市"],
  slots: [slot("奈良市", "2026-11-20"), slot("生駒市", "2026-11-21", 13, 17, { offline: true })],
  status: [{ d: "2026-11-22", s: "奈良市", f: "奈良市施設", t: "full" }],
  contacts: { "奈良市|奈良市施設": { tel: "0742-00-0000" } },
  courtCodes: { "奈良市|奈良市施設|A": "035" },
  facilityUrls: { "生駒市|生駒市施設": "https://k5.example/" },
});

test("mergeIngest: 新しければ混ぜる。そのエリアの『取得できなかった』は消える", () => {
  const acc = blockedAcc();
  const now = Date.parse("2026-11-17T06:00:00Z");
  const msg = mergeIngest(acc, ingestData("2026-11-17T04:00:00Z"), ["奈良市", "生駒市"], now);
  assert.match(msg, /取り込み: 奈良市・生駒市/);
  // 奈良市・生駒市の失敗(whole-area + 日付)が消えている。橿原市は残る
  assert.deepEqual(acc.failures, []);
  assert.deepEqual([...new Set(acc.slots.map((s) => s.site))].sort(), ["奈良市", "橿原市", "生駒市"]);
  // 消すべき unpub の status も消え、取り込んだ full が入っている
  assert.deepEqual(acc.status, [{ d: "2026-11-22", s: "奈良市", f: "奈良市施設", t: "full" }]);
  assert.equal(acc.contacts["奈良市|奈良市施設"].tel, "0742-00-0000");
  assert.equal(acc.facilityUrls["生駒市|生駒市施設"], "https://k5.example/");
  assert.deepEqual(acc.ingestedAt, { "奈良市": "2026-11-17T04:00:00Z", "生駒市": "2026-11-17T04:00:00Z" });
});

test("mergeIngest: 古い(6時間より前)なら混ぜない。失敗はそのまま残る", () => {
  const acc = blockedAcc();
  const now = Date.parse("2026-11-17T12:00:00Z");
  const msg = mergeIngest(acc, ingestData("2026-11-17T04:00:00Z"), ["奈良市", "生駒市"], now); // 8時間前
  assert.match(msg, /古い/);
  assert.ok(acc.failures.some((f) => f.s === "奈良市" && !f.d)); // 中止の記録が残る
  assert.ok(!acc.slots.some((s) => s.site === "奈良市")); // 取り込まれていない
});

test("mergeIngest: 許可していないエリアは混ぜない(保存データが汚れていても、関係ないエリアを書き換えない)", () => {
  const acc = new Collected();
  const now = Date.parse("2026-11-17T06:00:00Z");
  const bad: IngestData = { ...ingestData("2026-11-17T05:30:00Z"), sites: ["奈良市", "木津川市"], slots: [slot("木津川市", "2026-11-20")] };
  const msg = mergeIngest(acc, bad, ["奈良市", "生駒市"], now); // 木津川市は allowed に無い
  assert.match(msg, /取り込み: 奈良市/);
  assert.ok(!acc.slots.some((s) => s.site === "木津川市"));
  assert.deepEqual(acc.ingestedAt, { "奈良市": "2026-11-17T05:30:00Z" });
});

test("mergeIngest: 時刻が不正・未来なら混ぜない", () => {
  const acc = new Collected();
  assert.match(mergeIngest(acc, ingestData("こわれた"), ["奈良市"], Date.now()), /不正/);
  const future = Date.parse("2026-11-17T06:00:00Z");
  assert.match(mergeIngest(acc, ingestData("2026-11-17T07:00:00Z"), ["奈良市"], future), /古い/); // 未来(age<0)も使わない
});

/** fetch を差し替えて fetchIngest を動かす(終わったら元に戻す)。呼ばれた URL を返す */
async function withFetch<T>(impl: (url: string) => Response | Promise<Response>, fn: () => Promise<T>) {
  const orig = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => {
    urls.push(String(u));
    return impl(String(u));
  }) as typeof fetch;
  const origLog = console.log;
  console.log = () => {};
  try {
    return { result: await fn(), urls };
  } finally {
    globalThis.fetch = orig;
    console.log = origLog;
  }
}

test("fetchIngest: URL が無い・http(s) でないときは、通信せず null", async () => {
  const { result, urls } = await withFetch(() => new Response("{}"), async () => [
    await fetchIngest(undefined),
    await fetchIngest(""),
    await fetchIngest("file:///etc/passwd"),
  ]);
  assert.deepEqual(result, [null, null, null]);
  assert.equal(urls.length, 0);
});

test("fetchIngest: 形が正しければ返す。sites か updatedAt が欠けていれば null", async () => {
  const good = { sites: ["奈良市"], slots: [], status: [], contacts: {}, courtCodes: {}, facilityUrls: {}, updatedAt: "2026-11-28T00:00:00Z" };
  const a = await withFetch(() => new Response(JSON.stringify(good)), () => fetchIngest("https://relay.example/ingest-data"));
  assert.deepEqual(a.result, good);
  for (const bad of [null, { updatedAt: good.updatedAt }, { sites: "奈良市", updatedAt: good.updatedAt }, { sites: [] }]) {
    const b = await withFetch(() => new Response(JSON.stringify(bad)), () => fetchIngest("https://relay.example/ingest-data"));
    assert.equal(b.result, null);
  }
});

test("fetchIngest: 通信失敗・404・JSON でない応答でも落とさず null(取り込み無しで続ける)", async () => {
  const notFound = await withFetch(() => new Response("", { status: 404 }), () => fetchIngest("https://relay.example/x"));
  assert.equal(notFound.result, null);
  const notJson = await withFetch(() => new Response("<html>"), () => fetchIngest("https://relay.example/x"));
  assert.equal(notJson.result, null);
  const down = await withFetch(() => { throw new TypeError("fetch failed"); }, () => fetchIngest("https://relay.example/x"));
  assert.equal(down.result, null);
});
