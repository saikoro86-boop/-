import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectKashikan } from "../src/courts/collect/kashikan";
import { Collected, type CollectContext } from "../src/courts/collect/collected";
import type { KashikanConfig } from "../src/courts/config";

// 実サイトには繋がない。保存してある実物の画面を返す fetch に差し替えて、取得の流れ(失敗の記録・断られたときのやめ方)を確かめる
const html = readFileSync(__dirname + "/fixtures/nara-city-20261114.html", "utf-8");
const URL_ = "https://example.test/nara-city/index.php";
const site = {
  type: "kashikan",
  id: "nara",
  name: "奈良市",
  url: URL_,
  offlineMarks: ["●"],
  contacts: [{ match: "黒谷", tel: "0000-00-0001", hours: "9:00〜17:00" }],
  fallbackContact: { label: "担当課", tel: "0000-00-0002" },
} as KashikanConfig;
const ctxOf = (dates: string[]): CollectContext => ({ dates, first: dates[0], last: dates[dates.length - 1], purpose: { type: "7", codes: ["035", "036"] } });
const DATES = ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"];

/**
 * fetch・待ち時間・ログを差し替えて collectKashikan を動かす。
 * search は、検索(POST)のたびに呼ばれ、その日の応答を返す。戻り値の posts は、検索した日(UseDate)の並び
 */
async function run(dates: string[], search: (date: string, nth: number) => Response) {
  const real = { fetch: global.fetch, setTimeout: global.setTimeout, error: console.error };
  const posts: string[] = [];
  let tops = 0;
  global.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") { tops++; return new Response(""); } // 最初のアクセス(Cookie をもらうだけ)
    const d = (init.body as URLSearchParams).get("UseDate")!;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    posts.push(date);
    return search(date, posts.length);
  }) as typeof fetch;
  // 待ち時間(300ms、やり直しの2秒・4秒)を飛ばす
  global.setTimeout = ((fn: () => void) => real.setTimeout(fn, 0)) as unknown as typeof setTimeout;
  console.error = () => {};
  const acc = new Collected();
  try {
    await collectKashikan(site, ctxOf(dates), acc);
  } finally {
    global.fetch = real.fetch; global.setTimeout = real.setTimeout; console.error = real.error;
  }
  return { acc, posts, tops };
}
const ok = (body = html) => new Response(body);
const status = (code: number) => new Response("x", { status: code });

test("collectKashikan: 空き枠・予約サイトのURL・目的コードを積み、空きのない施設は理由を記録する", async () => {
  const { acc, posts } = await run(["2026-11-14"], () => ok());
  assert.deepEqual(posts, ["2026-11-14", "2026-11-14"]); // 硬式・軟式の2回
  assert.deepEqual(acc.errors, []);
  assert.deepEqual(acc.failures, []);
  const b = acc.slots.filter((s) => s.facility === "奈良市柏木コート" && s.court === "コートB");
  assert.deepEqual(b, [
    { date: "2026-11-14", site: "奈良市", facility: "奈良市柏木コート", court: "コートB", start: 9, end: 12 },
    { date: "2026-11-14", site: "奈良市", facility: "奈良市柏木コート", court: "コートB", start: 13, end: 17 },
  ]);
  assert.equal(acc.facilityUrls["奈良市|奈良市柏木コート"], URL_);
  assert.equal(acc.courtCodes["奈良市|奈良市柏木コート|コートB"], "035"); // 硬式・軟式で重なるコートは、先に検索した方
  assert.deepEqual(acc.contacts, {}); // ネットで予約できる枠だけなら、電話番号は付けない
  // 空きがある施設は、理由の一覧に出さない。すべて × の施設だけ「空きなし」
  assert.ok(!acc.status.some((r) => r.f === "奈良市柏木コート"));
  assert.deepEqual(acc.status.find((r) => r.f === "奈良市黒谷コート"), { d: "2026-11-14", s: "奈良市", f: "奈良市黒谷コート", t: "full" });
  // 部屋(会議室など)は、コートではないので入れない
  assert.ok(acc.slots.every((s) => !/会議|研修/.test(s.court)));
});

