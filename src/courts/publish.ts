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
  /** エリア → 予約サイトの検索の送り先(奈良市・生駒市)。code は、コートごとの目的コードが分からないときの既定 */
  postLinks: Record<string, { url: string; type: string; code: string }>;
  /** エリア → ☎の枠の問い合わせ先の対応表。取得できなかった回でも、自分で取り込んだ枠に電話番号を出すため */
  contactRules: Record<string, { list: { match: string; tel: string; hours?: string; via?: string; unconfirmed?: boolean }[]; fallback?: { label: string; tel: string } }>;
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
  // 奈良市・生駒市の送り先と問い合わせ先は、取得できたかどうかに関係なく、設定から出す
  // (先方に断られている間も、自分で取り込んだ枠から、予約サイトと電話番号へ案内できるように)
  const kashikan = cfg.sites.flatMap((s) => (s.type === "kashikan" ? [s] : []));
  const postLinks = Object.fromEntries(kashikan.map((s) => [s.name, { url: s.url, type: cfg.purpose.type, code: cfg.purpose.codes[0] }]));
  const contactRules = Object.fromEntries(
    kashikan.map((s) => [
      s.name,
      {
        list: (s.contacts ?? []).map(({ match, tel, hours, via, unconfirmed }) => ({ match, tel, hours, via, unconfirmed })),
        ...(s.fallbackContact ? { fallback: { label: s.fallbackContact.label, tel: s.fallbackContact.tel } } : {}),
      },
    ]),
  );
  return {
    updatedAt,
    sites,
    // 画面に必要な項目だけを出す(設定のメモなどは含めない)
    links: cfg.sites.flatMap((s) => (s.type === "link" ? [{ name: s.name, entryUrl: s.entryUrl, facilities: s.facilities }] : [])),
    facilityUrls: acc.facilityUrls,
    courtCodes: acc.courtCodes,
    postLinks,
    contactRules,
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
