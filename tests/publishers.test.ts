import { test } from "node:test";
import assert from "node:assert/strict";
import { xWeightedLength } from "../src/sns/publishers";

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
