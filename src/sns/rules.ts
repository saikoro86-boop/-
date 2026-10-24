import { xWeightedLength } from "./publishers";
import type { Draft } from "./types";

export function lengthWarning(draft: Draft): string | undefined {
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

/** 投稿済みの下書きを編集すると pending に戻り、承認し直すと二重投稿になるため拒否する */
export function assertEditable(draft: Draft): void {
  if (draft.status === "posted") throw new Error(`${draft.id} は投稿済みのため編集できません`);
}
