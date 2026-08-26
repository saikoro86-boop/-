import type { Page } from "puppeteer";

/** minMs〜maxMs のランダムな時間だけ待機する（人間らしい挙動を再現するため） */
export function randomDelay(minMs = 300, maxMs = 1200): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** セレクタが表示されるまで待機し、既存の値をクリアしてから1文字ずつ入力する */
export async function waitAndType(
  page: Page,
  selector: string,
  text: string,
  options?: { timeoutMs?: number; typeDelayMs?: number }
): Promise<void> {
  const { timeoutMs = 15000, typeDelayMs = 50 } = options ?? {};

  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  await page.click(selector, { clickCount: 3 }); // 既存の値を選択状態にしてから上書き
  await page.type(selector, text, { delay: typeDelayMs });

  await randomDelay();
}

/** セレクタが表示・クリック可能になるまで待機してからクリックする */
export async function waitAndClick(
  page: Page,
  selector: string,
  options?: { timeoutMs?: number }
): Promise<void> {
  const { timeoutMs = 15000 } = options ?? {};

  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  await page.click(selector);

  await randomDelay();
}
