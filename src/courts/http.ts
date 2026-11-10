/**
 * 空き状況を取りに行くときの、共通の通信まわり。
 * - 時間制限: 先方が応答しなくても、いつまでも待たない(ジョブ全体が止まるのを防ぐ)
 * - 応答コードの確認
 * - 一時的な失敗のやり直し(withRetry)と、先方に負荷をかけないための待ち(sleep)
 * - 断られたとき(403 など)は、やり直さない。続けて断られたら、そのサイトの取得をやめる(BlockCounter)
 */

/** 個人用の低頻度ツールであることを示す名乗り(ブラウザを装わない) */
export const USER_AGENT = "tennis-court-finder (personal use; low frequency)";

/** 1回の通信を待つ上限(ミリ秒) */
export const TIMEOUT_MS = 20_000;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 応答コードが 200 台以外だったときの例外。status で、やり直すか・やめるかを決める */
export class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`${url} -> HTTP ${status}`);
  }
}

/**
 * 先方に「来ないで」と断られた応答か(401・403・429)。
 * サイトの防御は回避しない方針なので、やり直さず、そのサイトの取得を早めにやめる
 */
export const isBlocked = (e: unknown): boolean => e instanceof HttpError && [401, 403, 429].includes(e.status);

/** やり直す意味がある失敗か。通信の失敗・時間切れ・先方の一時的な不調(5xx、408)だけ。4xx は、同じ結果になるだけなのでやり直さない */
export const isRetryable = (e: unknown): boolean => !(e instanceof HttpError) || e.status >= 500 || e.status === 408;

/** 時間制限つきの fetch。応答コードが 200 台以外なら、URL とコードを添えて例外(HttpError)にする */
export async function fetchChecked(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new HttpError(url, res.status);
  return res;
}

/** 一時的な通信エラーで施設が丸ごと抜けないよう、最大 tries 回(2秒・4秒あけて)やり直す。断られた応答(4xx)は、やり直さない */
export async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3, baseDelayMs = 2000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries || !isRetryable(e)) throw e;
      console.error(`${label}: ${(e as Error).message}(${i}回目。やり直します)`);
      await sleep(baseDelayMs * i);
    }
  }
}

/** 何回続けて断られたら、そのサイトの残りの取得をやめるか */
export const BLOCK_LIMIT = 2;

/** 続けて断られた回数を数える。成功すれば 0 に戻る */
export class BlockCounter {
  private n = 0;
  /** 失敗を記録する。断られた応答が BLOCK_LIMIT 回続いたら true(= もうやめる) */
  failed(e: unknown): boolean {
    this.n = isBlocked(e) ? this.n + 1 : 0;
    return this.n >= BLOCK_LIMIT;
  }
  ok() {
    this.n = 0;
  }
}
