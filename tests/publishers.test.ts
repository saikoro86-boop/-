import { test } from "node:test";
import assert from "node:assert/strict";
import { xWeightedLength, validateXImage } from "../src/sns/publishers";

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

test("validateXImage: 対応形式は MIME タイプを返す(charset 付き・大文字も可)", () => {
  assert.equal(validateXImage("image/png", 1000), "image/png");
  assert.equal(validateXImage("IMAGE/JPEG; charset=binary", 1000), "image/jpeg");
});

test("validateXImage: 非対応形式・空・サイズ超過はエラー", () => {
  assert.throws(() => validateXImage("text/html", 1000), /画像形式/);
  assert.throws(() => validateXImage(null, 1000), /画像形式/);
  assert.throws(() => validateXImage("image/png", 0), /空/);
  assert.throws(() => validateXImage("image/png", 5 * 1024 * 1024 + 1), /大きすぎ/);
  assert.equal(validateXImage("image/png", 5 * 1024 * 1024), "image/png");
});
