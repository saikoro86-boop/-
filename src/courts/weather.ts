/**
 * 気象庁の天気予報(公開JSON)から、日ごとの「降水確率」と「天気のマーク」を取り出す。
 *   https://www.jma.go.jp/bosai/forecast/data/forecast/290000.json (奈良県)
 *   https://www.jma.go.jp/bosai/forecast/data/forecast/260000.json (京都府)
 * - 今日・明日: 短期予報の6時間ごとの降水確率のうち、6〜18時(テニスをする時間帯)の大きいほう
 * - それ以降: 週間予報の、その日の降水確率
 * 出典の表示: 「天気: 気象庁」
 */

export interface DayWeather { pop: number | null; icon: string }
export type AreaWeather = Record<string, DayWeather>; // "2026-11-08" -> { pop: 30, icon: "☁" }

interface JmaArea { area: { name: string; code: string }; pops?: string[]; weatherCodes?: string[] }
interface JmaTs { timeDefines: string[]; areas: JmaArea[] }
type JmaForecast = { publishingOffice: string; reportDatetime: string; timeSeries: JmaTs[] }[];

export const JMA_AREAS = {
  nara: { office: "290000", short: "北部", week: "奈良県" },
  kyoto: { office: "260000", short: "南部", week: "南部" },
} as const;

/** 天気コードの百の位で、ざっくりしたマークにする(1=晴れ 2=くもり 3=雨 4=雪) */
export const iconOf = (code?: string) => ({ "1": "☀", "2": "☁", "3": "☔", "4": "❄" } as Record<string, string>)[(code ?? "")[0]] ?? "";

const day = (iso: string) => iso.slice(0, 10);
const hour = (iso: string) => Number(iso.slice(11, 13));
const num = (s?: string) => (s == null || s === "" ? null : Number(s));

export function parseJma(json: JmaForecast, shortName: string, weekName: string): AreaWeather {
  const out: AreaWeather = {};
  const [short, week] = json;
  // 週間予報(先に入れて、短期予報で上書きする)
  const wts = week?.timeSeries?.[0];
  const wa = wts?.areas.find((a) => a.area.name === weekName);
  if (wts && wa) {
    wts.timeDefines.forEach((t, i) => {
      out[day(t)] = { pop: num(wa.pops?.[i]), icon: iconOf(wa.weatherCodes?.[i]) };
    });
  }
  // 短期予報: 天気(日ごと)
  const sw = short?.timeSeries?.[0];
  const swa = sw?.areas.find((a) => a.area.name === shortName);
  if (sw && swa) sw.timeDefines.forEach((t, i) => {
    const d = day(t); out[d] = { pop: out[d]?.pop ?? null, icon: iconOf(swa.weatherCodes?.[i]) || out[d]?.icon || "" };
  });
  // 短期予報: 降水確率(6時間ごと)。6〜18時の枠の最大
  const sp = short?.timeSeries?.[1];
  const spa = sp?.areas.find((a) => a.area.name === shortName);
  if (sp && spa) {
    const best: Record<string, number> = {};
    sp.timeDefines.forEach((t, i) => {
      const h = hour(t), p = num(spa.pops?.[i]);
      if (p == null || h < 6 || h >= 18) return;
      best[day(t)] = Math.max(best[day(t)] ?? 0, p);
    });
    for (const [d, p] of Object.entries(best)) out[d] = { pop: p, icon: out[d]?.icon ?? "" };
  }
  return out;
}

export async function fetchWeather(): Promise<Record<keyof typeof JMA_AREAS, AreaWeather>> {
  const res: Partial<Record<keyof typeof JMA_AREAS, AreaWeather>> = {};
  for (const [k, a] of Object.entries(JMA_AREAS) as [keyof typeof JMA_AREAS, (typeof JMA_AREAS)[keyof typeof JMA_AREAS]][]) {
    const r = await fetch(`https://www.jma.go.jp/bosai/forecast/data/forecast/${a.office}.json`, {
      headers: { "user-agent": "tennis-court-finder (personal use; low frequency)" },
    });
    if (!r.ok) throw new Error(`気象庁 ${a.office} -> HTTP ${r.status}`);
    res[k] = parseJma((await r.json()) as JmaForecast, a.short, a.week);
  }
  return res as Record<keyof typeof JMA_AREAS, AreaWeather>;
}
