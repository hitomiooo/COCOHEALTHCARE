// === ぴーぴ健康データ解析 (bunseki.js) ===
// Firestore の records コレクション（index.html / script.js が保存している記録）を
// 読み取り専用で解析するページ。記録側のデータは一切書き換えません。

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCwPw3WxwYHvaudHqYJ64RzhS4hWhKvO0",
  authDomain: "coco-healthcare-59401.firebaseapp.com",
  projectId: "coco-healthcare-59401",
  storageBucket: "coco-healthcare-59401.firebasestorage.app",
  messagingSenderId: "986920233821",
  appId: "1:986920233821:web:96ff08e9f118d557a816b4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const recordsCollection = collection(db, 'records');

/* ============================================================
   定数（記録フォームの選択肢に合わせています）
   ============================================================ */
const DOGS = [
  { key: 'conditionCoco', name: 'ココ', color: '#d65f78' },
  { key: 'conditionNono', name: 'ノノ', color: '#7569b6' },
  { key: 'conditionMomo', name: 'モモ', color: '#4d8b78' },
  { key: 'conditionBibi', name: 'ビビ', color: '#d6924a' }
];
const COND_ORDER = ['○', '△', '×'];
const COND_SCORE = { '○': 100, '△': 50, '×': 0 };
const APPETITE_ORDER = ['完食', '少し残す', '半分', 'ほぼ食べず'];
const APPETITE_SCORE = { '完食': 3, '少し残す': 2, '半分': 1, 'ほぼ食べず': 0 };
const MEALS = [
  { key: 'appetiteMorning', name: '朝' },
  { key: 'appetiteNoon', name: '昼' },
  { key: 'appetiteNight', name: '晩' }
];
const MEDS = [
  { key: 'medPimo', name: 'ピモベハート（ココ）' },
  { key: 'medLactu', name: 'ラクツロース（ココ）' },
  { key: 'medConseve', name: 'コンセーブ（ココ）' },
  { key: 'medPrega', name: 'プレガバリン（モモ）' },
  { key: 'medOther', name: 'その他' }
];
const POOPS = [
  { key: 'poopMorning', name: '朝' },
  { key: 'poopNoon', name: '昼' },
  { key: 'poopWalk', name: '散歩時' },
  { key: 'poopNight', name: '夜' }
];
const WEATHERS = ['☀️', '☁️', '☂️', '☃️'];
const WEATHER_NAMES = { '☀️': '晴れ', '☁️': 'くもり', '☂️': '雨', '☃️': '雪' };
const MARKS = [
  { v: '🏥', n: '🏥 病院' },
  { v: '⚠️', n: '⚠️ 注意' },
  { v: '✨', n: '✨ 特別' },
  { v: '💉', n: '💉 注射' }
];
const TEMPS = ['暑い', '寒い', 'ちょうどいい'];
const SLEEPS = ['ずっと寝てる', '起きてる時間が長い', '寝たり起きたり移動多い'];
const WALKS = ['行ってない', '庭', '時又', 'アジア電子'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SEASONS = ['春(3-5月)', '夏(6-8月)', '秋(9-11月)', '冬(12-2月)'];
const MIN_N = 5; // これ未満の件数のグループは「参考値」として薄く表示

const DEFAULT_KEYWORDS = [
  '下痢', '血尿', '咳', '逆くしゃみ', '嘔吐', '🤮', '🤒', '💩', '💧',
  'フィラリア', 'トルコキシル', 'マロピタット', '💊', '🏥', '病院',
  'ココ', 'ノノ', 'モモ', 'ビビ', '👍', '❤️', '🍖', '💮', '✖', '😺', '達・', '仁・'
];

/* ============================================================
   状態
   ============================================================ */
let currentUser = null;
let allRecords = [];   // 取得した全記録（写真は除外）
let view = [];         // 期間で絞り込んだ記録
let activeTab = 'summary';
let memoKeyword = '';  // メモ解析で選択中のキーワード
let extraKeywords = loadExtraKeywords();
let summaryMark = '🏥'; // 概要タブで一覧表示するマーク
let modalDate = '';     // 日別カルテで表示中の日付

const $ = id => document.getElementById(id);

/* ============================================================
   小さなユーティリティ
   ============================================================ */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = v => typeof v === 'number' && isFinite(v);
function avg(list) { const v = list.filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function fmt(v, d = 1) { return isNum(v) ? v.toFixed(d) : '—'; }
function pct(part, whole) { return whole ? (part / whole * 100) : null; }
function parseDate(key) { return new Date(key + 'T00:00:00'); }
function dateKey(d) { const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10); }
function todayKey() { return dateKey(new Date()); }
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1; }
function monthKey(r) { return r.date.slice(0, 7); }
function seasonOf(r) {
  const m = Number(r.date.slice(5, 7));
  if (m >= 3 && m <= 5) return SEASONS[0];
  if (m >= 6 && m <= 8) return SEASONS[1];
  if (m >= 9 && m <= 11) return SEASONS[2];
  return SEASONS[3];
}
function weatherList(r) {
  const raw = (r.weather || '').trim();
  if (!raw) return ['未記録'];
  const found = WEATHERS.filter(w => raw.includes(w));
  return found.length ? found.map(w => `${w} ${WEATHER_NAMES[w]}`) : ['その他'];
}
function markName(v) {
  if (!v) return 'なし';
  const hit = MARKS.find(m => m.v === v);
  return hit ? hit.n : v;
}
function poopCount(r) { return POOPS.reduce((n, p) => n + (r[p.key] === true ? 1 : 0), 0); }
function condScore(r, key) { return COND_SCORE[r[key]] ?? null; }
function condAvg(r) { return avg(DOGS.map(d => condScore(r, d.key))); }
function appetiteScore(r) { return avg(MEALS.map(m => APPETITE_SCORE[r[m.key]] ?? null)); }
function memoText(r) { return (r.otherNotes || '').trim(); }

