import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectNsaAuto, collectNsaTargets } from "../src/courts/collect/nsa";
import { Collected, type CollectContext } from "../src/courts/collect/collected";
import { nsaReservationUrl, type NaraSuperAppResponse, type NaraSuperAppTopResponse } from "../src/courts/narasuperapp";
import { NSA_NEAR_LABEL } from "../src/courts/status";
import type { NsaAutoConfig, NsaConfig } from "../src/courts/config";

// 実サイトには繋がない。保存してある実物の応答を返す fetch に差し替えて、取得の流れ(積み方・失敗の記録・断られたときのやめ方)を確かめる
const fixture = (name: string): NaraSuperAppResponse => JSON.parse(readFileSync(`${__dirname}/fixtures/${name}`, "utf-8"));
const kashiba = fixture("nsa-kashiba-20261106.json"); // 枠は 11/16〜11/30(すき間なし)
const yatayama = fixture("nsa-yatayama-20261106.json"); // 枠は 11/14〜11/30(11/17・11/24 は枠なし)
// 会議室だけの建物(利用目的に「テニス」があっても、表示するコートがない)
const roomsOnly: NaraSuperAppResponse = JSON.parse(JSON.stringify(kashiba));
roomsOnly.returnValue.equResultList = roomsOnly.returnValue.equResultList.map((e) => ({ ...e, Name: "会議室" }));
// 施設名に「テニス」があると、施設名だけでテニスコートとみなされるので、名前も変える
roomsOnly.returnValue.buildingRecord.Name = "会議センター";
roomsOnly.returnValue.buildingRecord.FRE_FacilitiesId__r = { Name: "会議センター" };

const B = { kashiba: "a0hJ30000007KkpIAE", yatayama: "a0hJ30000005nP6IAI", rooms: "b-rooms" };
const RAWS: Record<string, NaraSuperAppResponse> = { [B.kashiba]: kashiba, [B.yatayama]: yatayama, [B.rooms]: roomsOnly };

// 施設一覧は、実物から必要な形だけを取り出して小さく作る(並び順が、取りに行く順になる)
const top: NaraSuperAppTopResponse = {
  returnValue: {
    facilitiesResultList: [
      {
        facilityId: "a0nJ3000006hh2UIAQ", facilityName: "香芝健民テニスコート", municipality: "香芝市", facilityURL: "https://example.test/kashiba",
        buildingList: [{ buildingId: B.kashiba, buildingName: "香芝健民テニスコート", purposeUseList: ["テニス"] }],
      },
      {
        facilityId: "f-rooms", facilityName: "会議室だけの施設", municipality: "会議市",
        buildingList: [{ buildingId: B.rooms, buildingName: "本館", purposeUseList: ["テニス", "会議・研修等"] }],
      },
      {
        facilityId: "f-gym", facilityName: "体育館", municipality: "体育市",
        buildingList: [{ buildingId: "b-gym", buildingName: "体育館", purposeUseList: ["バスケットボール"] }], // テニスではないので取りに行かない
      },
      {
        facilityId: "a0nJ30000006tEoIAI", facilityName: "大和郡山市総合公園施設", municipality: "大和郡山市", facilityURL: "javascript:void(0)",
        buildingList: [{ buildingId: B.yatayama, buildingName: "テニスコート", purposeUseList: ["テニス"] }],
      },
    ],
  },
};

const DATES = ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-12-01"];
const ctx: CollectContext = { dates: DATES, first: "2026-11-14", last: "2026-11-16", purpose: { type: "7", codes: ["035"] } };
const auto = { type: "nsa-auto", id: "nsa", name: "奈良スーパーアプリ" } as NsaAutoConfig;

/**
 * fetch・待ち時間・ログを差し替えて動かす。answer は、空き照会のたびに呼ばれ、その建物の応答を返す。
 * 戻り値の calls は、空き照会した建物の並び(施設一覧は "top")
 */
