/* ---------- race logic ---------- */
function lateralCheck() {
  const s = G.s,
    x = s.p[1],
    y = s.p[0],
    h = -s.p[2];
  if (SHIP.objs && !s.crash && shipHit(x, y, h)) {
    s.crash = 'ship';
    return;
  }
  if (F9.grid && !s.crash && f9Hit(x, y, h)) {
    s.crash = 'tower';
    return;
  }
  // spire contact: X1 inflatable profile, plus 2.4 m half-span allowance
  const t = performance.now();
  for (const o of spireObjs) {
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < 14 && h < SPIRE_H + 1 && d < spireR(h - 1.6) + 2.5 && t - G.lastHit > 1800) {
      G.lastHit = t;
      o.wob = 1;
      G.pen += 3;
      s.v = s.v.map((v) => v * 0.72);
      sfx('hit');
      banner('SPIRE HIT', '+3 s', 1100, '#ffc53d');
    }
  }
  if (G.next < SP.length) {
    const sp = SP[G.next],
      dx = x - sp.x,
      dy = y - sp.y,
      along = dx * sp.tan[0] + dy * sp.tan[1],
      off = dx * sp.out[0] + dy * sp.out[1];
    if (G.prevAlong !== undefined && G.prevAlong < 0 && along >= 0 && Math.abs(off) < 420) {
      if (off < 0) {
        G.pen += 5;
        sfx('buzz');
        banner('WRONG SIDE', 'Turn ' + (G.next + 1) + ': +5 s', 1500, '#ff3b3b');
      }
      G.next++;
      G.lastSafe = G.idx;
    }
    G.prevAlong =
      G.next < SP.length ? (x - SP[G.next].x) * SP[G.next].tan[0] + (y - SP[G.next].y) * SP[G.next].tan[1] : 0;
  }
  // start / finish: eastbound across x=0 between the checkered spires
  const ga = DEF.gate.a[1],
    gb = DEF.gate.b[1];
  if (G.prevE < 0 && x >= 0 && y > ga && y < gb) {
    if (!G.running) {
      G.running = true;
      G.lap = 1;
      G.lapT = 0;
      G.pen = 0;
      G.next = 0;
      G.void = false;
      G.maxV = 0;
      G.prevAlong = undefined;
      sfx('gate');
      banner('LAP 1', 'Timing started', 1100);
    } else {
      const raw = G.lapT,
        t2 = raw + G.pen,
        ok = G.next >= SP.length && !G.void;
      recordLap(t2, raw, ok);
      G.last = t2;
      $('tLast').textContent = ok ? fmt(t2) : 'void';
      const best = G.mode === 'demo' && !G.assist ? G.bestSI : G.bestYou;
      sfx(!ok ? 'void' : t2 <= best + 1e-6 ? 'best' : 'lap');
      if (ok)
        banner(
          fmt(t2),
          (t2 <= best + 1e-6 ? 'Best lap' : 'Lap ' + G.lap) + (G.pen ? '  incl. +' + G.pen + ' s' : ''),
          1900,
          t2 <= best + 1e-6 ? '#21d97e' : '',
        );
      else banner('LAP VOID', G.void ? 'Recovered by the marine crew' : 'Missed a spire', 1600, '#ff3b3b');
      G.lap++;
      G.lapT = 0;
      G.pen = 0;
      G.next = 0;
      G.void = false;
      G.maxV = 0;
      G.prevAlong = undefined;
      G.demoLaps++;
      if (G.mode === 'demo' && G.demoLaps >= 4 && !G.assist) {
        reset('demo');
      }
    }
  }
  G.prevE = x;
}
function recover() {
  G.at = X.makeAutoThrust();
  if (G.s.fuel <= 0) {
    reset(G.mode === 'demo' ? 'demo' : 'player');
    banner('OUT OF PROPANE', 'Refueled on the pad', 2200, '#ffc53d');
    return;
  }
  const s = G.s,
    i = G.lastSafe ?? G.idx,
    p = P[i],
    q = P[(i + 3) % N],
    yaw = Math.atan2(q.x - p.x, q.y - p.y);
  const n = X.newState({ n: p.y, e: p.x, alt: Math.max(p.z, 14) + 3, yaw, hT: Math.max(p.z, 14) + 3 });
  n.soc = s.soc;
  n.fuel = s.fuel;
  const v = 38;
  n.v = [Math.cos(yaw) * v, Math.sin(yaw) * v, 0];
  n.p[2] = -(Math.max(p.z, 14) + 3);
  for (let k = 0; k < 8; k++) n.spool[k] = 0.72;
  G.s = n;
  G.void = true;
  G.si = X.makeSI(course);
  G.si.t = 5;
  G.idx = i;
  G.prevE = p.x;
  banner('RECOVERED', 'Marine crew reset. Lap void.', 1500, '#ffc53d');
}
