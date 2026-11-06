/** 使い方: npm run courts -- 2026-11-14 [市名の一部] */
import { readFileSync } from "node:fs";
import { fetchNaraSuperAppRaw, fetchNaraSuperAppTop, nsaCourtFilter, parseNaraSuperApp, pickNaraSuperAppTargets } from "./narasuperapp";
import { fetchDay, isOpen, isTennisCourt, type CourtAvailability } from "./kashikan";

async function main() {
  const [date, filter] = process.argv.slice(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    console.error("使い方: npm run courts -- YYYY-MM-DD [市名]");
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync("config/courts.json", "utf-8"));
  for (const site of cfg.sites.filter((s: { name: string; type: string }) => s.type === "nsa-auto" || (s.type === "kashikan" && (!filter || s.name.includes(filter))))) {
    console.log(`\n■ ${site.type === "nsa-auto" ? (filter ?? "奈良スーパーアプリ全体") : site.name} ${date}`);
    let n = 0;
    let courts: CourtAvailability[];
    if (site.type === "nsa-auto") {
      // 市町村名で絞れる(例: npm run courts -- 2026-11-21 橿原)。絞らないと全施設に1回ずつアクセスする
      const targets = pickNaraSuperAppTargets(await fetchNaraSuperAppTop(), site.purpose).filter((t) => !filter || t.municipality.includes(filter));
      courts = [];
      for (const t of targets) {
        const raw = await fetchNaraSuperAppRaw(t.buildingId, t.facilityId);
        courts.push(...parseNaraSuperApp(raw, date).filter(nsaCourtFilter(raw).pred));
        await new Promise((r) => setTimeout(r, 1000));
      }
    } else courts = await fetchDay(site, date, cfg.purpose);
    for (const c of site.type === "nsa-auto" ? courts : courts.filter(isTennisCourt)) {
      const open = c.slots.filter(isOpen).map((s) => `${s.start}-${s.end}時`);
      if (open.length) { console.log(`  ${c.facility} ${c.court}: ${open.join(", ")}`); n++; }
    }
    if (!n) console.log("  空きなし");
  }
}
main();