async function run(fn: (acc: Collected) => Promise<void>, answer: (buildingId: string, nth: number) => Response, topRes = () => json(top)) {
  const real = { fetch: global.fetch, setTimeout: global.setTimeout, error: console.error };
  const calls: string[] = [];
  global.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === "getTopInfo") { calls.push("top"); return topRes(); }
    calls.push(body.params.buildingId);
    return answer(body.params.buildingId, calls.length);
  }) as typeof fetch;
  // 待ち時間(1〜1.5秒、やり直しの2秒・4秒)を飛ばす
  global.setTimeout = ((f: () => void) => real.setTimeout(f, 0)) as unknown as typeof setTimeout;
  console.error = () => {};
  const acc = new Collected();
  try {
    await fn(acc);
  } finally {
    global.fetch = real.fetch; global.setTimeout = real.setTimeout; console.error = real.error;
  }
  return { acc, calls };
}
const json = (v: unknown) => new Response(JSON.stringify(v));
const fromFixture = (id: string) => (RAWS[id] ? json(RAWS[id]) : new Response("x", { status: 404 }));
const status = (code: number) => new Response("x", { status: code });

test("collectNsaAuto: テニスの建物だけを取りに行き、公開する範囲の空き枠と予約画面のURLを積む", async () => {
  const { acc, calls } = await run((a) => collectNsaAuto(auto, ctx, a), fromFixture);
  assert.deepEqual(calls, ["top", B.kashiba, B.rooms, B.yatayama]); // テニスでない建物には通信しない
  assert.deepEqual(acc.errors, []);
  assert.deepEqual(acc.failures, []);
  // 会議室だけの建物は、エリアのボタンにも出さない
  assert.deepEqual([...acc.discovered].sort(), ["大和郡山市", "香芝市"].sort());
  assert.ok(!acc.slots.some((s) => s.site === "会議市"));
  // 空き枠は first〜last の範囲だけ。エリア名は市町村名
  assert.ok(acc.slots.length > 0);
  assert.ok(acc.slots.every((s) => s.date >= ctx.first && s.date <= ctx.last));
  assert.ok(acc.slots.some((s) => s.site === "香芝市" && s.facility === "香芝健民テニスコート"));
  assert.ok(acc.slots.some((s) => s.site === "大和郡山市"));
  assert.equal(acc.facilityUrls["香芝市|香芝健民テニスコート"], nsaReservationUrl("a0nJ3000006hh2UIAQ", B.kashiba));
  // 案内ページは http(s) のものだけ
  assert.deepEqual(acc.nsaInfoLinks, [{ site: "香芝市", match: "香芝健民テニスコート", url: "https://example.test/kashiba" }]);
  assert.ok(acc.namedFacilities.has("香芝市|香芝健民テニスコート"));
  assert.equal(acc.gymFacilities.size, 0);
});

test("collectNsaAuto: 枠のない日は、直前で消えた日・休館日など・未公開を分けて記録する", async () => {
  const { acc } = await run((a) => collectNsaAuto(auto, ctx, a), fromFixture);
  const of = (site: string, d: string) => acc.status.find((r) => r.s === site && r.d === d);
  // 香芝: 枠は 11/16 から。それより前は、直前のため消えた日(「まだ公開されていません」にしない)
  assert.deepEqual(of("香芝市", "2026-11-14"), { d: "2026-11-14", s: "香芝市", f: "香芝健民テニスコート", t: "closed", l: NSA_NEAR_LABEL });
  assert.equal(of("香芝市", "2026-11-15")?.l, NSA_NEAR_LABEL);
  // 大和郡山: 11/16 と 11/18 の間で枠がない 11/17 は、休館日など
  assert.equal(of("大和郡山市", "2026-11-17")?.t, "closed");
  assert.equal(of("大和郡山市", "2026-11-17")?.l, "休館日など");
  // 月末より先(翌月分)は、まだ公開されていない
  assert.equal(of("香芝市", "2026-12-01")?.t, "unpub");
  assert.equal(of("大和郡山市", "2026-12-01")?.t, "unpub");
});

