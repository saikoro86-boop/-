-- LTA チーム管理: データベース(Supabase の SQL Editor に貼って実行する。何度実行してもよい)
-- 権限はすべてここ(行レベル制限 = RLS)で守る。画面の隠しボタンには頼らない。
-- 役割: coach(監督) / recorder(記録係の選手) / player(選手)
-- ログインは「監督が渡す個人コード」。コードの確認はサーバー側の処理(supabase/functions)で行い、ここには鍵の「ハッシュ」だけを置く。

-- ===== チームと選手 =====
create table if not exists teams (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'player' check (role in ('coach', 'recorder', 'player')),
  team_id bigint references teams on delete set null,
  rank_label text,                       -- 例: S / A / B
  rank_order int,                        -- 小さいほど上位
  bio text,
  avatar_path text,                      -- アイコン写真(本人が選ぶ。Storage の場所)
  active boolean not null default true,  -- 退部したら false(ログイン停止。記録は残る)
  created_at timestamptz not null default now()
);

-- 個人コードのハッシュ。画面(anon/authenticated)からは一切読めない(方針なし = 拒否)。サーバー側の処理だけが触る。
create table if not exists login_codes (
  code_hash text primary key,
  profile_id uuid not null references profiles on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists login_attempts (   -- コードの総当たりを止めるための記録
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_ip_at on login_attempts (ip, at);
alter table login_codes enable row level security;
alter table login_attempts enable row level security;

-- ===== 判定用の関数(RLS の中から使うので security definer) =====
create or replace function is_coach() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach' and active);
$$;
create or replace function is_recorder() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'recorder' and active);
$$;
create or replace function my_team() returns bigint
language sql security definer set search_path = public stable as $$
  select team_id from profiles where id = auth.uid();
$$;

-- サーバー側の処理が選手を作ったとき、プロフィールを自動で作る(役割は必ず player。監督は SQL で手動設定)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, team_id)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 40),
          nullif(new.raw_user_meta_data ->> 'team_id', '')::bigint);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 役割・チーム・ランク・退部は監督だけが変えられる(選手が自分を監督にしたり、退部を取り消したりできないように)
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() が空 = サーバー側の処理や SQL Editor からの操作(ログインした人ではない)。そこは通す
  if auth.uid() is not null and not is_coach() and (new.role, new.team_id, new.rank_label, new.rank_order, new.active)
     is distinct from (old.role, old.team_id, old.rank_label, old.rank_order, old.active) then
    raise exception '役割・チーム・ランク・在籍は監督だけが変更できます';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on profiles;
create trigger profiles_guard_trg before update on profiles for each row execute function profiles_guard();

alter table teams enable row level security;
alter table profiles enable row level security;
drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated using (true);
drop policy if exists teams_write on teams;
create policy teams_write on teams for all to authenticated using (is_coach()) with check (is_coach());
-- 退部した選手の名前は、監督と本人以外には見えない
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (active or id = auth.uid() or is_coach());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_coach()) with check (id = auth.uid() or is_coach());

-- ===== 試合記録: 監督だけが入力。全員が見られる =====
create table if not exists matches (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  player_id uuid references profiles on delete set null,
  played_on date not null,
  tournament text, opponent text, score text,
  result text check (result in ('勝', '負', '引分')),
  memo text,
  file_path text
);
alter table matches enable row level security;
drop policy if exists matches_read on matches;
create policy matches_read on matches for select to authenticated using (true);
drop policy if exists matches_write on matches;
create policy matches_write on matches for all to authenticated using (is_coach()) with check (is_coach());

-- ===== お知らせ(監督 → チーム)。宛先のチームの選手にだけ見える。team_ids が空なら全員 =====
create table if not exists announcements (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  body text not null,
  team_ids bigint[] not null default '{}',
  pinned boolean not null default false
);
alter table announcements enable row level security;
drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select to authenticated
  using (is_coach() or cardinality(team_ids) = 0 or my_team() = any (team_ids));
drop policy if exists announcements_write on announcements;
create policy announcements_write on announcements for all to authenticated using (is_coach()) with check (is_coach());

