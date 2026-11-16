/* ---------- game state ---------- */
const BUILD = '@@BUILD@@';
const STORE = 'x1-skyracer-laps-v1';
const VRB = { a: '', b: '', c: '#fff', until: 0, dirty: false };
const G = {
  siView: 4,
  flyView: 0,
  lastMode: undefined,
  foldT: 1,
  foldTarget: null,
  foldWait: 0,
  cockpitParts: [],
  mode: 'demo',
  si: null,
  s: null,
  view: 0,
  paused: false,
  next: 0,
  lap: 0,
  lapT: 0,
  pen: 0,
  running: false,
  bestYou: null,
  bestSI: null,
  last: null,
  laps: [],
  void: false,
  took: false,
  altHold: true,
  showPath: true,
  raceT: 0,
  idx: 0,
  assist: false,
  th: 0,
  lastHit: 0,
  recovering: 0,
  lastSafe: null,
  prevE: 0,
  liftReq: false,
  prevSide: 0,
  maxV: 0,
  demoLaps: 0,
  lastSplit: [],
};
function loadLaps() {
  try {
    const j = JSON.parse(localStorage.getItem(STORE) || '[]');
    if (Array.isArray(j)) G.laps = j;
  } catch (e) {}
  recalc();
}
function saveLocal() {
  try {
    localStorage.setItem(STORE, JSON.stringify(G.laps.slice(-300)));
  } catch (e) {}
}
function recalc() {
  const v = G.laps.filter((l) => l.valid);
  const y = v.filter((l) => l.who === 'you'),
    s = v.filter((l) => l.who === 'si');
  G.bestYou = y.length ? Math.min(...y.map((l) => l.t)) : null;
  G.bestSI = s.length ? Math.min(...s.map((l) => l.t)) : null;
}
let cloud = null,
  cdb = null;
(async () => {
  try {
    if (!window.claude || !claude.use) return;
    const db = await claude.use('db'),
      user = await claude.use('user');
    if (!db || !user) return;
    cdb = db;
    const id = await user.id();
    const c = db.collection('data/users/' + id);
    cloud = c;
    const q = await c.orderBy('at', 'desc').limit(120).get();
    const docs = (q.docs || []).map((d) => d.data());
    const seen = new Set(G.laps.map((l) => l.at));
    let ch = false;
    docs.forEach((l) => {
      if (l && l.at && !seen.has(l.at)) {
        G.laps.push(l);
        ch = true;
      }
    });
    if (ch) {
      G.laps.sort((a, b) => a.at - b.at);
      saveLocal();
      recalc();
      drawHist();
    }
  } catch (e) {}
})();
function recordLap(t, raw, valid) {
  const rec = {
    t: +t.toFixed(3),
    raw: +raw.toFixed(3),
    pen: +G.pen.toFixed(1),
    valid,
    who: G.mode === 'demo' && !G.assist ? 'si' : 'you',
    assist: G.assist,
    at: Date.now(),
    mph: Math.round(G.maxV * 2.23694),
  };
  // a fast lap (a new best for whoever flew it, the pilot or the SI) gets a blast on the ships' horn
  const prev = rec.who === 'si' ? G.bestSI : G.bestYou;
  G.laps.push(rec);
  saveLocal();
  recalc();
  if (valid && (prev == null || rec.t < prev)) hornBlast();
  drawHist();
  if (cloud && rec.who === 'you') {
    cloud
      .doc('lap' + rec.at)
      .set(rec)
      .catch(() => {});
  }
  if (valid && rec.who === 'you' && !rec.assist) lbLap(rec);
}
const fmt = (t) => {
  if (t == null) return '--';
  const m = Math.floor(t / 60),
    s = t - m * 60;
  return m + ':' + s.toFixed(2).padStart(5, '0');
};
function drawHist() {
  const h = $('hist');
  const r = G.laps.slice(-7).reverse();
  h.innerHTML = '';
  r.forEach((l) => {
    const d = document.createElement('div');
    if (l.valid && (l.t === G.bestYou || l.t === G.bestSI)) d.className = 'best';
    const a = document.createElement('i');
    a.textContent = l.who === 'si' ? 'SI' : 'YOU';
    const b = document.createElement('span');
    b.textContent = l.valid ? fmt(l.t) : 'void';
    const c = document.createElement('span');
    c.textContent = l.pen ? '+' + l.pen + 's' : '';
    d.append(a, b, c);
    h.append(d);
  });
  $('tBest').textContent = fmt(G.bestYou);
  $('tSI').textContent = fmt(G.bestSI);
}

