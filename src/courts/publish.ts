/**
 * 取得した結果と設定から、公開するデータ(public/data2.json など)の形を組み立てる。
 * 画面(public/index.html の expandV2 など)は、ここで作る形を読む。形を変えるときは、画面とテストも同時に直す。
 */
import { fetchChecked } from "./http";
import type { CompactSlots } from "./compact";
import type { Failure } from "./types";
import type { Collected, StatusRow, ContactInfo } from "./collect/collected";
import type { Configs, FeesConfig } from "./config";
import type { fetchWeather } from "./weather";

type Weather = Awaited<ReturnType<typeof fetchWeather>>;

/** 公開データのうち、枠(slots / byDate)以外の部分 */
export interface PublishedCommon {
  updatedAt: string;
  /** エリアのボタン(設定した順 + 自動で見つけた市町村) */
  sites: string[];
  /** 自動取得しない地域(公式サイトへの案内だけ) */
  links: { name: string; entryUrl: string; facilities: { name: string; hint?: string }[] }[];
  facilityUrls: Record<string, string>;
  courtCodes: Record<string, string>;
  postLinks: Record<string, { url: string; type: string }>;
  facilityNotes: Record<string, string>;
  contacts: Record<string, ContactInfo>;
  fees: FeesConfig["fees"];
  feeLinks: { site: string; match: string; url: string }[];
  /** 「エリア|施設名」→ [緯度, 経度] */
  coords: Record<string, [number, number]>;
  /** 「エリア|施設名」→ s=種類, i=屋内(1), n=ナイター(1/0/不明null) */
  courtInfo: Record<string, { s: string[]; i: 0 | 1; n: 0 | 1 | null }>;
  weather: Weather | null;
  officialUrls: Record<string, string>;
  places: { site: string; match: string; dest: string }[];
  status: StatusRow[];
  errors: string[];
  failures: Failure[];
}

const GYM_NOTE = "体育館・競技場など(利用目的に「テニス」を含む施設です。設備ごとの利用目的は、予約画面で確認してください)";

export function buildCommon(configs: Configs, acc: Collected, weather: Weather | null, updatedAt: string): PublishedCommon {
  const cfg = configs.courts;
  // エリアのボタン: 設定した順 + 自動で見つけた市町村(五十音順)。同じ名前は1つにまとめる
  const configured = cfg.sites.filter((s) => s.type !== "nsa-auto").map((s) => s.name);
  const sites = [...new Set([...configured, ...[...acc.discovered].sort((a, b) => a.localeCompare(b, "ja"))])];
  return {
    updatedAt,
    sites,
    // 画面に必要な項目だけを出す(設定のメモなどは含めない)
    links: cfg.sites.flatMap((s) => (s.type === "link" ? [{ name: s.name, entryUrl: s.entryUrl, facilities: s.facilities }] : [])),
    facilityUrls: acc.facilityUrls,
    courtCodes: acc.courtCodes,
    postLinks: acc.postLinks,
    // 体育館・競技場だけの施設にだけ付ける(テニスコートと同居する施設には付けない)
    facilityNotes: Object.fromEntries([...acc.gymFacilities].filter((k) => !acc.namedFacilities.has(k)).map((k) => [k, GYM_NOTE])),
    contacts: acc.contacts,
    // 料金: 公式の原本で確認できたものだけ(config/fees.json)。確認できない施設は、公式ページへのリンク
    fees: configs.fees.fees,
    feeLinks: [...configs.fees.links, ...acc.nsaInfoLinks],
    coords: Object.fromEntries(Object.entries(configs.coords).map(([k, v]) => [k, [v.lat, v.lng] as [number, number]])),
    courtInfo: Object.fromEntries(
      Object.entries(configs.courtInfo).map(([k, v]) => [k, { s: v.surfaces, i: v.indoor ? 1 : 0, n: v.nighter == null ? null : v.nighter ? 1 : 0 }]),
    ),
    weather,
    officialUrls: configs.official,
    places: configs.places.map(({ site, match, dest }) => ({ site, match, dest })),
    // 空きがない施設・日の理由
    status: acc.status,
    errors: acc.errors,
    failures: acc.failures,
  };
}

/** 前回公開したデータ(🆕と、失敗の判断に使う)。取れなければ null */
export async function fetchPrevious(url: string | undefined): Promise<{ prev: CompactSlots; failures: Failure[] } | null> {
  if (!url) return null;
  try {
    const r = await fetchChecked(url, { headers: { "cache-control": "no-cache" } });
    const j = (await r.json()) as { v?: number; failures?: Failure[] } & CompactSlots;
    return j.v === 2 ? { prev: { courts: j.courts, byDate: j.byDate }, failures: j.failures ?? [] } : null;
  } catch (e) {
    console.log("前回のデータを取得できませんでした(🆕の印なしで続けます):", (e as Error).message);
    return null;
  }
}
