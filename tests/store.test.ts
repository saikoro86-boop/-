import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { Draft } from "../src/sns/types";

// store.ts は import 時に保存先を決めるため、先に環境変数を設定してから読み込む
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sns-store-"));
process.env.SNS_DRAFTS_PATH = path.join(dir, "nested", "drafts.json");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadDrafts, saveDrafts, newId } = require("../src/sns/store") as typeof import("../src/sns/store");

test("loadDrafts: ファイルが無ければ空配列", () => {
  assert.deepEqual(loadDrafts(), []);
});

test("saveDrafts/loadDrafts: ディレクトリを作成して往復でき、一時ファイルが残らない", () => {
  const draft: Draft = {
    id: "x-abc123",
    platform: "x",
    theme: "test",
    text: "テスト投稿",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  saveDrafts([draft]);
  assert.deepEqual(loadDrafts(), [draft]);
  assert.equal(fs.existsSync(`${process.env.SNS_DRAFTS_PATH}.tmp`), false);
});

test("newId: プラットフォーム名をプレフィックスに持つ", () => {
  assert.match(newId("threads"), /^threads-[0-9a-f]+$/);
});

test("loadDrafts: JSON が壊れていればファイル名つきの分かりやすいエラーにする", () => {
  const original = fs.readFileSync(process.env.SNS_DRAFTS_PATH as string, "utf-8");
  try {
    fs.writeFileSync(process.env.SNS_DRAFTS_PATH as string, "{ broken");
    assert.throws(() => loadDrafts(), /drafts\.json.*壊れています/);
  } finally {
    fs.writeFileSync(process.env.SNS_DRAFTS_PATH as string, original);
  }
});

test("loadDrafts: 配列でない JSON はエラーにする", () => {
  const original = fs.readFileSync(process.env.SNS_DRAFTS_PATH as string, "utf-8");
  try {
    fs.writeFileSync(process.env.SNS_DRAFTS_PATH as string, '{"a":1}');
    assert.throws(() => loadDrafts(), /配列ではありません/);
  } finally {
    fs.writeFileSync(process.env.SNS_DRAFTS_PATH as string, original);
  }
});
