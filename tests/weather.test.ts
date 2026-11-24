import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJma, iconOf } from "../src/courts/weather";

const nara = JSON.parse(readFileSync(__dirname + "/fixtures/jma-290000-20261108.json", "utf-8"));
const kyoto = JSON.parse(readFileSync(__dirname + "/fixtures/jma-260000-20261108.json", "utf-8"));

test("奈良県北部: 今日〜7日分の降水確率が取れる(0〜100)", () => {
  const w = parseJma(nara, "北部", "奈良県");
  const days = Object.keys(w).sort();
  assert.ok(days.length >= 7, days.join(","));
  assert.equal(days[0], "2026-11-08");
  for (const d of days.slice(0, 2)) { const p = w[d].pop; assert.ok(p != null && p >= 0 && p <= 100, d); }
  for (const d of days) assert.ok(["☀", "☁", "☔", "❄", ""].includes(w[d].icon), d);
});

test("京都府南部(木津川市)も取れる", () => {
  const w = parseJma(kyoto, "南部", "南部");
  assert.ok(Object.keys(w).length >= 7);
});

test("天気コードのマーク", () => {
  assert.equal(iconOf("100"), "☀"); assert.equal(iconOf("201"), "☁"); assert.equal(iconOf("313"), "☔"); assert.equal(iconOf(undefined), "");
});

// ---- 形が想定と違う・通信の部分 ----
import { fetchWeather } from "../src/courts/weather";
import { USER_AGENT } from "../src/courts/http";

test("予報が空・欄が足りないときは、例外にせず空で返す(天気が取れなくても空き状況の公開は続けるため)", () => {
  assert.deepEqual(parseJma([] as never, "北部", "奈良県"), {});
  assert.deepEqual(parseJma([{ publishingOffice: "", reportDatetime: "", timeSeries: [] }] as never, "北部", "奈良県"), {});
  // 地域名が合わないときも、空
  assert.deepEqual(parseJma(nara, "存在しない地域", "存在しない地域"), {});
});

test("降水確率は、6〜18時の枠だけで決める(夜の枠は見ない)", () => {
  const json = [
    {
      publishingOffice: "",
      reportDatetime: "",
      timeSeries: [
        { timeDefines: ["2026-11-08T00:00:00+09:00"], areas: [{ area: { name: "北部", code: "1" }, weatherCodes: ["100"] }] },
        {
          timeDefines: ["2026-11-08T00:00:00+09:00", "2026-11-08T06:00:00+09:00", "2026-11-08T12:00:00+09:00", "2026-11-08T18:00:00+09:00"],
          areas: [{ area: { name: "北部", code: "1" }, pops: ["90", "10", "30", "80"] }],
        },
      ],
    },
  ];
  assert.deepEqual(parseJma(json as never, "北部", "奈良県"), { "2026-11-08": { pop: 30, icon: "☀" } });
});

test("fetchWeather: 奈良県と京都府の2か所を、名乗りつきで取りに行く", async () => {
  const orig = globalThis.fetch;
  const calls: { url: string; ua: string | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), ua: (init?.headers as Record<string, string> | undefined)?.["user-agent"] });
    return new Response(JSON.stringify(String(url).includes("290000") ? nara : kyoto), { status: 200 });
  }) as typeof fetch;
  try {
    const w = await fetchWeather();
    assert.deepEqual(calls.map((c) => c.url.split("/").pop()), ["290000.json", "260000.json"]);
    assert.ok(calls.every((c) => c.ua === USER_AGENT));
    assert.ok(Object.keys(w.nara).length >= 7 && Object.keys(w.kyoto).length >= 7);
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchWeather: 応答が 503 なら、例外にする(呼び出し側 build.ts が受けて、天気なしで公開を続ける)", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  try {
    await assert.rejects(fetchWeather(), /HTTP 503/);
  } finally {
    globalThis.fetch = orig;
  }
});
