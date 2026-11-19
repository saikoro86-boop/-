// 監督だけが使える選手の管理: 追加(コード発行)・コードの再発行・退部。
// 呼び出した人が監督かどうかは、ここで必ず確かめる(画面の制限には頼らない)。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { cors, hashCode, json, newCode } from '../_shared/common.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // 1) 呼び出した人を確かめる
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: auth } = await caller.auth.getUser();
    if (!auth.user) return json({ error: 'unauthorized' }, 401);
    const admin = createClient(url, serviceKey);
    const { data: me } = await admin.from('profiles').select('role, active').eq('id', auth.user.id).single();
    if (me?.role !== 'coach' || !me.active) return json({ error: 'forbidden' }, 403);

    const body = await req.json();
    const action = body.action ?? 'create';

    // 新しいコードを作って、ハッシュだけ保存する(それまでのコードは無効にする)
    const issue = async (profileId: string) => {
      await admin.from('login_codes').update({ revoked: true }).eq('profile_id', profileId);
      const code = newCode();
      const { error } = await admin.from('login_codes').insert({ code_hash: await hashCode(code), profile_id: profileId });
      if (error) throw error;
      return code;
    };

    if (action === 'create') {
      const name = String(body.name ?? '').trim().slice(0, 40);
      if (!name) return json({ error: 'name_required' }, 400);
      const teamId = body.team_id == null ? null : Number(body.team_id);
      // ログインはコードで行うので、メールアドレスは使わない見せかけのもの(届かない・推測されない)
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${crypto.randomUUID()}@lta.invalid`,
        email_confirm: true,
        user_metadata: { name, team_id: teamId },
      });
      if (error || !created.user) throw error ?? new Error('createUser failed');
      return json({ id: created.user.id, code: await issue(created.user.id) });
    }

    // 以降は対象の選手が必要。監督自身は対象にできない
    const playerId = String(body.player_id ?? '');
    const { data: target } = await admin.from('profiles').select('id, role').eq('id', playerId).single();
    if (!target || target.role === 'coach') return json({ error: 'invalid_target' }, 400);

    if (action === 'reissue') return json({ code: await issue(playerId) });

    if (action === 'retire') {
      await admin.from('profiles').update({ active: false }).eq('id', playerId);
      await admin.from('login_codes').update({ revoked: true }).eq('profile_id', playerId);
      // すでにログイン済みのスマホも、数時間以内に入れなくなる(約10年の利用停止)
      await admin.auth.admin.updateUserById(playerId, { ban_duration: '87600h' });
      return json({ ok: true });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'server_error' }, 500);
  }
});
