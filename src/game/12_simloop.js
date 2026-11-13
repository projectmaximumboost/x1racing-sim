/* ---------- sim loop ---------- */
const FOLDED_U = { d: [0, 0, 0, 0], pd: [0, 0], yawSplit: 0, boost: false };
const DT = 1 / 200;
let acc = 0,
  lastT = 0,
  camInit = false;
function simStep() {
  const s = G.s;
  let cmd;
  const grd = groundH(s);
  const parked = G.foldT > 0;
  if (G.land) {
    cmd = G.land.step(s, DT, grd);
    if (G.land.done) {
      G.land = null;
      G.mode = 'player';
      G.assist = false;
      G.liftReq = false;
      s.hT = grd;
      $('pilotChip').textContent = 'YOU';
      $('pilotChip').className = 'you';
      syncMode();
      syncFold();
      $('menu').hidden = false;
      banner('LANDED', 'Press F to fold, or A or Enter to lift off', 2200);
    }
  } else if (parked) cmd = {};
  else if (G.mode === 'demo') cmd = G.si.step(s, DT, PAD.h);
  else {
    const a = G.at.step(
      s,
      inp.pitch,
      inp.boost > 0,
      DT,
      G.altHold ? s.hT : -s.p[2],
      Math.max(Math.abs(inp.roll), Math.abs(inp.yaw)),
    ); // right stick fore and aft is the speed control (auto-thrust); a hard turn on either stick backs the pushers off
    const cpl = clamp((s.V - 15) / 15, 0, 1); // at speed the yaw stick banks too, so full left stick is a full-bank coordinated turn
    cmd = {
      roll: clamp(inp.roll + inp.yaw * cpl, -1, 1),
      pitch: 0,
      yaw: inp.yaw,
      climb: inp.climb,
      throttle: a.throttle,
      thetaOff: a.thetaOff,
      noPushTilt: a.noPushTilt,
      boost: a.boost,
      altHold: G.altHold,
    };
    if (G.liftReq && -s.p[2] > grd + 9) G.liftReq = false;
    if (inp.climb > 0.2 && s.onGround) G.liftReq = true;
    if (s.onGround && !G.liftReq) s.hT = grd;
    if (G.liftReq && s.hT < grd + 13) s.hT = grd + 13;
  }
  if (s.onGround && !G.land && G.mode === 'player' && !G.onShip && grd > 8 && s.V < 2) {
    const nm = shipSpotName(s.p[1], s.p[0]);
    if (nm) {
      G.onShip = true;
      banner('ON DECK', nm + '. Press A or Enter to lift off', 2200, '#21d97e');
    }
  } else if (!s.onGround) G.onShip = false;
  if (G.foldWait > 0) {
    G.foldWait -= DT;
    if (G.foldWait <= 0) {
      G.foldTarget = 0;
      banner('UNFOLDING', 'Wings and ducts opening', 1800);
      syncFold();
    }
  }
  if (G.foldTarget !== null) {
    const d = G.foldTarget - G.foldT,
      st = DT / FOLD_S;
    G.foldT = Math.abs(d) <= st ? G.foldTarget : G.foldT + Math.sign(d) * st;
    if (G.foldT === G.foldTarget) {
      G.foldTarget = null;
      syncFold();
    }
  }
  const u = parked ? FOLDED_U : X.fbw(s, cmd, DT, grd);
  X.step(s, u, DT, env);
  motionAcc(s);
  G.lastCmd = cmd;
}
let fpsT = 0,
  fpsN = 0;
/* Smooth motion at any frame rate. The physics steps every 5 ms, so a 60 Hz frame holds 3 steps one time and 4 the
   next, and a 144 Hz frame 1 or 2: drawn as is, the craft moves unevenly from frame to frame, which at 85 m/s shows as
   the craft shuddering against a camera that follows it. Instead each frame draws the craft where it was the leftover
   fraction of a step after the second-to-last state: position and attitude are blended between the last two physics
   states (LERP.a = what is left in the accumulator, as a share of a step). So what is drawn always runs exactly one
   step behind the physics, and moves by exactly the frame's time. */