-- 既読: 画面を開くと自動で付く。本人の分だけ書ける。見られるのは本人と監督だけ
create table if not exists announcement_reads (
  id bigint generated always as identity primary key,
  announcement_id bigint not null references announcements on delete cascade,
  player_id uuid not null default auth.uid() references profiles on delete cascade,
  at timestamptz not null default now(),
  unique (announcement_id, player_id)
);
alter table announcement_reads enable row level security;
drop policy if exists reads_read on announcement_reads;
create policy reads_read on announcement_reads for select to authenticated using (player_id = auth.uid() or is_coach());
drop policy if exists reads_insert on announcement_reads;
create policy reads_insert on announcement_reads for insert to authenticated with check (player_id = auth.uid());

-- ===== 予定と出欠。予定は全員が見られる。team_ids は「出欠の対象」(見える範囲ではない) =====
create table if not exists events (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  kind text check (kind in ('練習', '大会')),
  title text not null, starts_on date,
  team_ids bigint[] not null default '{}',
  place text, url text, memo text
);
alter table events enable row level security;
drop policy if exists events_read on events;
create policy events_read on events for select to authenticated using (true);
drop policy if exists events_write on events;
create policy events_write on events for all to authenticated using (is_coach()) with check (is_coach());

-- 出欠の回答: 同じチームの選手と監督が見られる。書けるのは本人の分だけ
create table if not exists attendance (
  id bigint generated always as identity primary key,
  event_id bigint not null references events on delete cascade,
  player_id uuid not null default auth.uid() references profiles on delete cascade,
  status text not null check (status in ('yes', 'late', 'no')),
  unique (event_id, player_id)
);
alter table attendance enable row level security;
drop policy if exists attendance_read on attendance;
create policy attendance_read on attendance for select to authenticated
  using (player_id = auth.uid() or is_coach() or exists (select 1 from profiles p where p.id = attendance.player_id and p.team_id is not null and p.team_id = my_team()));
drop policy if exists attendance_write on attendance;
create policy attendance_write on attendance for all to authenticated
  using (player_id = auth.uid() or is_coach()) with check (player_id = auth.uid() or is_coach());

-- ===== ニュース・動画: 選手が共有 → 監督が承認してから全員に見える =====
do $$
declare t text;
begin
  foreach t in array array['news', 'videos'] loop
    execute format($f$create table if not exists %I (
      id bigint generated always as identity primary key,
      created_by uuid not null default auth.uid() references profiles,
      created_at timestamptz not null default now(),
      title text not null, url text, memo text,
      %s,
      approved boolean not null default false)$f$, t,
      case when t = 'news' then 'source text' else 'tags text' end);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (approved or created_by = auth.uid() or is_coach())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert to authenticated with check (created_by = auth.uid() and (approved = false or is_coach()))', t || '_insert', t);
    -- 本人が直せるのは「承認前」のものだけ。承認(approved を true に)できるのは監督だけ
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update to authenticated using (is_coach() or (created_by = auth.uid())) with check (is_coach() or (created_by = auth.uid() and approved = false))', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete to authenticated using (created_by = auth.uid() or is_coach())', t || '_delete', t);
  end loop;
end $$;

-- ===== テニスノート: 本人と監督だけ =====
create table if not exists notes (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  noted_on date, title text not null, body text
);
alter table notes enable row level security;
drop policy if exists notes_read on notes;
create policy notes_read on notes for select to authenticated using (created_by = auth.uid() or is_coach());
drop policy if exists notes_insert on notes;
create policy notes_insert on notes for insert to authenticated with check (created_by = auth.uid());
drop policy if exists notes_update on notes;
create policy notes_update on notes for update to authenticated using (created_by = auth.uid() or is_coach()) with check (created_by = auth.uid() or is_coach());
drop policy if exists notes_delete on notes;
create policy notes_delete on notes for delete to authenticated using (created_by = auth.uid() or is_coach());

