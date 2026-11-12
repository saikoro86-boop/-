import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSlots, expandSlots } from "../src/courts/compact";
import type { OpenSlot } from "../src/courts/types";

// 画面の部品(public/app-logic.js)。ブラウザと同じファイルを、そのまま読む
// eslint-disable-next-line @typescript-eslint/no-var-requires
const L = require("../public/app-logic.js");

test("dateLabel / weekday: 日付の文字列から曜日を出す(端末のタイムゾーンに左右されない)", () => {
  assert.equal(L.dateLabel("2026-11-14"), "11/14(土)");
  assert.equal(L.dateLabel("2026-11-08"), "11/8(日)");
  assert.equal(L.weekday("2026-11-09"), 1);
});

test("nowJst: 日本時間で日付をまたぐ瞬間を正しく扱う", () => {
  assert.deepEqual(L.nowJst(Date.parse("2026-11-10T14:59:00Z")), { today: "2026-11-10", hour: 23 + 59 / 60 });
  assert.deepEqual(L.nowJst(Date.parse("2026-11-10T15:00:00Z")), { today: "2026-11-11", hour: 0 });
});

test("visibleDates: 昨日より前は出さない。全部過去なら、そのまま出す", () => {
  assert.deepEqual(L.visibleDates(["2026-11-07", "2026-11-08", "2026-11-09"], "2026-11-08"), ["2026-11-08", "2026-11-09"]);
  assert.deepEqual(L.visibleDates(["2026-11-01", "2026-11-02"], "2026-11-08"), ["2026-11-01", "2026-11-02"]);
  assert.deepEqual(L.visibleDates([], "2026-11-08"), []);
});

test("hm / fmtT: 時刻の書き方", () => {
  assert.equal(L.hm(9), "9"); assert.equal(L.hm(9.5), "9:30"); assert.equal(L.hm(17), "17");
  assert.equal(L.fmtT(9), "9:00"); assert.equal(L.fmtT(13.5), "13:30");
});

test("expandV2: 配信データ(compact.ts の出力)を、画面が使う1枠ごとの形に戻す。TS の expandSlots と同じ", () => {
  const slots: OpenSlot[] = [
    { date: "2026-11-14", site: "奈良市", facility: "柏木コート", court: "コートA", start: 9, end: 12 },
    { date: "2026-11-14", site: "奈良市", facility: "柏木コート", court: "コートA", start: 13, end: 17, offline: true },
    { date: "2026-11-15", site: "生駒市", facility: "山麓公園", court: "A", start: 10, end: 11 },
  ];
  const c = compactSlots(slots);
  const sortKey = (x: OpenSlot) => `${x.date}|${x.site}|${x.facility}|${x.court}|${x.start}`;
  const page = [...L.expandV2({ ...c })].sort((a: OpenSlot, b: OpenSlot) => sortKey(a).localeCompare(sortKey(b)));
  const ts = expandSlots(c).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  assert.deepEqual(page, ts);
  assert.deepEqual([...slots].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), page);
});
test("expandV2: 5番目が 1 の枠には fresh が付く。範囲外のコート番号は読み飛ばす", () => {
  const d = { courts: [["奈良市", "A", "1"]], byDate: { "2026-11-14": [[0, 9, 10, 0, 1], [5, 9, 10, 0]] } };
  assert.deepEqual(L.expandV2(d), [{ date: "2026-11-14", site: "奈良市", facility: "A", court: "1", start: 9, end: 10, fresh: true }]);
});

test("mergeCourtSpans: 連続する枠を1つに。ネット予約の枠と受付外(☎)は混ぜない。🆕は引き継ぐ", () => {
  const r = L.mergeCourtSpans([
    { start: 10, end: 11 }, { start: 9, end: 10, fresh: true }, { start: 12, end: 13 },
    { start: 9, end: 10, offline: true }, { start: 10, end: 12, offline: true },
  ]);
  assert.deepEqual(r, [
    { start: 9, end: 11, offline: false, fresh: true },
    { start: 9, end: 12, offline: true, fresh: false },
    { start: 12, end: 13, offline: false, fresh: false },
  ]);
});
test("mergeCourtSpans: 渡した配列を並べ替えない", () => {
  const input = [{ start: 12, end: 13 }, { start: 9, end: 10 }];
  L.mergeCourtSpans(input);
  assert.deepEqual(input.map((x) => x.start), [12, 9]);
});

test("mergeFacilitySpans: 施設全体でまとめる。受付外になるのは、重なった全部が受付外のときだけ", () => {
  assert.deepEqual(L.mergeFacilitySpans([{ start: 9, end: 12, offline: true }, { start: 11, end: 13 }, { start: 15, end: 16, offline: true }]), [[9, 13, false], [15, 16, true]]);
});

