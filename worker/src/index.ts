import { decideRefresh, ghHeaders, isAllowedOrigin, parseCooldown, safeEqual, type Env, type RunInfo } from "./logic";

const json = (body: unknown, status: number, origin: string) =>
  new Response(status === 204 ? null : JSON.stringify(body), { // 204 は本文を持てない
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

async function lastRun(env: Env): Promise<RunInfo | undefined> {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/runs?per_page=1`;
  const res = await fetch(url, { headers: ghHeaders(env.GH_TOKEN) });
  if (!res.ok) throw new Error(`github runs ${res.status}`);
  const j = (await res.json()) as { workflow_runs?: RunInfo[] };
  return j.workflow_runs?.[0];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    // 画面を置いているサイト以外からは、受け付けない
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGIN)) return new Response("forbidden", { status: 403 });
    const o = origin as string;
    const path = new URL(request.url).pathname;

    if (request.method === "OPTIONS") return json({}, 204, o);

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
          pass = String(((await request.json()) as { passcode?: unknown }).passcode ?? "");
        } catch {
          /* 本文が壊れていたら、合言葉なし扱い */
        }
        if (!env.REFRESH_PASSCODE || !(await safeEqual(pass, env.REFRESH_PASSCODE))) {
          await new Promise((r) => setTimeout(r, 800)); // 総当たりを遅くする
          return json({ error: "bad_passcode" }, 401, o);
        }
        const d = decideRefresh(await lastRun(env), Date.now(), parseCooldown(env.COOLDOWN_SEC));
        if (d.result !== "go") return json(d, 200, o);
        const res = await fetch(
          `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`,
          { method: "POST", headers: { ...ghHeaders(env.GH_TOKEN), "content-type": "application/json" }, body: JSON.stringify({ ref: env.GH_REF }) },
        );
        if (res.status !== 204) return json({ error: "github_dispatch", status: res.status }, 502, o);
        return json({ result: "started" }, 200, o);
      }
      return json({ error: "not_found" }, 404, o);
    } catch {
      return json({ error: "github" }, 502, o);
    }
  },
};
