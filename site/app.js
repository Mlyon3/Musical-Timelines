'use strict';
const catalog = window.CATALOG;
const orchCatalog = window.CATALOG_ORCH;
const catalogs = { [catalog.version]: catalog, [orchCatalog.version]: orchCatalog };
// Each excerpt remembers which catalogue it came from (work ids can repeat across catalogues).
for (const c of Object.values(catalogs)) for (const e of c.excerpts) Object.defineProperty(e, '_cat', { value: c });
const allExcerpts = Object.values(catalogs).flatMap(c => c.excerpts);
const catOf = d => catalogs[d.catalogVersion];
const KEY = 'musical-flashbacks:collection-v2';
const XKEY = 'musical-flashbacks:extras-v1';
const CLIP = 25, HEARD_AFTER = 5;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const letter = (d, id) => String.fromCharCode(65 + d.initialOrder.indexOf(id));
const composerOf = id => catalog.composers.find(c => c.id === id);
const workOf = e => e._cat.works.find(w => w.id === e.workId);

/* ---------- storage ---------- */
let state = emptyCollection();
let extras = { results: {}, challenges: {}, name: '' };
try { state = restoreCollection(JSON.parse(localStorage.getItem(KEY) || 'null'), catalogs); } catch {}
try {
  const x = JSON.parse(localStorage.getItem(XKEY) || 'null');
  if (x && typeof x === 'object') extras = { results: x.results || {}, challenges: x.challenges || {}, name: typeof x.name === 'string' ? x.name : '', home: x.home === 'orchestral' ? 'orchestral' : undefined };
} catch {}
const firstVisit = !state.definitions.length;
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(XKEY, JSON.stringify(extras)); }
  catch { $('notice').textContent = 'This browser is not saving progress (private mode?). Keep this tab open.'; }
}

/* ---------- daily puzzle ---------- */
const EPOCH = new Date(2026, 10, 20); // Daily #1
function todayNumber() {
  const n = new Date();
  return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - EPOCH) / 864e5) + 1;
}
const DAILY_MODES = [{ kind: 'composer', composerId: 'beethoven' }, { kind: 'mixed' }, { kind: 'composer', composerId: 'brahms' }];
function dailyDefinition(n) {
  const id = 'daily-' + n;
  const existing = state.definitions.find(d => d.id === id);
  if (existing) return existing;
  const mode = DAILY_MODES[((n - 1) % 3 + 3) % 3];
  const rand = seededRandom(n * 7919 + 104729);
  const pool = validSelections(catalog, mode);
  const chosen = pool[Math.floor(rand() * pool.length)];
  const ids = chosen.map(e => e.id);
  const correct = [...chosen].sort((a, b) => workOf(a).year - workOf(b).year).map(e => e.id);
  let order;
  do {
    order = [...ids];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  } while (scoreOrder(order, correct).pairs > 9); // start from a genuinely scrambled order
  return {
    id, catalogVersion: catalog.version, mode,
    createdAt: EPOCH.getTime() + (n - 1) * 864e5,
    excerpts: chosen.map(({ id, version }) => ({ id, version })),
    initialOrder: order,
  };
}
const dayOf = d => d && d.id.startsWith('daily-') ? Number(d.id.slice(6)) : null;

/* ---------- app state ---------- */
let active = null;
let confirmReveal = false;
const game = () => state.attempts[active.id];
function save(g) { state = updateAttempt(state, active, g, catOf(active)); persist(); }
function select(d, { scroll = false } = {}) {
  if (active && active.id !== d.id) stop();
  active = d;
  confirmReveal = false;
  state = addDefinition(state, d);
  state.latest.current = d.id;
  if (!dayOf(d)) { state.latest.practice = d.id; $('mode').value = modeKey(d.mode); }
  persist();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}
