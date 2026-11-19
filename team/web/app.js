// テニスチーム管理: 画面の組み立て。
// 追加・編集フォームは SECTIONS の設定から作る(新しい項目は設定を足すだけ)。
// 外から来た文字列は必ず textContent で入れる(innerHTML は使わない)。
// 権限: coach(監督) / recorder(記録係の選手) / player(選手)。本当の制限はデータベース側(RLS)が行い、
// ここの絞り込みは「見せない・出さない」ための画面側の補助。
'use strict';

const sb = window.supabase.createClient(window.TEAM_CONFIG.SUPABASE_URL, window.TEAM_CONFIG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// field.type: text / textarea / date / month / number / url / select(options) / player / team / teams(複数) / bool / file
// add: 追加できる役割(省略 = 全員)。private: 本人と監督だけが見られる。
const SECTIONS = {
  players: { label: '選手', table: 'profiles', title: 'name', order: ['rank_order', true], noAdd: true, noDelete: true, fields: [
    { key: 'name', label: '名前', type: 'text', required: true },
    { key: 'bio', label: '自己紹介・プレースタイル', type: 'textarea' },
    { key: 'avatar_path', label: 'アイコン写真(好きな写真でOK)', type: 'file', accept: 'image/*' },
    { key: 'rank_label', label: 'ランク(例: S, A, B)', type: 'text', coachOnly: true },
    { key: 'rank_order', label: 'ランク順(小さいほど上位)', type: 'number', coachOnly: true },
    { key: 'team_id', label: 'チーム', type: 'team', coachOnly: true },
    { key: 'role', label: '役割(記録係にするとミーティングを書ける)', type: 'select', options: ['player', 'recorder'], names: ['選手', '記録係'], coachOnly: true, noBlank: true }] },
  matches: { label: '試合記録', table: 'matches', title: 'opponent', order: ['played_on', false], add: ['coach'], fab: '＋ 試合を記録', fields: [
    { key: 'played_on', label: '日付', type: 'date', required: true },
    { key: 'player_id', label: '選手', type: 'player' },
    { key: 'opponent', label: '対戦相手', type: 'text', required: true },
    { key: 'tournament', label: '大会・試合名', type: 'text' },
    { key: 'score', label: 'スコア(例: 6-4, 3-6, 7-5)', type: 'text' },
    { key: 'result', label: '結果', type: 'select', options: ['勝', '負', '引分'] },
    { key: 'memo', label: '反省・メモ', type: 'textarea' },
    { key: 'file_path', label: '画像・ファイル(スコア表の写真など)', type: 'file' }] },
  announcements: { label: 'お知らせ', table: 'announcements', title: 'body', order: ['created_at', false], add: ['coach'], icon: '📣', hint: '監督からの連絡', fab: '＋ お知らせを送る', fields: [
    { key: 'body', label: '内容(URLも貼れます)', type: 'textarea', required: true },
    { key: 'team_ids', label: '送り先(選ばないと全員)', type: 'teams' },
    { key: 'pinned', label: 'ホームの一番上に固定する', type: 'bool' }] },
  events: { label: '予定', table: 'events', title: 'title', order: ['starts_on', true], add: ['coach'], icon: '📅', hint: '練習と大会・出欠', fab: '＋ 予定を追加', fields: [
    { key: 'title', label: '予定の名前', type: 'text', required: true },
    { key: 'kind', label: '種類', type: 'select', options: ['練習', '大会'] },
    { key: 'starts_on', label: '日付', type: 'date' },
    { key: 'team_ids', label: '対象のチーム(選ばないと全員)', type: 'teams' },
    { key: 'place', label: '場所', type: 'text' },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'memo', label: 'メモ', type: 'textarea' }] },
  news: { label: 'ニュース', table: 'news', title: 'title', order: ['created_at', false], approval: true, icon: '📰', hint: 'テニスの話題', fab: '＋ ニュースを追加', fields: [
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'source', label: '出どころ', type: 'text' },
    { key: 'memo', label: 'ひとこと', type: 'textarea' }] },
  videos: { label: '動画', table: 'videos', title: 'title', order: ['created_at', false], approval: true, icon: '🎬', hint: '参考になる動画', fab: '＋ 動画を追加', fields: [
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'tags', label: 'タグ(例: サーブ, バックハンド)', type: 'text' },
    { key: 'memo', label: 'ポイント', type: 'textarea' }] },
  notes: { label: 'テニスノート', table: 'notes', title: 'title', order: ['noted_on', false], private: true, icon: '📝', hint: '自分と監督だけ', fab: '＋ ノートを書く', fields: [
    { key: 'noted_on', label: '日付', type: 'date' },
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'body', label: '内容', type: 'textarea' }] },
  goals: { label: '目標', table: 'goals', title: 'month', order: ['month', false], private: true, selfField: 'player_id', icon: '🎯', hint: '月の目標とふりかえり', fab: '＋ 今月の目標', fields: [
    { key: 'month', label: '月', type: 'month', required: true },
    { key: 'player_id', label: '選手', type: 'player', coachOnly: true },
    { key: 'goal', label: '今月の目標(1つだけ)', type: 'textarea', required: true },
    { key: 'reflection', label: '月末のふりかえり', type: 'textarea' },
    { key: 'coach_comment', label: '監督からのコメント', type: 'textarea', coachOnly: true }] },
  meetings: { label: 'ミーティング', table: 'meetings', title: 'title', order: ['held_on', false], add: ['coach', 'recorder'], icon: '💬', hint: '話し合いの記録', fab: '＋ 記録を追加', fields: [
    { key: 'held_on', label: '日付', type: 'date', required: true },
    { key: 'title', label: 'テーマ', type: 'text', required: true },
    { key: 'body', label: '内容', type: 'textarea' },
    { key: 'decisions', label: '決まったこと', type: 'textarea' }] },
  tests: { label: 'テスト', table: 'tests', title: 'title', order: ['taken_on', false], noAdd: true, icon: '✅', hint: 'ルールと判断力', fields: [
    { key: 'taken_on', label: '実施日', type: 'date', required: true },
    { key: 'title', label: 'テスト名', type: 'text', required: true },
    { key: 'kind', label: '種類', type: 'select', options: ['ルール', 'シチュエーション'] },
    { key: 'player_id', label: '選手', type: 'player' },
    { key: 'score', label: '点数', type: 'number' }] },
  quiz: { label: '問題づくり', table: 'quiz_questions', title: 'question', order: ['created_at', false], add: ['coach'], icon: '🧠', hint: 'テストの問題', coachOnly: true, fab: '＋ 問題を追加', fields: [
    { key: 'level', label: '種類', type: 'select', options: ['ルール', 'シチュエーション'], noBlank: true },
    { key: 'question', label: '問題文(シチュエーション問題は状況も書く)', type: 'textarea', required: true },
    { key: 'choices', label: '選択肢(1行に1つ)', type: 'textarea', required: true },
    { key: 'answer', label: '正解の番号(1つ目なら 1)', type: 'number', required: true },
    { key: 'explanation', label: '解説', type: 'textarea' }] },
};
const MENU = ['announcements', 'events', 'news', 'videos', 'notes', 'goals', 'meetings', 'tests', 'quiz'];
const TABS = [
  ['home', 'ホーム', 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10'],
  ['matches', '試合', 'M12 3a9 9 0 100 18 9 9 0 000-18zM4 8c4 1 6 4 6 8M20 16c-4-1-6-4-6-8'],
  ['players', '選手', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6'],
  ['ranking', 'ランク', 'M5 21V11h4v10M10 21V4h4v17M15 21v-7h4v7'],
  ['menu', 'メニュー', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
];

const state = { me: null, players: [], teams: [], filter: 'all', token: 0, quiz: null };
const role = () => state.me?.role;
const isCoach = () => role() === 'coach';
const canAdd = (sec) => !!sec && !sec.noAdd && (!sec.add || sec.add.includes(role()));
const NS = 'http://www.w3.org/2000/svg';

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n[k] = v;
  }
  for (const c of kids.flat()) if (c != null) n.append(c);
  return n;
}
const txt = (t) => document.createTextNode(String(t));
const safeUrl = (u) => /^https?:\/\//i.test(u || '') ? u : null;
const playerOf = (id) => state.players.find((p) => p.id === id);
const teamName = (id) => state.teams.find((t) => t.id === id)?.name || '';
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const dayNum = (s) => Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 864e5;
function fmtDate(s) { if (!s) return ''; const d = new Date(s.slice(0, 10) + 'T00:00:00Z'); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'日月火水木金土'[d.getUTCDay()]})`; }
const chip = (t, cls) => el('span', { class: 'chip ' + (cls || ''), textContent: t });
const linkText = (text) => { // 本文中の http(s) のURLだけをリンクにする(それ以外は文字のまま)
  const f = document.createDocumentFragment();
  for (const part of String(text).split(/(https?:\/\/[^\s]+)/g)) f.append(/^https?:\/\//.test(part) ? el('a', { href: part, target: '_blank', rel: 'noopener', textContent: part }) : txt(part));
  return f;
};
const roleName = { coach: '監督', recorder: '記録係', player: '選手' };
function avatar(p, size) {
  const n = (p?.name || '?').trim(), cls = 'avatar c' + (hash(p?.id || n) % 6) + (size ? ' ' + size : '');
  const a = el('span', { class: cls, textContent: [...n][0] || '?' });
  if (p?.avatar_path) sb.storage.from('uploads').createSignedUrl(p.avatar_path, 3600).then(({ data }) => {
    if (data?.signedUrl) { a.textContent = ''; a.append(el('img', { src: data.signedUrl, alt: '', loading: 'lazy' })); }
  });
  return a;
}
function link(url, label) { return safeUrl(url) ? el('a', { href: url, target: '_blank', rel: 'noopener', textContent: label || url }) : null; }

// 試合の集計: 勝ち・負け・勝率・直近5試合
function stats(ms) {
  const done = ms.filter((m) => m.result).sort((a, b) => (a.played_on < b.played_on ? 1 : -1));
  const w = done.filter((m) => m.result === '勝').length, l = done.filter((m) => m.result === '負').length;
  return { w, l, n: done.length, rate: done.length ? Math.round((w / done.length) * 100) : null, form: done.slice(0, 5).map((m) => m.result) };
}
function dots(form) {
  return el('div', { class: 'dots' }, form.map((r) => el('span', { class: 'dot ' + (r === '勝' ? 'w' : r === '負' ? 'l' : 'd'), textContent: r === '引分' ? '△' : r })));
}
function ring(pct, size = 88) {
  const r = 34, c = 2 * Math.PI * r, s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 80 80'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('class', 'ring');
  const mk = (tag, attrs) => { const x = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v); return x; };
  s.append(mk('circle', { cx: 40, cy: 40, r, class: 'ring-bg' }),
    mk('circle', { cx: 40, cy: 40, r, class: 'ring-fg', 'stroke-dasharray': `${(c * (pct || 0)) / 100} ${c}`, transform: 'rotate(-90 40 40)' }));
  const t = mk('text', { x: 40, y: 47, 'text-anchor': 'middle', class: 'ring-t' }); t.textContent = pct == null ? '–' : pct + '%'; s.append(t);
  return s;
}
const empty = (icon, msg) => el('div', { class: 'empty' }, el('b', { textContent: icon }), msg);
const q = (table, col, asc) => sb.from(table).select('*').order(col, { ascending: asc, nullsFirst: false });
// 本人と監督だけが見られるもの(ノート・目標)を、画面側でも絞る
const visibleRows = (sec, rows) => {
  if (sec.private && !isCoach()) return rows.filter((r) => r.created_by === state.me.id || r.player_id === state.me.id);
  // 選手が共有したものは、監督が承認するまで本人と監督だけが見られる
  if (sec.approval && !isCoach()) return rows.filter((r) => r.approved || r.created_by === state.me.id);
  return rows;
};

// ---------- ログイン(監督が渡した個人コード) ----------
function showLogin(message) {
  $('nav').hidden = true; $('logout').hidden = true; $('fab').hidden = true; $('title').textContent = '';
  const code = el('input', { type: 'text', id: 'code', placeholder: '監督からもらったコード', autocomplete: 'off', autocapitalize: 'characters', maxLength: 12 });
  const msg = el('p', { class: 'msg', textContent: message || '' });
  const btn = el('button', { class: 'btn ball', textContent: '入る', onclick: async () => {
    msg.textContent = '確認中…';
    // コード → サーバー側の処理(Edge Function)が本人を確かめて、ログイン用の情報を返す
    const { data, error } = await sb.functions.invoke('code-login', { body: { code: code.value.trim().toUpperCase() } });
    if (error || !data?.access_token) { msg.textContent = 'コードが違うか、使えなくなっています。監督に聞いてください。'; return; }
    await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    start();
  } });
  $('main').replaceChildren(el('div', { class: 'login' }, el('h2', { textContent: 'TEAM に入る' }),
    el('p', { class: 'muted', textContent: 'メンバー専用です。監督からLINEで届いたコードを入れてください。1回入れると、このスマホが覚えてくれます。' }),
    code, el('div', { class: 'actions' }, btn), msg));
}

// ---------- 追加・編集(下から出る画面) ----------
function closeSheet() { $('sheet').hidden = true; $('sheet').replaceChildren(); }
function showSheet(title, ...kids) {
  $('sheet').replaceChildren(el('div', { class: 'sheet-body' }, el('div', { class: 'sheet-head' }, el('h2', { textContent: title }), el('button', { class: 'ghost', textContent: '閉じる', onclick: closeSheet })), ...kids));
  $('sheet').hidden = false;
}
function openSheet(sec, row) {
  const form = el('form'), inputs = {}, getters = {};
  for (const f of sec.fields) {
    if (f.coachOnly && !isCoach()) continue;
    const opts = (list, val, name, blank) => [blank === false ? null : el('option', { value: '', textContent: '—' }), list.map((x, i) => el('option', { value: val(x, i), textContent: name(x, i) }))];
    let input;
    if (f.type === 'textarea') input = el('textarea');
    else if (f.type === 'select') input = el('select', {}, ...opts(f.options, (x) => x, (x, i) => f.names?.[i] || x, f.noBlank ? false : true));
    else if (f.type === 'player') input = el('select', {}, ...opts(state.players, (p) => p.id, (p) => p.name));
    else if (f.type === 'team') input = el('select', {}, ...opts(state.teams, (t) => t.id, (t) => t.name));
    else if (f.type === 'file') input = el('input', { type: 'file', accept: f.accept || 'image/*,.pdf,.csv,.xlsx,.docx' });
    else if (f.type === 'teams') {
      const boxes = state.teams.map((t) => el('input', { type: 'checkbox', value: t.id, checked: !!row?.team_ids?.includes(t.id) }));
      getters[f.key] = () => boxes.filter((b) => b.checked).map((b) => Number(b.value));
      form.append(el('label', { textContent: f.label }), el('div', { class: 'checks' }, state.teams.map((t, i) => el('label', { class: 'check' }, boxes[i], txt(t.name)))));
      continue;
    } else if (f.type === 'bool') {
      const cb = el('input', { type: 'checkbox', checked: !!row?.[f.key] }); getters[f.key] = () => cb.checked;
      form.append(el('label', { class: 'check' }, cb, txt(f.label))); continue;
    } else input = el('input', { type: { url: 'url', number: 'number', date: 'date', month: 'month' }[f.type] || 'text', step: f.type === 'number' ? 'any' : undefined });
    if (f.type !== 'file' && row && row[f.key] != null) input.value = row[f.key];
    else if (!row && f.type === 'player' && state.me) input.value = state.me.id;
    else if (!row && f.type === 'date') input.value = todayJst();
    else if (!row && f.type === 'month') input.value = todayJst().slice(0, 7);
    input.required = !!f.required; input.id = 'f-' + f.key; inputs[f.key] = input;
    form.append(el('label', { htmlFor: input.id, textContent: f.label }), input);
  }
  const msg = el('p', { class: 'msg' });
  const actions = el('div', { class: 'actions' }, el('button', { class: 'btn ball', type: 'submit', textContent: row ? '更新する' : sec.table === 'announcements' ? '送る' : '追加する' }));
  if (row && !sec.noDelete) actions.append(el('button', { class: 'btn danger', type: 'button', textContent: '削除', onclick: async () => {
    if (!confirm('削除しますか?')) return;
    const { error } = await sb.from(sec.table).delete().eq('id', row.id);
    if (error) msg.textContent = '削除できませんでした'; else { closeSheet(); render(); }
  } }));
  form.append(msg, actions);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '保存中…';
    const payload = {};
    for (const f of sec.fields) {
      if (getters[f.key]) { payload[f.key] = getters[f.key](); continue; }
      const inp = inputs[f.key]; if (!inp) continue;
      if (f.type === 'file') {
        const file = inp.files[0]; if (!file) continue;
        if (file.size > 20 * 1024 * 1024) { msg.textContent = 'ファイルは20MBまでです'; return; }
        const path = `${state.me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const up = await sb.storage.from('uploads').upload(path, file);
        if (up.error) { msg.textContent = 'アップロードできませんでした'; return; }
        payload[f.key] = path;
      } else {
        payload[f.key] = inp.value === '' ? null : (f.type === 'number' || f.type === 'team') ? Number(inp.value) : inp.value;
        if (f.noBlank && payload[f.key] == null) delete payload[f.key];
      }
    }
    if (sec.selfField && !payload[sec.selfField]) payload[sec.selfField] = state.me.id; // 本人の分として保存する
    if (sec.approval) { if (!row) payload.approved = isCoach(); else if (!isCoach()) payload.approved = false; } // 選手の追加・編集は、監督の承認待ちにする
    if (sec.table === 'quiz_questions') {
      const n = (payload.choices || '').split('\n').filter((x) => x.trim()).length;
      if (!(payload.answer >= 1 && payload.answer <= n)) { msg.textContent = `正解の番号は 1〜${n} にしてください`; return; }
    }
    const { error } = await (row ? sb.from(sec.table).update(payload).eq('id', row.id) : sb.from(sec.table).insert(payload));
    if (error) { msg.textContent = '保存できませんでした: ' + error.message; return; }
    closeSheet(); await loadRefs(); render();
  });
  showSheet((row ? '編集: ' : '追加: ') + sec.label, form);
}
// 選手の追加: 名前を入れるとコードが1回だけ表示される(サーバー側の処理で作る)
function openAddPlayer() {
  const name = el('input', { type: 'text', id: 'np-name', required: true });
  const team = el('select', { id: 'np-team' }, el('option', { value: '', textContent: '—' }), state.teams.map((t) => el('option', { value: t.id, textContent: t.name })));
  const msg = el('p', { class: 'msg' }), form = el('form');
  form.append(el('label', { htmlFor: 'np-name', textContent: '名前' }), name, el('label', { htmlFor: 'np-team', textContent: 'チーム' }), team, msg,
    el('div', { class: 'actions' }, el('button', { class: 'btn ball', type: 'submit', textContent: 'コードを発行する' })));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '作成中…';
    const { data, error } = await sb.functions.invoke('create-player', { body: { name: name.value.trim(), team_id: team.value ? Number(team.value) : null } });
    if (error || !data?.code) { msg.textContent = '作れませんでした'; return; }
    await loadRefs();
    const copy = el('button', { class: 'btn', type: 'button', textContent: 'コピー', onclick: async () => {
      try { await navigator.clipboard.writeText(data.code); copy.textContent = 'コピーしました'; } catch (_) { copy.textContent = '長押しでコピーしてください'; }
    } });
    showSheet('コードができました', el('p', { class: 'muted', textContent: `${name.value.trim()} さんのコードです。この画面を閉じると二度と表示されません。LINEで本人だけに渡してください。` }),
      el('div', { class: 'code', textContent: data.code }), el('div', { class: 'actions' }, copy, el('button', { class: 'btn ball', type: 'button', textContent: '閉じる', onclick: () => { closeSheet(); render(); } })));
  });
  showSheet('選手を追加', form);
}
const canEdit = (sec, row) => (sec.table === 'profiles' ? row.id === state.me.id : row.created_by === state.me.id) || isCoach();
const editBtn = (sec, row) => sec && canEdit(sec, row) ? el('button', { class: 'edit', textContent: '編集', onclick: () => openSheet(sec, row) }) : null;

