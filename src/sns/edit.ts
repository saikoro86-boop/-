import type { Draft } from "./types";

/**
 * 下書きの本文を書き換え、承認待ち(pending)に戻す。
 * 投稿済みの下書きを pending に戻すと、再承認で二重投稿になるため拒否する。
 */
export function applyEdit(draft: Draft, text: string): void {
  if (draft.status === "posted") {
    throw new Error(`${draft.id} は投稿済みのため編集できません`);
  }
  draft.text = text;
  draft.status = "pending"; // 編集したら承認し直す
  delete draft.error;
}
