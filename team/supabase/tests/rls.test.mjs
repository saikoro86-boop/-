// 権限(RLS)のテスト。Supabase の土台(auth / storage / ロール)を最小限に再現した PostgreSQL 互換のデータベースで schema.sql を動かし、
// 「だれが何を見られる・書けるか」を確かめる。実行: cd team/supabase/tests && npm i --no-save @electric-sql/pglite && node rls.test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
// Supabase の土台を最小限に再現(auth / storage / ロール)
await db.exec(`
create role authenticated nologin; create role anon nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
`);
const schema = fs.readFileSync((process.argv[2] ?? new URL('../schema.sql', import.meta.url).pathname), 'utf8');
await db.exec(schema);
await db.exec(schema); // 2回実行しても壊れない(何度でも実行できる)
await db.exec(`grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated; grant all on all tables in schema storage to authenticated;
grant usage, select on all sequences in schema public to authenticated; grant execute on all functions in schema public to authenticated;
grant execute on function auth.uid() to authenticated, anon; grant execute on function storage.foldername(text) to authenticated;`);

const ids = {}; // 監督・記録係・Aチーム選手2人・Bチーム選手・退部者
const mk = async (key, name, team) => { const r = await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${key}@x.invalid`, JSON.stringify({ name, team_id: team })]); ids[key] = r.rows[0].id; };
await db.exec(`insert into teams (name) values ('A'), ('B')`);
await mk('coach', '監督', null); await mk('rec', '記録係', 1); await mk('a1', 'A1', 1); await mk('a2', 'A2', 1); await mk('b1', 'B1', 2); await mk('gone', '退部者', 2);
await db.exec(`update profiles set role='coach' where id='${ids.coach}'; update profiles set role='recorder' where id='${ids.rec}'; update profiles set active=false where id='${ids.gone}';`);

let pass = 0, fail = 0;
const as = async (key, sql, params) => { await db.exec(`set role authenticated; set test.uid='${ids[key] ?? ''}'`); try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec(`reset role; set test.uid=''`); } };
const t = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL:', name, extra); } };
const sup = (sql) => db.exec(sql);

// --- 役割と自己昇格 ---
t('選手は自分を監督にできない', !(await as('a1', `update profiles set role='coach' where id='${ids.a1}'`)).ok);
t('選手は自分のランクを変えられない', !(await as('a1', `update profiles set rank_order=1 where id='${ids.a1}'`)).ok);
t('選手は自分の退部を取り消せない', !(await as('gone', `update profiles set active=true where id='${ids.gone}'`)).ok);
t('選手は自分の名前・自己紹介を変えられる', (await as('a1', `update profiles set name='A1改', bio='x' where id='${ids.a1}'`)).ok);
t('監督は役割を変えられる', (await as('coach', `update profiles set role='recorder' where id='${ids.a2}'`)).ok);
await sup(`update profiles set role='player' where id='${ids.a2}'`);
t('退部者の名前は他の選手に見えない', (await as('a1', `select id from profiles where id='${ids.gone}'`)).rows.length === 0);
t('退部者の名前は監督には見える', (await as('coach', `select id from profiles where id='${ids.gone}'`)).rows.length === 1);

// --- ログインコードは画面から読めない ---
await sup(`insert into login_codes (code_hash, profile_id) values ('h', '${ids.a1}')`);
t('選手は login_codes を読めない', (await as('a1', `select * from login_codes`)).rows.length === 0);
t('監督も login_codes を読めない', (await as('coach', `select * from login_codes`)).rows.length === 0);
t('login_codes に書けない', !(await as('coach', `insert into login_codes (code_hash, profile_id) values ('z','${ids.a1}')`)).ok);

// --- 試合記録: 監督だけ ---
t('選手は試合記録を追加できない', !(await as('a1', `insert into matches (played_on, opponent) values (now(), 'x')`)).ok);
t('記録係も試合記録を追加できない', !(await as('rec', `insert into matches (played_on, opponent) values (now(), 'x')`)).ok);
t('監督は試合記録を追加できる', (await as('coach', `insert into matches (played_on, opponent, player_id) values (now(), 'x', '${ids.a1}')`)).ok);
t('選手は試合記録を読める', (await as('b1', `select * from matches`)).rows.length === 1);

// --- お知らせ: 宛先のチームだけ ---
await as('coach', `insert into announcements (body, team_ids) values ('A向け', '{1}'), ('全員', '{}'), ('B向け', '{2}')`);
const seen = async (k) => (await as(k, `select body from announcements order by id`)).rows.map((r) => r.body).join(',');
t('Aチームの選手はA向けと全員を見る', (await seen('a1')) === 'A向け,全員', await seen('a1'));
t('Bチームの選手はB向けと全員を見る', (await seen('b1')) === '全員,B向け', await seen('b1'));
t('監督は全部見る', (await seen('coach')) === 'A向け,全員,B向け');
t('選手はお知らせを送れない', !(await as('a1', `insert into announcements (body) values ('x')`)).ok);

// --- 既読 ---
t('選手は自分の既読を付けられる', (await as('a1', `insert into announcement_reads (announcement_id) values (1)`)).ok);
t('他人の既読は付けられない', !(await as('a1', `insert into announcement_reads (announcement_id, player_id) values (1, '${ids.a2}')`)).ok);
t('既読は本人にしか見えない(他の選手)', (await as('a2', `select * from announcement_reads`)).rows.length === 0);
t('既読は監督に見える', (await as('coach', `select * from announcement_reads`)).rows.length === 1);

// --- 予定と出欠 ---
await as('coach', `insert into events (title, kind, team_ids, starts_on) values ('B練習', '練習', '{2}', now())`);
t('Aチームの選手にも予定は見える', (await as('a1', `select * from events`)).rows.length === 1);
t('選手は予定を追加できない', !(await as('a1', `insert into events (title) values ('x')`)).ok);
await as('a1', `insert into attendance (event_id, status) values (1, 'yes')`);
t('同じチームの出欠は見える', (await as('a2', `select * from attendance`)).rows.length === 1);
t('別チームの出欠は見えない', (await as('b1', `select * from attendance`)).rows.length === 0);
t('他人の出欠は書けない', !(await as('a2', `insert into attendance (event_id, player_id, status) values (1, '${ids.a1}', 'no')`)).ok);
t('出欠は本人が更新できる', (await as('a1', `update attendance set status='late' where event_id=1`)).n === 1);

// --- ニュース: 承認制 ---
t('選手は承認済みとして共有できない', !(await as('a1', `insert into news (title, approved) values ('x', true)`)).ok);
t('選手は共有できる(承認待ち)', (await as('a1', `insert into news (title) values ('承認待ち')`)).ok);
t('承認前は他の選手に見えない', (await as('b1', `select * from news`)).rows.length === 0);
t('承認前は本人に見える', (await as('a1', `select * from news`)).rows.length === 1);
t('承認前は監督に見える', (await as('coach', `select * from news`)).rows.length === 1);
t('本人は自分で承認できない', (await as('a1', `update news set approved=true where title='承認待ち'`)).n === 0 || !(await as('a1', `update news set approved=true where title='承認待ち'`)).ok);
t('監督は承認できる', (await as('coach', `update news set approved=true`)).ok);
t('承認後は他の選手にも見える', (await as('b1', `select * from news`)).rows.length === 1);
t('承認後、本人が直すと(承認待ちに戻さない限り)拒否される', !(await as('a1', `update news set memo='改' where approved=true`)).ok || (await as('b1', `select memo from news`)).rows[0].memo !== '改');
await as('b1', `insert into videos (title) values ('動画')`);
t('動画も承認前は見えない', (await as('a1', `select * from videos`)).rows.length === 0);

// --- ノート: 本人と監督だけ ---
await as('a1', `insert into notes (title) values ('A1のノート')`);
t('ノートは他の選手に見えない', (await as('a2', `select * from notes`)).rows.length === 0);
t('ノートは記録係にも見えない', (await as('rec', `select * from notes`)).rows.length === 0);
t('ノートは本人に見える', (await as('a1', `select * from notes`)).rows.length === 1);
t('ノートは監督に見える', (await as('coach', `select * from notes`)).rows.length === 1);
t('他人のノートは書き換えられない', (await as('a2', `update notes set title='x'`)).n === 0);

// --- 目標 ---
t('選手は自分の目標を書ける', (await as('a1', `insert into goals (player_id, month, goal) values ('${ids.a1}', '2026-11', '目標')`)).ok);
t('他人の名前で目標を書けない', !(await as('a1', `insert into goals (player_id, month, goal) values ('${ids.a2}', '2026-11', 'x')`)).ok);
t('目標は他の選手に見えない', (await as('a2', `select * from goals`)).rows.length === 0);
t('選手は監督コメントを書けない', !(await as('a1', `update goals set coach_comment='自分で褒める'`)).ok);
t('監督はコメントを書ける', (await as('coach', `update goals set coach_comment='いいね'`)).ok);
t('選手はコメントを書かずに更新できる', (await as('a1', `update goals set reflection='ふりかえり'`)).ok);
t('同じ月の目標は1つだけ', !(await as('a1', `insert into goals (player_id, month, goal) values ('${ids.a1}', '2026-11', 'もう1つ')`)).ok);

// --- ミーティング ---
t('選手はミーティングを書けない', !(await as('a1', `insert into meetings (held_on, title) values (now(), 'x')`)).ok);
t('記録係は書ける', (await as('rec', `insert into meetings (held_on, title) values (now(), '記録')`)).ok);
t('監督は書ける', (await as('coach', `insert into meetings (held_on, title) values (now(), '監督')`)).ok);
t('全員が読める', (await as('b1', `select * from meetings`)).rows.length === 2);
t('記録係は他人の記録を消せない', (await as('rec', `delete from meetings where title='監督'`)).n === 0);
await sup(`update profiles set active=false where id='${ids.rec}'`);
t('記録係を外す/退部すると書けなくなる', !(await as('rec', `insert into meetings (held_on, title) values (now(), 'x')`)).ok);
await sup(`update profiles set active=true where id='${ids.rec}'`);

// --- テスト ---
t('選手は問題を作れない', !(await as('a1', `insert into quiz_questions (level, question, choices, answer) values ('ルール','q','a\nb',1)`)).ok);
t('監督は問題を作れる', (await as('coach', `insert into quiz_questions (level, question, choices, answer) values ('ルール','q','a\nb',1)`)).ok);
t('選手は自分の結果を追加できる', (await as('a1', `insert into tests (taken_on, title, kind, player_id, score) values (now(),'ルールテスト','ルール','${ids.a1}',80)`)).ok);
t('他人の名前で結果を追加できない', !(await as('a1', `insert into tests (taken_on, title, kind, player_id, score) values (now(),'x','ルール','${ids.a2}',100)`)).ok);
t('範囲外の点数は入らない', !(await as('a1', `insert into tests (taken_on, title, kind, player_id, score) values (now(),'x','ルール','${ids.a1}',999)`)).ok);
t('選手は結果を書き換えられない', (await as('a1', `update tests set score=100`)).n === 0);
t('結果は全員が見られる', (await as('b1', `select * from tests`)).rows.length === 1);

// --- 保存場所 ---
await sup(`insert into storage.objects (bucket_id, name, owner) values ('uploads', '${ids.a1}/a.png', '${ids.a1}')`);
t('自分のフォルダにだけアップロードできる', (await as('a1', `insert into storage.objects (bucket_id, name) values ('uploads', '${ids.a1}/b.png')`)).ok);
t('他人のフォルダにはアップロードできない', !(await as('a1', `insert into storage.objects (bucket_id, name) values ('uploads', '${ids.a2}/b.png')`)).ok);

console.log(`\n${pass} 件OK / ${fail} 件NG`);
process.exit(fail ? 1 : 0);
