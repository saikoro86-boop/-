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
  // 「市内の(学校体育施設)…団体の方のみ」のように長い記号は、利用者を限定した枠(一般向けの空きではない)
  const label = other === "-" ? "受付期間外" : other.length > 10 || other.endsWith("のみ") ? "利用者を限定した枠" : other;
  return { state: "closed", label };
}

/** 直前の日で、アプリから枠が消えているときのラベル */
export const NSA_NEAR_LABEL = "直前のため、アプリに枠なし";

/**
 * 奈良スーパーアプリ(1つの建物)の、ある日の状態。
 *   hasOpen: その日に空き枠がある / hasSlots: その日に枠がある(すべて予約済みなら full)
 *   date / firstSlot / lastSlot: 調べる日と、アプリに枠が出ている最初の日・最後の日
 *   - 最初の日〜最後の日の間で枠がない → 休館日など(closed)
 *   - 最初の日より前 → 直前のため、アプリから枠が消えた日(closed。NSA_NEAR_LABEL)。
 *     2026-11 の実測: 枠は、日が近づくと市町村ごとに決まった日数で消える(三宅町・天理市・明日香村は7日前、
 *     宇陀市・香芝市は10日前 など)。11/7 には空きが見えていた 11/17〜23 の枠が、11/17 には枠ごと無くなっていた。
 *     「まだ公開されていない」のではないので、unpub にはしない
 *   - 最後の日より後(または枠が1つもない) → まだ公開されていない(unpub)。枠は月末までしか出ない(翌月分は未公開)
 */
export function nsaDayState(o: { hasOpen: boolean; hasSlots: boolean; date: string; firstSlot?: string; lastSlot?: string }): { state: FacilityState; label?: string } {
  if (o.hasOpen) return { state: "open" };
  if (o.hasSlots) return { state: "full" };
  if (!o.firstSlot || !o.lastSlot || o.date > o.lastSlot) return { state: "unpub" };
  if (o.date < o.firstSlot) return { state: "closed", label: NSA_NEAR_LABEL };
  return { state: "closed", label: "休館日など" };
}

/** 同じ施設の複数の建物の状態をまとめる(優先: open > full > closed > unpub) */
const ORDER: FacilityState[] = ["open", "full", "closed", "unpub"];
export const mergeStates = (a: FacilityState, b: FacilityState): FacilityState =>
  ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
