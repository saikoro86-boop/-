/**
 * 京都府・市町村共同施設予約システム(施設別空き状況照会)の画面から空きを読み取る。
 *
 * 自動アクセスはしない。ユーザーが自分のブラウザで開いた画面の HTML
 * (document.documentElement.outerHTML)を渡して使う前提の純粋関数で、
 * ブックマークレットと Node のテストの両方から呼ぶ。
 *
 * 画面の構造(2026-11 時点):
 *   <h3>木津川市<br>兜谷公園</h3>
 *     <div class="box_title"><h4><a>テニスコートＡ<img ...></a></h4> ...
 *     <table class="box_calendar">
 *       <tr class="date"><th/><th><p class="day">11<span>月</span>6<span>日</span></p>...</th>...
 *       <tr><th class="th_sticky">09:00 - 10:00</th><td><img alt="空いています"></td>...
 */
import type { OpenSlot } from "./types";

const stripTags = (s: string) =>
  s.replace(/<img[^>]*>/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

// コート名の全角英数(テニスコートＡ)を半角に揃える。奈良市・生駒市の表記と合わせるため
const norm = (s: string) => s.normalize("NFKC").trim();

const pad = (n: number) => String(n).padStart(2, "0");

export function parseKizugawaHtml(html: string): OpenSlot[] {
  const startYear = Number(html.match(/name="optYear"[^>]*value="(\d{4})"/)?.[1] ?? new Date().getFullYear());
  const out: OpenSlot[] = [];

  for (const section of html.split("<h3>").slice(1)) {
    const headEnd = section.indexOf("</h3>");
    if (headEnd < 0) continue;
    const [site, facility] = section
      .slice(0, headEnd)
      .split(/<br\s*\/?>/i)
      .map((x) => norm(stripTags(x)));
    if (!site || !facility) continue;

    for (const block of section.slice(headEnd).split('<div class="box_title">').slice(1)) {
      const court = norm(stripTags(block.match(/<h4>([\s\S]*?)<\/h4>/)?.[1] ?? ""));
      const table = block.match(/<table class="box_calendar">([\s\S]*?)<\/table>/)?.[1];
      if (!court || !table) continue;

      // 日付ヘッダ。月が戻ったら年をまたいだとみなす
      let year = startYear;
      let prevMonth = 0;
      const dates: string[] = [];
      for (const m of table.matchAll(/<p class="day">(\d+)<span>月<\/span>(\d+)<span>日<\/span><\/p>/g)) {
        const month = Number(m[1]);
        if (month < prevMonth) year++;
        prevMonth = month;
        dates.push(`${year}-${pad(month)}-${pad(Number(m[2]))}`);
      }
      if (!dates.length) continue;

      for (const row of table.matchAll(/<tr>\s*<th class="th_sticky">(\d{2}):(\d{2}) - (\d{2}):(\d{2})<\/th>([\s\S]*?)<\/tr>/g)) {
        const start = Number(row[1]) + Number(row[2]) / 60;
        const end = Number(row[3]) + Number(row[4]) / 60;
        const cells = [...row[5].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
        if (cells.length !== dates.length) continue; // 想定外の行は読まない
        cells.forEach((c, i) => {
          // 空きは alt="空いています"(予約済みは「予約済みです」)。それ以外は空きとして扱わない
          if (/alt="空いています"/.test(c[1])) out.push({ date: dates[i], site, facility, court, start, end });
        });
      }
    }
  }
  return out;
}
