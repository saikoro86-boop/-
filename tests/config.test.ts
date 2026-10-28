import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const KEYS = ["TARGET_URL", "LOGIN_ID", "LOGIN_PASSWORD", "USER_DATA_DIR", "DOTENV_CONFIG_PATH"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  // 開発者の手元の .env が読み込まれてテスト結果が変わらないようにする
  process.env.DOTENV_CONFIG_PATH = "/nonexistent/.env";
  delete require.cache[require.resolve("../src/config")];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  delete require.cache[require.resolve("../src/config")];
});

test("config: 必須の環境変数が揃っていれば読み込める(USER_DATA_DIR は既定値あり)", () => {
  process.env.TARGET_URL = "https://example.com/login";
  process.env.LOGIN_ID = "id";
  process.env.LOGIN_PASSWORD = "pw";
  delete process.env.USER_DATA_DIR;

  const { config } = require("../src/config");
  assert.equal(config.targetUrl, "https://example.com/login");
  assert.equal(config.userDataDir, "./user_data");
});

test("config: 必須の環境変数が無いと、変数名入りのエラーになる", () => {
  process.env.TARGET_URL = "https://example.com/login";
  process.env.LOGIN_ID = "id";
  delete process.env.LOGIN_PASSWORD;

  assert.throws(() => require("../src/config"), /LOGIN_PASSWORD/);
});

test("config: 空文字の環境変数も未設定として扱う", () => {
  process.env.TARGET_URL = "";
  process.env.LOGIN_ID = "id";
  process.env.LOGIN_PASSWORD = "pw";

  assert.throws(() => require("../src/config"), /TARGET_URL/);
});
