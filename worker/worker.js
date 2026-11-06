// 自動生成: npm run worker:build(worker/src/*.ts から作られます。直接は編集しないでください)
/**
 * 「手動更新ボタン」の中継役(Cloudflare Worker)の、判断の部分。
 * 画面には GitHub の鍵を置けないので、鍵はこの中継役だけが持つ。
 *   画面のボタン → 中継役(合言葉・連続実行の確認) → GitHub Actions を起動
 */
const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
/** 直近の実行の状態から、新しく起動してよいかを決める(純粋関数) */
function decideRefresh(last, nowMs, cooldownSec = 600) {
    if (!last)
        return { result: "go" };
    if (ACTIVE.has(last.status))
        return { result: "running", since: last.created_at };
    const finished = Date.parse(last.updated_at);
    const wait = Math.ceil(cooldownSec - (nowMs - finished) / 1000);
    return wait > 0 ? { result: "cooldown", waitSec: wait } : { result: "go" };
}
/** 呼び出し元(画面を置いているサイト)だけを許可する */
function isAllowedOrigin(origin, allowed) {
    return !!origin && !!allowed && origin === allowed;
}
/** 合言葉の比較。長さや一致の速さから、中身を推測されないように、ハッシュにして比べる */
async function safeEqual(a, b) {
    const enc = new TextEncoder();
    const [ha, hb] = await Promise.all([
        crypto.subtle.digest("SHA-256", enc.encode(a)),
        crypto.subtle.digest("SHA-256", enc.encode(b)),
    ]);
    const x = new Uint8Array(ha), y = new Uint8Array(hb);
    let diff = 0;
    for (let i = 0; i < x.length; i++)
        diff |= x[i] ^ y[i];
    return diff === 0;
}
const ghHeaders = (token) => ({
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "tennis-court-refresh-worker",
});


const json = (body, status, origin) => new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "origin",
        "cache-control": "no-store",
    },
});
async function lastRun(env) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/runs?per_page=1`;
    const res = await fetch(url, { headers: ghHeaders(env.GH_TOKEN) });
    if (!res.ok)
        throw new Error(`github runs ${res.status}`);
    const j = (await res.json());
    return j.workflow_runs?.[0];
}
export default {
    async fetch(request, env) {
        const origin = request.headers.get("origin");
        // 画面を置いているサイト以外からは、受け付けない
        if (!isAllowedOrigin(origin, env.ALLOWED_ORIGIN))
            return new Response("forbidden", { status: 403 });
        const o = origin;
        const path = new URL(request.url).pathname;
        if (request.method === "OPTIONS")
            return json({}, 204, o);
        try {
            // 取得の状態(合言葉は不要。GitHub の実行の状態だけを返す)
            if (request.method === "GET" && path === "/status") {
                const r = await lastRun(env);
                const running = !!r && ["queued", "in_progress", "waiting", "requested", "pending"].includes(r.status);
                return json({ running, lastUpdatedAt: r?.updated_at ?? null, conclusion: r?.conclusion ?? null }, 200, o);
            }
            // 取得し直す依頼(合言葉が必要)
            if (request.method === "POST" && path === "/refresh") {
                let pass = "";
                try {
                    pass = String((await request.json()).passcode ?? "");
                }
                catch {
                    /* 本文が壊れていたら、合言葉なし扱い */
                }
                if (!env.REFRESH_PASSCODE || !(await safeEqual(pass, env.REFRESH_PASSCODE))) {
                    await new Promise((r) => setTimeout(r, 800)); // 総当たりを遅くする
                    return json({ error: "bad_passcode" }, 401, o);
                }
                const d = decideRefresh(await lastRun(env), Date.now(), Number(env.COOLDOWN_SEC ?? 600));
                if (d.result !== "go")
                    return json(d, 200, o);
                const res = await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`, { method: "POST", headers: { ...ghHeaders(env.GH_TOKEN), "content-type": "application/json" }, body: JSON.stringify({ ref: env.GH_REF }) });
                if (res.status !== 204)
                    return json({ error: "github_dispatch", status: res.status }, 502, o);
                return json({ result: "started" }, 200, o);
            }
            return json({ error: "not_found" }, 404, o);
        }
        catch {
            return json({ error: "github" }, 502, o);
        }
    },
};