test("failedAreas: 絞り込み中のエリアと、日付に合うものだけ", () => {
  const f = [{ s: "生駒市", d: "2026-11-14" }, { s: "奈良市" }, { s: "生駒市", d: "2026-11-20" }];
  assert.deepEqual(L.failedAreas(f, "all", ["2026-11-14"]), ["生駒市", "奈良市"]);
  assert.deepEqual(L.failedAreas(f, "奈良市", ["2026-11-14"]), ["奈良市"]);
  assert.deepEqual(L.failedAreas(f, "生駒市", ["2026-11-15"]), []);
  assert.deepEqual(L.failedAreas(undefined, "all", []), []);
});

test("haversineKm: 奈良市役所〜京都駅は約36km", () => {
  const km = L.haversineKm(34.6851, 135.8049, 34.9858, 135.7588);
  assert.ok(km > 32 && km < 36, String(km));
  assert.equal(L.haversineKm(34.6, 135.8, 34.6, 135.8), 0);
});

test("shareText: ☎の枠は、そう分かる印と電話番号が入る", () => {
  const t = L.shareText({ facility: "柏木コート", court: "コートB", date: "2026-11-14", spans: [{ start: 9, end: 12 }, { start: 13, end: 17, offline: true }], url: "https://x.test", tel: "0742-00-0000" });
  assert.equal(t, "【テニスコートの空き】\n11/14(土) 柏木コート コートB\n9:00〜12:00 / 13:00〜17:00(ネット予約外・電話)\n電話: 0742-00-0000\n予約サイト: https://x.test");
  assert.ok(!L.shareText({ facility: "F", court: "C", date: "2026-11-14", spans: [{ start: 9, end: 10 }], tel: "0742" }).includes("電話"));
});

