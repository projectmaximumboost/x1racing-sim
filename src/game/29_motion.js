/* ---------- motion simulator output: 2-DOF (pitch + roll) UDP packet ----------
   A web page cannot send UDP, so the sim streams a 64-byte packet over a WebSocket to the X1 Motion Link helper on the
   rig PC (tools/motion/x1_motion_link.py), which forwards it as UDP to the rig software (FlyPT Mover, SimTools, an
   Arduino bridge...). Off unless the page is opened with ?motion (port 4580) or ?motion=<port>.
   The packet carries ready-to-use 2-DOF commands (-1..1) and the raw cues, so a rig can use either:
     pitchCmd  + = seat nose up   (sustained forward acceleration leans you back, braking tips you forward, plus pitch attitude)
     rollCmd   + = right side down (bank angle, plus any sideways push from a skid)
   Packets are built in the physics loop, one for every two 200 Hz steps, so they are 10 ms apart in sim time (100 Hz)
   whatever the display's frame rate; the browser hands them over in small bursts each frame and the helper spaces them
   back out to a steady 100 Hz. While the physics is stopped (paused), one parked packet goes out per frame instead.
   Safety: while parked (intro, paused, menus open) or after a crash or reset, the commands ease to
   neutral and hold there for a moment; crashes are capped at 3 g; if the tab stops drawing, the helper parks the rig.
   Layout (little endian), see tools/motion/README.md:
     0 'X1M2'  4 u32 seq  8 f32 sim time s  12 u16 flags  14 u16 version(1)
     16 pitchCmd  20 rollCmd  24 pitch deg  28 roll deg  32 heading deg  36 surge g  40 sway g  44 heave g
     48 roll rate  52 pitch rate  56 yaw rate (deg/s)  60 speed m/s
   flags: 1 flying (commands live)  2 parked  4 paused  8 intro  16 crash this packet  32 reset/teleport  64 on ground  128 SI flying */
const MOTION = {
  on: false,
  ws: null,
  port: 4580,
  seq: 0,
  n: 0,
  f: [0, 0, 0],
  last: 0,
  retry: 0,
  pc: 0,
  rc: 0,
  hold: 0,
  crash: false,
  lp: null,
  ls: null,
  chip: null,
  buf: new ArrayBuffer(64),
  ok: false,
  sent: 0,
  fb: [0, 0, -9.80665],
};
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has('motion')) return;
  MOTION.on = true;
  const p = parseInt(q.get('motion'), 10);
  if (p > 0 && p < 65536) MOTION.port = p;
})();
function motionChip(t, cls) {
  if (!MOTION.chip) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.id = 'cMotion';
    c.style.marginLeft = '6px';
    const h = $('chips');
    if (!h) return;
    h.appendChild(c);
    MOTION.chip = c;
  }
  if (MOTION.chip.textContent !== t) MOTION.chip.textContent = t;
  MOTION.chip.className = 'chip' + (cls ? ' ' + cls : '');
}
function motionLink(now) {
  const M = MOTION;
  if (M.ws && M.ws.readyState < 2) return;
  if (now < M.retry) return;
  M.retry = now + 2000;
  M.ok = false;
  motionChip('MOTION …');
  try {
    const ws = new WebSocket('ws://127.0.0.1:' + M.port);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      M.ok = true;
      motionChip('MOTION', 'on');
    };
    ws.onclose = () => {
      M.ok = false;
      motionChip('MOTION OFF');
    };
    ws.onerror = () => {};
    M.ws = ws;
  } catch (e) {
    M.ws = null;
    motionChip('MOTION OFF');
  }
}
const msat = (x) => Math.tanh(x);
/* every physics step: add up the specific force, and every second step turn it into a packet */
function motionAcc(s) {
  const M = MOTION;
  if (!M.on || !s.fb) return;
  M.f[0] += s.fb[0];
  M.f[1] += s.fb[1];
  M.f[2] += s.fb[2];
  if (++M.n < 2) return;
  M.fb = [M.f[0] / M.n, M.f[1] / M.n, M.f[2] / M.n];
  M.f = [0, 0, 0];
  M.n = 0;
  motionPacket(s, 2 * DT);
}
/* every frame: keep the link up, and if the physics did not run this frame (paused) send one parked packet */
function motionTick(now) {
  const M = MOTION;
  if (!M.on) return;
  motionLink(now);
  const dt = M.last ? Math.min((now - M.last) / 1000, 0.1) : 0;
  M.last = now;
  if (M.sent === 0 && dt > 0) motionPacket(G.s, dt);
  M.sent = 0;
}
function motionPacket(s, dt) {
  const M = MOTION,
    G0 = 9.80665,
    fb = M.fb;
  M.sent++;
  // a reset or crash recovery shows up as a new state object or a jump of more than 15 m between packets
  const tele = M.ls !== s || (M.lp && Math.hypot(s.p[0] - M.lp[0], s.p[1] - M.lp[1], s.p[2] - M.lp[2]) > 15);
  M.ls = s;
  M.lp = [s.p[0], s.p[1], s.p[2]];
  const crash = M.crash;
  M.crash = false;
  if (crash || tele) M.hold = 1.2;
  const paused = !!G.paused,
    intro = !!G.intro,
    parked = paused || intro || M.hold > 0;
  M.hold = Math.max(0, M.hold - dt);
  const cap = (v) => clamp(v, -3, 3),
    surge = cap(fb[0] / G0),
    sway = cap(fb[1] / G0),
    heave = cap(-fb[2] / G0);
  // 2-DOF blend, soft-limited: lean back under acceleration and forward under braking, bank with the craft
  const pT = parked ? 0 : msat((0.85 * surge) / 0.45 + (0.55 * (s.theta / D2R)) / 30),
    rT = parked ? 0 : msat((0.9 * (s.phi / D2R)) / 40 - (0.6 * sway) / 0.35);
  // rate limit: 2.5 full-scale per second normally, a gentle 0.8 when easing to park
  const rl = (parked ? 0.8 : 2.5) * dt;
  M.pc += clamp(pT - M.pc, -rl, rl);
  M.rc += clamp(rT - M.rc, -rl, rl);
  if (!M.ok || !M.ws || M.ws.readyState !== 1) return;
  const v = new DataView(M.buf);
  let o = 0;
  const f32 = (x) => {
    v.setFloat32(o, Number.isFinite(x) ? x : 0, true);
    o += 4;
  };
  v.setUint8(0, 88);
  v.setUint8(1, 49);
  v.setUint8(2, 77);
  v.setUint8(3, 50);
  v.setUint32(4, M.seq++ >>> 0, true);
  o = 8;
  f32(s.t || 0);
  const flags =
    (parked ? 2 : 1) |
    (paused ? 4 : 0) |
    (intro ? 8 : 0) |
    (crash ? 16 : 0) |
    (tele ? 32 : 0) |
    (s.onGround ? 64 : 0) |
    (G.mode === 'demo' ? 128 : 0);
  v.setUint16(12, flags, true);
  v.setUint16(14, 1, true);
  o = 16;
  f32(M.pc);
  f32(M.rc);
  f32(s.theta / D2R);
  f32(s.phi / D2R);
  f32((((s.psi / D2R) % 360) + 360) % 360);
  f32(surge);
  f32(sway);
  f32(heave);
  f32(s.w[0] / D2R);
  f32(s.w[1] / D2R);
  f32(s.w[2] / D2R);
  f32(s.V || 0);
  try {
    if (M.ws.bufferedAmount < 8192) M.ws.send(M.buf.slice(0));
  } catch (e) {}
}
