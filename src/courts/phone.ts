import type { CourtAvailability } from "./kashikan";

/**
 * 予約サイトが「空き」を出していない日(◯でも×でもない特別な記号で表示される日)を、施設ごとに拾う。
 * 例: 生駒市は直近の日付が「●」表示(クリックして予約もできない)になる。
 * この場合「空きなし」ではなく「ネットでは分からない → 電話で確認」と案内するために使う。
 */
export function facilitiesWithMarks(courts: CourtAvailability[], marks: string[]): string[] {
  const set = new Set<string>();
  for (const c of courts) if (c.slots.some((s) => marks.includes(s.mark))) set.add(c.facility);
  return [...set];
}

export interface Contact {
  match: string; // 施設名に含まれる文字列
  tel: string;
  hours?: string;
}

/** 施設名に合う連絡先を返す(最初に一致したもの) */
export function findContact(contacts: Contact[], facility: string): Contact | undefined {
  return contacts.find((c) => facility.includes(c.match));
}
