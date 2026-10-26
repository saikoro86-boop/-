/** 投稿の再試行回数(初回を含む)と、試行の間隔(ミリ秒)。README にも記載 */
export const MAX_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [5_000, 15_000];

/**
 * 一時的な失敗(ネットワークエラー、HTTP 429 / 5xx)かどうか。
 * 設定ミスや本文の不備など、再試行しても直らないものは false。
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const e = error as Error & { code?: unknown; cause?: { code?: unknown } };
  // fetch の失敗(DNS・接続断など)
  if (error instanceof TypeError && error.message === "fetch failed") return true;
  const networkCodes = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"];
  if (typeof e.code === "string" && networkCodes.includes(e.code)) return true;
  if (typeof e.cause?.code === "string" && networkCodes.includes(e.cause.code)) return true;
  // twitter-api-v2 の ApiResponseError は数値の code に HTTP ステータスを持つ
  if (typeof e.code === "number") return e.code === 429 || e.code >= 500;
  // graphPost のエラー形式: "<status> <message>"
  const match = /^(\d{3})\b/.exec(error.message);
  if (match) {
    const status = Number(match[1]);
    return status === 429 || status >= 500;
  }
  return false;
}

/** 一時的な失敗だけを、最大 MAX_ATTEMPTS 回まで再試行する。最後のエラーはそのまま投げる */
export async function withRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isTransientError(error)) throw error;
      onRetry?.(attempt, error);
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }
  }
}
