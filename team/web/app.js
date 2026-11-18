// テニスチーム管理: 画面の組み立て。
// 各コンテンツは SECTIONS の設定1つで「一覧 + 追加/編集フォーム」が出る(新しい項目は設定を足すだけ)。
// 外から来た文字列は必ず textContent で入れる(innerHTML は使わない)。
'use strict';

const sb = window.supabase.createClient(window.TEAM_CONFIG.SUPABASE_URL, window.TEAM_CONFIG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// field.type: text / textarea / date / number / url / select(options) / player(選手を選ぶ) / file
const SECTIONS = [
  { id: 'players', label: '選手', table: 'profiles', title: 'name', order: ['rank_order', true], noAdd: true, noDelete: true,
    fields: [
      { key: 'name', label: '名前', type: 'text', required: true },
      { key: 'bio', label: '自己紹介・プレースタイル', type: 'textarea' },
      { key: 'rank_label', label: 'ランク', type: 'text', coachOnly: true },
      { key: 'rank_order', label: 'ランク順(小さいほど上位)', type: 'number', coachOnly: true },
      { key: 'team_id', label: 'チーム', type: 'team', coachOnly: true },
    ] },
  { id: 'matches', label: '試合記録', table: 'matches', title: 'opponent', order: ['played_on', false],
    fields: [
      { key: 'played_on', label: '日付', type: 'date', required: true },
      { key: 'player_id', label: '選手', type: 'player' },
      { key: 'opponent', label: '対戦相手', type: 'text', required: true },
      { key: 'tournament', label: '大会・試合名', type: 'text' },
      { key: 'score', label: 'スコア', type: 'text' },
      { key: 'result', label: '結果', type: 'select', options: ['勝', '負', '引分'] },
      { key: 'memo', label: 'メモ', type: 'textarea' },
      { key: 'file_path', label: '画像・ファイル', type: 'file' },
    ] },
  { id: 'events', label: '試合情報', table: 'events', title: 'title', order: ['starts_on', true],
    fields: [
      { key: 'title', label: '大会名', type: 'text', required: true },
      { key: 'starts_on', label: '開催日', type: 'date' },
      { key: 'place', label: '場所', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'memo', label: 'メモ', type: 'textarea' },
    ] },
  { id: 'news', label: 'ニュース', table: 'news', title: 'title', order: ['created_at', false],
    fields: [
      { key: 'title', label: 'タイトル', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'source', label: '出どころ', type: 'text' },
      { key: 'memo', label: 'ひとこと', type: 'textarea' },
    ] },
  { id: 'videos', label: '動画', table: 'videos', title: 'title', order: ['created_at', false],
    fields: [
      { key: 'title', label: 'タイトル', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'tags', label: 'タグ(例: サーブ, バックハンド)', type: 'text' },
      { key: 'memo', label: 'ポイント', type: 'textarea' },
    ] },
  { id: 'prices', label: '最安値', table: 'prices', title: 'item', order: ['item', true],
    fields: [
      { key: 'item', label: '商品名', type: 'text', required: true },
      { key: 'price', label: '価格(円)', type: 'number' },
      { key: 'shop', label: '店', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'checked_on', label: '確認日', type: 'date' },
    ] },
  { id: 'notes', label: 'ノート', table: 'notes', title: 'title', order: ['noted_on', false],
    fields: [
      { key: 'noted_on', label: '日付', type: 'date' },
      { key: 'title', label: 'タイトル', type: 'text', required: true },
      { key: 'body', label: '内容', type: 'textarea' },
    ] },
  { id: 'meetings', label: 'ミーティング', table: 'meetings', title: 'title', order: ['held_on', false],
    fields: [
      { key: 'held_on', label: '日付', type: 'date', required: true },
      { key: 'title', label: 'テーマ', type: 'text', required: true },
      { key: 'body', label: '内容', type: 'textarea' },
      { key: 'decisions', label: '決まったこと', type: 'textarea' },
    ] },
  { id: 'tests', label: 'テスト', table: 'tests', title: 'title', order: ['taken_on', false],
    fields: [
      { key: 'taken_on', label: '実施日', type: 'date', required: true },
      { key: 'title', label: 'テスト名', type: 'text', required: true },
      { key: 'kind', label: '種類', type: 'select', options: ['筆記', '実技', '体力'] },
      { key: 'player_id', label: '選手', type: 'player' },
      { key: 'score', label: '点数', type: 'number' },
      { key: 'comment', label: 'コメント', type: 'text' },
    ] },
  { id: 'ranking', label: 'ランク', custom: true },
];

const state = { me: null, players: [], teams: [], editing: null };
const isCoach = () => state.me?.role === 'coach';

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n[k] = v;
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : null;
const playerName = (id) => state.players.find((p) => p.id === id)?.name || '';
const teamName = (id) => state.teams.find((t) => t.id === id)?.name || '';

// ---------- ログイン ----------
function showLogin(message) {
  $('nav').hidden = true; $('logout').hidden = true;
  const email = el('input', { type: 'email', placeholder: 'メールアドレス', autocomplete: 'email' });
  const msg = el('p', { class: 'msg', textContent: message || '' });
  const btn = el('button', { class: 'primary', textContent: 'ログイン用リンクを送る', onclick: async () => {
    msg.textContent = '送信中…';
    // shouldCreateUser:false … 監督が招待した人だけが入れる(知らない人は新規登録できない)
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    msg.textContent = error ? '送れませんでした。招待されたメールアドレスか確認してください。' : 'メールを送りました。届いたリンクを開いてください。';
  } });
  $('main').replaceChildren(el('div', { class: 'card' }, el('h3', { textContent: 'ログイン' }),
    el('p', { class: 'row', textContent: 'メンバーだけが入れます。パスワードは不要で、メールのリンクで入ります。' }), email, el('div', { class: 'actions' }, btn), msg));
}

// ---------- 一覧 ----------
async function signedUrl(path) {
  const { data } = await sb.storage.from('uploads').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

function renderFileInto(box, path) {
  signedUrl(path).then((u) => {
    if (!u) return;
    if (/\.(png|jpe?g|gif|webp|heic)$/i.test(path)) box.append(el('img', { class: 'thumb', src: u, alt: '添付画像', loading: 'lazy' }));
    else box.append(el('a', { href: u, target: '_blank', rel: 'noopener', textContent: '📎 添付ファイルを開く' }));
  });
}

function renderCard(sec, row) {
  const card = el('div', { class: 'card' }, el('h3', { textContent: String(row[sec.title] ?? '(無題)') }));
  for (const f of sec.fields) {
    if (f.key === sec.title || row[f.key] == null || row[f.key] === '') continue;
    if (f.type === 'file') { const box = el('div'); card.append(box); renderFileInto(box, row[f.key]); continue; }
    let v = row[f.key];
    if (f.type === 'player') v = playerName(v);
    if (f.type === 'team') v = teamName(v);
    const line = el('div', { class: 'row' }, el('b', { textContent: f.label + ': ' }));
    if (f.type === 'url' && safeUrl(v)) line.append(el('a', { href: v, target: '_blank', rel: 'noopener', textContent: v }));
    else line.append(document.createTextNode(String(v)));
    card.append(line);
  }
  const mine = sec.table === 'profiles' ? row.id === state.me.id : row.created_by === state.me.id;
  const actions = el('div', { class: 'actions' });
  if (mine || isCoach()) actions.append(el('button', { textContent: '編集', onclick: () => { state.editing = { sec: sec.id, row }; render(); scrollTo(0, 0); } }));
  if (!sec.noDelete && (mine || isCoach())) actions.append(el('button', { class: 'danger', textContent: '削除', onclick: async () => {
    if (!confirm('削除しますか?')) return;
    const { error } = await sb.from(sec.table).delete().eq('id', row.id);
    if (error) alert('削除できませんでした'); else render();
  } }));
  if (actions.children.length) card.append(actions);
  return card;
}

// ---------- フォーム ----------
function buildForm(sec, row) {
  const form = el('form', { class: 'card' });
  const inputs = {};
  for (const f of sec.fields) {
    if (f.coachOnly && !isCoach()) continue;
    let input;
    if (f.type === 'textarea') input = el('textarea');
    else if (f.type === 'select') input = el('select', {}, el('option', { value: '', textContent: '—' }), f.options.map((o) => el('option', { value: o, textContent: o })));
    else if (f.type === 'player') input = el('select', {}, el('option', { value: '', textContent: '—' }), state.players.map((p) => el('option', { value: p.id, textContent: p.name })));
    else if (f.type === 'team') input = el('select', {}, el('option', { value: '', textContent: '—' }), state.teams.map((t) => el('option', { value: t.id, textContent: t.name })));
    else if (f.type === 'file') input = el('input', { type: 'file', accept: 'image/*,.pdf,.csv,.xlsx,.docx' });
    else input = el('input', { type: f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text', step: f.type === 'number' ? 'any' : undefined });
    if (f.type !== 'file' && row && row[f.key] != null) input.value = row[f.key];
    input.required = !!f.required;
    inputs[f.key] = input;
    form.append(el('label', { textContent: f.label }), input);
  }
  const msg = el('p', { class: 'msg' });
  form.append(msg, el('div', { class: 'actions' },
    el('button', { class: 'primary', type: 'submit', textContent: row ? '更新' : '追加' }),
    row ? el('button', { type: 'button', textContent: 'やめる', onclick: () => { state.editing = null; render(); } }) : null));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '保存中…';
    const payload = {};
    for (const f of sec.fields) {
      const inp = inputs[f.key]; if (!inp) continue;
      if (f.type === 'file') {
        const file = inp.files[0]; if (!file) continue;
        if (file.size > 20 * 1024 * 1024) { msg.textContent = 'ファイルは20MBまでです'; return; }
        const path = `${state.me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const up = await sb.storage.from('uploads').upload(path, file);
        if (up.error) { msg.textContent = 'アップロードできませんでした'; return; }
        payload[f.key] = path;
      } else {
        const v = inp.value;
        payload[f.key] = v === '' ? null : (f.type === 'number' || f.type === 'team') ? Number(v) : v;
      }
    }
    const q = row ? sb.from(sec.table).update(payload).eq('id', row.id) : sb.from(sec.table).insert(payload);
    const { error } = await q;
    if (error) { msg.textContent = '保存できませんでした: ' + error.message; return; }
    state.editing = null; render();
  });
  return el('details', { open: !!row }, el('summary', { textContent: row ? '編集中' : '＋ 追加する' }), form);
}

// ---------- ランク・チーム(読み取り中心) ----------
async function renderRanking(main) {
  const rows = [...state.players].sort((a, b) => (a.rank_order ?? 1e9) - (b.rank_order ?? 1e9));
  const groups = new Map();
  for (const p of rows) { const k = teamName(p.team_id) || 'チーム未設定'; (groups.get(k) || groups.set(k, []).get(k)).push(p); }
  for (const [team, ps] of groups) {
    const card = el('div', { class: 'card' }, el('h3', { textContent: team }));
    for (const p of ps) card.append(el('div', { class: 'row' }, el('b', { textContent: (p.rank_label || '—') + '  ' }), document.createTextNode(p.name)));
    main.append(card);
  }
  if (isCoach()) main.append(el('button', { textContent: '＋ チームを追加', onclick: async () => {
    const name = prompt('チーム名'); if (!name) return;
    const { error } = await sb.from('teams').insert({ name }); if (error) alert('追加できませんでした'); else { await loadRefs(); render(); }
  } }), el('p', { class: 'row', textContent: 'ランク・チームの割り当ては「選手」タブの編集から(監督のみ)。' }));
}

// ---------- 全体 ----------
async function loadRefs() {
  const [p, t] = await Promise.all([sb.from('profiles').select('*'), sb.from('teams').select('*').order('name')]);
  state.players = p.data || []; state.teams = t.data || [];
  state.me = state.players.find((x) => x.id === state.session.user.id) || null;
}

async function render() {
  const id = location.hash.slice(1) || SECTIONS[0].id;
  const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
  $('nav').replaceChildren(...SECTIONS.map((s) => el('a', { href: '#' + s.id, class: s.id === sec.id ? 'on' : '', textContent: s.label })));
  const main = el('main'); main.id = 'main';
  if (sec.custom) { await renderRanking(main); $('main').replaceWith(main); return; }
  const editRow = state.editing?.sec === sec.id ? state.editing.row : null;
  if (!sec.noAdd || editRow) main.append(buildForm(sec, editRow));
  const [col, asc] = sec.order;
  const { data, error } = await sb.from(sec.table).select('*').order(col, { ascending: asc, nullsFirst: false });
  if (error) main.append(el('p', { class: 'msg', textContent: '読み込めませんでした' }));
  for (const row of data || []) main.append(renderCard(sec, row));
  if (!(data || []).length) main.append(el('p', { class: 'row', textContent: 'まだ登録がありません。' }));
  $('main').replaceWith(main);
}

async function start() {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (!state.session) return showLogin();
  await loadRefs();
  if (!state.me) return showLogin('プロフィールが見つかりません。監督に連絡してください。');
  $('nav').hidden = false; $('logout').hidden = false;
  render();
}

$('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; showLogin(); });
window.addEventListener('hashchange', () => { state.editing = null; if (state.session) render(); });
start();