/* ============================================================
   指標（数値化できるもの）と 要因（グループ分けするもの）
   ============================================================ */
const METRICS = [
  { id: 'condCoco', name: 'ココの体調スコア', unit: '点', digits: 1, get: r => condScore(r, 'conditionCoco'), hint: '○=100 / △=50 / ×=0' },
  { id: 'condNono', name: 'ノノの体調スコア', unit: '点', digits: 1, get: r => condScore(r, 'conditionNono'), hint: '○=100 / △=50 / ×=0' },
  { id: 'condMomo', name: 'モモの体調スコア', unit: '点', digits: 1, get: r => condScore(r, 'conditionMomo'), hint: '○=100 / △=50 / ×=0' },
  { id: 'condBibi', name: 'ビビの体調スコア', unit: '点', digits: 1, get: r => condScore(r, 'conditionBibi'), hint: '○=100 / △=50 / ×=0' },
  { id: 'condAvg', name: '4匹平均の体調スコア', unit: '点', digits: 1, get: condAvg, hint: '○=100 / △=50 / ×=0' },
  { id: 'appetite', name: 'ココの食欲スコア', unit: '点', digits: 2, get: appetiteScore, hint: '完食=3 / 少し残す=2 / 半分=1 / ほぼ食べず=0（朝昼晩の平均）' },
  { id: 'poop', name: 'ココの排便回数', unit: '回', digits: 2, get: r => poopCount(r), hint: '朝・昼・散歩時・夜のチェック数（0〜4）' }
];
const metricById = id => METRICS.find(m => m.id === id) || METRICS[0];

function buildFactors() {
  const list = [
    { id: 'weather', name: '天気', groups: r => weatherList(r), order: [...WEATHERS.map(w => `${w} ${WEATHER_NAMES[w]}`), 'その他', '未記録'], multi: true },
    { id: 'temp', name: '体感気温', groups: r => [r.temperatureFeel || '未記録'], order: [...TEMPS, '未記録'] },
    { id: 'walk', name: '散歩', groups: r => [r.walk || '未記録'], order: [...WALKS, '未記録'] },
    { id: 'sleep', name: '睡眠の様子', groups: r => [r.sleepTime || '未記録'], order: [...SLEEPS, '未記録'] },
    { id: 'mark', name: '一覧用マーク', groups: r => [markName(r.eventMark)], order: ['なし', ...MARKS.map(m => m.n)] },
    { id: 'season', name: '季節', groups: r => [seasonOf(r)], order: SEASONS },
    { id: 'month', name: '月（1〜12月）', groups: r => [Number(r.date.slice(5, 7)) + '月'], order: Array.from({ length: 12 }, (_, i) => (i + 1) + '月') },
    { id: 'weekday', name: '曜日', groups: r => [WEEKDAYS[parseDate(r.date).getDay()] + '曜'], order: WEEKDAYS.map(w => w + '曜') },
    { id: 'poopAny', name: '排便の有無', groups: r => [poopCount(r) > 0 ? 'あり' : 'なし'], order: ['あり', 'なし'] },
    { id: 'photo', name: '写真の有無', groups: r => [r.hasPhoto ? 'あり' : 'なし'], order: ['あり', 'なし'] }
  ];
  MEDS.forEach(m => list.push({
    id: 'med:' + m.key, name: `服用：${m.name}`,
    groups: r => [r[m.key] === true ? '飲んだ' : '飲んでいない'], order: ['飲んだ', '飲んでいない']
  }));
  list.push({ id: 'keyword', name: 'メモのキーワード（右の欄に入力）', groups: null, order: ['含む', '含まない'] });
  return list;
}
const FACTORS = buildFactors();

/* ============================================================
   認証・データ読み込み
   ============================================================ */
$('loginButton').onclick = () => signInWithPopup(auth, new GoogleAuthProvider())
  .catch(e => { $('authStatus').textContent = 'ログインできませんでした: ' + e.message; });
$('logoutButton').onclick = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    $('authStatus').textContent = 'ログインすると記録を解析できます。';
    $('loginButton').classList.remove('hidden');
    $('logoutButton').classList.add('hidden');
    $('mainContent').classList.add('hidden');
    return;
  }
  currentUser = user;
  $('authStatus').textContent = `${user.email} でログイン中`;
  $('loginButton').classList.add('hidden');
  $('logoutButton').classList.remove('hidden');
  $('mainContent').classList.remove('hidden');
  const cached = loadCache();
  if (cached) { allRecords = cached.records; setStatus(`キャッシュから ${allRecords.length} 件（${cached.savedAt} 取得）`); applyFilter(); }
  await fetchRecords(!cached);
});

function cacheKey() { return 'cocoBunsekiCache_v1_' + (currentUser ? currentUser.uid : 'anon'); }
function loadCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return Array.isArray(obj.records) ? obj : null;
  } catch (_) { return null; }
}
function saveCache() {
  try { localStorage.setItem(cacheKey(), JSON.stringify({ savedAt: new Date().toLocaleString('ja-JP'), records: allRecords })); } catch (_) { }
}
function loadExtraKeywords() {
  try { const raw = localStorage.getItem('cocoBunsekiKeywords_v1'); return raw ? JSON.parse(raw) : []; } catch (_) { return []; }
}
function saveExtraKeywords() {
  try { localStorage.setItem('cocoBunsekiKeywords_v1', JSON.stringify(extraKeywords)); } catch (_) { }
}
function setStatus(text) { $('status').textContent = text; }

