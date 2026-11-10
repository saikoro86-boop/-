/**
 * 空き状況を取りに行くときの、共通の通信まわり。
 * - 時間制限: 先方が応答しなくても、いつまでも待たない(ジョブ全体が止まるのを防ぐ)
 * - 応答コードの確認
 * - 一時的な失敗のやり直し(withRetry)と、先方に負荷をかけないための待ち(sleep)
 */

/** 個人用の低頻度ツールであることを示す名乗り(ブラウザを装わない) */
export const USER_AGENT = "tennis-court-finder (personal use; low frequency)";

/** 1回の通信を待つ上限(ミリ秒) */
export const TIMEOUT_MS = 20_000;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 時間制限つきの fetch。応答コードが 200 台以外なら、URL とコードを添えて例外にする */
export async function fetchChecked(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

/** 一時的な通信エラーで施設が丸ごと抜けないよう、最大 tries 回(2秒・4秒あけて)やり直す */
export async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3, baseDelayMs = 2000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      console.error(`${label}: ${(e as Error).message}(${i}回目。やり直します)`);
      await sleep(baseDelayMs * i);
    }
  }
}