function newPractice() {
  const v = $('mode').value;
  if (v === 'orchestral') { select(orchestralDefinition()); return; }
  const mode = v === 'mixed' ? { kind: 'mixed' } : { kind: 'composer', composerId: v };
  const history = selectionHistory(state, catalogs).filter(h => h.workIds.every(id => catalog.works.some(w => w.id === id)));
  select(generateDefinition(catalog, mode, state.familiarity, history));
}
// Orchestral: three Beethoven + three Brahms orchestral works, Apple Music previews.
function orchestralDefinition() {
  const c = orchCatalog, fam = state.familiarity;
  const last = [...state.definitions].reverse().find(d => d.mode.kind === 'orchestral');
  const lastSig = last ? signature(last.excerpts.map(e => e.id)) : '';
  const pickFrom = cid => {
    const es = c.excerpts.filter(e => workOf(e).composerId === cid);
    // Prefer works this browser hasn't heard yet, then shuffle.
    es.forEach(e => e._r = Math.random() + (fam[e.workId]?.heard ? 1 : 0));
    return es.sort((a, b) => a._r - b._r).slice(0, 3);
  };
  let chosen;
  for (let tries = 0; tries < 20; tries++) {
    chosen = [...pickFrom('beethoven'), ...pickFrom('brahms')];
    if (signature(chosen.map(e => e.id)) !== lastSig) break;
  }
  const correct = [...chosen].sort((a, b) => workOf(a).year - workOf(b).year).map(e => e.id);
  let order;
  do {
    order = chosen.map(e => e.id);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  } while (scoreOrder(order, correct).pairs > 9);
  return {
    id: crypto.randomUUID(), catalogVersion: c.version, mode: { kind: 'orchestral' }, createdAt: Date.now(),
    excerpts: chosen.map(({ id, version }) => ({ id, version })), initialOrder: order,
  };
}
function correctOrder(d) {
  return resolveExcerpts(catOf(d), d).sort((a, b) => workOf(a).year - workOf(b).year).map(e => e.id);
}
function modeName(m) { return m.kind === 'mixed' ? 'Mixed' : m.kind === 'orchestral' ? 'Orchestral' : composerOf(m.composerId).name; }

/* ---------- audio ---------- */
const audios = new Map();
let playing = null, raf = 0;
function audioFor(e) {
  let a = audios.get(e.id);
  if (!a) { a = new Audio(); a.preload = 'none'; a.src = e.audioPath; audios.set(e.id, a); }
  return a;
}
// Apple preview URLs can change; refresh from the iTunes lookup API once per session.
const appleFresh = new Map();
async function refreshApple(e, a) {
  if (e.provider !== 'apple' || appleFresh.has(e.id)) return;
  appleFresh.set(e.id, true);
  try {
    // Ask the player's own Apple store first (e.g. Japan), then the US; keep the saved link if both fail.
    const region = ((navigator.languages || [navigator.language]).map(l => (l.split('-')[1] || '')).find(r => /^[A-Za-z]{2}$/.test(r)) || '').toUpperCase();
    for (const country of [...new Set([region, 'US'].filter(Boolean))]) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
      try {
        const r = await fetch('https://itunes.apple.com/lookup?country=' + country + '&id=' + e.appleId, { signal: ctl.signal });
        const url = (await r.json()).results?.[0]?.previewUrl;
        if (url) { if (url !== a.src) a.src = url; break; }
      } catch {} finally { clearTimeout(t); }
    }
  } catch {}
}
function stop() {
  cancelAnimationFrame(raf);
  if (playing) { const a = audios.get(playing.id); if (a) { a.pause(); a.volume = 1; } }
  playing = null;
  paintPlayers();
}
async function toggle(id) {
  if (playing && playing.id === id) { stop(); return; }
  stop();
  const e = allExcerpts.find(x => x.id === id);
  const a = audioFor(e);
  if (e.provider === 'apple' && !appleFresh.has(e.id)) { playing = { id, loading: true }; paintPlayers(); await refreshApple(e, a); if (!playing || playing.id !== id) return; }
  const me = playing = { id, start: e.excerptStart, loading: true };
  paintPlayers();
  try {
    if (a.readyState < 1) await new Promise((res, rej) => { a.onloadedmetadata = res; a.onerror = rej; a.load(); });
    if (playing !== me) return;
    a.currentTime = e.excerptStart;
    a.volume = 1;
    await a.play();
    if (playing !== me) { a.pause(); return; }
    me.loading = false;
    a.onended = () => { if (playing === me) finish(me); };
    // Game logic runs on timeupdate (keeps working in background tabs); the ring repaints per frame.
    a.ontimeupdate = () => {
      if (playing !== me) return;
      const t = a.currentTime - me.start;
      if (t >= HEARD_AFTER) markHeard(id);
      if (t >= CLIP) finish(me);
    };
    const tick = () => {
      if (playing !== me) return;
      const t = Math.max(0, a.currentTime - me.start);
      try { a.volume = t > CLIP - 1.5 ? Math.max(0, (CLIP - t) / 1.5) : 1; } catch {}
      if (t >= CLIP) { finish(me); return; }
      paintRing(id, t / CLIP);
      raf = requestAnimationFrame(tick);
    };
    paintPlayers();
    tick();
  } catch {
    if (playing !== me) return;
    playing = null;
    paintPlayers();
    $('notice').textContent = 'That recording could not start — check your connection and try again.';
  }
}
function finish(me) { markHeard(me.id); stop(); }
const RING = 2 * Math.PI * 25;
function paintRing(id, f) {
  const c = document.querySelector('[data-play="' + id + '"] .bar');
  if (c) c.style.strokeDashoffset = String(RING * (1 - Math.min(1, f)));
}
function paintPlayers() {
  document.querySelectorAll('[data-play]').forEach(b => {
    const on = playing && playing.id === b.dataset.play;
    b.classList.toggle('loading', !!(on && playing.loading));
    b.querySelector('.glyph').textContent = on ? '❚❚' : '▶';
    b.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + b.dataset.label);
    if (!on) paintRing(b.dataset.play, 0);
  });
}
function markHeard(id) {
  const g = game();
  if (!active || g.heard.includes(id) || !active.initialOrder.includes(id)) return;
  save({ ...g, heard: [...g.heard, id] });
  const b = document.querySelector('[data-badge="' + id + '"]');
  if (b) b.classList.add('heard');
  paintProgress();
}

