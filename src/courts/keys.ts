/**
 * 施設・コートを指す「鍵」の作り方と、名前のそろえ方。
 * 「エリア|施設名」は、お気に入り・非表示の保存(画面)、公式ページ・位置・料金の対応づけの鍵でもある。
 * 形を変えると、利用者の設定が外れるので、変えないこと。
 */

/** 全角英数(テニスコートＡ)を半角にそろえ、前後の空白を除く。奈良市・生駒市・奈良スーパーアプリ・木津川市の表記を合わせるため */
export const normName = (s: string) => s.normalize("NFKC").trim();

/** 「エリア|施設名」 */
export const facilityKey = (site: string, facility: string) => `${site}|${facility}`;

/** 「エリア|施設名|コート名」 */
export const courtKey = (site: string, facility: string, court: string) => `${site}|${facility}|${court}`;
