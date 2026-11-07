/**
 * 設定した全サイトの今後 N 日分の空きを取得し、public/data.json に書き出す。
 *   npm run courts:build
 * 1サイトの失敗で全体を止めず、失敗したサイトは errors に記録する。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { OpenSlot } from "./types";
import {
  fetchNaraSuperAppRaw,
  fetchNaraSuperAppTop,
  nsaCourtFilter,
  nsaReservationUrl,
  listNaraSuperAppDates,
  parseNaraSuperApp,
  pickNaraSuperAppTargets,
  type NaraSuperAppResponse,
} from "./narasuperapp";
import { fetchDay, isOpen, isTennisCourt, type KashikanSite } from "./kashikan";
import { compactSlots } from "./compact";
import { fetchWeather } from "./weather";
import { findContact, type Contact } from "./phone";
import { kashikanFacilityState, mergeStates, nsaDayState, type FacilityState } from "./status";

interface KashikanConfig extends KashikanSite {
  type: "kashikan";
  /** 「空きだが、ネット予約は受付外(電話・窓口で予約)」を示す記号。予約サイトの凡例で「●」 */
  offlineMarks?: string[];
  /** 施設ごとの問い合わせ先 */
  contacts?: Contact[];
  /** contacts に合う施設がないときの窓口 */
  fallbackContact?: { label: string; tel: string };
}
interface LinkSite {
  id: string;
  name: string;
  type: "link";
  entryUrl: string;
  note?: string;
  facilities: { name: string; hint?: string }[];
}
interface NsaSite {
  id: string;
  name: string;
  type: "nsa";
  /** 1つの地域に複数の施設・建物をまとめられる */
  targets: { facilityId: string; buildingId: string; note?: string }[];
}
/** 奈良スーパーアプリの施設一覧から、利用目的に「テニス」を含む建物を全部拾う。エリア名は市町村名 */
interface NsaAutoSite {
  id: string;
  name: string;
  type: "nsa-auto";
  purpose?: string;
}
type Site = KashikanConfig | LinkSite | NsaSite | NsaAutoSite;