test("collectKashikan: offlineMarks の記号は「ネット予約は受付外の空き」として、問い合わせ先と一緒に積む", async () => {
  // 実物の画面には ● がないので、× を ● に置き換えて確かめる
  const { acc } = await run(["2026-11-14"], () => ok(html.replace(/×/g, "●")));
  const kurotani = acc.slots.filter((s) => s.facility === "奈良市黒谷コート");
  assert.ok(kurotani.length > 0);
  assert.ok(kurotani.every((s) => s.offline === true));
  assert.ok(acc.slots.some((s) => s.facility === "奈良市柏木コート" && !s.offline)); // ○ の枠は、今まで通り
  assert.deepEqual(acc.contacts["奈良市|奈良市黒谷コート"], { tel: "0000-00-0001", hours: "9:00〜17:00", via: undefined, unconfirmed: undefined });
  // 施設の番号が登録されていなければ、担当課の番号を「未確認」として付ける
  assert.deepEqual(acc.contacts["奈良市|奈良市青山コート"], { tel: "0000-00-0002", via: "担当課", unconfirmed: true });
  assert.ok(!acc.status.some((r) => r.f === "奈良市黒谷コート")); // 空きがあるので、理由の一覧には出さない
});

test("collectKashikan: 続けて2回断られたら(403)、残りの日は取りに行かない", async () => {
  const { acc, posts, tops } = await run(DATES, () => status(403));
  assert.deepEqual(posts, ["2026-11-14", "2026-11-15"]); // やり直しもしない(1日1回だけ)
  assert.equal(tops, 2);
  assert.deepEqual(acc.slots, []);
  assert.deepEqual(acc.failures, [{ s: "奈良市", d: "2026-11-14" }, { s: "奈良市", d: "2026-11-15" }, { s: "奈良市" }]);
  assert.equal(acc.errors.length, 3);
  // 公開されるので、取得元の URL・応答コードは入れない
  for (const m of acc.errors) assert.ok(!/https?:|example\.test|403/.test(m), m);
});

test("collectKashikan: 断られたのが続かなければ、最後の日まで取りに行く", async () => {
  const blocked = new Set(["2026-11-14", "2026-11-16"]);
  const { acc, posts } = await run(DATES, (date) => (blocked.has(date) ? status(403) : ok()));
  assert.deepEqual([...new Set(posts)], DATES);
  assert.deepEqual(acc.failures, [{ s: "奈良市", d: "2026-11-14" }, { s: "奈良市", d: "2026-11-16" }]);
  assert.deepEqual([...new Set(acc.slots.map((s) => s.date))], ["2026-11-15", "2026-11-17", "2026-11-18"]);
});

test("collectKashikan: 一時的な不調(503)は3回までやり直し、だめならその日だけ失敗にして先へ進む", async () => {
  const { acc, posts } = await run(["2026-11-14", "2026-11-15"], (date) => (date === "2026-11-14" ? status(503) : ok()));
  assert.equal(posts.filter((d) => d === "2026-11-14").length, 3);
  assert.deepEqual(acc.failures, [{ s: "奈良市", d: "2026-11-14" }]);
  assert.deepEqual(acc.errors, ["奈良市 2026-11-14: 取得に失敗"]);
  assert.ok(acc.slots.length > 0 && acc.slots.every((s) => s.date === "2026-11-15"));
});

test("collectKashikan: 1回目の不調が、やり直しで直れば失敗にしない", async () => {
  const { acc, posts } = await run(["2026-11-14"], (_d, nth) => (nth === 1 ? status(503) : ok()));
  assert.equal(posts.length, 3); // 失敗1回 + やり直しの2回(硬式・軟式)
  assert.deepEqual(acc.errors, []);
  assert.ok(acc.slots.length > 0);
});
