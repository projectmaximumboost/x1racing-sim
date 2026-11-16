/* ---------- ship deck view: a spectator at the upper sun-deck rail, SI flying ----------
   Rail spots in model metres (x beam, y up, z bow): upper deck at 36.4 m, rail top about 37.4 m, outer rail |x| 17.5-18.1.
   Each frame the best spot is the nearest one that faces the SkyRacer with the other ship out of the way; it changes only
   when a new spot is clearly better, and never more than once every 4 s. */
const DECK = {
  spots: [
    [-75, 1],
    [-75, -1],
    [40, 1],
    [40, -1],
  ].map(([z, s]) => ({ p: new THREE.Vector3(s * 16.4, 37.85, z), o: new THREE.Vector3(s * 30, 37.85, z) })),
  cur: null,
  t: 0,
  fov: 40,
  look: new THREE.Vector3(),
};
function deckCands() {
  const out = [];
  SHIP.objs.forEach((o, i) => {
    o.updateMatrixWorld(true);
    DECK.spots.forEach((s, j) => {
      const p = o.localToWorld(s.p.clone()),
        n = o.localToWorld(s.o.clone()).sub(p).normalize();
      out.push({ k: i * 4 + j, ship: i, side: j % 2, fwd: j > 1, p, n });
    });
  });
  return out;
}
function deckClear(c, t) {
  const d = t.clone().sub(c.p);
  for (let k = 1; k < 16; k++) {
    const q = c.p.clone().addScaledVector(d, k / 16);
    if (q.distanceTo(c.p) < 6) continue;
    if (shipHit(q.x, -q.z, q.y)) return false;
    if (q.y < 62) for (const sp of SP) if (Math.hypot(q.x - sp.x, -q.z - sp.y) < 8) return false;
  }
  return true;
}
function deckPick(t, now) {
  const cs = deckCands();
  let best = null,
    cur = null;
  for (const c of cs) {
    const d = c.p.distanceTo(t),
      f = c.n.dot(t.clone().sub(c.p)) / d;
    if (f < -0.1 || !deckClear(c, t)) continue;
    const sc = d * (1.3 - f * 0.3);
    if (DECK.cur && c.k === DECK.cur.k) cur = { c, sc };
    if (!best || sc < best.sc) best = { c, sc };
  }
  if (!best) return DECK.cur || cs[0];
  if (!cur || (best.c.k !== cur.c.k && best.sc < cur.sc * 0.72 && now - DECK.t > 4000)) {
    if (!DECK.cur || best.c.k !== DECK.cur.k) {
      DECK.t = now;
      camInit = false;
    }
    return best.c;
  }
  return cur.c;
}
function deckCam(dt, pos) {
  const now = performance.now(),
    c = G.view === 4 && DECK.cur ? DECK.cur : deckPick(pos, now);
  DECK.cur = c;
  const target = pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  if (G.view === 4) {
    if (!camInit || !DECK.lkV) {
      DECK.look.copy(target);
      DECK.lkV = new THREE.Vector3();
      DECK.fovV = 0;
      camInit = true;
      DECK.fov = clamp((2 * Math.atan(17 / Math.max(c.p.distanceTo(pos), 1))) / D2R, 3.5, 45);
    } else springV(DECK.look, DECK.lkV, target, 6, dt);
    cam.position.copy(c.p);
    cam.up.set(0, 1, 0);
    cam.lookAt(DECK.look);
    const r = spring1(
      DECK.fov,
      DECK.fovV,
      clamp((2 * Math.atan(17 / Math.max(c.p.distanceTo(pos), 1))) / D2R, 3.5, 45),
      2,
      dt,
    );
    DECK.fov = r[0];
    DECK.fovV = r[1];
    cam.fov = DECK.fov;
    return;
  }
  if (!camInit) {
    DECK.look.copy(target);
    camInit = true;
  }
  DECK.look.lerp(target, 1 - Math.exp(-dt * 6));
  cam.position.copy(c.p);
  cam.up.set(0, 1, 0);
  cam.lookAt(DECK.look);
  const d = c.p.distanceTo(pos),
    want = clamp((2 * Math.atan(17 / Math.max(d, 1))) / D2R, 3.5, 45);
  DECK.fov = lerp(DECK.fov, want, 1 - Math.exp(-dt * 2.5));
  cam.fov = DECK.fov;
}
function deckTag() {
  const s = G.s,
    p = proj(ned(s.p));
  if (p.behind || !DECK.cur) return;
  const d = DECK.cur.p.distanceTo(ned(s.p)),
    r = clamp((2600 / Math.max(d, 1) / DECK.fov) * 40, 22, 90);
  g2.strokeStyle = 'rgba(255,255,255,.85)';
  g2.lineWidth = 2;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    g2.beginPath();
    g2.moveTo(p.x + sx * r, p.y + sy * r * 0.55);
    g2.lineTo(p.x + sx * r, p.y + sy * r * 0.8);
    g2.lineTo(p.x + sx * r * 0.7, p.y + sy * r * 0.8);
    g2.stroke();
  }
  g2.font = '700 16px "Barlow Condensed",sans-serif';
  g2.textAlign = 'center';
  g2.fillStyle = '#fff';
  g2.shadowColor = 'rgba(0,0,0,.6)';
  g2.shadowBlur = 5;
  g2.fillText('X1 SKYRACER  ·  SI  ·  ' + Math.round(d * 3.28) + ' ft', p.x, p.y + r * 0.8 + 20);
  g2.textAlign = 'left';
  g2.font = '600 13px "IBM Plex Mono",monospace';
  g2.fillStyle = 'rgba(255,255,255,.8)';
  g2.fillText(
    'DECK CAM  SHIP ' +
      (DECK.cur.ship + 1) +
      (DECK.cur.side ? ' PORT' : ' STARBOARD') +
      (DECK.cur.fwd ? ' FWD' : ' AFT'),
    18,
    H2 - 150,
  );
  g2.shadowBlur = 0;
}
