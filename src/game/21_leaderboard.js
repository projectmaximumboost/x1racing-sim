/* ---------- leaderboard: best clean lap per X handle ----------
   Three places it can live, tried in this order:
   1. site: the Supabase project behind x1racing.com. The page finds it from x1-sim-config.json next to the sim
      ({"supabaseUrl": "...", "supabaseAnonKey": "..."}), or from window.X1_SIM_CONFIG. Laps are inserted into x1_laps and
      read back from the x1_leaderboard view (best lap per handle). See docs/leaderboard.sql.
   2. artifact: the shared database of the Claude artifact (signed-in viewers).
   3. local: this device only.
   Only clean laps you flew yourself count (no SI hand-over). Handles are typed in, not verified. */
const LB = {
  cfg: null,
  src: 'local',
  rows: [],
  handle: '',
  ready: null,
  pill: null,
  pillUntil: 0,
  HKEY: 'x1-skyracer-handle',
};
try {
  LB.handle = (localStorage.getItem(LB.HKEY) || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);
} catch (e) {}
const lbOK = (h) => /^[A-Za-z0-9_]{1,15}$/.test(h);
const lbMine = () => {
  const v = G.laps.filter((l) => l.valid && l.who === 'you' && !l.assist);
  return v.length ? v.reduce((a, b) => (b.t < a.t ? b : a)) : null;
};
function lbRankOf(t) {
  if (LB.src === 'local' || LB.err || !LB.handle || !LB.rows.length || t == null) return 0; // a place only means something on a shared board
  const i = LB.rows.findIndex((r) => r.handle.toLowerCase() === LB.handle.toLowerCase());
  return i >= 0 && Math.abs(LB.rows[i].lap_ms - Math.round(t * 1000)) < 2 ? i + 1 : 0;
}
async function lbFindConfig() {
  if (window.X1_SIM_CONFIG) return window.X1_SIM_CONFIG;
  const f = 'x1-sim-config.json',
    p = location.pathname.replace(/\/[^\/]*\.html?$/, '').replace(/\/$/, ''),
    seen = new Set();
  for (const u of [f, p + '/' + f, p.replace(/\/[^\/]*$/, '') + '/' + f, '/' + f]) {
    const abs = new URL(u, location.href).href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      const r = await fetch(abs, { cache: 'no-store' });
      if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) continue;
      const j = await r.json();
      if (j && j.supabaseUrl && j.supabaseAnonKey) return j;
    } catch (e) {}
  }
  return null;
}
LB.ready = (async () => {
  try {
    LB.cfg = await lbFindConfig();
  } catch (e) {}
  if (LB.cfg) LB.src = 'site';
  lbLoad();
  if (!LB.cfg)
    (async () => {
      for (let i = 0; i < 60 && !cdb; i++) await new Promise((r) => setTimeout(r, 250));
      if (cdb) {
        LB.src = 'artifact';
        lbLoad();
      }
    })();
})();
function lbSB(path, opt = {}) {
  const c = LB.cfg;
  return fetch(c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...opt,
    headers: {
      apikey: c.supabaseAnonKey,
      Authorization: 'Bearer ' + c.supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(opt.headers || {}),
    },
  });
}
async function lbLoad() {
  let rows = [];
  LB.err = '';
  try {
    if (LB.src === 'site') {
      const r = await lbSB('x1_leaderboard?select=handle,lap_ms,max_mph,set_at&order=lap_ms.asc&limit=100');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      rows = await r.json();
    } else if (LB.src === 'artifact') {
      const q = await cdb.collection('leaderboard').orderBy('lap_ms').limit(100).get();
      rows = (q.docs || []).map((d) => d.data()).filter((r) => r && lbOK(r.handle || '') && r.lap_ms > 0);
    }
  } catch (e) {
    LB.err = String((e && e.message) || e).slice(0, 60);
  }
  if (LB.src === 'local' || LB.err) {
    const m = lbMine();
    rows = m && LB.handle ? [{ handle: LB.handle, lap_ms: Math.round(m.t * 1000), max_mph: m.mph }] : [];
  }
  LB.rows = rows.filter((r) => r && typeof r.handle === 'string' && r.lap_ms > 0).sort((a, b) => a.lap_ms - b.lap_ms);
  if (!$('lb').hidden) lbDraw();
  return LB.rows;
}
async function lbSubmit(rec) {
  if (!lbOK(LB.handle) || !rec) return false;
  const row = { handle: LB.handle, lap_ms: Math.round(rec.t * 1000), max_mph: rec.mph || 0 };
  try {
    if (LB.src === 'site') {
      const r = await lbSB('x1_laps', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ ...row, build: BUILD, device: TC.on ? 'touch' : gp ? 'pad' : 'keys' }),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } else if (LB.src === 'artifact') {
      const d = cdb.collection('leaderboard').doc(LB.handle.toLowerCase()),
        cur = await d.get();
      const old = cur && cur.exists ? cur.data() : null;
      if (!old || !(old.lap_ms <= row.lap_ms)) await d.set({ ...row, at: Date.now() });
    }
    await lbLoad();
    return true;
  } catch (e) {
    LB.err = String((e && e.message) || e).slice(0, 60);
    return false;
  }
}
// a clean lap of your own just finished
async function lbLap(rec) {
  const m = lbMine();
  if (!m || rec.t > m.t + 1e-9) return; // only a new personal best goes up
  await LB.ready;
  if (!lbOK(LB.handle)) {
    lbPill('join', 'New best ' + fmt(rec.t) + '. Add your X handle to join the leaderboard', 'Join');
    return;
  }
  const ok = await lbSubmit(rec),
    r = lbRankOf(rec.t);
  lbPill(
    'post',
    ok && r ? 'New best ' + fmt(rec.t) + '. P' + r + ' on the leaderboard' : 'New best ' + fmt(rec.t),
    'Post on X',
  );
}
function lbPill(kind, text, btn) {
  LB.pill = kind;
  LB.pillUntil = performance.now() + 20000;
  $('pbText').textContent = text;
  $('pbBtn').textContent = btn;
  $('pb').hidden = false;
}
function lbPillSync() {
  if (LB.pill && performance.now() > LB.pillUntil) {
    LB.pill = null;
    $('pb').hidden = true;
  }
}
$('pbBtn').onclick = (e) => {
  const k = LB.pill;
  LB.pill = null;
  $('pb').hidden = true;
  e.target.blur();
  if (k === 'join') lbT(true);
  else shareT(true);
};
$('pbX').onclick = () => {
  LB.pill = null;
  $('pb').hidden = true;
};
let lbPaused = false;
function lbT(open) {
  const el = $('lb');
  if (open === !el.hidden) return;
  if (open) {
    lbPaused = G.paused;
    G.paused = true;
    $('lbHandle').value = LB.handle;
    $('lbMsg').textContent = '';
    el.hidden = false;
    lbDraw();
    lbLoad();
    if (!LB.handle && !TC.on) $('lbHandle').focus();
  } else {
    G.paused = lbPaused;
    el.hidden = true;
    $('lbHandle').blur();
  }
}
function lbDraw() {
  const L = $('lbList');
  L.textContent = '';
  const me = LB.handle.toLowerCase();
  $('lbSrc').textContent = LB.err
    ? 'Could not reach the leaderboard (' + LB.err + '). Showing this device only.'
    : LB.src === 'site'
      ? 'x1racing.com leaderboard'
      : LB.src === 'artifact'
        ? 'Shared with viewers of this page'
        : 'This device only. The site leaderboard is not connected.';
  if (!LB.rows.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = LB.handle
      ? 'No laps yet. Fly a clean lap to get on the board.'
      : 'Add your X handle, then fly a clean lap.';
    L.append(d);
  }
  LB.rows.slice(0, 50).forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'row' + (r.handle.toLowerCase() === me ? ' me' : '');
    const a = document.createElement('b');
    a.textContent = i + 1;
    const h = document.createElement('a');
    h.textContent = '@' + r.handle;
    h.href = 'https://x.com/' + encodeURIComponent(r.handle);
    h.target = '_blank';
    h.rel = 'noopener';
    const t = document.createElement('span');
    t.textContent = fmt(r.lap_ms / 1000);
    const m = document.createElement('i');
    m.textContent = r.max_mph ? r.max_mph + ' mph' : '';
    d.append(a, h, t, m);
    L.append(d);
  });
  const mine = lbMine();
  $('bLbPost').disabled = !mine;
  $('lbBest').textContent = mine ? 'Your best clean lap: ' + fmt(mine.t) : 'You have no clean lap yet.';
}
async function lbSave() {
  const v = $('lbHandle').value.trim().replace(/^@/, ''),
    msg = $('lbMsg');
  if (!lbOK(v)) {
    msg.textContent = 'Use letters, numbers and underscores only, up to 15.';
    return;
  }
  LB.handle = v;
  try {
    localStorage.setItem(LB.HKEY, v);
  } catch (e) {}
  $('lbHandle').value = v;
  $('lbHandle').blur();
  const m = lbMine();
  if (m) {
    msg.textContent = 'Saving your best lap…';
    const ok = await lbSubmit(m);
    msg.textContent = ok
      ? 'Saved. Your best lap is on the board.'
      : 'Handle saved. The lap could not be sent (' + (LB.err || 'offline') + ').';
  } else {
    msg.textContent = 'Saved. Fly a clean lap to get on the board.';
  }
  lbDraw();
}
$('bLbSave').onclick = lbSave;
$('bLbX').onclick = (e) => {
  lbT(false);
  e.target.blur();
};
$('bLbRef').onclick = (e) => {
  lbLoad();
  e.target.blur();
};
$('bLbPost').onclick = () => {
  lbT(false);
  shareT(true);
};
$('bLB').onclick = (e) => {
  lbT(true);
  e.target.blur();
};
