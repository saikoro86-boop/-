/** 奈良スーパーアプリの取得。建物ごとに1回の通信で、全日付分が返る */
import {
  fetchNaraSuperAppRaw,
  fetchNaraSuperAppTop,
  listNaraSuperAppDates,
  nsaCourtFilter,
  nsaReservationUrl,
  parseNaraSuperApp,
  pickNaraSuperAppTargets,
  type NaraSuperAppResponse,
} from "../narasuperapp";
import { isOpen } from "../kashikan";
import { nsaDayState } from "../status";
import { facilityKey, normName } from "../keys";
import { BlockCounter, sleep, withRetry } from "../http";
import type { NsaAutoConfig, NsaConfig } from "../config";
import type { CollectContext, Collected } from "./collected";

/** 1建物分を、入れ物に積む */
function addNsa(area: string, raw: NaraSuperAppResponse, ctx: CollectContext, acc: Collected) {
  const { buildingRecord: b } = raw.returnValue;
  const url = nsaReservationUrl(b.FRE_FacilitiesId__c, b.Id);
  const facility = normName(b.FRE_FacilitiesId__r?.Name ?? b.Name);
  const { pred, gym } = nsaCourtFilter(raw);
  (gym ? acc.gymFacilities : acc.namedFacilities).add(facilityKey(area, facility));
  // アプリに枠が出ている最初の日〜最後の日(テニスコートの枠だけで数える)
  const tennisDates = listNaraSuperAppDates(raw).filter((d) => parseNaraSuperApp(raw, d).some(pred));
  const [firstSlot, lastSlot] = [tennisDates[0], tennisDates[tennisDates.length - 1]];
  for (const date of ctx.dates) {
    const cs = parseNaraSuperApp(raw, date).filter(pred);
    const hasSlots = cs.some((c) => c.slots.length > 0);
    const hasOpen = cs.some((c) => c.slots.some(isOpen));
    const t = nsaDayState({ hasOpen, hasSlots, inRange: !!firstSlot && date >= firstSlot && date <= lastSlot });
    acc.setStatus(area, facility, date, t, t === "closed" ? "休館日など" : undefined);
  }
  for (const date of listNaraSuperAppDates(raw).filter((d) => d >= ctx.first && d <= ctx.last)) {
    for (const c of parseNaraSuperApp(raw, date).filter(pred)) {
      for (const s of c.slots.filter(isOpen)) {
        acc.slots.push({ date, site: area, facility: c.facility, court: c.court, start: s.start, end: s.end });
        acc.facilityUrls[facilityKey(area, c.facility)] = url;
      }
    }
  }
}

/** この建物に、表示する設備が1つでもあるか(会議室だけの建物を除く) */
function hasTennisCourt(raw: NaraSuperAppResponse): boolean {
  const { pred } = nsaCourtFilter(raw);
  const b = raw.returnValue.buildingRecord;
  return raw.returnValue.equResultList.some((e) => pred({ facility: b.FRE_FacilitiesId__r?.Name ?? b.Name, court: e.Name, slots: [] }));
}

/** 建物を手で指定した地域(type: "nsa") */
export async function collectNsaTargets(site: NsaConfig, ctx: CollectContext, acc: Collected): Promise<void> {
  for (const t of site.targets) {
    try {
      addNsa(site.name, await withRetry(t.note ?? t.buildingId, () => fetchNaraSuperAppRaw(t.buildingId, t.facilityId)), ctx, acc);
    } catch (e) {
      // 公開するデータには、取得元がわかる情報(URL・ID・エラー詳細)を入れない。詳細はログにだけ出す
      console.error(`${site.name} ${t.note ?? t.buildingId}: ${(e as Error).message}`);
      acc.fail(site.name, `${site.name}: 取得に失敗`);
    }
    await sleep(1500); // 先方に負荷をかけない
  }
}

/** 施設一覧から、利用目的に「テニス」を含む建物を全部拾う(type: "nsa-auto")。エリア名は市町村名 */
export async function collectNsaAuto(site: NsaAutoConfig, ctx: CollectContext, acc: Collected): Promise<void> {
  try {
    const targets = pickNaraSuperAppTargets(await withRetry("施設一覧", () => fetchNaraSuperAppTop()), site.purpose ?? "テニス");
    await sleep(1000);
    const blocks = new BlockCounter();
    for (const [i, t] of targets.entries()) {
      try {
        const raw = await withRetry(t.facilityName, () => fetchNaraSuperAppRaw(t.buildingId, t.facilityId));
        if (hasTennisCourt(raw)) {
          acc.discovered.add(t.municipality);
          const info = t.facilityUrl && /^https?:\/\//.test(t.facilityUrl) ? t.facilityUrl : null;
          const match = normName(t.facilityName);
          if (info && !acc.nsaInfoLinks.some((x) => x.site === t.municipality && x.match === match)) acc.nsaInfoLinks.push({ site: t.municipality, match, url: info });
          addNsa(t.municipality, raw, ctx, acc);
        }
        blocks.ok();
      } catch (e) {
        console.error(`${t.municipality} ${t.facilityName}: ${(e as Error).message}`);
        acc.fail(t.municipality, `${t.municipality}: 取得に失敗`);
        if (blocks.failed(e)) {
          console.error(`${site.name}: 続けて断られたため、残りの施設の取得をやめます`);
          acc.errors.push(`${site.name}: 先方に断られたため、取得を中止`);
          // まだ取りに行っていない市町村も、「取得できなかった」と記録する(「空きなし」に見せない)
          for (const area of new Set(targets.slice(i + 1).map((r) => r.municipality))) acc.failures.push({ s: area });
          return;
        }
      }
      await sleep(1500);
    }
  } catch (e) {
    console.error(`${site.name} 施設一覧: ${(e as Error).message}`);
    acc.fail(site.name, `${site.name}: 施設一覧の取得に失敗`);
  }
}
