// 個人コードの扱い(作る・ハッシュにする)と、応答の共通部分。
// コードそのものは保存しない。保存するのは「ハッシュ」だけ(データベースが漏れても、コードは分からない)。
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// 紛らわしい文字(0 O 1 I L)を除いた31文字。8文字 = 約8.5兆通り
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// 偏りのない乱数で8文字のコードを作る(248 以上の値は捨てて、31で割ったあまりの偏りをなくす)
export function newCode(len = 8): string {
  let out = '';
  while (out.length < len) {
    const buf = crypto.getRandomValues(new Uint8Array(len * 2));
    for (const b of buf) {
      if (b < 248 && out.length < len) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

// 入力ゆれ(小文字・空白・ハイフン)をそろえる
export function normalizeCode(input: unknown): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ペッパー(サーバー側だけが持つ秘密)を混ぜた SHA-256。ペッパーが無いときは動かさない
export async function hashCode(code: string): Promise<string> {
  const pepper = Deno.env.get('CODE_PEPPER');
  if (!pepper) throw new Error('CODE_PEPPER が設定されていません');
  const data = new TextEncoder().encode(`${pepper}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