async function fetchRecords(showLoading) {
  if (showLoading) setStatus('🔄 データを読み込み中…（記録数が多いと少し時間がかかります）');
  $('reloadButton').disabled = true;
  try {
    const snap = await getDocs(recordsCollection);
    allRecords = snap.docs.map(d => {
      const data = d.data();
      const { dogPhotoBase64, ...rest } = data;              // 写真は解析に使わないので保持しない
      return { id: d.id, ...rest, hasPhoto: !!dogPhotoBase64 };
    }).filter(r => typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    saveCache();
    setStatus(`✅ ${allRecords.length} 件を読み込みました（${new Date().toLocaleString('ja-JP')} 時点）`);
    applyFilter();
  } catch (e) {
    setStatus('❌ 読み込みに失敗しました: ' + e.message);
  } finally {
    $('reloadButton').disabled = false;
  }
}

/* ============================================================
   期間フィルタ・タブ
   ============================================================ */
$('periodSelect').onchange = () => {
  $('customRange').classList.toggle('hidden', $('periodSelect').value !== 'custom');
  if ($('periodSelect').value === 'custom' && allRecords.length) {
    if (!$('dateFrom').value) $('dateFrom').value = allRecords[0].date;
    if (!$('dateTo').value) $('dateTo').value = allRecords[allRecords.length - 1].date;
  }
  applyFilter();
};
$('dateFrom').onchange = applyFilter;
$('dateTo').onchange = applyFilter;
$('reloadButton').onclick = () => fetchRecords(true);
$('csvButton').onclick = downloadCsv;

document.querySelectorAll('#tabs button').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  $('panel-' + activeTab).classList.remove('hidden');
  render();
});

function applyFilter() {
  const mode = $('periodSelect').value;
  if (mode === 'all') view = allRecords.slice();
  else if (mode === 'custom') {
    const from = $('dateFrom').value || '0000-01-01';
    const to = $('dateTo').value || '9999-12-31';
    view = allRecords.filter(r => r.date >= from && r.date <= to);
  } else {
    const n = Number(mode);
    const from = dateKey(new Date(Date.now() - (n - 1) * 86400000));
    view = allRecords.filter(r => r.date >= from);
  }
  render();
}

function render() {
  if (!allRecords.length) return;
  if (activeTab === 'summary') renderSummary();
  if (activeTab === 'monthly') renderMonthly();
  if (activeTab === 'cross') renderCross();
  if (activeTab === 'tally') renderTally();
  if (activeTab === 'memo') renderMemo();
}

/* ============================================================
   グラフ（外部ライブラリなし・手書きSVG）
   ============================================================ */
