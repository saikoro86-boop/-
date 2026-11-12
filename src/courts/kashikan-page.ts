/**
 * 「いつでも貸館」方式(奈良市・生駒市)の、利用者が自分のブラウザで開いた画面から、空きを読み取る。
 *
 * 自動アクセスはしない(先方に断られているため)。「目的で検索」の結果の画面(1日表示)の HTML
 * (document.documentElement.outerHTML)を渡して使う純粋関数で、ブックマークレットと Node のテストの両方から呼ぶ。
 * 読めるのは、実物で確かめてある「1日表示」だけ。1週間・1か月表示は、形を確かめていないので、読まない(null を返す)。
 */
import type { OpenSlot } from "./types";
import { isOpen, isTennisCourt, parseAvailability } from "./kashikan";

/** 予約サイトの住所から、エリア名を決める(それ以外のサイトは null) */
export function kashikanSiteOf(href: string): string | null {
  if (/p-kashikan\.jp\/nara-city\//.test(href)) return "奈良市";
  if (/p-kashikan\.jp\/ikoma-city\//.test(href)) return "生駒市";
  return null;
}

/** 画面が表示している日(検索フォームの UseDate)。"20261114" → "2026-11-14" */
export function kashikanPageDate(html: string): string | null {
  const m = html.match(/name="UseDate"[^>]*value="(\d{4})(\d{2})(\d{2})"/) ?? html.match(/value="(\d{4})(\d{2})(\d{2})"[^>]*name="UseDate"/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 1日表示かどうか(表示の切り替えで「1日」が選ばれている)。切り替えが見つからない画面は、1日表示として扱う */
const isDayView = (html: string) => !/id="span_(week|month)"[^>]*\bchecked\b|\bchecked\b[^>]*id="span_(week|month)"/.test(html);

export interface KashikanPage {
  site: string;
  date: string;
  /** 空いている枠。「●」(空きだが、ネット予約の受付外)は offline つき */
  slots: OpenSlot[];
  /** 画面にあったコートの数(0 なら、検索結果の画面ではない) */
  courts: number;
}

/**
 * 検索結果の画面(1日表示)を読む。読めない画面(日付がない・1日表示でない・コートが1つもない)は null。
 * 空きが0件でも、コートがあれば「その日は空きなし」として返す(前に取り込んだ同じ日の分を消すため)
 */
export function parseKashikanPage(html: string, site: string, offlineMarks: string[] = ["●"]): KashikanPage | null {
  const date = kashikanPageDate(html);
  if (!date || !isDayView(html)) return null;
  const courts = parseAvailability(html).filter(isTennisCourt);
  if (!courts.length) return null;
  const seen = new Set<string>();
  const slots: OpenSlot[] = [];
  for (const c of courts) {
    for (const s of c.slots) {
      const online = isOpen(s);
      const offline = !online && offlineMarks.includes(s.mark.trim());
      if (!online && !offline) continue;
      // 施設名・コート名は、自動取得のときと同じ文字のまま使う(お気に入り・公式ページ・料金の鍵と合わせるため)
      const k = `${c.facility}|${c.court}|${s.start}|${s.end}`;
      if (seen.has(k)) continue;
      seen.add(k);
      slots.push({ date, site, facility: c.facility, court: c.court, start: s.start, end: s.end, ...(offline ? { offline: true as const } : {}) });
    }
  }
  return { site, date, slots, courts: courts.length };
}
