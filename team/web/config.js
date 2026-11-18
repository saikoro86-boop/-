// Supabase の「Project Settings → API」の値を入れる。
// anon キーは公開前提の鍵で、守っているのは schema.sql の RLS(ログイン必須)。service_role キーは絶対に入れない。
window.TEAM_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',
};