/* ---------- rendering ---------- */
function paintProgress() {
  const g = game();
  if (g.submitted) { $('progress').innerHTML = ''; return; }
  const n = g.heard.length;
  $('progress').innerHTML = active.initialOrder.map(id => '<span class="pip' + (g.heard.includes(id) ? ' on' : '') + '"></span>').join('') +
    '<span>&nbsp;Heard ' + n + ' of 6' + (n === 6 ? ' — ready when you are' : '') + '</span>';
}
function verdictFor(g, correct, id) {
  const diff = Math.abs(g.order.indexOf(id) - correct.indexOf(id));
  return { diff, guess: g.order.indexOf(id) + 1 };
}
function square(diff) { return diff === 0 ? '🟩' : diff === 1 ? '🟨' : '⬜'; }
function rating(p) {
  return p === 15 ? 'Flawless chronology' : p >= 13 ? 'Seasoned listener' : p >= 10 ? 'Good ears' : p >= 7 ? 'Finding the thread' : 'Lost in time';
}
const playBtn = (id, label) =>
  '<button class="play" data-play="' + esc(id) + '" data-label="' + esc(label) + '" aria-label="Play ' + esc(label) + '">' +
  '<svg viewBox="0 0 54 54" aria-hidden="true"><circle class="track" cx="27" cy="27" r="25"/><circle class="bar" cx="27" cy="27" r="25" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '"/></svg>' +
  '<span class="glyph">▶</span></button>';

