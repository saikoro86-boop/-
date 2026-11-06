/** 使い方: npm run courts -- 2026-11-14 [市名の一部] */
import { readFileSync } from "node:fs";
import { fetchNaraSuperAppRaw, parseNaraSuperApp } from "./narasuperapp";
import { fetchDay, isOpen, isTennisCourt, type CourtAvailability } from "./kashikan";

async function main() {
  const [date, filter] = process.argv.slice(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
    console.error("使い方: npm run courts -- YYYY-MM-DD [市名]");
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync("config/courts.json", "utf-8"));
  for (const site of cfg.sites.filter((s: { name: string; type: string }) => (s.type === "kashikan" || s.type === "nsa") && (!filter || s.name.includes(filter)))) {
    console.log(`\n■ ${site.name} ${date}`);
    let n = 0;
    const courts: CourtAvailability[] =
      site.type === "nsa"
        ? (
            await Promise.all(
              site.targets.map(async (t: { facilityId: string; buildingId: string }) =>
                parseNaraSuperApp(await fetchNaraSuperAppRaw(t.buildingId, t.facilityId), date),
              ),
            )
          ).flat()
        : await fetchDay(site, date, cfg.purpose);
    for (const c of courts.filter(isTennisCourt)) {
      const open = c.slots.filter(isOpen).map((s) => `${s.start}-${s.end}時`);
      if (open.length) { console.log(`  ${c.facility} ${c.court}: ${open.join(", ")}`); n++; }
    }
    if (!n) console.log("  空きなし");
  }
}
main();
