/**
 * 取得した結果を、サイトの種類ごとの取得処理から集めておく入れ物。
 * 取得処理は「入れ物に積む」だけ。公開データへの組み立ては publish.ts が行う。
 */
import type { Failure, OpenSlot } from "../types";
import { mergeStates, type FacilityState } from "../status";

/** 空きがない施設・日の理由(d=日付, s=エリア, f=施設, t=full|closed|unpub, l=ラベル) */
export interface StatusRow {
  d: string;
  s: string;
  f: string;
  t: FacilityState;
  l?: string;
}

/** ネット予約の受付外の枠があるときの問い合わせ先 */
export interface ContactInfo {
  tel?: string;
  hours?: string;
  via?: string;
  unconfirmed?: boolean;
}

/** 取得の範囲 */
export interface CollectContext {
  /** 取得する日付(今日から days 日分。日本時間) */
  dates: string[];
  /** 奈良スーパーアプリの枠のうち、公開する日付の範囲 */
  first: string;
  last: string;
  /** 「いつでも貸館」の目的コード */
  purpose: { type: string; codes: string[] };
}

export class Collected {
  slots: OpenSlot[] = [];
  /** 画面に出す、取得失敗の件数のもと(詳細な原因は含めない) */
  errors: string[] = [];
  /** 取得できなかったエリア・日(「空きなし」と区別して見せるため) */
  failures: Failure[] = [];
  /** 「エリア|施設名」→ 問い合わせ先 */
  contacts: Record<string, ContactInfo> = {};
  /** 自動で見つけた市町村(エリアのボタンに使う) */
  discovered = new Set<string>();
  /** 設備名に「テニス」を含まない建物(体育館・競技場など)がある施設 / 含む建物がある施設 */
  gymFacilities = new Set<string>();
  namedFacilities = new Set<string>();
  /** 「エリア|施設名|コート名」→ 公式サイトの検索で使う目的コード(奈良市・生駒市) */
  courtCodes: Record<string, string> = {};
  /** 奈良スーパーアプリの施設の、案内ページ(公式。料金などが載っていることが多い) */
  nsaInfoLinks: { site: string; match: string; url: string }[] = [];
  /** 「エリア|施設名」→ その施設の予約サイトのURL(時間をタップしたときの行き先) */
  facilityUrls: Record<string, string> = {};

  private statusMap = new Map<string, StatusRow>();

  /** 空きがない施設・日の理由を記録する(空き枠がある日は記録しない)。同じ施設の複数の建物は、空きに近い状態にまとめる */
  setStatus(site: string, facility: string, d: string, t: FacilityState, l?: string) {
    if (t === "open") return;
    const k = `${site}|${facility}|${d}`;
    const row: StatusRow = { d, s: site, f: facility, t, ...(l ? { l } : {}) };
    const prev = this.statusMap.get(k);
    if (!prev || (mergeStates(prev.t, t) === t && prev.t !== t)) this.statusMap.set(k, row);
  }

  get status(): StatusRow[] {
    return [...this.statusMap.values()];
  }

  /**
   * 取得に失敗したことを記録する。message は画面の件数に、site(と date)は「取得できなかった範囲」になる。
   * 公開されるので、URL・ID・エラーの詳細は含めない(詳細はログにだけ出す)
   */
  fail(site: string, message: string, date?: string) {
    this.errors.push(message);
    this.failures.push(date ? { s: site, d: date } : { s: site });
  }
}
