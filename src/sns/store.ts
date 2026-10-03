import fs from "fs";
import path from "path";
import type { Draft } from "./types";

const STORE_PATH = process.env.SNS_DRAFTS_PATH ?? "./drafts/drafts.json";

export function loadDrafts(): Draft[] {
  if (!fs.existsSync(STORE_PATH)) return [];
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as Draft[];
}

export function saveDrafts(drafts: Draft[]): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  // 途中で落ちてもファイルが壊れないよう、一時ファイルに書いてから置き換える
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(drafts, null, 2) + "\n");
  fs.renameSync(tmpPath, STORE_PATH);
}

/** 短くて打ちやすいID（例: x-3f9a1c） */
export function newId(platform: string): string {
  return `${platform}-${Math.random().toString(16).slice(2, 8)}`;
}