function lineChartSvg({ labels, series, yMin, yMax, yFormat = v => String(v) }) {
  const W = 720, H = 250, L = 44, R = 14, T = 12, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const n = labels.length;
  const x = i => n > 1 ? L + pw * i / (n - 1) : L + pw / 2;
  const y = v => T + ph - (v - yMin) / (yMax - yMin || 1) * ph;
  const ticks = 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let t = 0; t <= ticks; t++) {
    const val = yMin + (yMax - yMin) * t / ticks, yy = y(val);
    s += `<line class="gridline" x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}"/>`;
    s += `<text class="axis" x="${L - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${esc(yFormat(val))}</text>`;
  }
  series.forEach(sr => {
    const pts = sr.values.map((v, i) => isNum(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null);
    let run = [];
    pts.forEach(p => {
      if (p) run.push(p);
      else { if (run.length > 1) s += poly(run, sr.color); run = []; }
    });
    if (run.length > 1) s += poly(run, sr.color);
    sr.values.forEach((v, i) => {
      if (!isNum(v)) return;
      s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#fff" stroke="${sr.color}" stroke-width="2"/>`;
    });
  });
  const every = Math.max(1, Math.ceil(n / 12));
  labels.forEach((lb, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    s += `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${esc(lb)}</text>`;
  });
  s += '</svg>';
  return s;
  function poly(points, color) {
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

function barChartSvg({ labels, values, color = '#4f7fb5', yFormat = v => String(v) }) {
  const W = 720, H = 220, L = 44, R = 14, T = 12, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(1, ...values.filter(isNum));
  const n = labels.length;
  const bw = n ? pw / n * 0.68 : 0;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let t = 0; t <= 4; t++) {
    const val = max * t / 4, yy = T + ph - ph * t / 4;
    s += `<line class="gridline" x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}"/>`;
    s += `<text class="axis" x="${L - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${esc(yFormat(val))}</text>`;
  }
  values.forEach((v, i) => {
    const cx = L + pw * (i + 0.5) / n;
    const h = isNum(v) ? ph * v / max : 0;
    s += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2"/>`;
  });
  const every = Math.max(1, Math.ceil(n / 14));
  labels.forEach((lb, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    const cx = L + pw * (i + 0.5) / n;
    s += `<text class="axis" x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${esc(lb)}</text>`;
  });
  s += '</svg>';
  return s;
}

function legendHtml(series) {
  return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
function miniBar(ratio, color = '#4f7fb5') {
  const w = Math.max(0, Math.min(100, ratio || 0));
  return `<span style="display:inline-block;width:70px;height:8px;background:#eef2f6;border-radius:4px;overflow:hidden;vertical-align:middle">
    <span style="display:block;width:${w.toFixed(1)}%;height:100%;background:${color}"></span></span>`;
}

/* ============================================================
   概要タブ
   ============================================================ */
function renderSummary() {
  const el = $('panel-summary');
  if (!view.length) { el.innerHTML = emptyCard(); return; }
  const first = view[0].date, last = view[view.length - 1].date;
  const span = daysBetween(first, last);
  const cover = pct(view.length, span);
  const hospital = view.filter(r => r.eventMark === '🏥').length;

  const stats = [
    { k: '記録日数', v: view.length + ' 日', s: `${first} 〜 ${last}` },
    { k: '期間の日数', v: span + ' 日', s: `記録率 ${fmt(cover, 0)}%` },
    ...DOGS.map(d => {
      const vals = view.map(r => condScore(r, d.key)).filter(isNum);
      const ok = view.filter(r => r[d.key] === '○').length;
      return { k: d.name + 'の体調', v: fmt(avg(vals), 1) + ' 点', s: `○の日 ${ok}日 / ${vals.length}日` };
    }),
    { k: 'ココの食欲スコア', v: fmt(avg(view.map(appetiteScore)), 2), s: '3点満点（朝昼晩の平均）' },
    { k: 'ココの排便', v: fmt(avg(view.map(poopCount)), 2) + ' 回/日', s: `記録なしの日 ${view.filter(r => poopCount(r) === 0).length}日` },
    { k: '🏥 病院マーク', v: hospital + ' 日', s: 'マーク欄で🏥を選んだ日' }
  ];

  const months = groupByMonth(view);
  const labels = months.map(m => m.key.slice(2).replace('-', '/'));
  const series = DOGS.map(d => ({
    name: d.name, color: d.color,
    values: months.map(m => avg(m.records.map(r => condScore(r, d.key))))
  }));

  el.innerHTML = `
  <div class="card">
    <h2>この期間のまとめ</h2>
    <div class="stats">${stats.map(s => `<div class="stat"><div class="k">${esc(s.k)}</div><div class="v">${esc(s.v)}</div><div class="s">${esc(s.s)}</div></div>`).join('')}</div>
    <p class="muted" style="margin-top:10px">体調スコアは ○=100点 / △=50点 / ×=0点 として平均した値です（このページ独自の計算です）。</p>
  </div>
  ${markListCard()}
  ${appetiteTrendCard()}
  <div class="card">
    <h2>月別の体調スコア</h2>
    ${months.length ? lineChartSvg({ labels, series, yMin: 0, yMax: 100, yFormat: v => v.toFixed(0) }) + legendHtml(series) : '<p class="muted">データがありません。</p>'}
  </div>`;

  el.querySelectorAll('button[data-mark]').forEach(b => b.onclick = () => {
    summaryMark = b.dataset.mark;
    renderSummary();
  });
}

/* 直近30日の食欲推移（ココ）と食欲メモ
   ※ 健康管理手帳のトップページから移動してきた機能 */
function appetiteTrendCard() {
  const last30 = allRecords.slice(-30);
  if (!last30.length) {
    return `<div class="card"><h2>直近30日の食欲推移（ココ）</h2><p class="muted">データがありません。</p></div>`;
  }

  const labels = last30.map(r => r.date.slice(5).replace('-', '/'));
  const values = last30.map(r => {
    const scores = MEALS.map(m => APPETITE_SCORE[r[m.key]]).filter(isNum);
    return scores.length ? scores.reduce((a, b) => a + b, 0) : null;
  });
  const series = [{ name: 'ココの食欲（朝＋昼＋晩）', color: '#d65f78', values }];

  return `
  <div class="card">
    <h2>直近30日の食欲推移（ココ）</h2>
    ${lineChartSvg({ labels, series, yMin: 0, yMax: 9, yFormat: v => v.toFixed(0) })}
    ${legendHtml(series)}
    <p class="muted" style="margin-top:8px">完食=3点 / 少し残す=2点 / 半分=1点 / ほぼ食べず=0点 として、朝・昼・晩を合計した値です（9点満点）。上の期間の絞り込みとは関係なく、記録がある直近30日分を表示します。</p>
    ${appetiteAdviceHtml(values)}
  </div>`;
}

function appetiteAdviceHtml(values) {
  const scores = values.filter(isNum);
  if (scores.length < 3) {
    return `<div class="note">🐾 3日分以上の記録が貯まると、食欲の傾向を表示します。</div>`;
  }

  const latest = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const diff = latest - prev;

  let icon = '🐾';
  let message = '食欲は安定しています。日々の記録を続けることで、小さな変化にも気づきやすくなります。';

  if (latest <= 3) {
    icon = '⚠️';
    message = 'ココの食欲がかなり低下しています。「嘔吐」や「咳」などの記録がないか確認し、続く場合は早めに先生に相談しましょう。';
  } else if (diff <= -3) {
    icon = '📉';
    message = '前回の記録より食欲が急に落ちています。気圧や気温の変化による疲れかもしれません。ゆっくり休ませてあげてください。';
  } else if (latest >= 8) {
    icon = '✨';
    message = '完食が続いていますね。体調はとても良さそうです。この調子で投薬も忘れずに進めましょう。';
  }

  return `<div class="note">${icon} <strong>食欲メモ：</strong>${esc(message)}（直近の記録 ${latest} 点 / 9点）</div>`;
}

/* マークを付けた日の一覧（日付を押すとその日の記録を表示） */
function markListCard() {
  const counts = MARKS.map(m => ({ v: m.v, name: m.n, c: view.filter(r => r.eventMark === m.v).length }));
  const hits = view.filter(r => r.eventMark === summaryMark);
  const current = MARKS.find(m => m.v === summaryMark) || MARKS[0];

  let body;
  if (!hits.length) {
    body = `<p class="muted">この期間に「${esc(current.n)}」の日はありません。</p>`;
  } else {
    body = groupByMonth(hits).map(m => `
      <div class="monthhead">${esc(m.key)}（${m.records.length}日）</div>
      <div class="daygrid">${m.records.map(r => dayButton(r)).join('')}</div>`).join('');
  }

  return `
  <div class="card">
    <h2>マークを付けた日</h2>
    <div class="row" style="margin-bottom:6px">
      ${counts.map(m => `<button class="kw${m.v === summaryMark ? ' on' : ''}" data-mark="${esc(m.v)}">${esc(m.name)} <span class="muted">${m.c}</span></button>`).join('')}
    </div>
    <p class="muted">「${esc(current.n)}」の日：${hits.length}日 ／ 日付を押すと、その日の記録をまとめて表示します。</p>
    ${body}
  </div>`;
}

function dayButton(r) {
  const wd = WEEKDAYS[parseDate(r.date).getDay()];
  const memo = memoText(r);
  const tip = memo ? memo.replace(/\s+/g, ' ').slice(0, 40) : '';
  return `<button class="daylink" data-day="${esc(r.date)}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(r.date)}（${wd}）</button>`;
}

/* ============================================================
   日別カルテ（モーダル）
   ============================================================ */
function recordByDate(d) { return allRecords.find(r => r.date === d) || null; }

function openDay(dateStr) {
  modalDate = dateStr;
  renderDayModal();
  $('dayModal').classList.remove('hidden');
}
function closeDay() { $('dayModal').classList.add('hidden'); modalDate = ''; }

$('dayClose').onclick = closeDay;
$('dayModal').onclick = e => { if (e.target === $('dayModal')) closeDay(); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('dayModal').classList.contains('hidden')) closeDay();
});
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-day]');
  if (!btn) return;
  e.preventDefault();
  openDay(btn.dataset.day);
});