test("collectNsaAuto: 続けて2回断られたら(403)、残りの建物は取りに行かず、その市町村も「取得できなかった」と記録する", async () => {
  const { acc, calls } = await run((a) => collectNsaAuto(auto, ctx, a), () => status(403));
  assert.deepEqual(calls, ["top", B.kashiba, B.rooms]); // やり直しもしない(1建物1回だけ)
  assert.deepEqual(acc.slots, []);
  assert.deepEqual(acc.failures, [{ s: "香芝市" }, { s: "会議市" }, { s: "大和郡山市" }]);
  assert.equal(acc.errors.at(-1), "奈良スーパーアプリ: 先方に断られたため、取得を中止");
  // 公開されるので、URL・ID・応答コードは入れない
  assert.ok(acc.errors.every((m) => !/https?:|403|a0h/.test(m)));
});

test("collectNsaAuto: 403 が続かなければ、最後の建物まで取りに行く", async () => {
  const { acc, calls } = await run((a) => collectNsaAuto(auto, ctx, a), (id) => (id === B.rooms ? status(403) : fromFixture(id)));
  assert.deepEqual(calls, ["top", B.kashiba, B.rooms, B.yatayama]);
  assert.deepEqual(acc.failures, [{ s: "会議市" }]);
  assert.ok(acc.slots.some((s) => s.site === "大和郡山市"));
});

test("collectNsaAuto: 503 は3回までやり直し、だめならその建物だけ失敗にして先へ進む", async () => {
  const { acc, calls } = await run((a) => collectNsaAuto(auto, ctx, a), (id) => (id === B.kashiba ? status(503) : fromFixture(id)));
  assert.deepEqual(calls, ["top", B.kashiba, B.kashiba, B.kashiba, B.rooms, B.yatayama]);
  assert.deepEqual(acc.failures, [{ s: "香芝市" }]);
  assert.deepEqual(acc.errors, ["香芝市: 取得に失敗"]);
  assert.ok(acc.slots.some((s) => s.site === "大和郡山市"));
});

test("collectNsaAuto: 施設一覧が取れなければ、サイト全体を「取得できなかった」と記録する", async () => {
  const { acc, calls } = await run((a) => collectNsaAuto(auto, ctx, a), fromFixture, () => json({ returnValue: {} }));
  // 形が違う応答は、通信の失敗と同じく3回までやり直す(HttpError ではないため)。建物は取りに行かない
  assert.deepEqual(calls, ["top", "top", "top"]);
  assert.deepEqual(acc.failures, [{ s: "奈良スーパーアプリ" }]);
  assert.deepEqual(acc.errors, ["奈良スーパーアプリ: 施設一覧の取得に失敗"]);
});

test("collectNsaTargets: 手で指定した建物は、サイト名をエリア名にして積み、1建物の失敗で止めない", async () => {
  const site = {
    type: "nsa", id: "nsa-x", name: "手動エリア",
    targets: [
      { facilityId: "f-x", buildingId: "b-missing", note: "取れない建物" },
      { facilityId: "a0nJ3000006hh2UIAQ", buildingId: B.kashiba },
    ],
  } as NsaConfig;
  const { acc, calls } = await run((a) => collectNsaTargets(site, ctx, a), fromFixture);
  assert.deepEqual(calls, ["b-missing", B.kashiba]); // 404 はやり直さない
  assert.deepEqual(acc.failures, [{ s: "手動エリア" }]);
  assert.deepEqual(acc.errors, ["手動エリア: 取得に失敗"]);
  assert.ok(acc.slots.length > 0);
  assert.ok(acc.slots.every((s) => s.site === "手動エリア"));
  assert.equal(acc.discovered.size, 0); // 手で指定したエリアは、自動で見つけたものに入れない
});