function render() {
  if (!validOrder(game().order, active.initialOrder)) save({ ...game(), order: [...active.initialOrder] });
  const g = game(), d = active, day = dayOf(d);
  const es = resolveExcerpts(catOf(d), d);
  const byId = new Map(es.map(e => [e.id, e]));
  const correct = correctOrder(d);
  const isDaily = !!day;

  $('tab-daily').setAttribute('aria-pressed', String(isDaily));
  $('tab-practice').setAttribute('aria-pressed', String(!isDaily));
  $('practice-bar').hidden = isDaily;

  const orch = d.mode.kind === 'orchestral';
  $('composer').textContent = (isDaily ? 'Daily #' + day + ' · ' : '') + (orch ? 'Orchestral · Beethoven & Brahms' : d.mode.kind === 'mixed' ? 'Beethoven & Brahms, mixed' : composerOf(d.mode.composerId).fullName);
  $('intro').textContent = orch
    ? 'Six orchestral excerpts — three by Beethoven, three by Brahms. Listen, put them in the order they were written, then discover the works behind the sound.'
    : d.mode.kind === 'mixed'
    ? 'Two composers, six anonymous excerpts. Put them on one timeline, earliest at the top.'
    : 'Six moments from an early, middle and late career. Listen, put them in the order they were written, then discover the works behind the sound.';

  if (!isDaily) {
    const practice = state.definitions.filter(x => !dayOf(x));
    $('saved').innerHTML = practice.map((x, i) => {
      const r = extras.results[x.id];
      return '<option value="' + esc(x.id) + '"' + (x.id === d.id ? ' selected' : '') + '>' +
        esc(modeName(x.mode) + ' · Set ' + (i + 1) + (r ? ' · ' + r.pairs + '/15' : '') + (extras.challenges[x.id] ? ' · challenge' : '')) + '</option>';
    }).reverse().join('');
  }

  // challenge banner
  const ch = extras.challenges[d.id];
  if (ch && !g.submitted) {
    $('challenge').hidden = false;
    $('challenge').innerHTML = '<b>' + esc(ch.from || 'A friend') + '</b> ' + (Number.isInteger(ch.score) ? 'challenged you to this set' : 'sent you this set — enjoy the listening!') +
      (Number.isInteger(ch.score) ? ' and scored <b>' + ch.score + '/15</b>. Can you beat it?' : '');
  } else $('challenge').hidden = true;

  paintProgress();

  // scorecard
  const sc = $('scorecard');
  if (g.submitted) {
    const r = scoreOrder(g.order, correct);
    const first = extras.results[d.id];
    const squares = correct.map(id => square(verdictFor(g, correct, id).diff)).join('');
    let vs = '';
    if (ch && Number.isInteger(ch.score)) {
      const mine = first ? first.pairs : r.pairs, who = esc(ch.from || 'your friend');
      vs = '<div class="vs">' + (mine > ch.score ? '🏆 You beat ' + who + ' (' + mine + ' vs ' + ch.score + ')' : mine === ch.score ? '🤝 Tied with ' + who + ' at ' + mine : '😅 ' + who + ' wins this one, ' + ch.score + ' to ' + mine) + '</div>';
    }
    sc.hidden = false;
    sc.innerHTML =
      '<div class="score-big">' + r.pairs + '<small> / 15 pairs in order</small></div>' +
      '<div class="rating">' + rating(r.pairs) + '</div>' +
      '<div class="squares" aria-label="Accuracy for each work in chronological order">' + squares + '</div>' +
      '<p class="sub">' + r.exact + ' of 6 in exactly the right spot · 🟩 exact · 🟨 one off · ⬜ further' +
      (first && (first.pairs !== r.pairs) ? ' · first try: ' + first.pairs + '/15' : '') + '</p>' + vs +
      timelineSvg(correct.map(id => ({ e: byId.get(id), w: workOf(byId.get(id)) })), d) +
      compareSvg(g.order, correct, d) +
      '<div class="row"><button class="primary" id="share-result">Share my score</button>' +
      (isDaily ? '<button id="go-practice">Play a practice set</button>' : '<button id="next-practice">Next set →</button>') + '</div>';
    $('share-result').onclick = () => openShare(true);
    if ($('go-practice')) $('go-practice').onclick = goPractice;
    if ($('next-practice')) $('next-practice').onclick = newPractice;
  } else { sc.hidden = true; sc.innerHTML = ''; }

  // cards
  const order = g.submitted ? correct : g.order;
  $('cards').innerHTML = order.map((id, i) => {
    const e = byId.get(id), w = workOf(e), L = letter(d, id), heard = g.heard.includes(id);
    const label = g.submitted ? w.title : 'Excerpt ' + L;
    if (!g.submitted) {
      const note = g.notesByExcerptId[id] || '';
      return '<li class="card" data-id="' + esc(id) + '"><div class="cardtop">' +
        '<span class="handle" data-handle title="Drag to reorder" aria-hidden="true">⋮⋮</span>' +
        '<span class="pos" aria-hidden="true">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="badge' + (heard ? ' heard' : '') + '" data-badge="' + esc(id) + '" title="' + (heard ? 'Heard' : 'Not heard yet') + '">' + L + '</span>' +
        '<div class="desc"><h2>' + esc(label) + '</h2><p>' + esc(e.subtitle) + '</p></div>' + playBtn(id, label) + '</div>' +
        '<div class="tools">' +
        '<button data-move="' + esc(id) + '" data-at="' + (i - 1) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move excerpt ' + L + ' earlier">↑ Earlier</button>' +
        '<button data-move="' + esc(id) + '" data-at="' + (i + 1) + '"' + (i === 5 ? ' disabled' : '') + ' aria-label="Move excerpt ' + L + ' later">↓ Later</button>' +
        '<button data-notes="' + esc(id) + '" aria-expanded="' + (!!note) + '">✎ Notes</button></div>' +
        '<textarea class="note" data-note="' + esc(id) + '" maxlength="500" placeholder="What do you hear? Youthful? Searching? Grand?" aria-label="Notes for excerpt ' + L + '"' + (note ? '' : ' hidden') + '>' + esc(note) + '</textarea></li>';
    }
    const v = verdictFor(g, correct, id);
    const grade = v.diff === 0 ? 'exact' : v.diff === 1 ? 'near' : 'far';
    const vtxt = v.diff === 0 ? '✓ Spot on — you had it ' + ordinal(v.guess)
      : 'You had it ' + ordinal(v.guess) + ' — ' + v.diff + (v.diff === 1 ? ' place' : ' places') + ' off';
    return '<li class="card result ' + grade + '" data-id="' + esc(id) + '"><div class="cardtop">' +
      '<span class="pos">' + w.year + '</span>' +
      '<span class="badge heard">' + L + '</span>' +
      '<div class="desc"><h2>' + esc(w.title) + '</h2><p>' + esc(composerOf(w.composerId).fullName + ' · ' + w.catalogue) + '</p></div>' + playBtn(id, w.title) + '</div>' +
      '<p class="outcome ' + grade + '">' + vtxt + '</p>' +
      '<div class="tools"><span class="verdict">' + esc(e.subtitle) + '</span></div>' +
      '<h3>' + esc(w.chapter) + '</h3><p class="story">' + esc(w.story) + '</p>' +
      (g.notesByExcerptId[id] ? '<p class="mynote">Your notes: ' + esc(g.notesByExcerptId[id]) + '</p>' : '') +
      (e.provider === 'apple'
        ? '<p class="credits">' + esc(e.performer) + ' · <a href="' + esc(e.trackViewUrl) + '" target="_blank" rel="noopener">Listen on Apple Music ↗</a></p></li>'
        : '<details class="credits"><summary>Recording &amp; sources</summary><p>' + esc(e.performer) + ' · ' +
      '<a href="' + esc(e.licenseUrl) + '" target="_blank" rel="noopener">' + esc(e.license) + '</a></p><p>' + esc(e.modifications) + '</p>' +
      '<p><a href="' + esc(e.sourcePage) + '" target="_blank" rel="noopener">Recording source ↗</a> · <a href="' + esc(w.source) + '" target="_blank" rel="noopener">' + esc(w.sourceLabel || 'Work history') + ' ↗</a></p></details></li>');
  }).join('');
  $('apple-credit').hidden = !es.some(e => e.provider === 'apple');

  $('reveal').hidden = g.submitted;
  $('reveal').textContent = confirmReveal ? 'Reveal anyway' : 'Reveal the timeline';
  $('retry').hidden = !g.submitted;
  $('send-set').hidden = g.submitted;
  $('another').hidden = true;

  bindCards();
  paintPlayers();
  if (playing) paintRing(playing.id, 0);
}

