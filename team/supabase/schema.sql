-- テニスチーム管理システムのデータベース(Supabase の SQL Editor に貼って実行)
-- 方針: ログインした人は全員が閲覧でき、書き込みは自分のものだけ。監督(coach)は全部直せる。

-- ===== チームと選手 =====
create table if not exists teams (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'player' check (role in ('coach', 'player')),
  team_id bigint references teams on delete set null,
  rank_label text,            -- 例: 「S」「A」「1軍」
  rank_order int,             -- 小さいほど上位(並び順用)
  bio text,
  created_at timestamptz not null default now()
);

-- 監督かどうか。RLS の中から使うので security definer(profiles の RLS を素通りさせる)
create or replace function is_coach() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$;

-- 招待された人が初めてログインしたとき、自動で選手として登録する
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(split_part(new.email, '@', 1), ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 役割・チーム・ランクは監督だけが変えられる(選手が自分を監督にできないように)
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_coach() and (new.role, new.team_id, new.rank_label, new.rank_order)
     is distinct from (old.role, old.team_id, old.rank_label, old.rank_order) then
    raise exception '役割・チーム・ランクは監督だけが変更できます';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on profiles;
create trigger profiles_guard_trg before update on profiles
  for each row execute function profiles_guard();

alter table teams enable row level security;
alter table profiles enable row level security;

drop policy if exists teams_read on teams;
create policy teams_read on teams for select to authenticated using (true);
drop policy if exists teams_write on teams;
create policy teams_write on teams for all to authenticated using (is_coach()) with check (is_coach());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid() or is_coach()) with check (id = auth.uid() or is_coach());

-- ===== 各コンテンツ(どれも同じ形: 誰が作ったかを持つ) =====
create table if not exists matches (       -- 試合記録
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  player_id uuid references profiles on delete set null,
  played_on date not null,
  tournament text, opponent text, score text,
  result text check (result in ('勝', '負', '引分')),
  memo text,
  file_path text                            -- 画像・ファイル(Storage の uploads 内の場所)
);
create table if not exists news (          -- ニュース(第1段は手で登録。自動取得は後で)
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  title text not null, url text, source text, memo text
);
create table if not exists events (        -- 試合情報
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  title text not null, starts_on date, place text, url text, memo text
);
create table if not exists videos (        -- 動画
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  title text not null, url text, tags text, memo text
);
create table if not exists prices (        -- 最安値(商品ごとに、見つけた店と価格を記録)
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  item text not null, shop text, price int, url text, checked_on date
);
create table if not exists notes (         -- テニスノート
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  noted_on date, title text not null, body text
);
create table if not exists meetings (      -- ミーティング記録
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  held_on date not null, title text not null, body text, decisions text
);
create table if not exists tests (         -- テスト(1行 = 1人の1回分の結果)
  id bigint generated always as identity primary key,
  created_by uuid not null default auth.uid() references profiles,
  created_at timestamptz not null default now(),
  taken_on date not null, title text not null,
  kind text check (kind in ('筆記', '実技', '体力')),
  player_id uuid references profiles on delete set null,
  score numeric, comment text
);

-- 同じ規則を一括で付ける: 全員が読める / 書くのは自分の名前で / 直す・消すのは本人か監督
do $$
declare t text;
begin
  foreach t in array array['matches','news','events','videos','prices','notes','meetings','tests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert to authenticated with check (created_by = auth.uid())', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update to authenticated using (created_by = auth.uid() or is_coach()) with check (created_by = auth.uid() or is_coach())', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete to authenticated using (created_by = auth.uid() or is_coach())', t || '_delete', t);
  end loop;
end $$;

-- ===== 画像・ファイルの置き場(非公開。ログインした人だけが見られる) =====
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
  on conflict (id) do nothing;

drop policy if exists uploads_read on storage.objects;
create policy uploads_read on storage.objects for select to authenticated using (bucket_id = 'uploads');
drop policy if exists uploads_insert on storage.objects;
create policy uploads_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists uploads_delete on storage.objects;
create policy uploads_delete on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = auth.uid()::text or is_coach()));
