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
  isNsaTennisCourt,
  listNaraSuperAppDates,
  parseNaraSuperApp,
  pickNaraSuperAppTargets,
  type NaraSuperAppResponse,
} from "./narasuperapp";
import { fetchDay, isOpen, isTennisCourt, type KashikanSite } from "./kashikan";
import { facilitiesWithMarks, findContact, type Contact } from "./phone";

interface KashikanConfig extends KashikanSite {
  type: "kashikan";
  /** ◯でも×でもない、「ネットでは空きが分からない」ことを示す記号(例: 生駒市の直近の「●」) */
  phoneMarks?: string[];
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

/** 「ネットでは空きが分からない日」(電話で問い合わせてもらう) */
export interface PhoneNotice {
  date: string;
  site: string;
  facility: string;
  tel?: string;
  hours?: string;
  /** 施設の番号がないときの窓口名 */
  contactLabel?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function main() {
  const cfg: Config = JSON.parse(readFileSync("config/courts.json", "utf-8"));
  const slots: OpenSlot[] = [];
  const phone: PhoneNotice[] = [];
  const errors: string[] = [];
  const today = new Date();
  const first = jst(today);
  const last = jst(new Date(today.getTime() + (cfg.days - 1) * 86400e3));
  const discovered = new Set<string>(); // 自動で見つけた市町村(エリアのボタンに使う)

  /** 奈良スーパーアプリの1建物分を slots に積む */
  const addNsa = (area: string, raw: NaraSuperAppResponse) => {
    for (const date of listNaraSuperAppDates(raw).filter((d) => d >= first && d <= last)) {
      for (const c of parseNaraSuperApp(raw, date).filter(isNsaTennisCourt)) {
        for (const s of c.slots.filter(isOpen)) {
          slots.push({ date, site: area, facility: c.facility, court: c.court, start: s.start, end: s.end });
        }
      }
    }
  };
  /** この建物にテニスコートがあるか(体育館・会議室だけの建物を除く) */
  const hasTennisCourt = (raw: NaraSuperAppResponse) =>
    raw.returnValue.equResultList.some((e) =>
      isNsaTennisCourt({
        facility: raw.returnValue.buildingRecord.FRE_FacilitiesId__r?.Name ?? raw.returnValue.buildingRecord.Name,
        court: e.Name,
        slots: [],
      }),
    );

  for (const site of cfg.sites) {
    if (site.type === "nsa") {
      // 施設(建物)ごとに1回のリクエストで全日付分が返る
      for (const t of site.targets) {
        try {
          addNsa(site.name, await fetchNaraSuperAppRaw(t.buildingId, t.facilityId));
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
        const targets = pickNaraSuperAppTargets(await fetchNaraSuperAppTop(), site.purpose ?? "テニス");
        await sleep(1000);
        for (const t of targets) {
          try {
            const raw = await fetchNaraSuperAppRaw(t.buildingId, t.facilityId);
            if (hasTennisCourt(raw)) {
              discovered.add(t.municipality);
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
          for (const s of c.slots.filter(isOpen)) {
            slots.push({ date, site: site.name, facility: c.facility, court: c.court, start: s.start, end: s.end });
          }
        }
        // 「●」などで空きが出ていない日は、空きなしとは区別して電話案内の対象にする
        for (const facility of facilitiesWithMarks(courts, site.phoneMarks ?? [])) {
          const c = findContact(site.contacts ?? [], facility);
          phone.push({
            date,
            site: site.name,
            facility,
            tel: c?.tel ?? site.fallbackContact?.tel,
            hours: c?.hours,
            contactLabel: c ? undefined : site.fallbackContact?.label,
          });
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
  writeFileSync(
    "public/data.json",
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      sites,
      // 画面に必要な項目だけを出す(設定のメモなどは含めない)
      links: cfg.sites
        .filter((s): s is LinkSite => s.type === "link")
        .map((s) => ({ name: s.name, entryUrl: s.entryUrl, facilities: s.facilities })),
      slots,
      phone,
      errors,
    }),
  );
  console.log(`空き ${slots.length} 件 / 電話案内 ${phone.length} 件 / エリア ${sites.length} / エラー ${errors.length} 件 -> public/data.json`);
  if (errors.length) console.log(`失敗: ${errors.length} 件(詳細は上のログ)`);
}

main();
