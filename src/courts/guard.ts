/**
 * 取得がうまくいかなかった回の結果を、そのまま公開してよいかの判断(純粋関数)。
 * 公開しなければ、前回のデータが残る(画面には「更新が止まっている」と出る)。
 * 「空きなし」に見える偽のデータを出すより、古くても本物のデータを残すほうがよい。
 */
export interface PublishCheck {
  /** 今回の失敗の件数 */
  errors: number;
  /** 今回まとめた枠の数 */
  curCount: number;
  /** 前回公開したデータの枠の数(なければ 0) */
  prevCount: number;
}

/** 失敗があって、しかも枠が0件、または前回の3割未満に減ったときだけ、公開を見送る */
export function shouldRefusePublish({ errors, curCount, prevCount }: PublishCheck): string | null {
  if (errors === 0) return null; // 失敗がなければ、本当に空きが減っただけ
  if (curCount === 0) return "取得に失敗し、空きが1件も取れていません";
  if (prevCount >= 50 && curCount < prevCount * 0.3) return `取得に失敗し、空きが前回(${prevCount}件)から ${curCount}件に急に減っています`;
  return null;
}
