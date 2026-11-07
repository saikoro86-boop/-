import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchWithTimeout } from "../src/courts/http";

function serve(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => { server.closeAllConnections(); server.close(); } });
    });
  });
}

test("fetchWithTimeout: 応答があれば通常どおり返す", async () => {
  const s = await serve((_req, res) => res.end("ok"));
  try {
    const res = await fetchWithTimeout(s.url, {}, 2000);
    assert.equal(await res.text(), "ok");
  } finally { s.close(); }
});

test("fetchWithTimeout: 応答がなければ、URL付きの分かりやすいエラーにする", async () => {
  const s = await serve(() => { /* 応答しない */ });
  try {
    await assert.rejects(fetchWithTimeout(s.url, {}, 100), /応答がありませんでした/);
  } finally { s.close(); }
});
