/**
 * 空き枠を、スマホに優しい小さな形式にする。
 *   - コート名(エリア・施設・コート)は一覧に1回だけ持ち、枠は番号で指す
 *   - 連続する枠(9-10, 10-11 …)は1つにまとめる(画面も、もともとまとめて表示している)
 * 展開すると、まとめ前と「同じ時間帯が空いている」ことは変わらない(compact.test.ts で確認)。
 */
import type { OpenSlot } from "./types";

/** [コートの番号, 開始, 終了, ネット予約の受付外(1)か通常(0)か, 前回の更新から新しく空いた(1)] */
export type CompactSlot = [number, number, number, 0 | 1] | [number, number, number, 0 | 1, 1];

export interface CompactSlots {
  /** [エリア, 施設, コート] */
  courts: [string, string, string][];
  /** 日付(YYYY-MM-DD) → その日の枠 */
  byDate: Record<string, CompactSlot[]>;
}

export function compactSlots(slots: OpenSlot[]): CompactSlots {
  const courts: [string, string, string][] = [];
  const index = new Map<string, number>();
  const groups = new Map<string, { date: string; ci: number; off: 0 | 1; spans: [number, number][] }>();

  for (const s of slots) {
    const ck = `${s.site}\u0000${s.facility}\u0000${s.court}`;
    let ci = index.get(ck);
    if (ci === undefined) {
      ci = courts.length;
      index.set(ck, ci);
      courts.push([s.site, s.facility, s.court]);
    }
    const off: 0 | 1 = s.offline ? 1 : 0;
    const gk = `${s.date}|${ci}|${off}`;
    let g = groups.get(gk);
    if (!g) groups.set(gk, (g = { date: s.date, ci, off, spans: [] }));
    g.spans.push([s.start, s.end]);
  }

  const byDate: Record<string, CompactSlot[]> = {};
  for (const g of groups.values()) {
    g.spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let [cs, ce] = g.spans[0];
    const push = () => (byDate[g.date] ??= []).push([g.ci, cs, ce, g.off]);
    for (const [s, e] of g.spans.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e); // 連続・重なりは、1つにまとめる
      else { push(); cs = s; ce = e; }
    }
    push();
  }
  for (const d of Object.keys(byDate)) byDate[d].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { courts, byDate };
}

export function expandSlots(c: CompactSlots): OpenSlot[] {
  const out: OpenSlot[] = [];
  for (const [date, list] of Object.entries(c.byDate)) {
    for (const [ci, start, end, off] of list) {
      const [site, facility, court] = c.courts[ci];
      out.push({ date, site, facility, court, start, end, ...(off ? { offline: true as const } : {}) });
    }
  }
  return out;
}

/**
 * 前回公開したデータと比べて、新しく空いた枠に印(5番目 = 1)を付ける。
 * - 同じ日・同じコートで、前回は空いていなかった時間を含む枠が「新しい」
 * - 前回のデータに無かった先の日付(予約期間が1日進んで出てきた日)は、全部が新しくなってしまうので、印を付けない
 * - 前回のデータがなければ(初回など)、何もしない
 */
export function markNew(cur: CompactSlots, prev: CompactSlots | null): CompactSlots {
  if (!prev || !Object.keys(prev.byDate).length) return cur;
  const prevMax = Object.keys(prev.byDate).sort().pop()!;
  const cover = new Map<string, [number, number][]>();
  for (const [date, list] of Object.entries(prev.byDate)) {
    for (const [ci, s, e] of list) {
      const c = prev.courts[ci]; if (!c) continue;
      const k = `${date}|${c[0]}|${c[1]}|${c[2]}`;
      (cover.get(k) ?? cover.set(k, []).get(k)!).push([s, e]);
    }
  }
  const covered = (spans: [number, number][] | undefined, s: number, e: number) => {
    if (!spans) return false;
    let t = s;
    for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) { if (a <= t && b > t) t = b; if (t >= e) return true; }
    return t >= e;
  };
  const byDate: Record<string, CompactSlot[]> = {};
  for (const [date, list] of Object.entries(cur.byDate)) {
    byDate[date] = list.map((x) => {
      const [ci, s, e, off] = x;
      if (date > prevMax) return [ci, s, e, off];
      const c = cur.courts[ci];
      return covered(cover.get(`${date}|${c[0]}|${c[1]}|${c[2]}`), s, e) ? [ci, s, e, off] : [ci, s, e, off, 1];
    });
  }
  return { courts: cur.courts, byDate };
}
