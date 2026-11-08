import { TwitterApi } from "twitter-api-v2";
import type { Draft, Platform } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が .env に設定されていません`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Meta系API(Threads / Instagram)への POST。エラー時は API のメッセージをそのまま投げる */
async function graphPost(url: string, params: Record<string, string>): Promise<{ id: string }> {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { method: "POST" });
  const body = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !body.id) {
    throw new Error(`${res.status} ${body.error?.message ?? JSON.stringify(body)}`);
  }
  return { id: body.id };
}

/**
 * X の文字数(weighted length)。日本語などの全角文字は2、半角は1として数え、上限は280。
 * URLは実際には一律23としてカウントされるが、ここでは簡易的に文字数どおり数える。
 */
export function xWeightedLength(text: string): number {
  let length = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const isNarrow =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    length += isNarrow ? 1 : 2;
  }
  return length;
}

async function postToX(draft: Draft): Promise<string> {
  if (draft.imageUrl) {
    throw new Error("X への画像付き投稿はまだ未対応です。imageUrl を外すか、手動で投稿してください");
  }
  const client = new TwitterApi({
    appKey: requireEnv("X_API_KEY"),
    appSecret: requireEnv("X_API_SECRET"),
    accessToken: requireEnv("X_ACCESS_TOKEN"),
    accessSecret: requireEnv("X_ACCESS_SECRET"),
  });
  const { data } = await client.v2.tweet(draft.text);
  return data.id;
}

async function postToThreads(draft: Draft): Promise<string> {
  const userId = requireEnv("THREADS_USER_ID");
  const accessToken = requireEnv("THREADS_ACCESS_TOKEN");
  const base = `https://graph.threads.net/v1.0/${userId}`;

  const container = await graphPost(`${base}/threads`, {
    media_type: draft.imageUrl ? "IMAGE" : "TEXT",
    text: draft.text,
    ...(draft.imageUrl ? { image_url: draft.imageUrl } : {}),
    access_token: accessToken,
  });
  // 画像付きはサーバー側の処理待ちが必要(公式ドキュメントの推奨は約30秒)
  if (draft.imageUrl) await sleep(30_000);

  const published = await graphPost(`${base}/threads_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });
  return published.id;
}

async function postToInstagram(draft: Draft): Promise<string> {
  if (!draft.imageUrl) {
    throw new Error("Instagram は画像が必須です。draft に --image で公開URLの画像を指定してください");
  }
  const userId = requireEnv("INSTAGRAM_USER_ID");
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN");
  const graphBase = process.env.INSTAGRAM_GRAPH_BASE ?? "https://graph.facebook.com/v21.0";

  const container = await graphPost(`${graphBase}/${userId}/media`, {
    image_url: draft.imageUrl,
    caption: draft.text,
    access_token: accessToken,
  });

  // コンテナの処理が終わるまで待つ(最大約1分)
  for (let i = 0; i < 12; i++) {
    const res = await fetch(
      `${graphBase}/${container.id}?${new URLSearchParams({ fields: "status_code", access_token: accessToken })}`
    );
    const { status_code } = (await res.json()) as { status_code?: string };
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR") throw new Error("Instagram 側で画像の処理に失敗しました");
    await sleep(5_000);
  }

  const published = await graphPost(`${graphBase}/${userId}/media_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });
  return published.id;
}

/** 再試行の設定: 最大3回まで試す(初回 + 再試行2回)。間隔は5秒 → 15秒 */
export const RETRY_DELAYS_MS = [5_000, 15_000];

/**
 * 一時的な失敗(ネットワークエラー、HTTP 429 / 5xx)かどうか。
 * 認証エラーや文字数超過など、再試行しても直らないものは false。
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  // twitter-api-v2 の ApiResponseError は HTTP ステータスを code に持つ
  if (typeof code === "number") return code === 429 || code >= 500;
  if (typeof code === "string" && /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_\w+)$/.test(code)) {
    return true;
  }
  // graphPost のエラーは「<ステータス> <メッセージ>」の形式
  if (/^(429|5\d\d) /.test(error.message)) return true;
  // fetch のネットワーク失敗
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) return true;
  return false;
}

/**
 * 一時的な失敗だけを、delaysMs の回数まで再試行する。
 * 成功した時点で返すので、成功済みの投稿を再試行することはない。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = sleep,
  onRetry?: (error: Error, attempt: number, delayMs: number) => void
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= delaysMs.length || !isTransientError(error)) throw error;
      onRetry?.(error as Error, attempt + 1, delaysMs[attempt]);
      await wait(delaysMs[attempt]);
    }
  }
}

export const publishers: Record<Platform, (draft: Draft) => Promise<string>> = {
  x: postToX,
  threads: postToThreads,
  instagram: postToInstagram,
};
