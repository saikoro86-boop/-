export interface Contact {
  match: string; // 施設名に含まれる文字列
  tel: string;
  hours?: string;
}

/** 施設名に合う連絡先を返す(最初に一致したもの) */
export function findContact(contacts: Contact[], facility: string): Contact | undefined {
  return contacts.find((c) => facility.includes(c.match));
}
