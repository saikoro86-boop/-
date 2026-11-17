/**
 * 自宅PC(家庭用回線)から取り込んだ、奈良市・生駒市の空きを、ビルドに取り込むための処理。
 *
 * 背景: 奈良市・生駒市の予約サイトは 2026-11-10 から、海外・データセンターからの自動取得を 403 で断っている。
 * そこで、利用者が自宅の家庭用回線で取得し(local-fetch.ts)、中継役(Cloudflare Worker)経由で渡す。
 * ここは「自宅PC側で送るデータを作る」と「ビルド側で受け取って混ぜる」の、通信を伴わない部分(テストできる)。
 */
import type { Collected, ContactInfo, StatusRow } from "./collect/collected";
import { fetchChecked } from "./http";
import type { OpenSlot } from "./types";

/** 自宅PC → 中継役 → ビルド で受け渡す中身 */
export interface IngestPayload {
  /** このデータが対象とするエリア(断られず取得できたものだけ) */
  sites: string[];
  slots: OpenSlot[];
  status: StatusRow[];
  contacts: Record<string, ContactInfo>;
  courtCodes: Record<string, string>;
  facilityUrls: Record<string, string>;
}

/** 中継役が保存する形(payload + 受け取った時刻) */
export interface IngestData extends IngestPayload {
  updatedAt: string;
}

/**
 * 集めた結果(acc)から、送るデータを作る。
 * 断られたエリア(そのエリア全体の失敗がある)は、空きが取れていないので送らない(良いデータを上書きしないため)。
 */
export function buildIngestPayload(acc: Collected, sites: string[]): { payload: IngestPayload; blocked: string[] } {
  const blocked = sites.filter((s) => acc.failures.some((f) => f.s === s && !f.d));
  const ok = new Set(sites.filter((s) => !blocked.includes(s)));
  const pick = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => ok.has(k.split("|")[0])));
  return {
    payload: {
      sites: [...ok],
      slots: acc.slots.filter((s) => ok.has(s.site)),
      status: acc.status.filter((r) => ok.has(r.s)),
      contacts: pick(acc.contacts),
      courtCodes: pick(acc.courtCodes),
      facilityUrls: pick(acc.facilityUrls),
    },
    blocked,
  };
}

/** 中継役から、取り込んだデータを読む。無ければ(まだ送られていない等)null。通信失敗でも落とさない */
export async function fetchIngest(url: string | undefined): Promise<IngestData | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const r = await fetchChecked(url, { headers: { "cache-control": "no-cache" } });
    const j = (await r.json()) as IngestData | null;
    return j && Array.isArray(j.sites) && typeof j.updatedAt === "string" ? j : null;
  } catch (e) {
    console.log("取り込みデータを読めませんでした(無しで続けます):", (e as Error).message);
    return null;
  }
}

/**
 * 取り込んだデータを acc に混ぜる。新しいときだけ。
 * - 古い(maxAgeH 時間より前)/ 時刻がおかしい → 使わない(自宅PCが止まっている間は、画面に「取得できなかった」と出る)
 * - allowed に無いエリアは混ぜない(万一、保存データが汚れていても、関係ないエリアを書き換えない)
 * - 混ぜるエリアは、自動取得の「取得できなかった」の記録を消してから入れる
 */
export function mergeIngest(acc: Collected, data: IngestData, allowed: string[], now = Date.now(), maxAgeH = 6): string {
  const t = Date.parse(data.updatedAt);
  if (isNaN(t)) return "取り込みデータの時刻が不正なので使いません";
  const ageH = (now - t) / 3600e3;
  if (ageH < 0 || ageH > maxAgeH) return `取り込みデータが古い(${ageH.toFixed(1)}時間前)ので使いません`;
  const sites = data.sites.filter((s) => allowed.includes(s));
  if (!sites.length) return "取り込みデータに、対象のエリアがありません";
  const ok = new Set(sites);
  for (const s of sites) acc.dropSite(s);
  for (const s of data.slots) if (ok.has(s.site)) acc.slots.push(s);
  for (const r of data.status) if (ok.has(r.s)) acc.setStatusRow(r);
  for (const [k, v] of Object.entries(data.contacts)) if (ok.has(k.split("|")[0])) acc.contacts[k] = v;
  for (const [k, v] of Object.entries(data.courtCodes)) if (ok.has(k.split("|")[0])) acc.courtCodes[k] = v;
  for (const [k, v] of Object.entries(data.facilityUrls)) if (ok.has(k.split("|")[0])) acc.facilityUrls[k] = v;
  for (const s of sites) acc.ingestedAt[s] = data.updatedAt;
  return `取り込み: ${sites.join("・")} 空き${data.slots.filter((s) => ok.has(s.site)).length}件(${ageH.toFixed(1)}時間前)`;
}
