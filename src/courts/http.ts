/** 取得先が応答しないときに、ワークフロー全体が止まらないよう、タイムアウト付きで fetch する */
export const FETCH_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new Error(`${url} -> ${timeoutMs / 1000}秒以内に応答がありませんでした`);
    }
    throw e;
  }
}