const LERP = { s: null, p: [0, 0, 0], q: [1, 0, 0, 0], a: 1, rp: null, rq: null };
function lerpSave() {
  const s = G.s;
  LERP.s = s;
  LERP.p[0] = s.p[0];
  LERP.p[1] = s.p[1];
  LERP.p[2] = s.p[2];
  LERP.q[0] = s.q[0];
  LERP.q[1] = s.q[1];
  LERP.q[2] = s.q[2];
  LERP.q[3] = s.q[3];
}
// swap the blended position and attitude into the state for drawing, and back afterwards
function lerpIn() {
  const s = G.s,
    a = LERP.a;
  if (LERP.s !== s || G.paused || a >= 1 || Math.hypot(s.p[0] - LERP.p[0], s.p[1] - LERP.p[1], s.p[2] - LERP.p[2]) > 5)
    return false; // a reset, a pause, or a recovery jump: draw the state as it is
  LERP.rp = s.p;
  LERP.rq = s.q;
  const P = LERP.p,
    Q = LERP.q;
  let q = s.q,
    d = Q[0] * q[0] + Q[1] * q[1] + Q[2] * q[2] + Q[3] * q[3];
  const sg = d < 0 ? -1 : 1; // the short way round
  const b = [0, 1, 2, 3].map((i) => Q[i] + (sg * q[i] - Q[i]) * a),
    n = Math.hypot(b[0], b[1], b[2], b[3]) || 1;
  s.p = [P[0] + (s.p[0] - P[0]) * a, P[1] + (s.p[1] - P[1]) * a, P[2] + (s.p[2] - P[2]) * a];
  s.q = b.map((v) => v / n);
  return true;
}
function lerpOut() {
  if (!LERP.rp) return;
  G.s.p = LERP.rp;
  G.s.q = LERP.rq;
  LERP.rp = LERP.rq = null;
}
function tick(now) {
  let dt = Math.min((now - lastT) / 1000, 0.05);
  fpsN++;
  if (now - fpsT > 2500) {
    const f = (fpsN * 1000) / (now - fpsT);
    fpsT = now;
    fpsN = 0;
    if (f < 32 && pr > 0.8 && !renderer.xr.isPresenting) {
      pr = Math.max(0.8, pr - 0.25);
      renderer.setPixelRatio(pr);
      resize();
    }
  }
  lastT = now;
  if (G.intro) {
    if (XR()) introStart();
    else {
      introPad();
      introPre();
      render(dt, now);
      return;
    }
  }
  pollPad();
  if (!viewOK(G.view)) setView(G.mode === 'demo' ? 0 : G.flyView, true);
  if (G.paused) {
    render(0, now);
    return;
  }
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 16) {
    lerpSave();
    simStep();
    acc -= DT;
    n++;
    if (G.s.crash) break;
    if (G.running) G.lapT += DT;
    G.raceT += DT;
    lateralCheck();
  }
  if (n >= 16) acc = 0;
  LERP.a = n ? clamp(acc / DT, 0, 1) : LERP.a;
  if (G.s.crash) {
    const c = G.s.crash,
      hard = c === 'ship' || c === 'tower';
    G.s.crash = null;
    MOTION.crash = true;
    sfx(hard ? 'hit' : 'splash');
    if (!hard) splash();
    recover();
    if (c === 'ship') banner('SHIP STRIKE', 'Marine crew reset. Lap void.', 1700, '#ff3b3b');
    if (c === 'tower') banner('LAUNCH TOWER STRIKE', 'Pad crew reset. Lap void.', 1700, '#ff3b3b');
  }
  G.maxV = Math.max(G.maxV, G.s.V);
  G.idx = nearestFwd();
  const lerped = lerpIn();
  try {
    render(dt, now);
  } finally {
    if (lerped) lerpOut();
  }
}
function splash() {
  const s = G.s,
    p = ned(s.p);
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * 6.3,
      r = Math.random() * 9;
    emit(p.x, 0.5, p.z, Math.cos(a) * r, 6 + Math.random() * 12, Math.sin(a) * r);
  }
}
