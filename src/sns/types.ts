export const PLATFORMS = ["x", "threads", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];

/**
 * pending  : AIが作成した下書き（人の確認待ち）
 * approved : 人が承認済み（予約時刻になったら投稿される）
 * rejected : 却下
 * posted   : 投稿完了
 * failed   : 投稿に失敗（error を確認して approve し直すと再投稿される）
 */
export type DraftStatus = "pending" | "approved" | "rejected" | "posted" | "failed";

export interface Draft {
  id: string;
  platform: Platform;
  theme: string;
  text: string;
  imageUrl?: string;
  /** ISO 8601。未指定なら承認後の次回 publish で即投稿 */
  scheduledAt?: string;
  status: DraftStatus;
  createdAt: string;
  postedAt?: string;
  postedId?: string;
  error?: string;
}
