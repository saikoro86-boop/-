import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { config } from "./config";
import { randomDelay, waitAndType, waitAndClick } from "./utils";

puppeteer.use(StealthPlugin());

// フォームのセレクタはサイトに合わせて書き換える
const SELECTORS = {
  loginIdInput: "#username",
  passwordInput: "#password",
  submitButton: 'button[type="submit"]',
};

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: false, // 画面を表示した状態で動作確認する
    userDataDir: config.userDataDir, // セッション情報をローカルに保持
    defaultViewport: null,
    args: ["--start-maximized"],
  });

  try {
    const page = await browser.newPage();

    await page.goto(config.targetUrl, { waitUntil: "networkidle2" });
    await randomDelay();

    await waitAndType(page, SELECTORS.loginIdInput, config.loginId);
    await waitAndType(page, SELECTORS.passwordInput, config.loginPassword);

    await waitAndClick(page, SELECTORS.submitButton);

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    console.log("フォーム送信が完了しました");
  } catch (error) {
    console.error("処理中にエラーが発生しました:", error);
    throw error;
  } finally {
    // 動作確認のためすぐに閉じたくない場合はここをコメントアウトする
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