interface Config {
  sites: Site[];
  purpose: { type: string; codes: string[] };
  days: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 一時的な通信エラーで施設が丸ごと抜けないよう、最大3回(2秒・4秒あけて)やり直す */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      console.error(`${label}: ${(e as Error).message}(${i}回目。やり直します)`);
      await sleep(2000 * i);
    }
  }
}
const jst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function main() {
  const cfg: Config = JSON.parse(readFileSync("config/courts.json", "utf-8"));
  const slots: OpenSlot[] = [];
  /** 「エリア|施設名」→ ネット予約の受付外の枠があるときの問い合わせ先 */
  const contacts: Record<string, { tel?: string; hours?: string; via?: string; unconfirmed?: boolean }> = {};
  const errors: string[] = [];
  const today = new Date();
  const first = jst(today);
  const last = jst(new Date(today.getTime() + (cfg.days - 1) * 86400e3));
  const discovered = new Set<string>(); // 自動で見つけた市町村(エリアのボタンに使う)
  /** 空きがない施設・日の理由(空き枠がある日は入れない)。同じ施設の複数の建物は、空きに近い状態にまとめる */
  const statusMap = new Map<string, { d: string; s: string; f: string; t: FacilityState; l?: string }>();
  const setStatus = (site: string, facility: string, d: string, t: FacilityState, l?: string) => {
    if (t === "open") return;
    const k = `${site}|${facility}|${d}`;
    const prev = statusMap.get(k);
    if (!prev) statusMap.set(k, { d, s: site, f: facility, t, ...(l ? { l } : {}) });
    else if (mergeStates(prev.t, t) === t && prev.t !== t) statusMap.set(k, { d, s: site, f: facility, t, ...(l ? { l } : {}) });
  };
  const rangeDates = Array.from({ length: cfg.days }, (_, i) => jst(new Date(today.getTime() + i * 86400e3)));
  /** 「エリア|施設名」→ 補足(体育館・競技場など、設備名に「テニス」を含まない施設) */
  const gymFacilities = new Set<string>(); // 設備名に「テニス」を含まない建物がある施設
  const namedFacilities = new Set<string>(); // 設備名に「テニス」を含む建物がある施設
  /** 「エリア|施設名|コート名」→ 公式サイトの検索で使う目的コード(奈良市・生駒市) */
  const courtCodes: Record<string, string> = {};
  /** エリア → 公式サイトの検索フォームの送り先(奈良市・生駒市。日付つきで開くために使う) */
  const postLinks: Record<string, { url: string; type: string }> = {};
  /** 奈良スーパーアプリの施設の、案内ページ(公式。料金などが載っていることが多い) */
  const nsaInfoLinks: { site: string; match: string; url: string }[] = [];
  /** 「エリア|施設名」→ その施設の予約サイトのURL(画面で、コート名・時間をタップしたときの行き先) */
  const facilityUrls: Record<string, string> = {};

  /** 奈良スーパーアプリの1建物分を slots に積む */
  const addNsa = (area: string, raw: NaraSuperAppResponse) => {
    const { buildingRecord: b } = raw.returnValue;
    const url = nsaReservationUrl(b.FRE_FacilitiesId__c, b.Id);
    const facility = (b.FRE_FacilitiesId__r?.Name ?? b.Name).normalize("NFKC").trim();
    const { pred, gym } = nsaCourtFilter(raw);
    (gym ? gymFacilities : namedFacilities).add(`${area}|${facility}`);
    // アプリに枠が出ている最初の日〜最後の日(テニスコートの枠だけで数える)
    const tennisDates = listNaraSuperAppDates(raw).filter((d) => parseNaraSuperApp(raw, d).some(pred));
    const [firstSlot, lastSlot] = [tennisDates[0], tennisDates[tennisDates.length - 1]];
    for (const date of rangeDates) {
      const cs = parseNaraSuperApp(raw, date).filter(pred);
      const hasSlots = cs.some((c) => c.slots.length > 0);
      const hasOpen = cs.some((c) => c.slots.some(isOpen));
      const t = nsaDayState({ hasOpen, hasSlots, inRange: !!firstSlot && date >= firstSlot && date <= lastSlot });
      setStatus(area, facility, date, t, t === "closed" ? "休館日など" : undefined);
    }
    for (const date of listNaraSuperAppDates(raw).filter((d) => d >= first && d <= last)) {
      for (const c of parseNaraSuperApp(raw, date).filter(pred)) {
        for (const s of c.slots.filter(isOpen)) {
          slots.push({ date, site: area, facility: c.facility, court: c.court, start: s.start, end: s.end });
          facilityUrls[`${area}|${c.facility}`] = url;
        }
      }
    }
  };
  /** この建物に、表示する設備が1つでもあるか(会議室だけの建物を除く) */
  const hasTennisCourt = (raw: NaraSuperAppResponse) => {
    const { pred } = nsaCourtFilter(raw);
    const b = raw.returnValue.buildingRecord;
    return raw.returnValue.equResultList.some((e) => pred({ facility: b.FRE_FacilitiesId__r?.Name ?? b.Name, court: e.Name, slots: [] }));
  };

  for (const site of cfg.sites) {
    if (site.type === "nsa") {
      // 施設(建物)ごとに1回のリクエストで全日付分が返る
      for (const t of site.targets) {
        try {
          addNsa(site.name, await withRetry(t.note ?? t.buildingId, () => fetchNaraSuperAppRaw(t.buildingId, t.facilityId)));
        } catch (e) {
          // 公開する data.json には、取得元がわかる情報(URL・ID・エラー詳細)を入れない。詳細はログにだけ出す
          console.error(`${site.name} ${t.note ?? t.buildingId}: ${(e as Error).message}`);
          errors.push(`${site.name}: 取得に失敗`);
        }
        await sleep(1500); // 先方に負荷をかけない
      }
      continue;
    }
    if (site.type === "nsa-auto") {
      try {
        const targets = pickNaraSuperAppTargets(await withRetry("施設一覧", () => fetchNaraSuperAppTop()), site.purpose ?? "テニス");
        await sleep(1000);
        for (const t of targets) {
          try {
            const raw = await withRetry(t.facilityName, () => fetchNaraSuperAppRaw(t.buildingId, t.facilityId));
            if (hasTennisCourt(raw)) {
              discovered.add(t.municipality);
              const info = t.facilityUrl && /^https?:\/\//.test(t.facilityUrl) ? t.facilityUrl : null;
              const match = t.facilityName.normalize("NFKC").trim();
              if (info && !nsaInfoLinks.some((x) => x.site === t.municipality && x.match === match)) nsaInfoLinks.push({ site: t.municipality, match, url: info });
              addNsa(t.municipality, raw);
            }
          } catch (e) {
            console.error(`${t.municipality} ${t.facilityName}: ${(e as Error).message}`);
            errors.push(`${t.municipality}: 取得に失敗`);
          }
          await sleep(1500);
        }
      } catch (e) {
        console.error(`${site.name} 施設一覧: ${(e as Error).message}`);
        errors.push(`${site.name}: 施設一覧の取得に失敗`);
      }
      continue;
    }
    if (site.type !== "kashikan") continue; // link 型は自動取得しない(公式サイトへ案内するだけ)
    for (let i = 0; i < cfg.days; i++) {
      const date = jst(new Date(today.getTime() + i * 86400e3));
      try {
        const courts = (await fetchDay(site, date, cfg.purpose)).filter(isTennisCourt);
        for (const c of courts) {
          for (const s of c.slots) {
            const online = isOpen(s);
            const offline = !online && (site.offlineMarks ?? []).includes(s.mark.trim());
            if (!online && !offline) continue;
            slots.push({ date, site: site.name, facility: c.facility, court: c.court, start: s.start, end: s.end, ...(offline ? { offline: true as const } : {}) });
            facilityUrls[`${site.name}|${c.facility}`] = site.url; // 施設ごとの直接URLは無いので、予約サイトのトップへ
            if (c.code) courtCodes[`${site.name}|${c.facility}|${c.court}`] = c.code;
            postLinks[site.name] = { url: site.url, type: cfg.purpose.type };
            if (offline) {
              const ct = findContact(site.contacts ?? [], c.facility);
              contacts[`${site.name}|${c.facility}`] = ct
                ? { tel: ct.tel, hours: ct.hours, via: ct.via, unconfirmed: ct.unconfirmed }
                : site.fallbackContact
                  ? { tel: site.fallbackContact.tel, via: site.fallbackContact.label, unconfirmed: true }
                  : {};
            }
          }
        }
        // 施設ごとの状態(空きなし/休館など)。空き枠がある日は、一覧に出さない
        const byFac = new Map<string, typeof courts>();
        for (const c of courts) byFac.set(c.facility, [...(byFac.get(c.facility) ?? []), c]);
        for (const [facility, cs] of byFac) {
          const st = kashikanFacilityState(cs, site.offlineMarks ?? []);
          if (st && (st.state === "full" || st.state === "closed")) setStatus(site.name, facility, date, st.state, st.label);
        }
      } catch (e) {
        console.error(`${site.name} ${date}: ${(e as Error).message}`);
        errors.push(`${site.name} ${date}: 取得に失敗`);
      }
      await sleep(300); // 先方サーバに負荷をかけない
    }
  }

  // エリアのボタン: 設定した順 + 自動で見つけた市町村(五十音順)。同じ名前は1つにまとめる
  const configured = cfg.sites.filter((s) => s.type !== "nsa-auto").map((s) => s.name);
  const sites = [...new Set([...configured, ...[...discovered].sort((a, b) => a.localeCompare(b, "ja"))])];

  mkdirSync("public", { recursive: true });
  const feeConfig = JSON.parse(readFileSync("config/fees.json", "utf-8")) as {
    fees: {
      site: string; match: string; summary: string; lines: string[]; source: { label: string; url: string }; checkedAt: string;
      crossCheck?: { status: "match" | "conflict"; checkedAt: string; sources: { label: string; url: string; note?: string }[] };
    }[];
    links: { site: string; match: string; url: string }[];
  };
  // 「ルート」ボタンの行き先(名前だけでは場所が決まらない施設の所在地)。出典は config 側にだけ残す
  // 「近い順」用の位置(緯度・経度)。画面には数値だけを渡す
  const coordConfig = JSON.parse(readFileSync("config/coords.json", "utf-8")) as {
    coords: Record<string, { lat: number; lng: number; src: string; ref: string }>;
  };
  // コートの種類・屋内・ナイター(絞り込み用)
  const courtInfo = JSON.parse(readFileSync("config/courtinfo.json", "utf-8")) as {
    info: Record<string, { surfaces: string[]; indoor: boolean; nighter: boolean | null }>;
  };
  // 天気(気象庁)。取れなくても空き状況の更新は止めない
  let weather: Awaited<ReturnType<typeof fetchWeather>> | null = null;
  try {
    weather = await fetchWeather();
  } catch (e) {
    console.log("天気(気象庁)の取得に失敗:", (e as Error).message);
  }
  const placeConfig = JSON.parse(readFileSync("config/places.json", "utf-8")) as {
    places: { site: string; match: string; dest: string; source: string }[];
  };
  const common = {
    updatedAt: new Date().toISOString(),
    sites,
    // 画面に必要な項目だけを出す(設定のメモなどは含めない)
    links: cfg.sites
      .filter((s): s is LinkSite => s.type === "link")
      .map((s) => ({ name: s.name, entryUrl: s.entryUrl, facilities: s.facilities })),
    facilityUrls,
    courtCodes,
    postLinks,
    // 体育館・競技場だけの施設にだけ付ける(テニスコートと同居する施設には付けない)
    facilityNotes: Object.fromEntries(
      [...gymFacilities].filter((k) => !namedFacilities.has(k)).map((k) => [k, "体育館・競技場など(利用目的に「テニス」を含む施設です。設備ごとの利用目的は、予約画面で確認してください)"]),
    ),
    contacts,
    // 料金: 公式の原本で確認できたものだけ(config/fees.json)。確認できない施設は、公式ページへのリンク
    fees: feeConfig.fees,
    feeLinks: [...feeConfig.links, ...nsaInfoLinks],
    coords: Object.fromEntries(Object.entries(coordConfig.coords).map(([k, v]) => [k, [v.lat, v.lng]])),
    courtInfo: Object.fromEntries(Object.entries(courtInfo.info).map(([k, v]) => [k, { s: v.surfaces, i: v.indoor ? 1 : 0, n: v.nighter == null ? null : v.nighter ? 1 : 0 }])),
    weather,
    places: placeConfig.places.map(({ site, match, dest }) => ({ site, match, dest })),
    // 空きがない施設・日の理由(d=日付, s=エリア, f=施設, t=full|closed|unpub, l=ラベル)
    status: [...statusMap.values()],
    errors,
  };
  // data2.json: スマホ向けの小さな形式(いまの画面が読む)
  const compact = compactSlots(slots);
  const small = JSON.stringify({ v: 2, ...common, courts: compact.courts, byDate: compact.byDate });
  writeFileSync("public/data2.json", small);
  // data.json: 従来の形式。キャッシュに残った古い画面が読むために、しばらく残す(新しい画面は読まない)
  const legacy = JSON.stringify({ ...common, slots });
  writeFileSync("public/data.json", legacy);
  const kb = (t: string) => Math.round(Buffer.byteLength(t) / 1024);
  console.log(
    `空き ${slots.length} 件(うちネット予約外 ${slots.filter((x) => x.offline).length}) → まとめて ${Object.values(compact.byDate).reduce((n, l) => n + l.length, 0)} 件 / エリア ${sites.length} / エラー ${errors.length} 件`,
  );
  console.log(`public/data2.json ${kb(small)}KB(画面が読む) / public/data.json ${kb(legacy)}KB(従来形式)`);
  if (errors.length) console.log(`失敗: ${errors.length} 件(詳細は上のログ)`);
}

main();