// ---------- 各カード ----------
function fileBox(path) {
  const box = el('div');
  sb.storage.from('uploads').createSignedUrl(path, 3600).then(({ data }) => {
    if (!data?.signedUrl) return;
    if (/\.(png|jpe?g|gif|webp|heic)$/i.test(path)) box.append(el('img', { class: 'thumb', src: data.signedUrl, alt: '添付画像', loading: 'lazy' }));
    else box.append(el('a', { href: data.signedUrl, target: '_blank', rel: 'noopener', textContent: '📎 添付ファイルを開く' }));
  });
  return box;
}
function matchCard(m, sec) {
  const p = playerOf(m.player_id), cls = m.result === '勝' ? 'w' : m.result === '負' ? 'l' : '';
  return el('div', { class: 'card match ' + cls }, el('span', { class: 'stripe' }),
    el('span', { class: 'badge', textContent: m.result === '引分' ? '△' : m.result || '–' }),
    el('div', { class: 'match-body' },
      el('div', { class: 'muted', textContent: fmtDate(m.played_on) + (m.tournament ? ' ・ ' + m.tournament : '') }),
      el('h3', { textContent: 'vs ' + m.opponent }),
      m.score ? el('div', { class: 'score', textContent: m.score }) : null,
      p ? el('div', { class: 'pl' }, avatar(p, 'sm'), txt(p.name)) : null,
      m.memo ? el('p', { class: 'pre muted', textContent: m.memo }) : null,
      m.file_path ? fileBox(m.file_path) : null),
    editBtn(sec, m));
}
function playerCard(p, ms, sec) {
  const s = stats(ms.filter((m) => m.player_id === p.id));
  return el('div', { class: 'card' }, editBtn(sec, p), avatar(p, 'lg'), el('h3', { textContent: p.name }),
    p.rank_label ? el('span', { class: 'rank', textContent: p.rank_label }) : null,
    p.role === 'recorder' ? chip('記録係', 'ball') : null,
    p.team_id ? el('div', { class: 'muted', textContent: teamName(p.team_id) }) : null,
    s.n ? el('div', { class: 'rec' }, txt(`${s.w}勝${s.l}敗 `), el('i', { textContent: s.rate + '%' })) : el('div', { class: 'muted', textContent: '試合の記録なし' }),
    p.bio ? el('div', { class: 'clamp', textContent: p.bio }) : null);
}
function genericCard(key, row, sec) {
  const c = el('div', { class: 'card' }, editBtn(sec, row));
  const t = String(row[SECTIONS[key]?.title] ?? row.title ?? '');
  if (key === 'events') {
    const d = row.starts_on ? new Date(row.starts_on + 'T00:00:00Z') : null;
    c.classList.add('flex');
    c.append(el('div', { class: 'date' }, el('b', { textContent: d ? d.getUTCDate() : '–' }), el('span', { textContent: d ? `${d.getUTCMonth() + 1}月` : '未定' })),
      el('div', { class: 'cards-pad' }, row.kind ? chip(row.kind, row.kind === '大会' ? 'ball' : '') : null, row.team_ids?.length ? chip(row.team_ids.map(teamName).join('・')) : null, el('h3', { textContent: t }), row.place ? el('div', { class: 'muted', textContent: '📍 ' + row.place }) : null,
        row.memo ? el('p', { class: 'pre muted', textContent: row.memo }) : null, link(row.url, '詳しいページを開く')));
    return c;
  }
  if (key === 'quiz') {
    const ch = (row.choices || '').split('\n').filter((x) => x.trim());
    c.append(el('div', { class: 'cards-pad' }, chip(row.level, row.level === 'ルール' ? '' : 'ball'), el('h3', { class: 'pre', textContent: t }),
      el('ol', { class: 'choices-list' }, ch.map((x, i) => el('li', { class: i + 1 === row.answer ? 'ok' : '', textContent: x }))),
      row.explanation ? el('p', { class: 'pre muted', textContent: '解説: ' + row.explanation }) : null));
    return c;
  }
  const lead = key === 'news' || key === 'videos' ? link(row.url, t) : null;
  const when = row.noted_on || row.held_on || (row.created_at || '').slice(0, 10);
  const owner = key === 'goals' && isCoach() ? playerOf(row.player_id) : null;
  const wrap = el('div', { class: 'cards-pad' }, when ? el('div', { class: 'muted', textContent: fmtDate(when) }) : null,
    lead ? el('h3', {}, lead) : el('h3', { textContent: key === 'goals' ? `${(row.month || '').replace('-', '年')}月の目標` : t }));
  if (owner) wrap.append(el('div', { class: 'pl' }, avatar(owner, 'sm'), txt(owner.name)));
  if (sec?.approval && !row.approved) {
    wrap.prepend(chip(isCoach() ? '承認待ち' : '承認待ち(監督が確認中)', 'new'));
    if (isCoach()) wrap.append(el('div', { class: 'actions' },
      el('button', { class: 'btn ball', type: 'button', textContent: '承認して公開', onclick: async () => { await sb.from(sec.table).update({ approved: true }).eq('id', row.id); render(); } }),
      el('button', { class: 'btn danger', type: 'button', textContent: '却下', onclick: async () => { await sb.from(sec.table).delete().eq('id', row.id); render(); } })));
  }
  if (row.source) wrap.append(chip(row.source));
  for (const tag of (row.tags || '').split(/[,、]/).map((x) => x.trim()).filter(Boolean)) wrap.append(chip('#' + tag, 'ball'));
  for (const k of ['memo', 'body', 'goal']) if (row[k]) wrap.append(el('p', { class: 'pre ' + (k === 'memo' ? 'muted' : ''), textContent: row[k] }));
  if (row.reflection) wrap.append(el('div', { class: 'decide' }, el('b', { textContent: 'ふりかえり' }), txt(row.reflection)));
  if (row.coach_comment) wrap.append(el('div', { class: 'decide coach' }, el('b', { textContent: '監督より' }), txt(row.coach_comment)));
  if (row.decisions) wrap.append(el('div', { class: 'decide' }, el('b', { textContent: '決まったこと' }), txt(row.decisions)));
  c.append(wrap); return c;
}
function testGroups(rows, sec) {
  const groups = new Map();
  for (const r of rows) { const k = `${r.taken_on}|${r.title}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  return [...groups.values()].map((g) => {
    const max = Math.max(100, ...g.map((r) => r.score || 0));
    const c = el('div', { class: 'card' }, el('div', { class: 'muted', textContent: fmtDate(g[0].taken_on) }), el('h3', { textContent: g[0].title }), g[0].kind ? chip(g[0].kind) : null);
    for (const r of g.sort((a, b) => (b.score || 0) - (a.score || 0))) {
      c.append(el('button', { class: 'bar', type: 'button', onclick: canEdit(sec, r) ? () => openSheet(sec, r) : null },
        el('span', { class: 'nm', textContent: playerOf(r.player_id)?.name || '—' }),
        el('span', { class: 'track' }, el('span', { class: 'fill', style: `display:block;width:${Math.round(((r.score || 0) / max) * 100)}%` })),
        el('span', { class: 'v', textContent: r.score ?? '–' })));
    }
    return c;
  });
}

// ---------- お知らせ(監督 → チーム) ----------
const visibleTo = (a) => isCoach() || !a.team_ids?.length || a.team_ids.includes(state.me.team_id);
const recipientsOf = (a) => state.players.filter((p) => p.role !== 'coach' && (!a.team_ids?.length || a.team_ids.includes(p.team_id)));
function noticeCard(a, reads, unread, sec) {
  const to = a.team_ids?.length ? a.team_ids.map(teamName).join('・') : '全員';
  const c = el('div', { class: 'card notice' + (a.pinned ? ' pin' : '') }, editBtn(sec, a),
    el('div', { class: 'cards-pad' }, a.pinned ? chip('📌 固定', 'ball') : null, unread ? chip('NEW', 'new') : null, chip('宛先: ' + to),
      el('p', { class: 'pre', style: 'margin:6px 0 0' }, linkText(a.body)),
      el('div', { class: 'muted', style: 'margin-top:6px', textContent: fmtDate(a.created_at) })));
  if (isCoach()) {
    const rcp = recipientsOf(a), done = new Set(reads.filter((r) => r.announcement_id === a.id).map((r) => r.player_id));
    const un = rcp.filter((p) => !done.has(p.id));
    c.append(el('details', { class: 'reads' }, el('summary', { textContent: `既読 ${rcp.length - un.length}/${rcp.length}` + (un.length ? `(未読 ${un.length}人)` : ' ✓') }),
      un.length ? el('div', {}, el('b', { class: 'muted', textContent: '未読: ' }), un.map((p) => chip(p.name))) : null));
  } else c.append(el('div', { class: 'muted', style: 'margin-top:8px;font-size:12px', textContent: '開くと既読になり、監督が確認できます' }));
  return c;
}
async function loadNotices() {
  const [a, r] = await Promise.all([q('announcements', 'created_at', false), sb.from('announcement_reads').select('*')]);
  const list = (a.data || []).filter(visibleTo).sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)), reads = r.data || [];
  const mine = new Set(reads.filter((x) => x.player_id === state.me.id).map((x) => x.announcement_id));
  const unread = new Set(isCoach() ? [] : list.filter((x) => !mine.has(x.id)).map((x) => x.id));
  // 表示した時点で自動的に既読にする(ボタンは不要)
  if (unread.size) Promise.all([...unread].map((id) => sb.from('announcement_reads').insert({ announcement_id: id, player_id: state.me.id })));
  return { list, reads, unread };
}

// ---------- 出欠 ----------
const ATT = [['yes', '行く'], ['late', '遅れる'], ['no', '行けない']];
function attendanceBlock(ev, att) {
  if (ev.starts_on && ev.starts_on < todayJst()) return null;
  const rows = att.filter((a) => a.event_id === ev.id);
  if (isCoach()) {
    const players = recipientsOf(ev), by = (s) => players.filter((p) => rows.some((r) => r.player_id === p.id && r.status === s));
    const none = players.filter((p) => !rows.some((r) => r.player_id === p.id));
    return el('details', { class: 'reads' }, el('summary', { textContent: `行く ${by('yes').length} ・ 遅れる ${by('late').length} ・ 行けない ${by('no').length} ・ 未回答 ${none.length}` }),
      ...ATT.map(([s, l]) => by(s).length ? el('div', {}, el('b', { class: 'muted', textContent: l + ': ' }), by(s).map((p) => chip(p.name))) : null),
      none.length ? el('div', {}, el('b', { class: 'muted', textContent: '未回答: ' }), none.map((p) => chip(p.name))) : null);
  }
  const mine = rows.find((r) => r.player_id === state.me.id);
  const mates = state.players.filter((p) => p.role !== 'coach' && p.team_id === state.me.team_id), by = (s) => mates.filter((p) => rows.some((r) => r.player_id === p.id && r.status === s));
  const team = el('details', { class: 'reads' }, el('summary', { textContent: `チームの回答: 行く ${by('yes').length} ・ 遅れる ${by('late').length} ・ 行けない ${by('no').length}` }),
    ...ATT.map(([s, l]) => by(s).length ? el('div', {}, el('b', { class: 'muted', textContent: l + ': ' }), by(s).map((p) => chip(p.name))) : null));
  return el('div', {}, el('div', { class: 'chips att' }, ATT.map(([s, l]) => el('button', { class: 'pill' + (mine?.status === s ? ' on' : ''), type: 'button', textContent: l, onclick: async () => {
    await (mine ? sb.from('attendance').update({ status: s }).eq('id', mine.id) : sb.from('attendance').insert({ event_id: ev.id, player_id: state.me.id, status: s }));
    render();
  } }))), team);
}

// ---------- 問題(今日の一問・テスト共通) ----------
function askQuestion(qr, onAnswer) {
  const choices = (qr.choices || '').split('\n').filter((x) => x.trim()), box = el('div', { class: 'qbox' });
  const btns = choices.map((c, i) => el('button', { class: 'choice', type: 'button', textContent: c, onclick: () => {
    const ok = i + 1 === qr.answer;
    btns.forEach((b, j) => { b.disabled = true; if (j + 1 === qr.answer) b.classList.add('ok'); else if (j === i) b.classList.add('ng'); });
    box.append(el('div', { class: 'result ' + (ok ? 'ok' : 'ng') }, el('b', { textContent: ok ? '⭕ 正解!' : '❌ ざんねん' }),
      qr.explanation ? el('p', { class: 'pre', textContent: qr.explanation }) : null), onAnswer(ok) || '');
  } }));
  box.append(chip(qr.level, qr.level === 'ルール' ? '' : 'ball'), el('p', { class: 'pre qtext', textContent: qr.question }), ...btns);
  return box;
}
// 監督のホーム: 声をかけたほうがよい人・確認が必要なことを、人の名前つきで並べる
function coachChecks(nt, at, events, notes, goals, matches) {
  const players = state.players.filter((p) => p.role !== 'coach'), today = todayJst(), rows = [];
  const names = (ps) => (ps.length > 8 ? [...ps.slice(0, 8).map((p) => chip(p.name)), chip(`他${ps.length - 8}人`)] : ps.map((p) => chip(p.name)));
  const add = (label, ps) => { if (ps.length) rows.push(el('div', { class: 'check-row' }, el('b', { textContent: label }), el('div', {}, names(ps)))); };
  for (const a of nt.list.slice(0, 5)) {
    const done = new Set(nt.reads.filter((r) => r.announcement_id === a.id).map((r) => r.player_id));
    add(`お知らせ「${a.body.slice(0, 14)}${a.body.length > 14 ? '…' : ''}」が未読`, recipientsOf(a).filter((p) => !done.has(p.id)));
  }
  for (const ev of events.filter((x) => x.starts_on && x.starts_on >= today).slice(0, 2))
    add(`出欠が未回答: ${ev.title}`, recipientsOf(ev).filter((p) => !at.some((r) => r.event_id === ev.id && r.player_id === p.id)));
  add('今月の目標が未記入', players.filter((p) => !goals.some((g) => g.player_id === p.id && g.month === today.slice(0, 7))));
  add('ノートが14日以上ありません', players.filter((p) => !notes.some((n) => n.created_by === p.id && dayNum((n.noted_on || n.created_at || '0000-01-01').slice(0, 10)) >= dayNum(today) - 14)));
  add('試合記録が30日以上ありません', players.filter((p) => !matches.some((m) => m.player_id === p.id && dayNum(m.played_on) >= dayNum(today) - 30)));
  return el('div', { class: 'card' }, el('h3', { textContent: '確認が必要なこと' }), rows.length ? rows : el('p', { class: 'muted', textContent: 'いまのところ、ありません ✓' }));
}

// ---------- 各画面 ----------
async function viewHome(main) {
  const none = Promise.resolve({ data: [] });
  const [m, e, mt, n, nt, at, vd, nts, gls] = await Promise.all([q('matches', 'played_on', false), q('events', 'starts_on', true), q('meetings', 'held_on', false), q('news', 'created_at', false),
    loadNotices(), sb.from('attendance').select('*'), q('videos', 'created_at', false),
    isCoach() ? q('notes', 'created_at', false) : none, isCoach() ? q('goals', 'month', false) : none]);
  const matches = m.data || [], today = todayJst();
  if (nt.list.length) {
    main.append(el('h2', { class: 'sec' }, txt('お知らせ'), el('a', { href: '#announcements', textContent: 'すべて →' })));
    nt.list.slice(0, 2).forEach((a) => main.append(noticeCard(a, nt.reads, nt.unread.has(a.id), null)));
  }
  if (isCoach()) main.append(el('h2', { class: 'sec', textContent: '監督のチェック' }), coachChecks(nt, at.data || [], (e.data || []).filter(visibleTo), nts.data || [], gls.data || [], matches));
  const mine = matches.filter((x) => x.player_id === state.me.id), personal = mine.length > 0, s = stats(personal ? mine : matches);
  main.append(el('div', { class: 'hero' }, el('small', { textContent: personal ? 'あなたの戦績' : 'チームの戦績' }),
    el('h2', { textContent: `${state.me.name}さん、おつかれさま` }),
    el('div', { class: 'hero-row' }, ring(s.rate),
      el('div', {}, el('div', { class: 'hero-stats' },
        el('div', {}, el('div', { class: 'big', textContent: s.w }), el('div', { class: 'big-l', textContent: '勝ち' })),
        el('div', {}, el('div', { class: 'big', textContent: s.l }), el('div', { class: 'big-l', textContent: '負け' })),
        el('div', {}, el('div', { class: 'big', textContent: s.n }), el('div', { class: 'big-l', textContent: '試合' }))), s.form.length ? dots(s.form) : null))));
  const pending = isCoach() ? [['news', 'ニュース', n.data], ['videos', '動画', vd.data]].map(([k, l, d]) => [k, l, (d || []).filter((x) => !x.approved).length]).filter((x) => x[2]) : [];
  if (pending.length) main.append(el('div', { class: 'card' }, el('b', { textContent: '承認待ちがあります' }), el('div', {}, pending.map(([k, l, c]) => el('a', { class: 'chip new', href: '#' + k, textContent: `${l} ${c}件` })))));
  const next = (e.data || []).filter(visibleTo).find((x) => x.starts_on && x.starts_on >= today);
  if (next) {
    const days = dayNum(next.starts_on) - dayNum(today);
    main.append(el('h2', { class: 'sec' }, txt('次の予定'), el('a', { href: '#events', textContent: 'すべて →' })),
      el('div', { class: 'card' }, el('div', { class: 'next' }, el('div', { class: 'days' }, el('b', { textContent: days }), el('span', { textContent: days === 0 ? '今日!' : '日後' })),
        el('div', {}, next.kind ? chip(next.kind, next.kind === '大会' ? 'ball' : '') : null, el('h3', { textContent: next.title }), el('div', { class: 'muted', textContent: fmtDate(next.starts_on) + (next.place ? ' ・ ' + next.place : '') }))),
        attendanceBlock(next, at.data || [])));
  }
  main.append(el('h2', { class: 'sec' }, txt('最近の試合'), el('a', { href: '#matches', textContent: 'すべて →' })));
  if (matches.length) matches.slice(0, 3).forEach((x) => main.append(matchCard(x))); else main.append(empty('🎾', 'まだ試合の記録がありません。'));
  const last = (mt.data || [])[0];
  if (last) main.append(el('h2', { class: 'sec' }, txt('前回のミーティング'), el('a', { href: '#meetings', textContent: 'すべて →' })), genericCard('meetings', last, null));
  const nw = (n.data || []).find((x) => x.approved);
  if (nw) main.append(el('h2', { class: 'sec' }, txt('新しいニュース'), el('a', { href: '#news', textContent: 'すべて →' })), genericCard('news', nw, null));
}

async function viewMatches(main, sec) {
  const { data } = await q('matches', 'played_on', false);
  const all = data || [], rows = state.filter === 'mine' ? all.filter((x) => x.player_id === state.me.id) : all, s = stats(rows);
  main.append(el('div', { class: 'chips' }, ...[['all', '全員'], ['mine', '自分']].map(([k, l]) =>
    el('button', { class: 'pill' + (state.filter === k ? ' on' : ''), type: 'button', textContent: l, onclick: () => { state.filter = k; render(); } }))));
  main.append(el('div', { class: 'card', style: 'display:flex;align-items:center;gap:14px' }, ring(s.rate, 72),
    el('div', {}, el('div', { class: 'rec', textContent: `${s.w}勝 ${s.l}敗` }), s.form.length ? dots(s.form) : el('div', { class: 'muted', textContent: '記録なし' }))));
  if (rows.length) rows.forEach((x) => main.append(matchCard(x, sec))); else main.append(empty('🎾', 'まだ記録がありません。'));
}

async function viewPlayers(main, sec) {
  const { data } = await q('matches', 'played_on', false);
  if (isCoach()) main.append(el('button', { class: 'btn ball', type: 'button', style: 'margin-top:8px', textContent: '＋ 選手を追加(コード発行)', onclick: openAddPlayer }));
  const list = state.players.filter((p) => p.role !== 'coach').sort((a, b) => (a.rank_order ?? 1e9) - (b.rank_order ?? 1e9));
  const groups = state.teams.map((t) => [t.name, list.filter((p) => p.team_id === t.id)]);
  const rest = list.filter((p) => !state.teams.some((t) => t.id === p.team_id));
  if (rest.length) groups.push(['チーム未設定', rest]);
  for (const [name, ps] of groups) if (ps.length) main.append(el('h2', { class: 'sec', textContent: name }), el('div', { class: 'grid' }, ps.map((p) => playerCard(p, data || [], sec))));
}

async function viewRanking(main) {
  const list = state.players.filter((p) => p.rank_order != null && p.role !== 'coach').sort((a, b) => a.rank_order - b.rank_order);
  if (!list.length) { main.append(empty('🏆', 'まだランクが決まっていません。監督が設定します。')); return; }
  const pod = list.slice(0, 3), order = [pod[1], pod[0], pod[2]].filter(Boolean);
  main.append(el('div', { class: 'podium' }, order.map((p) => {
    const place = pod.indexOf(p) + 1;
    return el('div', { class: 'pod p' + place }, avatar(p, 'lg'), el('b', { textContent: p.name }), el('span', { class: 'muted', textContent: p.rank_label || '' }), el('div', { class: 'step', textContent: place }));
  })));
  const rest = list.slice(3);
  if (rest.length) main.append(el('div', { class: 'card' }, rest.map((p, i) => el('div', { class: 'row' }, el('span', { class: 'n', textContent: i + 4 }), avatar(p, 'sm'),
    el('div', { class: 'grow' }, el('b', { textContent: p.name }), el('div', { class: 'muted', textContent: teamName(p.team_id) })), p.rank_label ? el('span', { class: 'rank', textContent: p.rank_label }) : null))));
  if (isCoach()) main.append(el('button', { class: 'btn', type: 'button', style: 'margin-top:8px', textContent: '＋ チームを追加', onclick: async () => {
    const name = prompt('チーム名'); if (!name) return;
    const { error } = await sb.from('teams').insert({ name }); if (error) alert('追加できませんでした'); else { await loadRefs(); render(); }
  } }));
}

function viewMenu(main) {
  main.append(el('div', { class: 'tiles' }, MENU.filter((k) => !SECTIONS[k].coachOnly || isCoach()).map((k, i) =>
    el('a', { class: 'tile t' + (i % 7), href: '#' + k }, el('i', { textContent: SECTIONS[k].icon }), txt(SECTIONS[k].label), el('small', { textContent: SECTIONS[k].hint })))));
}

async function viewAnnouncements(main, sec) {
  const nt = await loadNotices();
  if (!nt.list.length) { main.append(empty('📣', 'お知らせはまだありません。')); return; }
  nt.list.forEach((a) => main.append(noticeCard(a, nt.reads, nt.unread.has(a.id), sec)));
}

async function viewEvents(main, sec) {
  const [{ data }, at] = await Promise.all([q('events', 'starts_on', true), sb.from('attendance').select('*')]);
  const rows = (data || []).filter(visibleTo);
  if (!rows.length) { main.append(empty('📅', 'まだ予定がありません。')); return; }
  rows.forEach((r) => { const c = genericCard('events', r, sec), a = attendanceBlock(r, at.data || []); if (a) c.querySelector('.cards-pad').append(a); main.append(c); });
}

// テスト: 画面で解答して自動採点。簡単=ルール、難しい=シチュエーション
async function viewTests(main, sec) {
  const [{ data: qs }, { data: rs }] = await Promise.all([q('quiz_questions', 'id', true), q('tests', 'taken_on', false)]);
  const run = state.quiz;
  if (run) {
    if (run.i >= run.qs.length) {
      const score = Math.round((run.ok / run.qs.length) * 100);
      sb.from('tests').insert({ taken_on: todayJst(), title: `${run.level}テスト`, kind: run.level, player_id: state.me.id, score });
      main.append(el('div', { class: 'card', style: 'text-align:center' }, ring(score, 120), el('h3', { textContent: `${run.qs.length}問中 ${run.ok}問 正解` }),
        el('p', { class: 'muted', textContent: '結果は「みんなの結果」に残りました。' }), el('button', { class: 'btn ball', type: 'button', textContent: '戻る', onclick: () => { state.quiz = null; render(); } })));
      return;
    }
    const qr = run.qs[run.i];
    main.append(el('div', { class: 'progress' }, el('span', { style: `width:${(run.i / run.qs.length) * 100}%` })), el('p', { class: 'muted', textContent: `${run.level}テスト ${run.i + 1} / ${run.qs.length}` }),
      el('div', { class: 'card' }, askQuestion(qr, (ok) => { if (ok) run.ok++; return el('button', { class: 'btn ball', type: 'button', style: 'margin-top:12px', textContent: run.i + 1 === run.qs.length ? '結果を見る' : '次の問題へ', onclick: () => { run.i++; render(); } }); })));
    return;
  }
  const start = (level) => { const pool = (qs || []).filter((x) => x.level === level).sort(() => Math.random() - 0.5).slice(0, 5); if (pool.length) { state.quiz = { level, qs: pool, i: 0, ok: 0 }; render(); } };
  main.append(el('div', { class: 'tiles' }, [['ルール', '簡単・基本のルール', 't0', '📖'], ['シチュエーション', '難しい・試合中の判断', 't1', '🧠']].map(([lv, hint, cls, ic]) => {
    const n = (qs || []).filter((x) => x.level === lv).length;
    const t = el('button', { class: 'tile ' + cls, type: 'button', disabled: !n, onclick: () => start(lv) }, el('i', { textContent: ic }), txt(`${lv}テスト`), el('small', { textContent: n ? `${hint}(最大5問)` : '問題がまだありません' }));
    return t;
  })));
  main.append(el('h2', { class: 'sec', textContent: 'みんなの結果' }));
  if (rs?.length) main.append(...testGroups(rs, sec)); else main.append(empty('✅', 'まだ結果がありません。'));
}

async function viewList(main, key, sec) {
  const [col, asc] = sec.order;
  const { data, error } = await q(sec.table, col, asc), rows = visibleRows(sec, data || []);
  if (error) main.append(el('p', { class: 'msg', textContent: '読み込めませんでした' }));
  if (sec.private) main.append(el('p', { class: 'muted', textContent: isCoach() ? '選手が書いた内容は、本人と監督だけが見られます。' : '自分と監督だけが見られます。ほかの選手には見えません。' }));
  if (!rows.length) { main.append(empty(sec.icon || '🎾', canAdd(sec) ? 'まだありません。右下のボタンから追加できます。' : 'まだありません。')); return; }
  rows.forEach((r) => main.append(genericCard(key, r, sec)));
}

// ---------- 全体 ----------
async function loadRefs() {
  const [p, t] = await Promise.all([sb.from('profiles').select('*'), sb.from('teams').select('*').order('name')]);
  state.players = p.data || []; state.teams = t.data || [];
  state.me = state.players.find((x) => x.id === state.session.user.id) || null;
}

async function render() {
  const key = location.hash.slice(1) || 'home', token = ++state.token;
  const sec = SECTIONS[key], tab = TABS.find((t) => t[0] === key)?.[0] || (MENU.includes(key) ? 'menu' : 'home');
  $('title').textContent = key === 'home' ? 'HOME' : key === 'menu' ? 'MENU' : key === 'ranking' ? 'RANKING' : sec?.label || '';
  $('navin').replaceChildren(...TABS.map(([id, label, d]) => {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); svg.append(path);
    return el('a', { href: '#' + id, class: id === tab ? 'on' : '' }, el('span', { class: 'ic' }, svg), txt(label));
  }));
  const main = el('div');
  if (sec?.coachOnly && !isCoach()) main.append(empty('🔒', '監督だけが使えます。'));
  else if (key === 'home') await viewHome(main); else if (key === 'menu') viewMenu(main); else if (key === 'ranking') await viewRanking(main);
  else if (key === 'matches') await viewMatches(main, sec); else if (key === 'players') await viewPlayers(main, sec);
  else if (key === 'announcements') await viewAnnouncements(main, sec); else if (key === 'events') await viewEvents(main, sec);
  else if (key === 'tests') await viewTests(main, sec); else if (sec) await viewList(main, key, sec);
  if (token !== state.token) return; // 画面を移動した後の古い結果は捨てる
  const fabSec = key === 'home' ? (canAdd(SECTIONS.matches) ? SECTIONS.matches : null) : canAdd(sec) ? sec : null;
  $('fab').hidden = !fabSec || !!state.quiz; if (fabSec) { $('fab').textContent = fabSec.fab; $('fab').onclick = () => openSheet(fabSec); }
  $('main').replaceChildren(main);
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
window.addEventListener('hashchange', () => { closeSheet(); state.quiz = null; if (state.session) { scrollTo(0, 0); render(); } });
start();
