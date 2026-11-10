/**
 * 設定した全サイトの今後 N 日分の空きを取得し、public/data2.json に書き出す。
 *   npm run courts:build
 * 1サイトの失敗で全体を止めず、失敗は errors / failures に記録する(取得の詳細は collect/、公開の形は publish.ts)。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadConfigs } from "./config";
import { Collected, type CollectContext } from "./collect/collected";
import { collectKashikan } from "./collect/kashikan";
import { collectNsaAuto, collectNsaTargets } from "./collect/nsa";
import { compactSlots, markNew, type CompactSlots } from "./compact";
import { shouldRefusePublish } from "./guard";
import { buildCommon, fetchPrevious } from "./publish";
import { fetchWeather } from "./weather";

const jst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const count = (c: CompactSlots) => Object.values(c.byDate).reduce((n, l) => n + l.length, 0);

async function main() {
  const configs = loadConfigs(); // 設定の誤りは、取得を始める前に止める
  const cfg = configs.courts;
  const today = new Date();
  const dates = Array.from({ length: cfg.days }, (_, i) => jst(new Date(today.getTime() + i * 86400e3)));
  const ctx: CollectContext = { dates, first: dates[0], last: dates[dates.length - 1], purpose: cfg.purpose };

  const acc = new Collected();
  for (const site of cfg.sites) {
    if (site.type === "kashikan") await collectKashikan(site, ctx, acc);
    else if (site.type === "nsa") await collectNsaTargets(site, ctx, acc);
    else if (site.type === "nsa-auto") await collectNsaAuto(site, ctx, acc);
    // link 型は自動取得しない(公式サイトへ案内するだけ)
  }

  // 天気(気象庁)。取れなくても空き状況の更新は止めない
  let weather: Awaited<ReturnType<typeof fetchWeather>> | null = null;
  try {
    weather = await fetchWeather();
  } catch (e) {
    console.log("天気(気象庁)の取得に失敗:", (e as Error).message);
  }
  const common = buildCommon(configs, acc, weather, new Date().toISOString());

  // 前回公開したデータと比べて、新しく空いた枠に印を付ける。取れなければ印なし
  const previous = await fetchPrevious(process.env.PREV_URL);
  const compact = markNew(compactSlots(acc.slots), previous?.prev ?? null, previous?.failures);
  console.log(`🆕 新しく空いた枠: ${Object.values(compact.byDate).flat().filter((x) => x[4] === 1).length} 件(前回データ ${previous ? "あり" : "なし"})`);

  // 取得に失敗した回は、本物でない「空きなし」を公開しない(前回のデータが残る)
  const refuse = shouldRefusePublish({ errors: acc.errors.length, curCount: count(compact), prevCount: previous ? count(previous.prev) : 0 });
  if (refuse) { console.error(`公開を見送ります: ${refuse}`); process.exitCode = 1; return; }

  mkdirSync("public", { recursive: true });
  // data2.json: スマホ向けの小さな形式(いまの画面が読む)
  const small = JSON.stringify({ v: 2, ...common, courts: compact.courts, byDate: compact.byDate });
  writeFileSync("public/data2.json", small);
  const kb = (t: string) => Math.round(Buffer.byteLength(t) / 1024);
  console.log(
    `空き ${acc.slots.length} 件(うちネット予約外 ${acc.slots.filter((x) => x.offline).length}) → まとめて ${count(compact)} 件 / エリア ${common.sites.length} / エラー ${acc.errors.length} 件`,
  );
  console.log(`public/data2.json ${kb(small)}KB`);
  if (acc.errors.length) console.log(`失敗: ${acc.errors.length} 件(詳細は上のログ)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
