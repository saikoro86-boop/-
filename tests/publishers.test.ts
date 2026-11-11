import { test } from "node:test";
import assert from "node:assert/strict";
import { xWeightedLength, checkXImage } from "../src/sns/publishers";

test("xWeightedLength: 半角英数は1文字=1", () => {
  assert.equal(xWeightedLength("hello"), 5);
  assert.equal(xWeightedLength(""), 0);
});

test("xWeightedLength: 日本語などの全角文字は1文字=2", () => {
  assert.equal(xWeightedLength("こんにちは"), 10);
  assert.equal(xWeightedLength("aあ"), 3);
});

test("xWeightedLength: サロゲートペア(絵文字)は1文字=2として数える", () => {
  assert.equal(xWeightedLength("😀"), 2);
});

test("checkXImage: 対応形式は MIME タイプを返す(大文字・パラメータ付きも可)", () => {
  assert.equal(checkXImage("image/png", 1000), "image/png");
  assert.equal(checkXImage("Image/JPEG; charset=binary", 1000), "image/jpeg");
});

test("checkXImage: 非対応の形式と Content-Type なしはエラー", () => {
  assert.throws(() => checkXImage("text/html", 1000), /形式/);
  assert.throws(() => checkXImage(null, 1000), /不明/);
});

test("checkXImage: 空の画像と 5MB 超はエラー、ちょうど 5MB は通る", () => {
  assert.throws(() => checkXImage("image/png", 0), /空/);
  assert.throws(() => checkXImage("image/png", 5 * 1024 * 1024 + 1), /大きすぎ/);
  assert.equal(checkXImage("image/png", 5 * 1024 * 1024), "image/png");
});
