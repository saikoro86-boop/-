/** 「いつでも貸館」方式(奈良市・生駒市)の取得。1日ずつ、目的コードで検索する */
import { fetchDay, isOpen, isTennisCourt } from "../kashikan";
import { findContact } from "../phone";
import { kashikanFacilityState } from "../status";
import { courtKey, facilityKey } from "../keys";
import { BlockCounter, sleep, withRetry } from "../http";
import type { KashikanConfig } from "../config";
import type { CollectContext, Collected } from "./collected";

export async function collectKashikan(site: KashikanConfig, ctx: CollectContext, acc: Collected): Promise<void> {
  const offlineMarks = site.offlineMarks ?? [];
  const blocks = new BlockCounter();
  for (const date of ctx.dates) {
    try {
      const courts = (await withRetry(`${site.name} ${date}`, () => fetchDay(site, date, ctx.purpose))).filter(isTennisCourt);
      for (const c of courts) {
        for (const s of c.slots) {
          const online = isOpen(s);
          const offline = !online && offlineMarks.includes(s.mark.trim());
          if (!online && !offline) continue;
          acc.slots.push({ date, site: site.name, facility: c.facility, court: c.court, start: s.start, end: s.end, ...(offline ? { offline: true as const } : {}) });
          acc.facilityUrls[facilityKey(site.name, c.facility)] = site.url; // 施設ごとの直接URLは無いので、予約サイトのトップへ
          if (c.code) acc.courtCodes[courtKey(site.name, c.facility, c.court)] = c.code;
          if (offline) {
            const ct = findContact(site.contacts ?? [], c.facility);
            acc.contacts[facilityKey(site.name, c.facility)] = ct
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
        const st = kashikanFacilityState(cs, offlineMarks);
        if (st && (st.state === "full" || st.state === "closed")) acc.setStatus(site.name, facility, date, st.state, st.label);
      }
      blocks.ok();
    } catch (e) {
      console.error(`${site.name} ${date}: ${(e as Error).message}`);
      acc.fail(site.name, `${site.name} ${date}: 取得に失敗`, date);
      if (blocks.failed(e)) {
        // 先方に断られている。残りの日を取りに行っても同じなので、ここでやめる(負荷をかけない・防御を回避しない)
        console.error(`${site.name}: 続けて断られたため、残りの日の取得をやめます`);
        acc.fail(site.name, `${site.name}: 先方に断られたため、取得を中止`);
        return;
      }
    }
    await sleep(300); // 先方サーバに負荷をかけない
  }
}