const ordinal = n => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
// "Your order" on the left, real order on the right; straight lines = right, crossings = swaps.
function compareSvg(order, correct, d) {
  const W = 360, top = 46, row = 34, lx = 110, rx = 250;
  const col = diff => diff === 0 ? 'var(--good)' : diff === 1 ? 'var(--near)' : 'var(--far)';
  const y = i => top + i * row;
  const lines = order.map((id, i) => {
    const j = correct.indexOf(id), diff = Math.abs(i - j), L = letter(d, id), c = col(diff);
    return '<line x1="' + (lx + 16) + '" y1="' + y(i) + '" x2="' + (rx - 16) + '" y2="' + y(j) + '" stroke="' + c + '" stroke-width="' + (diff ? 2.5 : 3) + '" stroke-linecap="round"' + (diff > 1 ? ' stroke-dasharray="5 4"' : '') + '/>' +
      '<circle cx="' + lx + '" cy="' + y(i) + '" r="14" fill="var(--panel2)" stroke="' + c + '" stroke-width="2"/><text class="cmp-l" x="' + lx + '" y="' + (y(i) + 5) + '" text-anchor="middle">' + L + '</text>' +
      '<circle cx="' + rx + '" cy="' + y(j) + '" r="14" fill="var(--panel2)" stroke="' + c + '" stroke-width="2"/><text class="cmp-l" x="' + rx + '" y="' + (y(j) + 5) + '" text-anchor="middle">' + L + '</text>';
  }).join('');
  const nums = order.map((_, i) => '<text x="' + (lx - 34) + '" y="' + (y(i) + 4) + '" text-anchor="end">' + ordinal(i + 1) + '</text><text x="' + (rx + 34) + '" y="' + (y(i) + 4) + '">' + ordinal(i + 1) + '</text>').join('');
  return '<div class="compare"><svg viewBox="0 0 ' + W + ' ' + (top + 5 * row + 26) + '" role="img" aria-label="Your order compared with the real order">' +
    '<text class="cmp-h" x="' + lx + '" y="18" text-anchor="middle">Your order</text><text class="cmp-h" x="' + rx + '" y="18" text-anchor="middle">Real order</text>' +
    nums + lines + '</svg><p class="sub">Straight lines are right · crossing lines show what you swapped</p></div>';
}
function timelineSvg(items, d) {
  const years = items.map(x => x.w.year);
  const lo = Math.min(...years) - 2, hi = Math.max(...years) + 2;
  const W = 760, x = y => 30 + (y - lo) / (hi - lo) * (W - 60);
  const mixed = d.mode.kind !== 'composer';
  const colors = {}; catalog.composers.forEach((c, i) => colors[c.id] = i ? 'var(--b)' : 'var(--a)');
  let lastX = -99, lift = 0;
  const marks = items.map(({ e, w }) => {
    const cx = x(w.year);
    lift = cx - lastX < 34 ? (lift ? 0 : 1) : 0; lastX = cx;
    const ty = lift ? 14 : 30, yy = lift ? 92 : 76;
    const col = mixed ? colors[w.composerId] : 'var(--gold)';
    return '<line x1="' + cx + '" x2="' + cx + '" y1="' + (ty + 6) + '" y2="52" stroke="' + col + '" stroke-opacity=".5"/>' +
      '<circle cx="' + cx + '" cy="52" r="6" fill="' + col + '"/>' +
      '<text x="' + cx + '" y="' + ty + '" text-anchor="middle" style="fill:' + col + ';font:600 14px Georgia,serif">' + letter(d, e.id) + '</text>' +
      '<text class="yr" x="' + cx + '" y="' + yy + '" text-anchor="middle">' + w.year + '</text>';
  }).join('');
  const legend = mixed ? catalog.composers.map((c, i) => '<circle cx="' + (40 + i * 130) + '" cy="116" r="5" fill="' + colors[c.id] + '"/><text x="' + (52 + i * 130) + '" y="120">' + esc(c.name) + '</text>').join('') : '';
  return '<svg class="timeline" viewBox="0 0 ' + W + ' ' + (mixed ? 128 : 100) + '" role="img" aria-label="Timeline of the six works from ' + Math.min(...years) + ' to ' + Math.max(...years) + '">' +
    '<line x1="20" x2="' + (W - 20) + '" y1="52" y2="52" stroke="var(--line2)" stroke-width="2"/>' + marks + legend + '</svg>';
}

