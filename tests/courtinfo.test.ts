import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(__dirname + "/../config/courtinfo.json", "utf-8")) as {
  info: Record<string, { surfaces: string[]; indoor: boolean; nighter: boolean | null; src: string; ref: string }>;
};

test("コート情報: 種類は omni/clay/hard だけ、出典がある", () => {
  for (const [k, v] of Object.entries(cfg.info)) {
    for (const s of v.surfaces) assert.ok(["omni", "clay", "hard"].includes(s), k + " " + s);
    assert.ok(v.nighter === true || v.nighter === false || v.nighter === null, k);
    assert.ok(v.src.length > 2, k);
  }
});

test("公式で確かめた点: 城址・塚穴は照明なし、屋敷山はクレー、県立橿原公苑(体育館)は屋内", () => {
  assert.equal(cfg.info["木津川市|城址公園"].nighter, false);
  assert.equal(cfg.info["木津川市|塚穴公園"].nighter, false);
  assert.deepEqual(cfg.info["葛城市|屋敷山公園テニスコート"].surfaces, ["clay"]);
  assert.equal(cfg.info["橿原市|県立橿原公苑"].indoor, true);
});
