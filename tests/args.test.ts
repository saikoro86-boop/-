import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, parsePlatforms } from "../src/sns/args";

test("parsePlatforms: 未指定なら全媒体", () => {
  assert.deepEqual(parsePlatforms(undefined), ["x", "threads", "instagram"]);
});

test("parsePlatforms: 空白を除き、重複をまとめる", () => {
  assert.deepEqual(parsePlatforms(" x , threads,x,"), ["x", "threads"]);
});

test("parsePlatforms: 空・未対応の媒体はエラー", () => {
  assert.throws(() => parsePlatforms(""), /媒体を指定/);
  assert.throws(() => parsePlatforms("x,facebook"), /facebook/);
});

test("parseArgs: オプションと位置引数を分ける", () => {
  assert.deepEqual(parseArgs(["テーマ", "--image", "https://e.com/a.jpg", "--dry-run"]), {
    positional: ["テーマ"],
    options: { image: "https://e.com/a.jpg", "dry-run": "true" },
  });
});