-- ===== 月の目標とふりかえり: 本人と監督だけ。コメント欄は監督だけが書ける =====
create table if not exists goals (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  player_id uuid not null references profiles on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  goal text not null, reflection text, coach_comment text,
  unique (player_id, month)
);
alter table goals enable row level security;
drop policy if exists goals_read on goals;
create policy goals_read on goals for select to authenticated using (player_id = auth.uid() or is_coach());
drop policy if exists goals_insert on goals;
create policy goals_insert on goals for insert to authenticated
  with check (created_by = auth.uid() and (player_id = auth.uid() or is_coach()));
drop policy if exists goals_update on goals;
create policy goals_update on goals for update to authenticated using (player_id = auth.uid() or is_coach()) with check (player_id = auth.uid() or is_coach());
drop policy if exists goals_delete on goals;
create policy goals_delete on goals for delete to authenticated using (player_id = auth.uid() or is_coach());
create or replace function goals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_coach() then
    if tg_op = 'INSERT' and new.coach_comment is not null then raise exception '監督コメントは監督だけが書けます'; end if;
    if tg_op = 'UPDATE' and new.coach_comment is distinct from old.coach_comment then raise exception '監督コメントは監督だけが書けます'; end if;
  end if;
  return new;
end $$;
drop trigger if exists goals_guard_trg on goals;
create trigger goals_guard_trg before insert or update on goals for each row execute function goals_guard();

-- ===== ミーティング記録: 監督と記録係が書ける。全員が見られる =====
create table if not exists meetings (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  held_on date not null, title text not null, body text, decisions text
);
alter table meetings enable row level security;
drop policy if exists meetings_read on meetings;
create policy meetings_read on meetings for select to authenticated using (true);
drop policy if exists meetings_insert on meetings;
create policy meetings_insert on meetings for insert to authenticated with check (created_by = auth.uid() and (is_coach() or is_recorder()));
drop policy if exists meetings_update on meetings;
create policy meetings_update on meetings for update to authenticated using (is_coach() or (created_by = auth.uid() and is_recorder())) with check (is_coach() or (created_by = auth.uid() and is_recorder()));
drop policy if exists meetings_delete on meetings;
create policy meetings_delete on meetings for delete to authenticated using (is_coach() or (created_by = auth.uid() and is_recorder()));

-- ===== テスト: 問題は監督が作る。結果は全員が見られる =====
create table if not exists quiz_questions (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  level text not null check (level in ('ルール', 'シチュエーション')),
  question text not null,
  choices text not null,                 -- 1行に1つ
  answer int not null check (answer >= 1),
  explanation text
);
alter table quiz_questions enable row level security;
drop policy if exists quiz_read on quiz_questions;
create policy quiz_read on quiz_questions for select to authenticated using (true);
drop policy if exists quiz_write on quiz_questions;
create policy quiz_write on quiz_questions for all to authenticated using (is_coach()) with check (is_coach());

create table if not exists tests (
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  taken_on date not null, title text not null,
  kind text check (kind in ('ルール', 'シチュエーション')),
  player_id uuid references profiles on delete set null,
  score numeric check (score between 0 and 100)
);
alter table tests enable row level security;
drop policy if exists tests_read on tests;
create policy tests_read on tests for select to authenticated using (true);
-- 選手は「自分の結果」だけ追加できる(点数は画面で採点。問題は全員が読めるので、ずるは完全には防げない。監督は消せる)
drop policy if exists tests_insert on tests;
create policy tests_insert on tests for insert to authenticated
  with check (created_by = auth.uid() and (is_coach() or player_id = auth.uid()));
drop policy if exists tests_write on tests;
create policy tests_write on tests for update to authenticated using (is_coach()) with check (is_coach());
drop policy if exists tests_delete on tests;
create policy tests_delete on tests for delete to authenticated using (is_coach());

-- ===== 画像・ファイルの置き場(非公開。ログインした人だけ) =====
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false) on conflict (id) do nothing;
drop policy if exists uploads_read on storage.objects;
create policy uploads_read on storage.objects for select to authenticated using (bucket_id = 'uploads');
drop policy if exists uploads_insert on storage.objects;
create policy uploads_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists uploads_delete on storage.objects;
create policy uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = auth.uid()::text or is_coach()));