const ev = { date: "2026-11-14", start: 9.5, end: 11, title: "🎾 テニス 奈良市柏木コート コートA", location: "奈良県奈良市", details: "予約サイト: https://x.test/a,b;c\nルート: https://maps.test" };
test("calStamp / googleCalUrl: 日本時間の日時が入る", () => {
  assert.equal(L.calStamp("2026-11-14", 9.5), "20261114T093000");
  const u = new URL(L.googleCalUrl(ev));
  assert.equal(u.searchParams.get("dates"), "20261114T093000/20261114T110000");
  assert.equal(u.searchParams.get("ctz"), "Asia/Tokyo");
  assert.equal(u.searchParams.get("text"), ev.title);
});
test("icsText: 日本時間・1時間前の通知・エスケープ・75バイト以内の折り返し", () => {
  const ics = L.icsText(ev, new Date("2026-11-10T00:00:00Z"));
  assert.ok(ics.includes("DTSTAMP:20261110T000000Z"));
  assert.ok(ics.includes("DTSTART;TZID=Asia/Tokyo:20261114T093000"));
  assert.ok(ics.includes("DTEND;TZID=Asia/Tokyo:20261114T110000"));
  assert.ok(ics.includes("TRIGGER:-PT1H"));
  assert.ok(ics.endsWith("\r\n"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  // 折り返しをもどして、エスケープを確かめる(カンマ・セミコロン・改行)
  const body = ics.replace(/\r\n /g, "");
  assert.ok(body.includes("a\\,b\\;c\\n"));
});

// ---- 自分のスマホで取り込んだ空き ----
const slotOf = (site: string, date: string, start = 9, end = 10, extra: object = {}) => ({ date, site, facility: "F", court: "C", start, end, ...extra });
const imp = (slots: object[], covers: object[] | undefined, importedAt = "2026-11-12T05:00:00.000Z") => ({ source: "import", importedAt, slots, ...(covers ? { covers } : {}) });

test("validateImport: 形の合わないものは捨てる。☎(offline)と、入れ替える範囲(covers)は通す", () => {
  const v = L.validateImport(imp([slotOf("奈良市", "2026-11-14", 9, 12, { offline: true, evil: "<script>" }), { date: "x" }, slotOf("奈良市", "2026-11-14", 12, 9)], [{ s: "奈良市", d: "2026-11-14" }, { s: "", d: "x" }, { s: "生駒市", d: "だめ" }]));
  assert.deepEqual(v.slots, [{ date: "2026-11-14", site: "奈良市", facility: "F", court: "C", start: 9, end: 12, offline: true }]);
  assert.deepEqual(v.covers, [{ s: "奈良市", d: "2026-11-14" }]);
  assert.equal(L.validateImport({ source: "other", slots: [] }), null);
  assert.equal(L.validateImport(imp([], undefined)), null);                              // 枠も範囲もない
  assert.ok(L.validateImport(imp([], [{ s: "奈良市", d: "2026-11-14" }])));              // 空きなしの日(範囲だけ)は通す
  assert.equal(L.validateImport(imp(new Array(5001).fill(slotOf("奈良市", "2026-11-14")), undefined)), null);
});

test("mergeImport: 取り込んだ日だけを入れ替え、ほかの日・ほかのエリアは残す。今日より前は捨てる", () => {
  const today = "2026-11-12";
  let st = L.mergeImport(null, L.validateImport(imp([slotOf("奈良市", "2026-11-14")], [{ s: "奈良市", d: "2026-11-14" }])), today);
  st = L.mergeImport(st, L.validateImport(imp([slotOf("奈良市", "2026-11-15"), slotOf("奈良市", "2026-11-11")], [{ s: "奈良市", d: "2026-11-15" }], "2026-11-12T06:00:00.000Z")), today);
  st = L.mergeImport(st, L.validateImport(imp([slotOf("木津川市", "2026-11-14")], [{ s: "木津川市" }], "2026-11-12T07:00:00.000Z")), today);
  assert.deepEqual(st.slots.map((s: { site: string; date: string }) => s.site + s.date).sort(), ["奈良市2026-11-14", "奈良市2026-11-15", "木津川市2026-11-14"]);
  assert.equal(st.at["奈良市"], "2026-11-12T06:00:00.000Z");
  assert.deepEqual(Object.keys(st.days).sort(), ["奈良市|2026-11-14", "奈良市|2026-11-15"]);
  // 同じ日をもう一度取り込むと、その日だけ入れ替わる(空きなしになった)
  st = L.mergeImport(st, L.validateImport(imp([], [{ s: "奈良市", d: "2026-11-14" }], "2026-11-12T08:00:00.000Z")), today);
  assert.deepEqual(st.slots.map((s: { site: string; date: string }) => s.site + s.date).sort(), ["奈良市2026-11-15", "木津川市2026-11-14"]);
  assert.equal(st.days["奈良市|2026-11-14"], "2026-11-12T08:00:00.000Z");
  // 保存したものは、もう一度検証を通る(読み直せる)
  assert.deepEqual(L.validateImport(JSON.parse(JSON.stringify(st))).slots, st.slots);
});

test("mergeImport: 以前の形(covers なし)の取り込みは、出てきたエリアを丸ごと入れ替える", () => {
  const old = L.validateImport(imp([slotOf("木津川市", "2026-11-14"), slotOf("木津川市", "2026-11-15")], undefined));
  const st = L.mergeImport(old, L.validateImport(imp([slotOf("木津川市", "2026-11-16")], undefined, "2026-11-12T09:00:00.000Z")), "2026-11-12");
  assert.deepEqual(st.slots.map((s: { date: string }) => s.date), ["2026-11-16"]);
});

test("importedSlotsToShow: 自動取得にそのエリアの枠があれば、取り込んだ分は足さない。足す枠には取り込んだ時刻が付く", () => {
  const st = L.mergeImport(null, L.validateImport(imp([slotOf("奈良市", "2026-11-14"), slotOf("生駒市", "2026-11-14")], [{ s: "奈良市", d: "2026-11-14" }, { s: "生駒市", d: "2026-11-14" }])), "2026-11-12");
  const add = L.importedSlotsToShow([slotOf("生駒市", "2026-11-20")], st, "2026-11-12");
  assert.deepEqual(add.map((s: { site: string }) => s.site), ["奈良市"]);
  assert.equal(add[0].imported, "2026-11-12T05:00:00.000Z");
  assert.deepEqual(L.importedSlotsToShow([], null, "2026-11-12"), []);
});

test("failedAreas: その日を自分で取り込んであるエリアは、「取得できなかった」から外す", () => {
  const f = [{ s: "奈良市" }, { s: "生駒市" }];
  const days = { "奈良市|2026-11-14": "2026-11-12T05:00:00.000Z" };
  assert.deepEqual(L.failedAreas(f, "all", ["2026-11-14"], days), ["生駒市"]);
  assert.deepEqual(L.failedAreas(f, "all", ["2026-11-14", "2026-11-15"], days), ["奈良市", "生駒市"]); // 一部の日だけでは外さない
});

test("importLabel", () => {
  assert.equal(L.importLabel([{ s: "奈良市", d: "2026-11-14" }]), "奈良市 11/14(土)");
  assert.equal(L.importLabel([{ s: "木津川市" }]), "木津川市");
});
