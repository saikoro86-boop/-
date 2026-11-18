// テニスチーム管理: 画面の組み立て。
// 追加・編集フォームは SECTIONS の設定から作る(新しい項目は設定を足すだけ)。
// 外から来た文字列は必ず textContent で入れる(innerHTML は使わない)。
'use strict';

const sb = window.supabase.createClient(window.TEAM_CONFIG.SUPABASE_URL, window.TEAM_CONFIG.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// field.type: text / textarea / date / number / url / select(options) / player / team / file
const SECTIONS = {
  players: { label: '選手', table: 'profiles', title: 'name', order: ['rank_order', true], noAdd: true, noDelete: true, fields: [
    { key: 'name', label: '名前', type: 'text', required: true },
    { key: 'bio', label: '自己紹介・プレースタイル', type: 'textarea' },
    { key: 'rank_label', label: 'ランク(例: S, A, B)', type: 'text', coachOnly: true },
    { key: 'rank_order', label: 'ランク順(小さいほど上位)', type: 'number', coachOnly: true },
    { key: 'team_id', label: 'チーム', type: 'team', coachOnly: true }] },
  matches: { label: '試合記録', table: 'matches', title: 'opponent', order: ['played_on', false], fab: '＋ 試合を記録', fields: [
    { key: 'played_on', label: '日付', type: 'date', required: true },
    { key: 'player_id', label: '選手', type: 'player' },
    { key: 'opponent', label: '対戦相手', type: 'text', required: true },
    { key: 'tournament', label: '大会・試合名', type: 'text' },
    { key: 'score', label: 'スコア(例: 6-4, 3-6, 7-5)', type: 'text' },
    { key: 'result', label: '結果', type: 'select', options: ['勝', '負', '引分'] },
    { key: 'memo', label: '反省・メモ', type: 'textarea' },
    { key: 'file_path', label: '画像・ファイル(スコア表の写真など)', type: 'file' }] },
  events: { label: '試合情報', table: 'events', title: 'title', order: ['starts_on', true], icon: '📅', hint: '大会の日程', fab: '＋ 大会を追加', fields: [
    { key: 'title', label: '大会名', type: 'text', required: true },
    { key: 'starts_on', label: '開催日', type: 'date' },
    { key: 'place', label: '場所', type: 'text' },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'memo', label: 'メモ', type: 'textarea' }] },
  news: { label: 'ニュース', table: 'news', title: 'title', order: ['created_at', false], icon: '📰', hint: 'テニスの話題', fab: '＋ ニュースを追加', fields: [
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'source', label: '出どころ', type: 'text' },
    { key: 'memo', label: 'ひとこと', type: 'textarea' }] },
  videos: { label: '動画', table: 'videos', title: 'title', order: ['created_at', false], icon: '🎬', hint: '参考になる動画', fab: '＋ 動画を追加', fields: [
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'tags', label: 'タグ(例: サーブ, バックハンド)', type: 'text' },
    { key: 'memo', label: 'ポイント', type: 'textarea' }] },
  prices: { label: '最安値', table: 'prices', title: 'item', order: ['item', true], icon: '💰', hint: 'ボール・ガットなど', fab: '＋ 価格を追加', fields: [
    { key: 'item', label: '商品名', type: 'text', required: true },
    { key: 'price', label: '価格(円)', type: 'number' },
    { key: 'shop', label: '店', type: 'text' },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'checked_on', label: '確認日', type: 'date' }] },
  notes: { label: 'テニスノート', table: 'notes', title: 'title', order: ['noted_on', false], icon: '📝', hint: '気づきを残す', fab: '＋ ノートを書く', fields: [
    { key: 'noted_on', label: '日付', type: 'date' },
    { key: 'title', label: 'タイトル', type: 'text', required: true },
    { key: 'body', label: '内容', type: 'textarea' }] },
  meetings: { label: 'ミーティング', table: 'meetings', title: 'title', order: ['held_on', false], icon: '💬', hint: '話し合いの記録', fab: '＋ 記録を追加', fields: [
    { key: 'held_on', label: '日付', type: 'date', required: true },
    { key: 'title', label: 'テーマ', type: 'text', required: true },
    { key: 'body', label: '内容', type: 'textarea' },
    { key: 'decisions', label: '決まったこと', type: 'textarea' }] },
  tests: { label: 'テスト', table: 'tests', title: 'title', order: ['taken_on', false], icon: '✅', hint: '筆記・実技・体力', fab: '＋ 結果を追加', fields: [
    { key: 'taken_on', label: '実施日', type: 'date', required: true },
    { key: 'title', label: 'テスト名', type: 'text', required: true },
    { key: 'kind', label: '種類', type: 'select', options: ['筆記', '実技', '体力'] },
    { key: 'player_id', label: '選手', type: 'player' },
    { key: 'score', label: '点数', type: 'number' },
    { key: 'comment', label: 'コメント', type: 'text' }] },
};
const MENU = ['events', 'news', 'videos', 'prices', 'notes', 'meetings', 'tests'];
const TABS = [
  ['home', 'ホーム', 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10'],
  ['matches', '試合', 'M12 3a9 9 0 100 18 9 9 0 000-18zM4 8c4 1 6 4 6 8M20 16c-4-1-6-4-6-8'],
  ['players', '選手', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6'],
  ['ranking', 'ランク', 'M5 21V11h4v10M10 21V4h4v17M15 21v-7h4v7'],
  ['menu', 'メニュー', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
];

const state = { me: null, players: [], teams: [], filter: 'all', token: 0 };
const isCoach = () => state.me?.role === 'coach';
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
function avatar(p, size) { const n = (p?.name || '?').trim(); return el('span', { class: 'avatar c' + (hash(p?.id || n) % 6) + (size ? ' ' + size : ''), textContent: [...n][0] || '?' }); }
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

// ---------- ログイン ----------
function showLogin(message) {
  $('nav').hidden = true; $('logout').hidden = true; $('fab').hidden = true; $('title').textContent = '';
  const email = el('input', { type: 'email', id: 'email', placeholder: 'メールアドレス', autocomplete: 'email' });
  const msg = el('p', { class: 'msg', textContent: message || '' });
  const btn = el('button', { class: 'btn ball', textContent: 'ログイン用リンクを送る', onclick: async () => {
    msg.textContent = '送信中…';
    // shouldCreateUser:false … 監督が招待した人だけが入れる
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    msg.textContent = error ? '送れませんでした。招待されたメールアドレスか確認してください。' : 'メールを送りました。届いたリンクを開いてください。';
  } });
  $('main').replaceChildren(el('div', { class: 'login' }, el('h2', { textContent: 'TEAM に入る' }),
    el('p', { class: 'muted', textContent: 'メンバー専用です。パスワードは不要で、メールのリンクで入れます。' }), email, el('div', { class: 'actions' }, btn), msg));
}

// ---------- 追加・編集(下から出る画面) ----------
function closeSheet() { $('sheet').hidden = true; $('sheet').replaceChildren(); }
function openSheet(sec, row) {
  const form = el('form'), inputs = {};
  for (const f of sec.fields) {
    if (f.coachOnly && !isCoach()) continue;
    const opts = (list, val, name) => [el('option', { value: '', textContent: '—' }), list.map((x) => el('option', { value: val(x), textContent: name(x) }))];
    let input;
    if (f.type === 'textarea') input = el('textarea');
    else if (f.type === 'select') input = el('select', {}, ...opts(f.options, (x) => x, (x) => x));
    else if (f.type === 'player') input = el('select', {}, ...opts(state.players, (p) => p.id, (p) => p.name));
    else if (f.type === 'team') input = el('select', {}, ...opts(state.teams, (t) => t.id, (t) => t.name));
    else if (f.type === 'file') input = el('input', { type: 'file', accept: 'image/*,.pdf,.csv,.xlsx,.docx' });
    else input = el('input', { type: { url: 'url', number: 'number', date: 'date' }[f.type] || 'text', step: f.type === 'number' ? 'any' : undefined });
    if (f.type !== 'file' && row && row[f.key] != null) input.value = row[f.key];
    else if (!row && f.type === 'player' && state.me) input.value = state.me.id;
    else if (!row && f.type === 'date') input.value = todayJst();
    input.required = !!f.required; input.id = 'f-' + f.key; inputs[f.key] = input;
    form.append(el('label', { htmlFor: input.id, textContent: f.label }), input);
  }
  const msg = el('p', { class: 'msg' });
  const actions = el('div', { class: 'actions' }, el('button', { class: 'btn ball', type: 'submit', textContent: row ? '更新する' : '追加する' }));
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
      const inp = inputs[f.key]; if (!inp) continue;
      if (f.type === 'file') {
        const file = inp.files[0]; if (!file) continue;
        if (file.size > 20 * 1024 * 1024) { msg.textContent = 'ファイルは20MBまでです'; return; }
        const path = `${state.me.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const up = await sb.storage.from('uploads').upload(path, file);
        if (up.error) { msg.textContent = 'アップロードできませんでした'; return; }
        payload[f.key] = path;
      } else payload[f.key] = inp.value === '' ? null : (f.type === 'number' || f.type === 'team') ? Number(inp.value) : inp.value;
    }
    const { error } = await (row ? sb.from(sec.table).update(payload).eq('id', row.id) : sb.from(sec.table).insert(payload));
    if (error) { msg.textContent = '保存できませんでした: ' + error.message; return; }
    closeSheet(); await loadRefs(); render();
  });
  const sheet = $('sheet');
  sheet.replaceChildren(el('div', { class: 'sheet-body' },
    el('div', { class: 'sheet-head' }, el('h2', { textContent: (row ? '編集: ' : '追加: ') + sec.label }), el('button', { class: 'ghost', textContent: '閉じる', onclick: closeSheet })), form));
  sheet.hidden = false;
}
const canEdit = (sec, row) => (sec.table === 'profiles' ? row.id === state.me.id : row.created_by === state.me.id) || isCoach();
const editBtn = (sec, row) => canEdit(sec, row) ? el('button', { class: 'edit', textContent: '編集', onclick: () => openSheet(sec, row) }) : null;

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
    sec ? editBtn(sec, m) : null);
}
function playerCard(p, ms, sec) {
  const s = stats(ms.filter((m) => m.player_id === p.id));
  return el('div', { class: 'card' }, editBtn(sec, p), avatar(p, 'lg'), el('h3', { textContent: p.name }),
    p.rank_label ? el('span', { class: 'rank', textContent: p.rank_label }) : null,
    p.team_id ? el('div', { class: 'muted', textContent: teamName(p.team_id) }) : null,
    s.n ? el('div', { class: 'rec' }, txt(`${s.w}勝${s.l}敗 `), el('i', { textContent: s.rate + '%' })) : el('div', { class: 'muted', textContent: '試合の記録なし' }),
    p.bio ? el('div', { class: 'clamp', textContent: p.bio }) : null);
}
function genericCard(key, row, sec) {
  const c = el('div', { class: 'card' }, sec ? editBtn(sec, row) : null);
  const t = (row.title || '') + '';
  if (key === 'events') {
    const d = row.starts_on ? new Date(row.starts_on + 'T00:00:00Z') : null;
    c.classList.add('flex');
    c.append(el('div', { class: 'date' }, el('b', { textContent: d ? d.getUTCDate() : '–' }), el('span', { textContent: d ? `${d.getUTCMonth() + 1}月` : '未定' })),
      el('div', { class: 'cards-pad' }, el('h3', { textContent: t }), row.place ? el('div', { class: 'muted', textContent: '📍 ' + row.place }) : null,
        row.memo ? el('p', { class: 'pre muted', textContent: row.memo }) : null, link(row.url, '大会ページを開く')));
    return c;
  }
  const lead = key === 'news' || key === 'videos' ? link(row.url, t) : null;
  const when = row.noted_on || row.held_on || (row.created_at || '').slice(0, 10);
  const wrap = el('div', { class: 'cards-pad' }, when ? el('div', { class: 'muted', textContent: fmtDate(when) }) : null,
    lead ? el('h3', {}, lead) : el('h3', { textContent: t }));
  if (row.source) wrap.append(chip(row.source));
  for (const tag of (row.tags || '').split(/[,、]/).map((x) => x.trim()).filter(Boolean)) wrap.append(chip('#' + tag, 'ball'));
  for (const k of ['memo', 'body']) if (row[k]) wrap.append(el('p', { class: 'pre ' + (k === 'memo' ? 'muted' : ''), textContent: row[k] }));
  if (row.decisions) wrap.append(el('div', { class: 'decide' }, el('b', { textContent: '決まったこと' }), txt(row.decisions)));
  c.append(wrap); return c;
}
function groupCards(key, rows, sec) {
  const groups = new Map();
  for (const r of rows) { const k = key === 'tests' ? `${r.taken_on}|${r.title}` : r.item; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  return [...groups.values()].map((g) => {
    const c = el('div', { class: 'card' });
    if (key === 'tests') {
      const max = Math.max(100, ...g.map((r) => r.score || 0));
      c.append(el('div', { class: 'muted', textContent: fmtDate(g[0].taken_on) }), el('h3', { textContent: g[0].title }), g[0].kind ? chip(g[0].kind) : null);
      for (const r of g.sort((a, b) => (b.score || 0) - (a.score || 0))) {
        const b = el('button', { class: 'bar', type: 'button', onclick: canEdit(sec, r) ? () => openSheet(sec, r) : null },
          el('span', { class: 'nm', textContent: playerOf(r.player_id)?.name || '—' }),
          el('span', { class: 'track' }, el('span', { class: 'fill', style: `display:block;width:${Math.round(((r.score || 0) / max) * 100)}%` })),
          el('span', { class: 'v', textContent: r.score ?? '–' }));
        c.append(b);
      }
    } else {
      c.append(el('h3', { textContent: g[0].item }));
      g.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12)).forEach((r, i) => {
        c.append(el('button', { class: 'price' + (i === 0 ? ' best' : ''), type: 'button', onclick: canEdit(sec, r) ? () => openSheet(sec, r) : null },
          i === 0 ? chip('最安', 'ball') : null, el('span', { class: 'yen', textContent: r.price != null ? '¥' + Number(r.price).toLocaleString('ja-JP') : '—' }),
          el('span', { class: 'muted', textContent: [r.shop, r.checked_on && fmtDate(r.checked_on)].filter(Boolean).join(' ・ ') })));
        if (safeUrl(r.url)) c.lastChild.after(el('div', { class: 'muted' }, link(r.url, '→ ショップを開く')));
      });
    }
    return c;
  });
}

// ---------- 各画面 ----------
async function viewHome(main) {
  const [m, e, mt, n] = await Promise.all([q('matches', 'played_on', false), q('events', 'starts_on', true), q('meetings', 'held_on', false), q('news', 'created_at', false)]);
  const matches = m.data || [], today = todayJst();
  const mine = matches.filter((x) => x.player_id === state.me.id), personal = mine.length > 0;
  const s = stats(personal ? mine : matches);
  main.append(el('div', { class: 'hero' }, el('small', { textContent: personal ? 'あなたの戦績' : 'チームの戦績' }),
    el('h2', { textContent: `${state.me.name}さん、おつかれさま` }),
    el('div', { class: 'hero-row' }, ring(s.rate),
      el('div', {}, el('div', { class: 'hero-stats' },
        el('div', {}, el('div', { class: 'big', textContent: s.w }), el('div', { class: 'big-l', textContent: '勝ち' })),
        el('div', {}, el('div', { class: 'big', textContent: s.l }), el('div', { class: 'big-l', textContent: '負け' })),
        el('div', {}, el('div', { class: 'big', textContent: s.n }), el('div', { class: 'big-l', textContent: '試合' }))), s.form.length ? dots(s.form) : null))));
  const next = (e.data || []).find((x) => x.starts_on && x.starts_on >= today);
  if (next) {
    const days = dayNum(next.starts_on) - dayNum(today);
    main.append(el('h2', { class: 'sec' }, txt('次の大会'), el('a', { href: '#events', textContent: 'すべて →' })),
      el('div', { class: 'card next' }, el('div', { class: 'days' }, el('b', { textContent: days }), el('span', { textContent: days === 0 ? '今日!' : '日後' })),
        el('div', {}, el('h3', { textContent: next.title }), el('div', { class: 'muted', textContent: fmtDate(next.starts_on) + (next.place ? ' ・ ' + next.place : '') }))));
  }
  main.append(el('h2', { class: 'sec' }, txt('最近の試合'), el('a', { href: '#matches', textContent: 'すべて →' })));
  if (matches.length) matches.slice(0, 3).forEach((x) => main.append(matchCard(x))); else main.append(empty('🎾', 'まだ試合の記録がありません。右下のボタンから最初の1試合を残しましょう。'));
  const last = (mt.data || [])[0];
  if (last) main.append(el('h2', { class: 'sec' }, txt('前回のミーティング'), el('a', { href: '#meetings', textContent: 'すべて →' })), genericCard('meetings', last, null));
  const nw = (n.data || [])[0];
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
  const list = [...state.players].sort((a, b) => (a.rank_order ?? 1e9) - (b.rank_order ?? 1e9));
  main.append(el('div', { class: 'grid', style: 'margin-top:8px' }, list.map((p) => playerCard(p, data || [], sec))));
}

async function viewRanking(main) {
  const list = state.players.filter((p) => p.rank_order != null).sort((a, b) => a.rank_order - b.rank_order);
  if (!list.length) { main.append(empty('🏆', 'まだランクが決まっていません。監督が「選手」タブで設定します。')); return; }
  const pod = list.slice(0, 3), order = [pod[1], pod[0], pod[2]].filter(Boolean);
  main.append(el('div', { class: 'podium' }, order.map((p) => {
    const place = pod.indexOf(p) + 1;
    return el('div', { class: 'pod p' + place }, avatar(p, 'lg'), el('b', { textContent: p.name }), el('span', { class: 'muted', textContent: p.rank_label || '' }), el('div', { class: 'step', textContent: place }));
  })));
  const rest = list.slice(3);
  if (rest.length) main.append(el('div', { class: 'card' }, rest.map((p, i) => el('div', { class: 'row' }, el('span', { class: 'n', textContent: i + 4 }), avatar(p, 'sm'),
    el('div', { class: 'grow' }, el('b', { textContent: p.name }), el('div', { class: 'muted', textContent: teamName(p.team_id) })), p.rank_label ? el('span', { class: 'rank', textContent: p.rank_label }) : null))));
  const teams = state.teams.map((t) => [t, state.players.filter((p) => p.team_id === t.id)]).filter(([, ps]) => ps.length);
  if (teams.length) { main.append(el('h2', { class: 'sec', textContent: 'チーム' })); for (const [t, ps] of teams) main.append(el('div', { class: 'card' }, el('h3', { textContent: t.name }), ps.map((p) => chip(p.name)))); }
  if (isCoach()) main.append(el('button', { class: 'btn', type: 'button', textContent: '＋ チームを追加', onclick: async () => {
    const name = prompt('チーム名'); if (!name) return;
    const { error } = await sb.from('teams').insert({ name }); if (error) alert('追加できませんでした'); else { await loadRefs(); render(); }
  } }));
}

function viewMenu(main) {
  main.append(el('div', { class: 'tiles' }, MENU.map((k, i) => el('a', { class: 'tile t' + i, href: '#' + k }, el('i', { textContent: SECTIONS[k].icon }), txt(SECTIONS[k].label), el('small', { textContent: SECTIONS[k].hint })))));
}

async function viewList(main, key, sec) {
  const [col, asc] = sec.order;
  const { data, error } = await q(sec.table, col, asc), rows = data || [];
  if (error) main.append(el('p', { class: 'msg', textContent: '読み込めませんでした' }));
  if (!rows.length) { main.append(empty(sec.icon || '🎾', 'まだ登録がありません。右下のボタンから追加できます。')); return; }
  if (key === 'tests' || key === 'prices') main.append(...groupCards(key, rows, sec));
  else rows.forEach((r) => main.append(genericCard(key, r, sec)));
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
  if (key === 'home') await viewHome(main); else if (key === 'menu') viewMenu(main); else if (key === 'ranking') await viewRanking(main);
  else if (key === 'matches') await viewMatches(main, sec); else if (key === 'players') await viewPlayers(main, sec); else if (sec) await viewList(main, key, sec);
  if (token !== state.token) return; // 画面を移動した後の古い結果は捨てる
  const fabSec = key === 'home' ? SECTIONS.matches : sec && !sec.noAdd ? sec : null;
  $('fab').hidden = !fabSec; if (fabSec) { $('fab').textContent = fabSec.fab; $('fab').onclick = () => openSheet(fabSec); }
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
window.addEventListener('hashchange', () => { closeSheet(); if (state.session) { scrollTo(0, 0); render(); } });
start();
