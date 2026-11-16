/* ---------- standalone launch page: cameras, controls, readouts, the frame loop ----------
   Director: cuts between set shots that follow the script (the pad from the water, the mount from below, long lenses
   from the shore and the tower, the catch at arm level). Orbit: drag to turn, wheel or pinch to zoom, double-click to
   switch the orbit centre between the tower and whichever vehicle is flying. */
const SQ = {
  cam: 'director',
  shot: -1,
  orb: { yaw: 0.6, pit: 0.12, dist: 420, tgt: 'pad', c: new THREE.Vector3() },
  v: new THREE.Vector3(),
  w: new THREE.Vector3(),
  look: new THREE.Vector3(),
  idleT: 0,
};
function resize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
// fov that frames a size (metres) at a distance, in degrees
const fit = (size, d) => clamp((2 * Math.atan(size / 2 / Math.max(d, 1))) / D2R, 2.5, 60);
const PP = (x, y, z) => stPadPt(x, y, z, new THREE.Vector3());
const live = () => (ST.bv.vis && (ST.mode !== 'shipcatch' || ST.held) ? ST.bv : ST.sv);
/* shots: [from, to, camera(u, cam)] in mission time; u runs 0..1 across the shot */
const SHOTS_L = [
  [-99, -3.5, (u, c) => {
    c.position.copy(PP(150 - 40 * u, 10 + 4 * u, 320 - 70 * u));
    c.lookAt(PP(0, 78, -6));
    c.fov = 38 - 6 * u;
  }],
  [-3.5, 6, (u, c) => {
    c.position.copy(PP(150, 9, 230));
    c.lookAt(stVehPt(ST.bv, 0.2 + 0.25 * u, SQ.v));
    c.fov = 40;
  }],
  [6, 17, (u, c) => {
    c.position.copy(PP(-300, 5, 620));
    const m = stVehPt(ST.bv, 0.9, SQ.v);
    c.lookAt(m);
    c.fov = fit(230 + 80 * u, c.position.distanceTo(m));
  }],
  [17, 34, (u, c) => {
    c.position.copy(PP(140, 30, 260));
    const m = stVehPt(ST.bv, 1, SQ.v);
    c.lookAt(m);
    c.fov = fit(280, c.position.distanceTo(m));
  }],
  [34, 47, (u, c) => {
    // staging, from alongside: a camera that keeps pace with the stack
    const m = stVehPt(ST.bv, 1, SQ.w);
    ST.root.updateMatrixWorld(true);
    const off = SQ.v.set(320, -40, -160).applyQuaternion(ST.root.quaternion);
    c.position.copy(m).add(off);
    c.lookAt(m);
    c.fov = 26;
  }],
  [47, 70, (u, c) => {
    c.position.copy(PP(260, 45, 420));
    const m = stVehPt(ST.bv, 0.5, SQ.v);
    c.lookAt(m);
    c.fov = fit(420 - 200 * u, c.position.distanceTo(m));
  }],
  [70, STT.lbEnd - 4, (u, c) => {
    c.position.copy(PP(170, 150, 170));
    const m = stVehPt(ST.bv, 0.5, SQ.v);
    c.lookAt(m);
    c.fov = fit(150 + 60 * (1 - u), c.position.distanceTo(m));
  }],
  [STT.lbEnd - 4, 999, (u, c) => {
    // the catch at arm level; after it, a slow drift round the tower
    const s = SQ.post * 0.03;
    c.position.copy(PP(Math.cos(0.55 + s) * 95, 128 - 10 * Math.min(1, s), Math.sin(0.55 + s) * 95));
    c.lookAt(PP(0, 120, -10));
    c.fov = 44;
  }],
];
const SHOTS_S = [
  [-99, 12, (u, c) => {
    c.position.copy(PP(-180, 14, 360));
    const m = stVehPt(ST.sv, 0.5, SQ.v);
    c.lookAt(m);
    c.fov = fit(260, c.position.distanceTo(m));
  }],
  [12, 20.5, (u, c) => {
    c.position.copy(PP(220, 60, 300));
    const m = stVehPt(ST.sv, 0.5, SQ.v);
    c.lookAt(m);
    c.fov = fit(170, c.position.distanceTo(m));
  }],
  [20.5, 37, (u, c) => {
    // the flip and the arc in over the tower, side on and low, like the Flight 15 time-lapse
    // square-on to the plane it flies in (the pad's y-z plane), level with it and keeping pace, so the pitch reads true
    const m = stVehPt(ST.sv, 0.5, SQ.v),
      l = ST.root.worldToLocal(new THREE.Vector3().copy(m));
    c.position.copy(PP(480, Math.max(25, l.y - 15), l.z - 25));
    c.lookAt(m);
    c.fov = fit(150, c.position.distanceTo(m));
  }],
  [37, 999, (u, c) => {
    // the catch at the top of the tower, then down with it as the carriage lowers it onto the booster
    const s = SQ.post * 0.03,
      y = ST.car.y + 128;
    c.position.copy(PP(Math.cos(0.7 + s) * 110, y + 12, Math.sin(0.7 + s) * 110));
    c.lookAt(PP(0, y, -8));
    c.fov = 48;
  }],
];
function idleShot(dt, c) {
  // nothing flying: a slow turn round the pad from the shore
  SQ.idleT += dt;
  const a = 0.6 + SQ.idleT * 0.02;
  c.position.copy(PP(Math.cos(a) * 330, 26, Math.sin(a) * 330));
  c.lookAt(PP(0, 90, -10));
  c.fov = 40;
}
function directorCam(dt) {
  const c = cam;
  if (ST.mode === 'idle' && !SQ.hold) return idleShot(dt, c);
  SQ.post = ST.mode === 'idle' ? (SQ.post || 0) + dt : 0; // time since the sequence ended: the closing drift
  const t = ST.mode === 'idle' ? 998 : ST.t;
  const L = ST.mode === 'shipcatch' || SQ.last === 'shipcatch' ? SHOTS_S : SHOTS_L;
  for (let i = 0; i < L.length; i++) {
    const [a, b, f] = L[i];
    if (t >= a && t < b) {
      const a0 = Math.max(a, ST.mode === 'launch' ? -10 : 0);
      f(clamp((t - a0) / (b - a0), 0, 1), c);
      SQ.shot = i;
      return;
    }
  }
}
function orbitCam(dt) {
  const O = SQ.orb,
    c = cam;
  if (O.tgt === 'veh' && (ST.bv.vis || ST.sv.vis)) stVehPt(live(), 0.5, SQ.w);
  else stPadPt(0, 95, -8, SQ.w);
  O.c.lerp(SQ.w, 1 - Math.exp(-6 * dt));
  const cp = Math.cos(O.pit);
  ST.root.updateMatrixWorld(true);
  SQ.v.set(Math.cos(O.yaw) * cp, Math.sin(O.pit), Math.sin(O.yaw) * cp).applyQuaternion(ST.root.quaternion);
  c.position.copy(O.c).addScaledVector(SQ.v, O.dist);
  const gh = DEF.landH(c.position.x, -c.position.z) + 1.5;
  if (c.position.y < gh) c.position.y = gh;
  c.lookAt(O.c);
  c.fov = 50;
}
/* ---------- input ---------- */
{
  const cv = $('view3d'),
    ptrs = new Map();
  let pinch = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()],
        d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) SQ.orb.dist = clamp((SQ.orb.dist * pinch) / d, 40, 6000);
      pinch = d;
      return;
    }
    if (SQ.cam !== 'orbit') camMode('orbit', true);
    SQ.orb.yaw += (e.clientX - x) * 0.005;
    SQ.orb.pit = clamp(SQ.orb.pit + (e.clientY - y) * 0.004, -0.2, 1.45);
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = 0;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (SQ.cam !== 'orbit') camMode('orbit', true);
      SQ.orb.dist = clamp(SQ.orb.dist * Math.exp(e.deltaY * 0.001), 40, 6000);
    },
    { passive: false },
  );
  cv.addEventListener('dblclick', () => {
    SQ.orb.tgt = SQ.orb.tgt === 'pad' ? 'veh' : 'pad';
    if (SQ.cam !== 'orbit') camMode('orbit', true);
  });
}
function camMode(m, keep) {
  if (m === 'orbit' && !keep) {
    // start the orbit from wherever the director camera is
    ST.root.updateMatrixWorld(true);
    const inv = ST.root.quaternion.clone().invert(),
      d = cam.position.clone().sub(stPadPt(0, 95, -8, SQ.w));
    SQ.orb.c.copy(SQ.w);
    const l = d.length();
    d.applyQuaternion(inv).normalize();
    SQ.orb.dist = clamp(l, 40, 3000);
    SQ.orb.pit = Math.asin(clamp(d.y, -1, 1));
    SQ.orb.yaw = Math.atan2(d.z, d.x);
  }
  if (m === 'orbit' && keep && SQ.cam !== 'orbit') camMode('orbit');
  SQ.cam = m;
  $('bCam').textContent = m === 'director' ? 'Director' : 'Orbit';
  $('bCam').classList.toggle('on', m === 'director');
}
$('bCam').onclick = (e) => {
  camMode(SQ.cam === 'director' ? 'orbit' : 'director');
  e.target.blur();
};
function go() {
  audioOn();
  if (ST.mode !== 'idle') return;
  const restack = !ST.stack || ST.held;
  if (stLaunch()) {
    SQ.last = 'launch';
    SQ.hold = true;
    if (restack) banner('RESTACKED', 'Super Heavy and Starship back on the mount', 2200);
    camMode('director');
  }
}
function shipCatch() {
  audioOn();
  if (ST.mode !== 'idle') return;
  if (stShipCatch()) {
    SQ.last = 'shipcatch';
    SQ.hold = true;
    banner('STARSHIP RETURN', 'Chopsticks open at the top of the tower', 2600);
    camMode('director');
  }
}
function stop() {
  stAbort();
  SQ.hold = false;
  SQ.last = null;
  $('count').style.opacity = 0;
}
$('bGo').onclick = (e) => {
  go();
  e.target.blur();
};
$('bShip').onclick = (e) => {
  shipCatch();
  e.target.blur();
};
$('bStop').onclick = (e) => {
  stop();
  e.target.blur();
};
const armsT = () => ST.mode === 'idle' && stArms(ST.arm.to > 0.5 ? -0.115 : 1); // close = in to the hull, under the hooks
const qdT = () => ST.mode === 'idle' && stQD(ST.qd.to > 0.5 ? 0 : 1);
$('bArms').onclick = (e) => {
  armsT();
  e.target.blur();
};
$('bFin').onclick = (e) => {
  if (ST.mode === 'idle') stFins(ST.fin.to > 0.5 ? 0 : 1);
  e.target.blur();
};
$('bQD').onclick = (e) => {
  qdT();
  e.target.blur();
};
// carriage: press and hold
const carHold = { dir: 0 };
for (const [id, d] of [
  ['bUp', 1],
  ['bDn', -1],
]) {
  const b = $(id);
  b.addEventListener('pointerdown', () => (carHold.dir = d));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => (carHold.dir = 0));
}
addEventListener('keydown', (e) => {
  if (e.repeat && !/KeyR|KeyF/.test(e.code)) return;
  const k = e.code;
  if (k === 'KeyL' || k === 'Space') go();
  else if (k === 'KeyC') shipCatch();
  else if (k === 'Escape') stop();
  else if (k === 'KeyA') armsT();
  else if (k === 'KeyQ') qdT();
  else if (k === 'KeyG' && ST.mode === 'idle') stFins(ST.fin.to > 0.5 ? 0 : 1);
  else if (k === 'KeyR') carHold.dir = 1;
  else if (k === 'KeyF') carHold.dir = -1;
  else if (k === 'KeyV') camMode(SQ.cam === 'director' ? 'orbit' : 'director');
  else if (k === 'KeyM') sndT();
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyR' || e.code === 'KeyF') carHold.dir = 0;
});
/* ---------- sound: started on the first press (browsers need one) ---------- */
let SND_ON = true;
function audioOn() {
  if (ST.audio || !SND_ON) return;
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)(),
      n = A.sampleRate * 2,
      nb = A.createBuffer(1, n, A.sampleRate),
      d = nb.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // brown-ish noise: a rumble, not a hiss
      d[i] = b * 6 + (Math.random() * 2 - 1) * 0.08;
    }
    const out = A.createGain();
    out.gain.value = 0.9;
    out.connect(A.destination);
    ST.audio = { ac: A, nb, out };
  } catch (e) {}
}
function sndT() {
  SND_ON = !SND_ON;
  if (SND_ON) audioOn();
  if (ST.audio) ST.audio.out.gain.value = SND_ON ? 0.9 : 0;
  $('bSnd').classList.toggle('on', SND_ON);
}
$('bSnd').classList.add('on');
$('bSnd').onclick = (e) => {
  sndT();
  e.target.blur();
};
addEventListener('pointerdown', audioOn, { once: true });
/* ---------- the script's callbacks ---------- */
function stOnCount(n) {
  const c = $('count');
  c.textContent = n;
  c.style.color = n <= 3 ? 'var(--x1)' : '#fff';
  c.style.opacity = 1;
  clearTimeout(SQ.cT);
  SQ.cT = setTimeout(() => (c.style.opacity = 0), 700);
}
const BIG = {
  LIFTOFF: ['LIFTOFF', 'Designed with American Super Intelligence and Built with American Might', 7000, '#e8690f', 'big'],
  'HOT STAGING': ['HOT STAGING', 'Starship lights its engines on top of Super Heavy', 3200],
  'LIFTING STARSHIP': ['LIFTING', 'Starship on the chopsticks', 2000],
  'LIFTING SUPER HEAVY': ['LIFTING', 'Super Heavy on the chopsticks', 2000],
  'BOOSTER ON THE MOUNT': ['ON THE MOUNT', 'Super Heavy set down', 2500],
  'BOOSTER FLIP': ['BOOSTER FLIP', 'Super Heavy turns for home', 2600],
  'BOOSTBACK BURN': ['BOOSTBACK BURN', '', 2400],
  'LANDING BURN': ['LANDING BURN', '', 2400],
  CAUGHT: ['CAUGHT', '', 4000, '#e8690f'],
  FLIP: ['FLIP', 'Starship swings upright', 2400],
  STACKED: ['STACKED', 'Ready to fly again', 3500, '#e8690f'],
};
function stOnPhase(p, sub) {
  const b = BIG[p];
  if (!b) return;
  banner(b[0], sub || b[1], b[2], b[3], b[4]);
}
/* ---------- readouts ---------- */
const fmtT = (t) => {
  const a = Math.abs(t),
    m = Math.floor(a / 60),
    s = Math.floor(a % 60);
  return (t < 0 ? 'T−' : 'T+') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};
