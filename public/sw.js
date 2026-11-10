// ホーム画面に置いたときに、電波が悪くても前回の画面とデータを出すための仕組み(Service Worker)。
// 方針: 画面(HTML・app-logic.js)とデータ(data2.json)は、まずネットから取る(最新を優先)。取れなければ、前回保存したものを出す。
// アイコンなどの変わらないものは、保存したものを使う。
const CACHE = "courts-v2";
const CORE = ["./", "index.html", "app-logic.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/** ネットを待つ上限。電波が弱くて応答が来ないときは、ここで諦めて、保存分を出す */
const NETWORK_TIMEOUT_MS = 8000;
/** 直前に時間切れになったばかりなら、次(画面のあとのデータなど)は短く待つ。2回続けて長く待たせない */
const RETRY_TIMEOUT_MS = 2500;
let lastTimeoutAt = 0;

/** ネット優先。失敗したら(または時間切れなら)保存分を返す(保存分には、そうと分かる印を付ける) */
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const ctl = new AbortController();
  const wait = Date.now() - lastTimeoutAt < 60000 ? RETRY_TIMEOUT_MS : NETWORK_TIMEOUT_MS;
  const timer = setTimeout(() => { lastTimeoutAt = Date.now(); ctl.abort(); }, wait);
  try {
    // no-cache: 毎回サーバーに確かめるが、変わっていなければ本文は送られない
    const res = await fetch(req, { cache: "no-cache", signal: ctl.signal });
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (!hit) throw err;
    const h = new Headers(hit.headers);
    h.set("x-from-cache", "1");
    return new Response(await hit.blob(), { status: 200, headers: h });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 予約サイトや地図などの外部は、さわらない
  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "index.html")); return; }
  const name = url.pathname.split("/").pop();
  // 画面の部品(app-logic.js)は、画面(HTML)と食い違わないよう、同じくネット優先
  if (name === "data2.json" || name === "app-logic.js") { e.respondWith(networkFirst(req, name)); return; }
  if (name === "refresh-config.json") return;
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
