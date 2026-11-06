/**
 * 設定した全サイトの今後 N 日分の空きを取得し、public/data.json に書き出す。
 *   npm run courts:build
 * 1サイトの失敗で全体を止めず、失敗したサイトは errors に記録する。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { OpenSlot } from "./types";
import { fetchNaraSuperAppRaw, listNaraSuperAppDates, parseNaraSuperApp } from "./narasuperapp";
import { fetchDay, isOpen, isTennisCourt, type KashikanSite } from "./kashikan";

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
type Site = (KashikanSite & { type: "kashikan" }) | LinkSite | NsaSite;

interface Config {
  sites: Site[];
  purpose: { type: string; codes: string[] };
  days: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function main() {
  const cfg: Config = JSON.parse(readFileSync("config/courts.json", "utf-8"));
  const slots: OpenSlot[] = [];
  const errors: string[] = [];
  const today = new Date();
  for (const site of cfg.sites) {
    if (site.type === "nsa") {
      // 施設(建物)ごとに1回のリクエストで全日付分が返る
      const first = jst(today);
      const last = jst(new Date(today.getTime() + (cfg.days - 1) * 86400e3));
      for (const t of site.targets) {
        try {
          const raw = await fetchNaraSuperAppRaw(t.buildingId, t.facilityId);
          for (const date of listNaraSuperAppDates(raw).filter((d) => d >= first && d <= last)) {
            for (const c of parseNaraSuperApp(raw, date).filter(isTennisCourt)) {
              for (const s of c.slots.filter(isOpen)) {
                slots.push({ date, site: site.name, facility: c.facility, court: c.court, start: s.start, end: s.end });
              }
            }
          }
        } catch (e) {
          // 公開する data.json には、取得元がわかる情報(URL・ID・エラー詳細)を入れない。詳細はログにだけ出す
          console.error(`${site.name} ${t.note ?? t.buildingId}: ${(e as Error).message}`);
          errors.push(`${site.name}: 取得に失敗`);
        }
        await sleep(1500); // 先方に負荷をかけない
      }
      continue;
    }
    if (site.type !== "kashikan") continue; // link 型は自動取得しない(公式サイトへ案内するだけ)
    for (let i = 0; i < cfg.days; i++) {
      const date = jst(new Date(today.getTime() + i * 86400e3));
      try {
        for (const c of (await fetchDay(site, date, cfg.purpose)).filter(isTennisCourt)) {
          for (const s of c.slots.filter(isOpen)) {
            slots.push({ date, site: site.name, facility: c.facility, court: c.court, start: s.start, end: s.end });
          }
        }
      } catch (e) {
        console.error(`${site.name} ${date}: ${(e as Error).message}`);
        errors.push(`${site.name} ${date}: 取得に失敗`);
      }
      await sleep(300); // 先方サーバに負荷をかけない
    }
  }
  mkdirSync("public", { recursive: true });
  writeFileSync(
    "public/data.json",
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      sites: cfg.sites.map((s) => s.name),
      // 画面に必要な項目だけを出す(設定のメモなどは含めない)
      links: cfg.sites
        .filter((s): s is LinkSite => s.type === "link")
        .map((s) => ({ name: s.name, entryUrl: s.entryUrl, facilities: s.facilities })),
      slots,
      errors,
    }),
  );
  console.log(`空き ${slots.length} 件 / エラー ${errors.length} 件 -> public/data.json`);
  if (errors.length) console.log(`失敗: ${errors.length} 件(詳細は上のログ)`);
}

main();
