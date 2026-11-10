/** 空いている1コマ(画面表示・data.json・取り込みで共通) */
export interface OpenSlot {
  date: string; // YYYY-MM-DD
  site: string;
  facility: string;
  court: string;
  start: number;
  end: number;
  /** 空きだが、ネット予約の受付外(電話・窓口での予約)。予約サイトの「●」 */
  offline?: true;
}

/**
 * 取得できなかった範囲。site はエリア名、date を省くと「そのエリア全体(日付を問わない)」。
 * 「空きなし」とは別物なので、画面で区別して見せる。公開データに入れるので、URL・ID・エラーの詳細は含めない
 */
export interface Failure {
  s: string;
  d?: string;
}
