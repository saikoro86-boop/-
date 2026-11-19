/**
 * 自宅PC(家庭用回線)で実行し、奈良市・生駒市の空きだけを取得して、中継役(Cloudflare Worker)へ送る。
 *   npm run fetch:local
 *
 * 必要な環境変数:
 *   WORKER_URL         中継役の住所(例 https://xxxx.workers.dev)
 *   REFRESH_PASSCODE   合言葉(中継役に設定したものと同じ)
 *
 * 守る一線(このファイルの方針):
 *   - 取得は、既存の collectKashikan をそのまま使う(正直な名乗り・1日ごとに待ち時間・断られたら中止)。
 *   - ブラウザ偽装・串(プロキシ)・VPN は使わない。
 *   - 自宅PCでも 403/429 で断られたら、そのエリアは送らない(良いデータを上書きしない)。全部断られたら、何も送らず終了。
 */
import { loadConfigs } from "./config";
import { Collected, type CollectContext } from "./collect/collected";
import { collectKashikan } from "./collect/kashikan";
import { buildIngestPayload } from "./ingest";
import { TIMEOUT_MS, USER_AGENT } from "./http";

const jst = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function main() {
  const base = process.env.WORKER_URL?.replace(/\/+$/, "");
  const pass = process.env.REFRESH_PASSCODE;
  if (!base || !/^https?:\/\//.test(base) || !pass) {
    console.error("環境変数 WORKER_URL(中継役の住所)と REFRESH_PASSCODE(合言葉)を設定してください");
    process.exit(1);
  }

  const cfg = loadConfigs().courts;
  const today = new Date();
  const dates = Array.from({ length: cfg.days }, (_, i) => jst(new Date(today.getTime() + i * 86400e3)));
  const ctx: CollectContext = { dates, first: dates[0], last: dates[dates.length - 1], purpose: cfg.purpose };

  const acc = new Collected();
  const sites = cfg.sites.filter((s) => s.type === "kashikan");
  for (const site of sites) {
    console.log(`${site.name} を取得します…`);
    await collectKashikan(site, ctx, acc);
  }

  const names = sites.map((s) => s.name);
  const { payload, blocked } = buildIngestPayload(acc, names);
  if (blocked.length) console.error(`断られたため送らないエリア: ${blocked.join("・")}(自宅の回線でも 403 でした)`);
  if (!payload.sites.length) {
    console.error("すべてのエリアで断られました。送信しません。");
    process.exit(1);
  }

  const res = await fetch(`${base}/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({ passcode: pass, ...payload }),
    // 中継役が応答しないまま、自宅PCの実行が止まり続けないように、他の通信と同じ時間制限を付ける
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status !== 200) {
    console.error(`送信に失敗: HTTP ${res.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`送信しました: ${payload.sites.join("・")} / 空き ${payload.slots.length} 件`);
  console.log(text.slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
