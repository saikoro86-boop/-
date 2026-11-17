import { test } from "node:test";
import assert from "node:assert/strict";
import { kashikanFacilityState, mergeStates, nsaDayState, NSA_NEAR_LABEL } from "../src/courts/status";

const court = (...marks: string[]) => ({ facility: "F", court: "A", slots: marks.map((mark, i) => ({ start: 9 + i, end: 10 + i, mark })) });

test("貸館方式: ○があれば open、●(ネット予約は受付外の空き)も open、×だけなら full", () => {
  assert.equal(kashikanFacilityState([court("×", "○")], ["●"])?.state, "open");
  assert.equal(kashikanFacilityState([court("×", "●")], ["●"])?.state, "open");
  assert.equal(kashikanFacilityState([court("×", "●")], [])?.state, "full"); // ●を空きとして扱う設定がなければ
  assert.equal(kashikanFacilityState([court("×", "×", "")], ["●"])?.state, "full");
});

test("貸館方式: 休館は closed、「-」は受付期間外(ラベル付き)、空欄だけなら判定なし", () => {
  assert.deepEqual(kashikanFacilityState([court("休館", "休館")], ["●"]), { state: "closed", label: "休館" });
  assert.deepEqual(kashikanFacilityState([court("-")], []), { state: "closed", label: "受付期間外" });
  assert.equal(kashikanFacilityState([court("", "")], ["●"]), undefined);
});

test("奈良スーパーアプリ: 空きあり open / 全部予約済み full / 期間内で枠なしは休館日など", () => {
  const r = { firstSlot: "2026-11-24", lastSlot: "2026-11-30" };
  assert.deepEqual(nsaDayState({ hasOpen: true, hasSlots: true, date: "2026-11-25", ...r }), { state: "open" });
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: true, date: "2026-11-25", ...r }), { state: "full" });
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: false, date: "2026-11-25", ...r }), { state: "closed", label: "休館日など" });
});

test("奈良スーパーアプリ: 直前で枠が消えた日は「まだ公開されていない」にしない。月末より先は、まだ公開されていない", () => {
  const r = { firstSlot: "2026-11-24", lastSlot: "2026-11-30" };
  // 11/17 の実測: 明日香村などは、7日先(11/24)からしか枠が出ていない。11/17〜23 は、直前のため消えた日
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: false, date: "2026-11-17", ...r }), { state: "closed", label: NSA_NEAR_LABEL });
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: false, date: "2026-11-23", ...r }), { state: "closed", label: NSA_NEAR_LABEL });
  // 枠は月末までしか出ない。12月の日は、まだ公開されていない
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: false, date: "2026-12-01", ...r }), { state: "unpub" });
  // 枠が1つもない建物
  assert.deepEqual(nsaDayState({ hasOpen: false, hasSlots: false, date: "2026-11-20" }), { state: "unpub" });
});

test("複数の建物の状態は、空きに近いほうを優先する", () => {
  assert.equal(mergeStates("full", "unpub"), "full");
  assert.equal(mergeStates("unpub", "open"), "open");
  assert.equal(mergeStates("closed", "full"), "full");
});

test("長い制限の記号(学校体育施設の団体限定など)は「利用者を限定した枠」と表示する", () => {
  const r = kashikanFacilityState([court("市内の（学校体育施設）新たな地域クラブ、（学校体育施設）青少年団体のみ")], ["●"]);
  assert.deepEqual(r, { state: "closed", label: "利用者を限定した枠" });
});