function renderDayModal() {
  const r = recordByDate(modalDate);
  const wd = modalDate ? WEEKDAYS[parseDate(modalDate).getDay()] : '';
  $('dayTitle').textContent = `${modalDate}（${wd}）の記録`;
  if (!r) {
    $('dayBody').innerHTML = '<p class="muted">この日の記録は見つかりませんでした。</p>';
    return;
  }

  const poopOn = POOPS.filter(p => r[p.key] === true).map(p => p.name);
  const medOn = MEDS.filter(m => r[m.key] === true).map(m => m.name);
  const weatherTxt = (r.weather || '').trim()
    ? WEATHERS.filter(w => (r.weather || '').includes(w)).map(w => `${w} ${WEATHER_NAMES[w]}`).join(' ・ ') || r.weather
    : '未記録';

  const rows = [
    ['マーク', markName(r.eventMark)],
    ['体調', DOGS.map(d => `${d.name}：${r[d.key] || '—'}`).join('　')],
    ['天気', weatherTxt],
    ['体感気温', r.temperatureFeel || '未記録'],
    ['食欲', MEALS.map(m => `${m.name}：${r[m.key] || '—'}`).join('　') + `（スコア ${fmt(appetiteScore(r), 2)}）`],
    ['ココの排便', poopOn.length ? `${poopOn.join('・')}（${poopOn.length}回）` : 'チェックなし'],
    ['睡眠の様子', r.sleepTime || '未記録'],
    ['散歩', r.walk || '未記録'],
    ['服用チェック', medOn.length ? medOn.join('、') : 'なし'],
    ['写真', r.hasPhoto ? 'あり（記録手帳で見られます）' : 'なし'],
    ['メモ', memoText(r) || '（記入なし）']
  ];

  const idx = allRecords.findIndex(x => x.date === modalDate);
  const prev = idx > 0 ? allRecords[idx - 1] : null;
  const next = idx >= 0 && idx < allRecords.length - 1 ? allRecords[idx + 1] : null;

  $('dayBody').innerHTML = `
    <table class="kv"><tbody>
      ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
    </tbody></table>
    <div class="modal-nav">
      <span>${prev ? `<button class="daylink" data-day="${esc(prev.date)}">← ${esc(prev.date)}</button>` : ''}</span>
      <a href="index.html?date=${encodeURIComponent(modalDate)}" class="daylink" style="text-decoration:none">📖 記録手帳でこの日を開く</a>
      <span>${next ? `<button class="daylink" data-day="${esc(next.date)}">${esc(next.date)} →</button>` : ''}</span>
    </div>`;
}

function emptyCard() { return `<div class="card"><p class="muted">この期間には記録がありません。上の期間設定を変えてみてください。</p></div>`; }

