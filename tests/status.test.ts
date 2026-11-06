import { test } from "node:test";
import assert from "node:assert/strict";
import { kashikanFacilityState, mergeStates, nsaDayState } from "../src/courts/status";

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

test("奈良スーパーアプリ: 枠が全部予約済みなら full、範囲外は unpub、範囲内で枠なしは closed", () => {
  assert.equal(nsaDayState({ hasOpen: true, hasSlots: true, inRange: true }), "open");
  assert.equal(nsaDayState({ hasOpen: false, hasSlots: true, inRange: true }), "full");
  assert.equal(nsaDayState({ hasOpen: false, hasSlots: false, inRange: true }), "closed");
  assert.equal(nsaDayState({ hasOpen: false, hasSlots: false, inRange: false }), "unpub");
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