function reset(mode) {
  G.mode = mode;
  G.s = X.newState({ n: PAD.y, e: PAD.x, yaw: PAD.yaw, hT: PAD.h });
  G.s.p[2] = -(PAD.h + C.cg[2] - 0.02);
  X.euler(G.s);
  G.si = X.makeSI(course);
  G.at = X.makeAutoThrust();
  G.next = 0;
  G.lap = 0;
  G.lapT = 0;
  G.pen = 0;
  G.running = false;
  G.void = false;
  G.raceT = 0;
  G.liftReq = false;
  G.th = 0;
  G.assist = false;
  G.recovering = 0;
  G.maxV = 0;
  G.lastSafe = null;
  G.land = null;
  G.foldT = 1;
  G.foldTarget = null;
  G.foldWait = 0.7;
  G.idx = nearestAll();
  G.prevE = G.s.p[1];
  G.demoLaps = 0;
  $('menu').hidden = false;
  $('pilotChip').textContent = mode === 'demo' ? 'SI PILOT' : 'YOU';
  $('pilotChip').className = mode === 'demo' ? '' : 'you';
  syncMode();
  syncFold();
  banner(
    mode === 'demo' ? 'SI PILOT' : 'YOUR MACHINE',
    mode === 'demo' ? 'Autonomous demo. Press Fly it to take over.' : 'Press A or Enter to take off',
    2200,
  );
}
// Each mode keeps its own camera: SI starts on TV, flying starts on chase; switching back brings the last one used.
function syncMode() {
  if (G.mode !== G.lastMode) {
    const was = G.lastMode;
    G.lastMode = G.mode;
    if (was !== undefined || G.mode === 'demo') setView(G.mode === 'demo' ? G.siView : G.flyView, true);
  }
  if (typeof syncViewBtns === 'function') syncViewBtns();
  $('bFly').classList.toggle('pri', G.mode !== 'demo');
  $('bDemo').classList.toggle('pri', G.mode === 'demo');
}
function nearestAll() {
  let b = 1e12,
    bi = 0;
  const x = G.s.p[1],
    y = G.s.p[0];
  for (let i = 0; i < N; i++) {
    const d = (P[i].x - x) ** 2 + (P[i].y - y) ** 2;
    if (d < b) {
      b = d;
      bi = i;
    }
  }
  return bi;
}
function nearestFwd() {
  const x = G.s.p[1],
    y = G.s.p[0];
  let b = 1e12,
    bi = G.idx;
  for (let k = -8; k < 60; k++) {
    const i = (G.idx + k + N) % N,
      d = (P[i].x - x) ** 2 + (P[i].y - y) ** 2;
    if (d < b) {
      b = d;
      bi = i;
    }
  }
  if (b > 400 * 400) return nearestAll();
  return bi;
}
let bT = 0;
// cls 'big': a larger, bolder second line that wraps (the Falcon 9 liftoff line)
function banner(a, b, ms = 1600, color, cls) {
  VRB.a = a;
  VRB.b = b || '';
  VRB.c = color || '#fff';
  VRB.until = performance.now() + ms;
  VRB.dirty = true;
  const e = $('banner');
  e.textContent = a;
  if (b) {
    const s = document.createElement('small');
    s.textContent = b;
    e.append(s);
  }
  e.style.color = color || '';
  e.classList.toggle('big', cls === 'big');
  e.style.opacity = 1;
  bT = performance.now() + ms;
}