function readouts() {
  $('clock').textContent = ST.mode === 'idle' && !SQ.hold ? 'T−00:10' : ST.mode === 'shipcatch' || SQ.last === 'shipcatch' ? 'EDL ' + fmtT(ST.t).slice(2) : fmtT(ST.t);
  $('phase').textContent = ST.phase;
  const tl = (V) => (V.vis ? `${(Math.max(0, V.p.y + V.eng) / 1000).toFixed(1)} km · ${Math.round(V.v.length() * 3.6)} km/h` : '—');
  $('tB').textContent = tl(ST.bv);
  $('tS').textContent = tl(ST.sv);
  const a = ST.arm.k;
  $('tA').textContent =
    (a < -0.05 ? 'gripping' : a < 0.02 ? 'closed' : a > 0.98 ? 'open' : 'moving') +
    (ST.mode !== 'idle' ? '' : ST.held === 'booster' ? ' · booster' : stShipUp() ? ' · ship' : '') +
    (Math.abs(ST.car.y) > 0.05 ? ` · ${ST.car.y > 0 ? '+' : ''}${ST.car.y.toFixed(1)} m` : '');
  const idle = ST.mode === 'idle';
  $('bArms').disabled = !idle || (ST.arm.to < 0.5 && stHanging());
  $('bFin').classList.toggle('on', ST.fin.to > 0.5);
  $('bFin').disabled = !idle;
  $('bQD').disabled = $('bUp').disabled = $('bDn').disabled = !idle;
  $('bArms').textContent = ST.arm.to > 0.5 ? 'Arms close' : 'Arms open';
  $('bGo').disabled = !idle;
  $('bShip').disabled = !idle;
}
/* ---------- frame loop ---------- */
let last = performance.now(),
  tt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  tt += dt;
  if (carHold.dir && ST.ready && ST.mode === 'idle') stCarriage(ST.car.to + carHold.dir * 2.5 * dt);
  stTick(dt);
  if (ST.ready) {
    if (SQ.cam === 'director') directorCam(dt);
    else if (SQ.cam === 'orbit') orbitCam(dt); // 'fixed': left where a script put it (tests, stills)
  }
  const nr = clamp(cam.position.y / 55, 0.7, 12);
  cam.near = nr;
  cam.far = 60000;
  cam.updateProjectionMatrix();
  waterU.t.value = tt;
  waterU.cam.value.copy(cam.position);
  waterU.craft.value.set(0, -999, 0);
  skyMat.uniforms.t.value = tt;
  sky.position.copy(cam.position);
  if (FLAGS.length) flagTick(tt);
  if (bT && now > bT) {
    $('banner').style.opacity = 0;
    bT = 0;
  }
  renderer.render(scene, cam);
  if (ST.ready) readouts();
}
sky.scale.setScalar(5.5); // the rocket climbs past the sky dome's 9 km radius
cam.position.set(0, 30, 0);
requestAnimationFrame(frame);
(async () => {
  await stLoad();
  if (!ST.ready) {
    $('ldMsg').textContent = 'THE TOWER FAILED TO LOAD';
    return;
  }
  const L = $('loading');
  L.style.opacity = 0;
  setTimeout(() => (L.hidden = true), 700);
  // the cruise ships, if their pack sits beside the page
  try {
    const r = await fetch('X1_SkyRacer_Ships.bin', { method: 'HEAD' });
    if (r.ok && !/text\/html/.test(r.headers.get('content-type') || '')) {
      SHIP.on = true;
      syncDetail();
      shipsLoad();
    }
  } catch (e) {}
})();
window.__st = { ST, STC, STT, SQ, stLaunch, stShipCatch, stAbort, stArms, stCarriage, stQD, stFins, stHit, stTick, cam, scene, renderer, THREE, camMode, twiT };
