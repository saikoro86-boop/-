/**
 * 施設ごと・日ごとの「空きがない理由」を区別する。
 * 「空きなし」と「ネットでは分からない」「休館」「まだ公開されていない」は、利用者にとって意味が違う。
 */
import type { CourtAvailability } from "./kashikan";

/** open は空き枠があるので、一覧に出さない */
export type FacilityState = "open" | "full" | "closed" | "unpub";

const OPEN = /^[〇○◯]$/;

/**
 * 「いつでも貸館」方式の1施設・1日分の記号から、状態を決める。
 *   ○が1つでもある、または openMarks(●=ネット予約は受付外の空き)がある → open
 *   ×がある → full
 *   休館・保守・主催事業・「-」(受付期間外)などだけ → closed(label にその記号)
 *   何も表示がない(営業時間外の空欄だけ) → undefined
 */
export function kashikanFacilityState(
  courts: CourtAvailability[],
  offlineMarks: string[],
): { state: FacilityState; label?: string } | undefined {
  const marks = courts.flatMap((c) => c.slots.map((s) => s.mark.trim())).filter((m) => m !== "");
  if (!marks.length) return undefined;
  if (marks.some((m) => OPEN.test(m))) return { state: "open" };
  if (marks.some((m) => offlineMarks.includes(m))) return { state: "open" };
  if (marks.includes("×")) return { state: "full" };
  const other = marks[0];
  return { state: "closed", label: other === "-" ? "受付期間外" : other };
}

/**
 * 奈良スーパーアプリ(1つの建物)の、ある日の状態。
 *   hasOpen: その日に空き枠がある / hasSlots: その日に枠がある(すべて予約済みなら full)
 *   inRange: アプリに出ている枠の最初の日〜最後の日の間か
 *   枠がない日が範囲内なら休館日など(closed)、範囲外ならまだ公開されていない(unpub)
 */
export function nsaDayState(o: { hasOpen: boolean; hasSlots: boolean; inRange: boolean }): FacilityState {
  if (o.hasOpen) return "open";
  if (o.hasSlots) return "full";
  return o.inRange ? "closed" : "unpub";
}

/** 同じ施設の複数の建物の状態をまとめる(優先: open > full > closed > unpub) */
const ORDER: FacilityState[] = ["open", "full", "closed", "unpub"];
export const mergeStates = (a: FacilityState, b: FacilityState): FacilityState =>
  ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
