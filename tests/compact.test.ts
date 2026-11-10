import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSlots, expandSlots } from "../src/courts/compact";
import type { OpenSlot } from "../src/courts/types";

const s = (court: string, date: string, start: number, end: number, offline = false): OpenSlot =>
  ({ date, site: "奈良市", facility: "柏木コート", court, start, end, ...(offline ? { offline: true as const } : {}) });

/** (コート, 日付, 通常/受付外, 空いている時間帯)の集まりを、比較用の文字列にする */
function coverage(slots: OpenSlot[]): string[] {
  const m = new Map<string, Set<number>>();
  for (const x of slots) {
    const k = `${x.site}/${x.facility}/${x.court}/${x.date}/${x.offline ? "off" : "on"}`;
    const set = m.get(k) ?? new Set<number>();
    for (let h = x.start * 2; h < x.end * 2; h++) set.add(h); // 30分刻み
    m.set(k, set);
  }
  return [...m].map(([k, v]) => `${k}:${[...v].sort((a, b) => a - b).join(",")}`).sort();
}

test("連続する枠は1つにまとめる。離れた枠・通常と受付外は、まとめない", () => {
  const c = compactSlots([s("A", "2026-11-14", 9, 10), s("A", "2026-11-14", 10, 11), s("A", "2026-11-14", 11, 12), s("A", "2026-11-14", 14, 15), s("A", "2026-11-14", 15, 16, true)]);
  assert.deepEqual(c.byDate["2026-11-14"], [[0, 9, 12, 0], [0, 14, 15, 0], [0, 15, 16, 1]]);
  assert.deepEqual(c.courts, [["奈良市", "柏木コート", "A"]]);
});

test("展開しても、空いている時間帯は、まとめる前と同じ(全組み合わせで確認)", () => {
  const slots: OpenSlot[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const court of ["A", "B", "C"]) for (const date of ["2026-11-14", "2026-11-15"]) for (let h = 9; h < 21; h++) {
    if (rnd() < 0.5) slots.push(s(court, date, h, h + 1, rnd() < 0.2));
    if (rnd() < 0.1) slots.push(s(court, date, h, h + 2)); // 重なる枠
  }
  assert.deepEqual(coverage(expandSlots(compactSlots(slots))), coverage(slots));
});

test("枠が少なくなり、コート名は一覧に1回だけ持つ", () => {
  const slots = Array.from({ length: 12 }, (_, i) => s("A", "2026-11-14", 9 + i, 10 + i));
  const c = compactSlots(slots);
  assert.equal(c.byDate["2026-11-14"].length, 1);
  assert.equal(c.courts.length, 1);
});

test("空の入力でも動く", () => {
  assert.deepEqual(compactSlots([]), { courts: [], byDate: {} });
  assert.deepEqual(expandSlots({ courts: [], byDate: {} }), []);
});

// ---- 🆕 新しく空いた枠 ----
import { markNew } from "../src/courts/compact";
test("前回は埋まっていた時間を含む枠に🆕、同じ枠や先の新しい日には付けない", () => {
  const prev = { courts: [["奈良市", "A", "1"]] as [string, string, string][], byDate: { "2026-11-10": [[0, 9, 12, 0]] as any } };
  const cur = {
    courts: [["奈良市", "A", "1"], ["奈良市", "A", "2"]] as [string, string, string][],
    byDate: {
      "2026-11-10": [[0, 9, 12, 0], [0, 13, 15, 0], [1, 9, 10, 0]] as any,
      "2026-11-11": [[0, 9, 12, 0]] as any, // 前回より先の日(新しく公開された日)
    },
  };
  const r = markNew(cur, prev);
  assert.deepEqual(r.byDate["2026-11-10"].map((x) => x[4] ?? 0), [0, 1, 1]);
  assert.deepEqual(r.byDate["2026-11-11"].map((x) => x[4] ?? 0), [0]);
  assert.equal(markNew(cur, null), cur);
});

// ---- 取得に失敗した範囲を、「新しく空いた」と間違えない ----
const mk = (rows: [string, number, number][], date = "2026-11-14"): import("../src/courts/compact").CompactSlots => ({
  courts: [["奈良市", "A施設", "コートA"], ["生駒市", "B施設", "コートB"]],
  byDate: { [date]: rows.map(([, s, e], i) => [rows[i][0] === "奈良市" ? 0 : 1, s, e, 0] as [number, number, number, 0]) },
});

test("markNew: 前回、そのエリアの取得に失敗していたら、今回の枠に印を付けない", () => {
  const prev = mk([["奈良市", 9, 12]]);                      // 前回は生駒市の枠が1つもない(取得失敗)
  const cur = mk([["奈良市", 9, 12], ["生駒市", 9, 12]]);
  const withFail = markNew(cur, prev, [{ s: "生駒市" }]);
  assert.deepEqual(withFail.byDate["2026-11-14"].map((x) => x[4]), [undefined, undefined]);
});

test("markNew: 失敗の記録がなくても、前回まったく枠のなかったエリアには印を付けない", () => {
  const prev = mk([["奈良市", 9, 12]]);
  const cur = mk([["奈良市", 9, 12], ["生駒市", 9, 12]]);
  assert.deepEqual(markNew(cur, prev).byDate["2026-11-14"].map((x) => x[4]), [undefined, undefined]);
});

test("markNew: 日付つきの失敗は、その日だけ印を付けない(ほかの日は、これまでどおり)", () => {
  const prev = { courts: [["奈良市", "A施設", "コートA"]] as [string, string, string][], byDate: { "2026-11-14": [[0, 9, 10, 0]], "2026-11-15": [[0, 9, 10, 0]] } } as import("../src/courts/compact").CompactSlots;
  const cur = { courts: prev.courts, byDate: { "2026-11-14": [[0, 9, 12, 0]], "2026-11-15": [[0, 9, 12, 0]] } } as import("../src/courts/compact").CompactSlots;
  const r = markNew(cur, prev, [{ s: "奈良市", d: "2026-11-14" }]);
  assert.equal(r.byDate["2026-11-14"][0][4], undefined);  // 失敗していた日
  assert.equal(r.byDate["2026-11-15"][0][4], 1);          // 10〜12時が新しく空いた
});
