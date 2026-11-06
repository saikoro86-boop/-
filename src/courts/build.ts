/**
 * 設定した全サイトの今後 N 日分の空きを取得し、public/data.json に書き出す。
 *   npm run courts:build
 * 1サイトの失敗で全体を止めず、失敗したサイトは errors に記録する。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { OpenSlot } from "./types";
import { fetchDay, isOpen, isTennisCourt, type KashikanSite } from "./kashikan";

interface LinkSite {
  id: string;
  name: string;
  type: "link";
  entryUrl: string;
  note?: string;
  facilities: { name: string; hint?: string }[];
}
type Site = (KashikanSite & { type: "kashikan" }) | LinkSite;

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
        errors.push(`${site.name} ${date}: ${(e as Error).message}`);
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
      links: cfg.sites.filter((s): s is LinkSite => s.type === "link"),
      slots,
      errors,
    }),
  );
  console.log(`空き ${slots.length} 件 / エラー ${errors.length} 件 -> public/data.json`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
}

main();
