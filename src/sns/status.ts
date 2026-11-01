import type { DraftStatus } from "./types";

export const DRAFT_STATUSES: readonly DraftStatus[] = ["pending", "approved", "rejected", "posted", "failed"];

/** `list` のステータス絞り込み引数を検証する。未指定なら undefined(絞り込みなし) */
export function parseStatusFilter(value: string | undefined): DraftStatus | undefined {
  if (value === undefined) return undefined;
  if (!(DRAFT_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`未対応のステータスです: ${value} (${DRAFT_STATUSES.join(" | ")})`);
  }
  return value as DraftStatus;
}