function groupByMonth(list) {
  const map = new Map();
  list.forEach(r => {
    const k = monthKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return [...map.keys()].sort().map(k => ({ key: k, records: map.get(k) }));
}

/* ============================================================
   月別・季節別タブ
   ============================================================ */
function renderMonthly() {
  const el = $('panel-monthly');
  if (!view.length) { el.innerHTML = emptyCard(); return; }
  const metricId = el.dataset.metric || 'condAvg';
  const metric = metricById(metricId);
  const months = groupByMonth(view);

  const labels = months.map(m => m.key.slice(2).replace('-', '/'));
  let chart = '', legend = '';
  if (metricId === 'condAvg') {
    const series = DOGS.map(d => ({ name: d.name, color: d.color, values: months.map(m => avg(m.records.map(r => condScore(r, d.key)))) }));
    chart = lineChartSvg({ labels, series, yMin: 0, yMax: 100, yFormat: v => v.toFixed(0) });
    legend = legendHtml(series);
  } else {
    const values = months.map(m => avg(m.records.map(metric.get)));
    const max = metricId.startsWith('cond') ? 100 : (metricId === 'appetite' ? 3 : 4);
    const series = [{ name: metric.name, color: '#4f7fb5', values }];
    chart = lineChartSvg({ labels, series, yMin: 0, yMax: max, yFormat: v => v.toFixed(metric.digits === 2 ? 1 : 0) });
    legend = legendHtml(series);
  }

  const monthRows = months.map(m => {
    const rs = m.records;
    return `<tr>
      <td>${esc(m.key)}</td>
      <td class="num">${rs.length}</td>
      ${DOGS.map(d => `<td class="num">${fmt(avg(rs.map(r => condScore(r, d.key))), 1)}</td>`).join('')}
      <td class="num">${fmt(avg(rs.map(appetiteScore)), 2)}</td>
      <td class="num">${fmt(avg(rs.map(poopCount)), 2)}</td>
      <td class="num">${rs.filter(r => r.eventMark === '🏥').length}</td>
    </tr>`;
  }).join('');

  const seasonRows = SEASONS.map(sn => {
    const rs = view.filter(r => seasonOf(r) === sn);
    if (!rs.length) return `<tr class="thin"><td>${esc(sn)}</td><td class="num">0</td><td colspan="7" class="muted">記録なし</td></tr>`;
    return `<tr${rs.length < MIN_N ? ' class="thin"' : ''}>
      <td>${esc(sn)}</td>
      <td class="num">${rs.length}</td>
      ${DOGS.map(d => `<td class="num">${fmt(avg(rs.map(r => condScore(r, d.key))), 1)}</td>`).join('')}
      <td class="num">${fmt(avg(rs.map(appetiteScore)), 2)}</td>
      <td class="num">${fmt(avg(rs.map(poopCount)), 2)}</td>
      <td class="num">${rs.filter(r => r.eventMark === '🏥').length}</td>
    </tr>`;
  }).join('');

  const head = `<th>期間</th><th class="num">記録日数</th>${DOGS.map(d => `<th class="num">${d.name}</th>`).join('')}<th class="num">食欲</th><th class="num">排便</th><th class="num">🏥</th>`;

  el.innerHTML = `
  <div class="card">
    <h2>月ごとの推移</h2>
    <div class="row" style="margin-bottom:10px">
      <label for="monthlyMetric">グラフの指標</label>
      <select id="monthlyMetric">${METRICS.map(m => `<option value="${m.id}"${m.id === metricId ? ' selected' : ''}>${esc(m.name)}${m.id === 'condAvg' ? '（4匹を並べて表示）' : ''}</option>`).join('')}</select>
    </div>
    ${chart}${legend}
    <div class="tablewrap" style="margin-top:14px">
      <table><thead><tr>${head}</tr></thead><tbody>${monthRows}</tbody></table>
    </div>
    <p class="muted">食欲＝3点満点 / 排便＝1日あたりの回数（0〜4）。「—」はその月に該当データがないことを表します。</p>
  </div>
  <div class="card">
    <h2>季節別</h2>
    <div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${seasonRows}</tbody></table></div>
    <div class="note">季節の区切りは 春=3〜5月 / 夏=6〜8月 / 秋=9〜11月 / 冬=12〜2月 としています。記録日数が ${MIN_N} 件未満の行は薄く表示しています（偶然のばらつきが大きく、傾向とは言い切れません）。</div>
  </div>`;

  $('monthlyMetric').onchange = e => { el.dataset.metric = e.target.value; renderMonthly(); };
}

/* ============================================================
   項目どうしの関連タブ
   ============================================================ */
function renderCross() {
  const el = $('panel-cross');
  if (!view.length) { el.innerHTML = emptyCard(); return; }
  const factorId = el.dataset.factor || 'weather';
  const metricId = el.dataset.metric || 'condCoco';
  const kw = el.dataset.kw || '';
  const factor = FACTORS.find(f => f.id === factorId) || FACTORS[0];
  const metric = metricById(metricId);

  const groupsFn = factorId === 'keyword'
    ? (r => [memoText(r).includes(kw) && kw ? '含む' : '含まない'])
    : factor.groups;

  const buckets = new Map();
  view.forEach(r => {
    const v = metric.get(r);
    groupsFn(r).forEach(g => {
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(v);
    });
  });

  const overall = avg(view.map(metric.get));
  const order = factor.order || [];
  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return buckets.get(b).length - buckets.get(a).length;
  });

  const maxV = metricId.startsWith('cond') ? 100 : (metricId === 'appetite' ? 3 : 4);
  const rows = keys.map(k => {
    const vals = buckets.get(k).filter(isNum);
    const n = buckets.get(k).length;
    const a = avg(vals);
    const diff = isNum(a) && isNum(overall) ? a - overall : null;
    const thin = n < MIN_N;
    return `<tr${thin ? ' class="thin"' : ''}>
      <td>${esc(k)}</td>
      <td class="num">${n}</td>
      <td class="num">${fmt(a, metric.digits)}</td>
      <td>${isNum(a) ? miniBar(a / maxV * 100) : ''}</td>
      <td class="num" style="color:${diff === null ? '#999' : (diff > 0 ? '#2f7d4f' : (diff < 0 ? '#c0392b' : '#999'))}">${diff === null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(metric.digits)}</td>
      <td class="muted">${thin ? '件数が少なく参考値' : ''}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
  <div class="card">
    <h2>要因ごとの平均を比べる</h2>
    <div class="row" style="margin-bottom:12px">
      <label for="crossFactor">分けかた</label>
      <select id="crossFactor">${FACTORS.map(f => `<option value="${f.id}"${f.id === factorId ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      <label for="crossMetric">見たい指標</label>
      <select id="crossMetric">${METRICS.map(m => `<option value="${m.id}"${m.id === metricId ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <span id="kwWrap" class="row ${factorId === 'keyword' ? '' : 'hidden'}">
        <label for="crossKw">キーワード</label>
        <input type="text" id="crossKw" value="${esc(kw)}" placeholder="例：下痢" size="10">
      </span>
    </div>
    <p class="muted">${esc(metric.name)}：${esc(metric.hint)} ／ 期間全体の平均は <strong>${fmt(overall, metric.digits)}</strong>（${view.length}日）</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>${esc(factor.name)}</th><th class="num">日数</th><th class="num">平均</th><th>目安</th><th class="num">全体との差</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">データがありません</td></tr>'}</tbody>
      </table>
    </div>
    <div class="note">
      この表は「そのグループの平均を並べただけ」のもので、原因と結果を示すものではありません。<br>
      日数が ${MIN_N} 件未満のグループは薄く表示しています。差が小さい場合や日数が少ない場合は、偶然のばらつきの可能性があります。<br>
      天気は1日に2つまで選べるため、天気で分けたときの日数の合計は記録日数より多くなることがあります。
    </div>
  </div>`;

  $('crossFactor').onchange = e => { el.dataset.factor = e.target.value; renderCross(); };
  $('crossMetric').onchange = e => { el.dataset.metric = e.target.value; renderCross(); };
  const kwInput = $('crossKw');
  if (kwInput) kwInput.onchange = e => { el.dataset.kw = e.target.value.trim(); renderCross(); };
}

/* ============================================================
   集計一覧タブ
   ============================================================ */
function countTable(title, rows, total, note) {
  const body = rows.map(r => {
    const p = pct(r.n, total);
    const thin = r.n === 0;
    return `<tr${thin ? ' class="thin"' : ''}><td>${esc(r.label)}</td><td class="num">${r.n}</td><td class="num">${fmt(p, 1)}%</td><td>${miniBar(p)}</td></tr>`;
  }).join('');
  return `<h3>${esc(title)}</h3>
  <div class="tablewrap"><table><thead><tr><th>項目</th><th class="num">日数</th><th class="num">割合</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
  ${note ? `<p class="muted">${esc(note)}</p>` : ''}`;
}

function renderTally() {
  const el = $('panel-tally');
  if (!view.length) { el.innerHTML = emptyCard(); return; }
  const N = view.length;
  const cnt = (fn) => (label) => ({ label, n: view.filter(r => fn(r) === label).length });

  let html = `<div class="card"><h2>項目ごとの集計（${N}日分）</h2>`;

  DOGS.forEach(d => {
    const rows = COND_ORDER.map(c => ({ label: c, n: view.filter(r => r[d.key] === c).length }));
    rows.push({ label: '未記録', n: view.filter(r => !COND_ORDER.includes(r[d.key])).length });
    html += countTable(`体調：${d.name}`, rows, N);
  });

  MEALS.forEach(m => {
    const rows = APPETITE_ORDER.map(a => ({ label: a, n: view.filter(r => r[m.key] === a).length }));
    rows.push({ label: '未記録', n: view.filter(r => !APPETITE_ORDER.includes(r[m.key])).length });
    html += countTable(`食欲：${m.name}`, rows, N);
  });

  html += countTable('天気', [...WEATHERS.map(w => ({ label: `${w} ${WEATHER_NAMES[w]}`, n: view.filter(r => (r.weather || '').includes(w)).length })), { label: '未記録', n: view.filter(r => !(r.weather || '').trim()).length }], N, '1日に2つまで選べるため、合計が100%を超えることがあります。');

  html += countTable('体感気温', [...TEMPS.map(cnt(r => r.temperatureFeel)), { label: '未記録', n: view.filter(r => !TEMPS.includes(r.temperatureFeel)).length }], N);
  html += countTable('睡眠の様子', [...SLEEPS.map(cnt(r => r.sleepTime)), { label: '未記録', n: view.filter(r => !SLEEPS.includes(r.sleepTime)).length }], N);
  html += countTable('散歩', [...WALKS.map(cnt(r => r.walk)), { label: '未記録', n: view.filter(r => !WALKS.includes(r.walk)).length }], N);
  html += countTable('一覧用マーク', [{ label: 'なし', n: view.filter(r => !r.eventMark).length }, ...MARKS.map(m => ({ label: m.n, n: view.filter(r => r.eventMark === m.v).length }))], N);
  html += countTable('服用中の薬（チェックが入っていた日）', MEDS.map(m => ({ label: m.name, n: view.filter(r => r[m.key] === true).length })), N, '記録フォームでは初期状態でチェックが入っているため、実際の服用と一致しない日が含まれる可能性があります。');
  html += countTable('ココの排便（時間帯別）', POOPS.map(p => ({ label: p.name, n: view.filter(r => r[p.key] === true).length })), N);
  html += countTable('ココの排便回数（1日あたり）', [0, 1, 2, 3, 4].map(k => ({ label: k + '回', n: view.filter(r => poopCount(r) === k).length })), N);
  html += countTable('写真', [{ label: 'あり', n: view.filter(r => r.hasPhoto).length }, { label: 'なし', n: view.filter(r => !r.hasPhoto).length }], N);
  html += countTable('メモ', [{ label: '書いてある', n: view.filter(r => memoText(r)).length }, { label: '空欄', n: view.filter(r => !memoText(r)).length }], N);

  html += '</div>';
  el.innerHTML = html;
}

/* ============================================================
   メモ解析タブ
   ============================================================ */
function allKeywords() {
  return [...new Set([...DEFAULT_KEYWORDS, ...extraKeywords])];
}
function keywordHits(word) {
  return view.filter(r => word && memoText(r).includes(word));
}
function highlight(text, word) {
  const safe = esc(text);
  if (!word) return safe;
  const w = esc(word);
  return safe.split(w).join(`<mark>${w}</mark>`);
}

function renderMemo() {
  const el = $('panel-memo');
  if (!view.length) { el.innerHTML = emptyCard(); return; }
  const withMemo = view.filter(r => memoText(r));

  const kwRows = allKeywords().map(w => {
    const hits = keywordHits(w);
    return { w, n: hits.length, last: hits.length ? hits[hits.length - 1].date : '' };
  }).sort((a, b) => b.n - a.n);

  const chips = kwRows.map(k => `<button class="kw${k.w === memoKeyword ? ' on' : ''}" data-kw="${esc(k.w)}">${esc(k.w)} <span class="muted">${k.n}</span></button>`).join('');

  const kwTable = kwRows.filter(k => k.n > 0).map(k => `<tr>
      <td><button class="kw" data-kw="${esc(k.w)}">${esc(k.w)}</button></td>
      <td class="num">${k.n}</td>
      <td class="num">${fmt(pct(k.n, view.length), 1)}%</td>
      <td>${esc(k.last)}</td>
    </tr>`).join('');

  // 選択キーワードの月別推移と該当日一覧
  let detail = '<p class="muted">上のキーワードを押すと、その語が書かれた日の一覧と月ごとの回数を表示します。</p>';
  if (memoKeyword) {
    const hits = keywordHits(memoKeyword);
    const months = groupByMonth(view);
    const labels = months.map(m => m.key.slice(2).replace('-', '/'));
    const values = months.map(m => m.records.filter(r => memoText(r).includes(memoKeyword)).length);
    const condOnHit = avg(hits.map(r => condScore(r, 'conditionCoco')));
    const condAll = avg(view.map(r => condScore(r, 'conditionCoco')));
    const list = hits.slice().reverse().map(r => `<div class="memoitem">
        <div class="d"><button class="daylink" data-day="${esc(r.date)}">${esc(r.date)}（${WEEKDAYS[parseDate(r.date).getDay()]}）</button>
          ${DOGS.map(d => `${d.name}:${esc(r[d.key] || '—')}`).join(' / ')}
          ${r.eventMark ? ' ' + esc(r.eventMark) : ''}</div>
        <div class="t">${highlight(memoText(r), memoKeyword)}</div>
      </div>`).join('');
    detail = `
      <h3>「${esc(memoKeyword)}」が書かれた日：${hits.length}日（記録日数の ${fmt(pct(hits.length, view.length), 1)}%）</h3>
      ${barChartSvg({ labels, values, yFormat: v => v.toFixed(0) })}
      <p class="muted">この語が書かれた日のココの体調スコア平均：<strong>${fmt(condOnHit, 1)}</strong>（期間全体は ${fmt(condAll, 1)}）</p>
      <div style="max-height:420px;overflow:auto;border:1px solid #e3e7ec;border-radius:8px;padding:0 10px">${list || '<p class="muted">該当なし</p>'}</div>`;
  }

  // 参考：メモの断片頻度
  const freq = new Map();
  withMemo.forEach(r => {
    memoText(r).split(/[\s、。,.，．・／/\n\r()（）「」]+/).forEach(tok => {
      const t = tok.trim();
      if (t.length < 2 || t.length > 12) return;
      freq.set(t, (freq.get(t) || 0) + 1);
    });
  });
  const freqRows = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([t, n]) => `<tr><td><button class="kw" data-kw="${esc(t)}">${esc(t)}</button></td><td class="num">${n}</td></tr>`).join('');

  el.innerHTML = `
  <div class="card">
    <h2>メモの解析</h2>
    <p class="muted">メモがある日：${withMemo.length}日 / ${view.length}日（${fmt(pct(withMemo.length, view.length), 1)}%）</p>
    <h3>キーワードで数える</h3>
    <div class="kwlist">${chips}</div>
    <div class="row" style="margin-top:10px">
      <input type="text" id="memoSearch" placeholder="自由に検索（例：吐いた）" size="16">
      <button id="memoSearchBtn">検索</button>
      <button id="memoAddBtn">この語をキーワードに追加</button>
      ${extraKeywords.length ? '<button id="memoClearBtn">追加した語をすべて削除</button>' : ''}
    </div>
    <div class="tablewrap" style="margin-top:12px">
      <table><thead><tr><th>キーワード</th><th class="num">日数</th><th class="num">割合</th><th>最後に登場</th></tr></thead>
      <tbody>${kwTable || '<tr><td colspan="4" class="muted">該当するキーワードはありませんでした</td></tr>'}</tbody></table>
    </div>
  </div>
  <div class="card">${detail}</div>
  <div class="card">
    <h2>参考：メモによく出てくる語</h2>
    <p class="muted">メモを句読点・スペース・記号で区切って数えた、単純な出現回数です。日本語を文法的に解析しているわけではないので、途中で切れた語や意味のない断片が混じることがあります。</p>
    <div class="tablewrap"><table><thead><tr><th>語</th><th class="num">出現回数</th></tr></thead><tbody>${freqRows || '<tr><td colspan="2" class="muted">メモがありません</td></tr>'}</tbody></table></div>
  </div>`;

  el.querySelectorAll('button.kw').forEach(b => b.onclick = () => {
    memoKeyword = memoKeyword === b.dataset.kw ? '' : b.dataset.kw;
    renderMemo();
  });
  $('memoSearchBtn').onclick = () => { memoKeyword = $('memoSearch').value.trim(); renderMemo(); };
  $('memoSearch').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('memoSearchBtn').click(); } };
  $('memoAddBtn').onclick = () => {
    const w = ($('memoSearch').value || memoKeyword).trim();
    if (!w) return;
    if (!allKeywords().includes(w)) { extraKeywords.push(w); saveExtraKeywords(); }
    memoKeyword = w;
    renderMemo();
  };
  const clr = $('memoClearBtn');
  if (clr) clr.onclick = () => { extraKeywords = []; saveExtraKeywords(); renderMemo(); };
}

/* ============================================================
   CSV出力
   ============================================================ */
function downloadCsv() {
  if (!view.length) { alert('この期間には記録がありません。'); return; }
  const cols = [
    ['日付', r => r.date],
    ['曜日', r => WEEKDAYS[parseDate(r.date).getDay()]],
    ['天気', r => r.weather || ''],
    ['体感気温', r => r.temperatureFeel || ''],
    ['マーク', r => r.eventMark || ''],
    ...DOGS.map(d => [`体調_${d.name}`, r => r[d.key] || '']),
    ...DOGS.map(d => [`体調スコア_${d.name}`, r => { const v = condScore(r, d.key); return isNum(v) ? v : ''; }]),
    ...MEALS.map(m => [`食欲_${m.name}`, r => r[m.key] || '']),
    ['食欲スコア', r => { const v = appetiteScore(r); return isNum(v) ? v.toFixed(2) : ''; }],
    ...POOPS.map(p => [`排便_${p.name}`, r => r[p.key] === true ? 1 : 0]),
    ['排便回数', r => poopCount(r)],
    ...MEDS.map(m => [`薬_${m.name}`, r => r[m.key] === true ? 1 : 0]),
    ['睡眠', r => r.sleepTime || ''],
    ['散歩', r => r.walk || ''],
    ['写真', r => r.hasPhoto ? 1 : 0],
    ['メモ', r => memoText(r)]
  ];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map(c => q(c[0])).join(',')];
  view.forEach(r => lines.push(cols.map(c => q(c[1](r))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `piipi_kiroku_${view[0].date}_${view[view.length - 1].date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
