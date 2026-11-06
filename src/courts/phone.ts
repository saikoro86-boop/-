export interface Contact {
  match: string; // 施設名に含まれる文字列
  tel: string;
  hours?: string;
  /** その施設の申込・問い合わせを受ける窓口(例: 「南部生涯スポーツセンター(申込先)」)。施設自身の番号なら省く */
  via?: string;
  /** 施設自身の番号が確認できず、窓口(via)の番号で代用しているとき true */
  unconfirmed?: boolean;
}

/** 施設名に合う連絡先を返す(最初に一致したもの。「富雄南」を「富雄」より先に並べるなど、順序に注意) */
export function findContact(contacts: Contact[], facility: string): Contact | undefined {
  return contacts.find((c) => facility.includes(c.match));
}
