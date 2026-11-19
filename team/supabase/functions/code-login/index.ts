// 個人コードでのログイン。コードが正しければ、そのスマホ用のログイン情報(セッション)を返す。
// コードの総当たりを防ぐため、同じ接続元から10分に10回までしか試せない。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { cors, hashCode, json, normalizeCode } from '../_shared/common.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_TRIES = 10;
const WINDOW_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(url, serviceKey);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin.from('login_attempts').select('*', { count: 'exact', head: true }).eq('ip', ip).gte('at', since);
    if ((count ?? 0) >= MAX_TRIES) return json({ error: 'too_many' }, 429);

    const fail = async () => { await admin.from('login_attempts').insert({ ip }); return json({ error: 'invalid' }, 401); };

    const code = normalizeCode((await req.json()).code);
    if (code.length !== 8) return await fail();

    const { data: row } = await admin.from('login_codes').select('profile_id').eq('code_hash', await hashCode(code)).eq('revoked', false).maybeSingle();
    if (!row) return await fail();

    const { data: prof } = await admin.from('profiles').select('active').eq('id', row.profile_id).single();
    if (!prof?.active) return await fail();

    // サーバー側だけで使える一回限りのリンクを作り、その場で使ってセッションに交換する
    const { data: user } = await admin.auth.admin.getUserById(row.profile_id);
    const email = user.user?.email;
    if (!email) return await fail();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties?.hashed_token) throw linkError ?? new Error('generateLink failed');
    const { data: session, error: verifyError } = await createClient(url, anonKey).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' });
    if (verifyError || !session.session) throw verifyError ?? new Error('verifyOtp failed');

    return json({ access_token: session.session.access_token, refresh_token: session.session.refresh_token });
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
