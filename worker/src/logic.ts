/**
 * 「手動更新ボタン」と「3時間おきの時計」の中継役(Cloudflare Worker)の、判断の部分。
 * 画面には GitHub の鍵を置けないので、鍵はこの中継役だけが持つ。
 *   画面のボタン → 中継役(合言葉・連続実行の確認) → GitHub Actions を起動
 *   時計(Cron Trigger) → 中継役(直近の実行が新しければ何もしない) → GitHub Actions を起動
 * GitHub の定期実行(schedule)は、混んでいると遅れたり飛ばされたりする(実際に8〜10時間おきになった)。
 * 時計は、それが予定どおり動かなかったときだけ、補う。
 */

export interface Env {
  GH_TOKEN: string; // 秘密: このリポジトリの Actions を起動できる鍵
  REFRESH_PASSCODE: string; // 秘密: 3人で共有する合言葉(12文字以上を推奨)
  GH_OWNER: string; // 例: saikoro86-boop
  GH_REPO: string; // 例: -
  GH_WORKFLOW: string; // 例: courts.yml
  GH_REF: string; // 例: claude/puppeteer-form-automation-dd1dmz(メインのブランチ)
  ALLOWED_ORIGIN: string; // 例: https://saikoro86-boop.github.io
  COOLDOWN_SEC?: string; // 前回の実行から、次の依頼を受け付けるまでの秒数(既定 600)
}

export interface RunInfo {
  status: string; // queued | in_progress | completed など
  conclusion?: string | null;
  created_at: string;
  updated_at: string;
}

export type Decision =
  | { result: "go" }
  | { result: "running"; since: string }
  | { result: "cooldown"; waitSec: number };

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

/** 直近の実行の状態から、新しく起動してよいかを決める(純粋関数) */
export function decideRefresh(last: RunInfo | undefined, nowMs: number, cooldownSec = 600): Decision {
  if (!last) return { result: "go" };
  if (ACTIVE.has(last.status)) return { result: "running", since: last.created_at };
  const finished = Date.parse(last.updated_at);
  const wait = Math.ceil(cooldownSec - (nowMs - finished) / 1000);
  return wait > 0 ? { result: "cooldown", waitSec: wait } : { result: "go" };
}

/** 時計が、起動を見送る目安(分)。直近の実行が終わってから、これより新しければ何もしない */
export const FRESH_MIN = 150;

/**
 * 時計(3時間おき)が起動してよいかを決める(純粋関数)。
 *   実行中 → 見送る(GitHub の定期実行が動いている)
 *   直近の実行が終わってから freshMin 分未満 → 見送る(GitHub の定期実行が、予定どおり動いた)
 *   それより古い(または実行の記録がない) → 起動する(GitHub の定期実行が飛ばされた)
 */
export function decideScheduled(last: RunInfo | undefined, nowMs: number, freshMin = FRESH_MIN): Decision {
  if (!last) return { result: "go" };
  if (ACTIVE.has(last.status)) return { result: "running", since: last.created_at };
  const ageMin = (nowMs - Date.parse(last.updated_at)) / 60000;
  return ageMin < freshMin ? { result: "cooldown", waitSec: Math.ceil((freshMin - ageMin) * 60) } : { result: "go" };
}

/** 呼び出し元(画面を置いているサイト)だけを許可する */
export function isAllowedOrigin(origin: string | null, allowed: string): boolean {
  return !!origin && !!allowed && origin === allowed;
}

/** 合言葉の比較。長さや一致の速さから、中身を推測されないように、ハッシュにして比べる */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const ghHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "tennis-court-refresh-worker",
});
