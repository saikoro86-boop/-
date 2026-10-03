import "dotenv/config";
import { generatePosts } from "./generate";
import { publishers, xWeightedLength } from "./publishers";
import { loadDrafts, newId, saveDrafts } from "./store";
import { PLATFORMS, type Draft, type DraftStatus, type Platform } from "./types";

const USAGE = `使い方:
  npm run sns -- draft "<テーマ>" [--image <画像URL>] [--at <投稿日時>] [--platforms x,threads,instagram]
  npm run sns -- list [pending|approved|rejected|posted|failed]
  npm run sns -- show <id>
  npm run sns -- edit <id> "<新しい本文>"
  npm run sns -- approve <id> [<id> ...]
  npm run sns -- reject <id> [<id> ...]
  npm run sns -- publish [--dry-run]

例:
  npm run sns -- draft "10/10から秋の新メニュー3種を販売開始" --image https://example.com/menu.jpg --at "2026-10-10T09:00+09:00"
`;

/** --name value 形式のオプションと、それ以外の引数に分ける */
function parseArgs(args: string[]): { positional: string[]; options: Record<string, string> } {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        options[arg.slice(2)] = "true";
      } else {
        options[arg.slice(2)] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function lengthWarning(draft: Draft): string | undefined {
  if (draft.platform === "x" && xWeightedLength(draft.text) > 280) {
    return `X の上限(280)を超えています: ${xWeightedLength(draft.text)}`;
  }
  if (draft.platform === "threads" && [...draft.text].length > 500) {
    return `Threads の上限(500文字)を超えています: ${[...draft.text].length}`;
  }
  if (draft.platform === "instagram" && [...draft.text].length > 2200) {
    return `Instagram の上限(2200文字)を超えています: ${[...draft.text].length}`;
  }
  if (draft.platform === "instagram" && !draft.imageUrl) {
    return "Instagram は画像が必須です(--image で指定)";
  }
  return undefined;
}

function printDraft(draft: Draft): void {
  const when = draft.scheduledAt ? new Date(draft.scheduledAt).toLocaleString("ja-JP") : "承認後すぐ";
  console.log(`\n[${draft.id}] ${draft.platform} / ${draft.status} / 予約: ${when}`);
  if (draft.imageUrl) console.log(`  画像: ${draft.imageUrl}`);
  console.log(draft.text.replace(/^/gm, "  │ "));
  const warning = lengthWarning(draft);
  if (warning) console.log(`  ⚠ ${warning}`);
  if (draft.error) console.log(`  ✖ ${draft.error}`);
}

function findDraft(drafts: Draft[], id: string): Draft {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) throw new Error(`ID ${id} の下書きが見つかりません`);
  return draft;
}

async function draftCommand(positional: string[], options: Record<string, string>): Promise<void> {
  const theme = positional[0];
  if (!theme) throw new Error("テーマを指定してください\n\n" + USAGE);

  const platforms = (options.platforms?.split(",") ?? [...PLATFORMS]) as Platform[];
  for (const p of platforms) {
    if (!PLATFORMS.includes(p)) throw new Error(`未対応の媒体です: ${p}`);
  }

  let scheduledAt: string | undefined;
  if (options.at) {
    const date = new Date(options.at);
    if (Number.isNaN(date.getTime())) throw new Error(`日時の形式が正しくありません: ${options.at}`);
    scheduledAt = date.toISOString();
  }

  console.log("投稿文を作成中...");
  const posts = await generatePosts(theme, platforms);

  const drafts = loadDrafts();
  const created: Draft[] = platforms.map((platform) => ({
    id: newId(platform),
    platform,
    theme,
    text: posts[platform].trim(),
    imageUrl: options.image,
    scheduledAt,
    status: "pending",
    createdAt: new Date().toISOString(),
  }));
  saveDrafts([...drafts, ...created]);

  created.forEach(printDraft);
  console.log(`\n内容を確認して、問題なければ: npm run sns -- approve ${created.map((d) => d.id).join(" ")}`);
}

function setStatus(ids: string[], status: DraftStatus): void {
  if (ids.length === 0) throw new Error("ID を指定してください");
  const drafts = loadDrafts();
  for (const id of ids) {
    const draft = findDraft(drafts, id);
    if (draft.status === "posted") throw new Error(`${id} は投稿済みです`);
    if (status === "approved") {
      const warning = lengthWarning(draft);
      if (warning) throw new Error(`${id} は承認できません: ${warning}`);
    }
    draft.status = status;
    delete draft.error;
  }
  saveDrafts(drafts);
  console.log(`${ids.join(", ")} を ${status} にしました`);
}

async function publishCommand(dryRun: boolean): Promise<void> {
  const drafts = loadDrafts();
  const now = Date.now();
  const due = drafts.filter(
    (d) => d.status === "approved" && (!d.scheduledAt || new Date(d.scheduledAt).getTime() <= now)
  );

  if (due.length === 0) {
    console.log("投稿時刻になった承認済みの下書きはありません");
    return;
  }

  for (const draft of due) {
    if (dryRun) {
      console.log(`[dry-run] ${draft.id} を ${draft.platform} に投稿します`);
      continue;
    }
    try {
      draft.postedId = await publishers[draft.platform](draft);
      draft.status = "posted";
      draft.postedAt = new Date().toISOString();
      console.log(`✔ ${draft.id} を ${draft.platform} に投稿しました (${draft.postedId})`);
    } catch (error) {
      draft.status = "failed";
      draft.error = error instanceof Error ? error.message : String(error);
      console.error(`✖ ${draft.id} の投稿に失敗しました: ${draft.error}`);
    }
    // 1件ごとに保存して、途中で落ちても二重投稿しないようにする
    saveDrafts(drafts);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, options } = parseArgs(rest);

  switch (command) {
    case "draft":
      return draftCommand(positional, options);
    case "list": {
      const status = positional[0];
      const drafts = loadDrafts().filter((d) => !status || d.status === status);
      if (drafts.length === 0) console.log("該当する下書きはありません");
      drafts.forEach(printDraft);
      return;
    }
    case "show":
      return printDraft(findDraft(loadDrafts(), positional[0]));
    case "edit": {
      const [id, text] = positional;
      if (!text) throw new Error("新しい本文を指定してください");
      const drafts = loadDrafts();
      const draft = findDraft(drafts, id);
      draft.text = text;
      draft.status = "pending"; // 編集したら承認し直す
      saveDrafts(drafts);
      printDraft(draft);
      return;
    }
    case "approve":
      return setStatus(positional, "approved");
    case "reject":
      return setStatus(positional, "rejected");
    case "publish":
      return publishCommand(options["dry-run"] === "true");
    default:
      console.log(USAGE);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
