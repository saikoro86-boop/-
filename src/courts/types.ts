/** 空いている1コマ(画面表示・data.json・取り込みで共通) */
export interface OpenSlot {
  date: string; // YYYY-MM-DD
  site: string;
  facility: string;
  court: string;
  start: number;
  end: number;
}