/* ---------- interactions ---------- */
function move(id, at) {
  const g = game();
  if (g.submitted) return;
  const up = at < g.order.indexOf(id);
  save({ ...g, order: moveCard(g.order, id, at) });
  confirmReveal = false;
  render();
  const [earlier, later] = document.querySelectorAll('[data-move="' + id + '"]');
  const btn = up ? (earlier.disabled ? later : earlier) : (later.disabled ? earlier : later);
  btn.focus();
}
function bindCards() {
  document.querySelectorAll('[data-play]').forEach(b => b.onclick = () => toggle(b.dataset.play));
  document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => move(b.dataset.move, Number(b.dataset.at)));
  document.querySelectorAll('[data-notes]').forEach(b => b.onclick = () => {
    const t = document.querySelector('[data-note="' + b.dataset.notes + '"]');
    t.hidden = !t.hidden; b.setAttribute('aria-expanded', String(!t.hidden)); if (!t.hidden) t.focus();
  });
  document.querySelectorAll('[data-note]').forEach(n => n.oninput = () =>
    save(setNote(game(), n.dataset.note, n.value)));
  document.querySelectorAll('[data-handle]').forEach(h => h.onpointerdown = startDrag);
}

// Pointer-based drag (mouse, touch, pen). Only cards with a data-id take part.
let drag = null;
const cardEls = () => [...$('cards').querySelectorAll(':scope > .card[data-id]')];
const GAP = 12;
function startDrag(ev) {
  if (drag || game().submitted || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  ev.preventDefault();
  const handle = ev.currentTarget, li = handle.closest('.card');
  li.classList.add('dragging');
  drag = { li, handle, pointerId: ev.pointerId, startPageY: ev.clientY + scrollY, lastY: ev.clientY, downY: ev.clientY,
    moved: false, before: cardEls().map(x => x.dataset.id) };
  try { handle.setPointerCapture(ev.pointerId); } catch {}
  // Listen on window so the drag survives even if Safari drops pointer capture.
  const onMove = e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.lastY = e.clientY;
    if (Math.abs(e.clientY - drag.downY) > 8) drag.moved = true;
    updateDrag();
  };
  const onUp = e => { if (drag && e.pointerId === drag.pointerId) endDrag(); };
  const noScroll = e => { if (drag) e.preventDefault(); }; // stop iOS from turning the drag into a page scroll
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  document.addEventListener('touchmove', noScroll, { passive: false });
  drag.cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.removeEventListener('touchmove', noScroll);
  };
  const loop = () => {
    if (!drag) return;
    const edge = 60, list = $('cards').getBoundingClientRect();
    let v = 0;
    if (drag.moved && drag.lastY < edge && list.top < edge) v = -Math.min(8, Math.ceil((edge - drag.lastY) / 8));
    else if (drag.moved && drag.lastY > innerHeight - edge && list.bottom > innerHeight - edge) v = Math.min(8, Math.ceil((drag.lastY - innerHeight + edge) / 8));
    if (v) scrollBy(0, v);
    updateDrag();
    drag.raf = requestAnimationFrame(loop);
  };
  loop();
}
function slide(el, fn) {
  const before = el.getBoundingClientRect().top; fn();
  const after = el.getBoundingClientRect().top;
  el.classList.remove('settle'); el.style.transform = 'translateY(' + (before - after) + 'px)';
  void el.offsetHeight;
  el.classList.add('settle'); el.style.transform = '';
}
function updateDrag() {
  const { li } = drag;
  if (!li.isConnected) return;
  let dy = drag.lastY + scrollY - drag.startPageY;
  // Allow several swaps per frame so fast flicks keep up with the finger.
  for (let k = 0; k < 6; k++) {
    const els = cardEls(), i = els.indexOf(li), next = els[i + 1], prev = els[i - 1];
    if (next && dy > (next.offsetHeight + GAP) / 2) {
      slide(next, () => li.parentNode.insertBefore(next, li));
      drag.startPageY += next.offsetHeight + GAP;
    } else if (prev && dy < -(prev.offsetHeight + GAP) / 2) {
      slide(prev, () => li.parentNode.insertBefore(prev, li.nextSibling));
      drag.startPageY -= prev.offsetHeight + GAP;
    } else break;
    dy = drag.lastY + scrollY - drag.startPageY;
  }
  li.style.transform = 'translateY(' + dy + 'px)';
  cardEls().forEach((c, i) => { const p = c.querySelector('.pos'); if (p) p.textContent = String(i + 1).padStart(2, '0'); });
}
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null;
  cancelAnimationFrame(d.raf);
  d.cleanup();
  try { d.handle.releasePointerCapture(d.pointerId); } catch {}
  const order = cardEls().map(x => x.dataset.id);
  const changed = order.join() !== d.before.join();
  // Glide the card into its slot, then commit.
  d.li.classList.remove('dragging');
  d.li.classList.add('settle');
  d.li.style.transform = '';
  setTimeout(() => {
    if (changed && validOrder(order, active.initialOrder) && !game().submitted) { save({ ...game(), order }); confirmReveal = false; }
    if (!drag) render();
  }, 190);
}

