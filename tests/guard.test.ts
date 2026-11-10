import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRefusePublish } from "../src/courts/guard";

test("失敗がなければ、枠が減っていても公開する(本当に埋まっただけ)", () => {
  assert.equal(shouldRefusePublish({ errors: 0, curCount: 0, prevCount: 1000 }), null);
  assert.equal(shouldRefusePublish({ errors: 0, curCount: 10, prevCount: 1000 }), null);
});
test("失敗があって枠が0件なら、公開を見送る", () => {
  assert.match(shouldRefusePublish({ errors: 3, curCount: 0, prevCount: 0 })!, /1件も/);
});
test("失敗があって、前回の3割未満に急に減ったら、公開を見送る", () => {
  assert.match(shouldRefusePublish({ errors: 5, curCount: 200, prevCount: 1469 })!, /急に減って/);
});
test("失敗があっても、少し減っただけなら公開する(一部の日だけ失敗)", () => {
  assert.equal(shouldRefusePublish({ errors: 2, curCount: 1300, prevCount: 1469 }), null);
});
test("前回が少ないとき(初回など)は、割合では判断しない", () => {
  assert.equal(shouldRefusePublish({ errors: 2, curCount: 5, prevCount: 20 }), null);
});