function reveal() {
  const g = game();
  const missing = active.initialOrder.filter(id => !g.heard.includes(id));
  if (missing.length && !confirmReveal) {
    confirmReveal = true;
    $('notice').textContent = 'You haven’t heard excerpt ' + missing.map(id => letter(active, id)).join(', ') + ' yet. Reveal anyway?';
    $('reveal').textContent = 'Reveal anyway';
    return;
  }
  stop();
  $('notice').textContent = '';
  const correct = correctOrder(active);
  if (!validOrder(g.order, active.initialOrder)) { save({ ...g, order: [...active.initialOrder] }); render(); $('notice').textContent = 'Your order got scrambled — sorry! Please check it and reveal again.'; return; }
  const r = scoreOrder(g.order, correct);
  if (!extras.results[active.id]) {
    extras.results[active.id] = {
      pairs: r.pairs, exact: r.exact, at: Date.now(), day: dayOf(active),
      squares: correct.map(id => square(verdictFor(g, correct, id).diff)).join(''),
    };
  }
  save({ ...g, submitted: true });
  render();
  $('scorecard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('scorecard').focus({ preventScroll: true });
}

/* ---------- sharing ---------- */
function setUrl(d, withScore) {
  const p = new URLSearchParams();
  p.set('set', encodeSet(d));
  const day = dayOf(d); if (day) p.set('day', String(day));
  const name = extras.name.trim(); if (name) p.set('from', name);
  const r = extras.results[d.id]; if (withScore && r) p.set('score', String(r.pairs));
  return location.origin + location.pathname + '?' + p.toString();
}
function shareText(withScore) {
  const d = active, day = dayOf(d), r = extras.results[d.id];
  const title = 'Musical Flashbacks ' + (day ? '#' + day : '· ' + modeName(d.mode) + ' set') + ' 🎼';
  const lines = [title];
  if (day) lines.push(modeName(d.mode) === 'Mixed' ? 'Beethoven & Brahms' : composerOf(d.mode.composerId).name);
  if (withScore && r) lines.push(r.squares, r.pairs + '/15 · ' + r.exact + '/6 exact', 'Can you beat me?');
  else lines.push('I thought you might enjoy this one 🎧 Six short excerpts to listen to and put in the order they were written. No pressure, just for fun!');
  lines.push(setUrl(d, withScore));
  return lines.join('\n');
}
function openShare(withScore) {
  const dlg = $('share-dlg');
  $('share-title').textContent = withScore ? 'Challenge a friend' : 'Send this set';
  $('share-blurb').textContent = withScore
    ? 'Send this exact set. They’ll see your score once they finish — never your order or notes.'
    : 'Your friend gets the same six excerpts to enjoy at their own pace. No scores are shared — add your name so they know it’s from you.';
  $('share-name').value = extras.name;
  const refresh = () => { $('share-text').value = shareText(withScore); };
  $('share-name').oninput = () => { extras.name = $('share-name').value.slice(0, 24); persist(); refresh(); };
  refresh();
  $('share-go').hidden = !navigator.share;
  $('share-go').onclick = async () => { try { await navigator.share({ text: $('share-text').value }); dlg.close(); } catch {} };
  $('share-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('share-text').value); $('share-copy').textContent = 'Copied ✓'; }
    catch { $('share-text').select(); $('share-copy').textContent = 'Press ⌘/Ctrl+C'; }
    setTimeout(() => $('share-copy').textContent = 'Copy', 1800);
  };
  dlg.showModal();
}

/* ---------- stats ---------- */
function openStats() {
  const rs = Object.values(extras.results);
  const played = rs.length;
  const avg = played ? (rs.reduce((n, r) => n + r.pairs, 0) / played).toFixed(1) : '–';
  const perfect = rs.filter(r => r.pairs === 15).length;
  const days = new Set(rs.filter(r => r.day).map(r => r.day));
  const today = todayNumber();
  let cur = 0; for (let n = days.has(today) ? today : today - 1; days.has(n); n--) cur++;
  let best = 0, run = 0; [...days].sort((a, b) => a - b).forEach((n, i, a) => { run = i && a[i - 1] === n - 1 ? run + 1 : 1; best = Math.max(best, run); });
  const buckets = [['15', r => r.pairs === 15], ['13–14', r => r.pairs >= 13 && r.pairs < 15], ['10–12', r => r.pairs >= 10 && r.pairs < 13], ['7–9', r => r.pairs >= 7 && r.pairs < 10], ['0–6', r => r.pairs < 7]];
  const counts = buckets.map(([, f]) => rs.filter(f).length), max = Math.max(1, ...counts);
  $('stats-body').innerHTML =
    '<div class="stat-grid"><div><b>' + played + '</b><span>Sets played</span></div><div><b>' + avg + '</b><span>Avg pairs</span></div>' +
    '<div><b>' + cur + '</b><span>Daily streak</span></div><div><b>' + best + '</b><span>Best streak</span></div></div>' +
    '<p class="sub">' + perfect + ' perfect set' + (perfect === 1 ? '' : 's') + ' · first-try scores only</p>' +
    '<div class="dist">' + buckets.map(([l], i) => '<div><span>' + l + '</span><i style="width:' + (counts[i] / max * 75) + '%"></i>' + counts[i] + '</div>').join('') + '</div>';
  $('stats').showModal();
}

/* ---------- navigation ---------- */
function goDaily() { select(dailyDefinition(todayNumber()), { scroll: true }); }
function goPractice() {
  const last = state.definitions.find(d => d.id === state.latest.practice);
  last ? select(last, { scroll: true }) : (newPractice(), window.scrollTo({ top: 0, behavior: 'smooth' }));
}
$('mode').innerHTML = catalog.composers.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '<option value="mixed">Mixed (both)</option><option value="orchestral">Orchestral</option>';
$('mode').onchange = () => {
  const v = $('mode').value, d = [...state.definitions].reverse().find(d => !dayOf(d) && modeKey(d.mode) === v && !state.attempts[d.id].submitted);
  d ? select(d) : newPractice();
};
$('saved').onchange = () => select(state.definitions.find(d => d.id === $('saved').value));
$('new').onclick = newPractice;
$('tab-daily').onclick = goDaily;
$('tab-practice').onclick = goPractice;
$('reveal').onclick = reveal;
$('send-set').onclick = () => openShare(false);
$('retry').onclick = () => { stop(); save({ ...freshGame(active.initialOrder), heard: game().heard }); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
$('open-help').onclick = () => $('help').showModal();
$('open-stats').onclick = openStats;
document.querySelectorAll('dialog').forEach(dl => dl.addEventListener('click', e => { if (e.target === dl) dl.close(); }));
window.addEventListener('pagehide', stop);
document.addEventListener('keydown', e => { if (e.key === ' ' && e.target === document.body && playing) { e.preventDefault(); stop(); } });

/* ---------- boot ---------- */
(function boot() {
  const q = new URLSearchParams(location.search);
  const today = todayNumber();
  let target = null;
  if (q.get('mode') === 'orchestral') extras.home = 'orchestral';
  try {
    const day = Number(q.get('day'));
    if (Number.isInteger(day) && day >= 1 && day <= today) target = dailyDefinition(day);
    else if (q.get('set')) {
      const shared = decodeSet(q.get('set'), catalogs);
      target = findShared(state, shared) || shared;
    }
    if (target && (q.get('from') || q.get('score'))) {
      const score = q.get('score') === null || q.get('score') === '' ? NaN : Number(q.get('score'));
      extras.challenges[target.id] = {
        from: (q.get('from') || '').slice(0, 24),
        score: Number.isInteger(score) && score >= 0 && score <= 15 ? score : null,
      };
    }
  } catch (err) {
    $('notice').textContent = err.message + ' Here’s today’s puzzle instead.';
    target = null;
  }
  if (q.toString()) history.replaceState(null, '', location.pathname);
  if (!target && extras.home === 'orchestral') {
    target = [...state.definitions].reverse().find(d => d.mode.kind === 'orchestral' && !state.attempts[d.id].submitted) || orchestralDefinition();
  }
  select(target || dailyDefinition(today));
  if (firstVisit) $('help').showModal();
})();
