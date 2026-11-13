/* ---------- TV view (SI only): a race broadcast ----------
   Chase from take-off to the start line, then a director cuts between shots: a camera on the water by the next spire, a
   helicopter alongside, fly-bys from ahead, a slow orbit, the ship decks, and short cockpit and bird's-eye shots. Shots last
   a few seconds; a spire shot holds until the SkyRacer is round the spire. */
const TV = {
  kind: 0,
  t0: 0,
  until: 0,
  spire: -1,
  passT: 0,
  fix: new THREE.Vector3(),
  ang: 0,
  last: [],
  fov: 50,
  lk: new THREE.Vector3(),
  label: '',
  reset() {
    this.kind = 0;
    this.t0 = 0;
    this.until = 0;
    this.spire = -1;
    this.last = [];
    this.label = 'CHASE';
  },
  pick(now, pos, hdg) {
    const s = G.s,
      opts = [];
    const nx = G.next < SP.length ? SP[G.next] : null,
      ds = nx ? Math.hypot(nx.x - s.p[1], nx.y - s.p[0]) : 1e9;
    if (nx && ds < 330 && G.next !== this.spire && this.last[0] !== 'spire') opts.push([5, 'spire']);
    opts.push([3, 'heli'], [3, 'flyby'], [2, 'chase'], [1.6, 'orbit'], [1.2, 'low'], [0.9, 'cockpit'], [0.7, 'bird']);
    if (SHIP.objs) {
      const t = pos;
      let best = 1e9;
      for (const c of deckCands()) {
        const d = c.p.distanceTo(t);
        if (c.n.dot(t.clone().sub(c.p)) > 0 && d < best && deckClear(c, t)) best = d;
      }
      if (best < 520) opts.push([4, 'deck']);
    }
    const ok = opts.filter((o) => !this.last.includes(o[1]) || o[1] === 'spire');
    let tot = 0;
    for (const o of ok) tot += o[0];
    let r = Math.random() * tot,
      k = ok[0][1];
    for (const o of ok) {
      r -= o[0];
      if (r <= 0) {
        k = o[1];
        break;
      }
    }
    this.last = [k, ...this.last].slice(0, 2);
    this.t0 = now;
    camInit = false;
    const R = new THREE.Vector3(-hdg.z, 0, hdg.x); // right of the heading
    const dur =
      { spire: 14, heli: 6, flyby: 5, chase: 5, orbit: 6, low: 5, cockpit: 4, bird: 4.5, deck: 6 }[k] *
      (0.8 + Math.random() * 0.4);
    this.until = now + dur * 1000;
    if (k === 'spire') {
      this.spire = G.next;
      this.passT = 0;
      const sp = SP[G.next];
      let okP = false;
      for (const [a, b] of [
        [60, -16],
        [60, 22],
        [80, -30],
        [80, 0],
      ]) {
        this.fix.copy(toW(sp.x + sp.tan[0] * a + sp.out[0] * b, sp.y + sp.tan[1] * a + sp.out[1] * b, 4.5));
        if (
          tvLOS(this.fix, pos) &&
          !shipNear(this.fix.x, -this.fix.z, 70) &&
          SP.every((o) => Math.hypot(this.fix.x - o.x, -this.fix.z - o.y) > 40)
        ) {
          okP = true;
          break;
        }
      }
      if (!okP) {
        this.kind = 0;
        return this.pick(now, pos, hdg);
      }
      this.label = 'TURN ' + (G.next + 1) + ' CAM';
    }
    if (k === 'flyby') {
      const sd = Math.random() < 0.5 ? -1 : 1;
      this.fix
        .copy(pos)
        .addScaledVector(hdg, 110 + s.V * 1.2)
        .addScaledVector(R, sd * (10 + Math.random() * 10));
      this.fix.y = Math.max(2.5, pos.y + (Math.random() * 8 - 3));
      this.label = 'TRACKSIDE';
    }
    if (k === 'low') {
      const sd = Math.random() < 0.5 ? -1 : 1;
      this.fix
        .copy(pos)
        .addScaledVector(hdg, 70 + s.V)
        .addScaledVector(R, sd * 24);
      this.fix.y = 1.4;
      this.label = 'WATER CAM';
    }
    const bad = () => !tvLOS(this.fix, pos) || shipNear(this.fix.x, -this.fix.z, 45);
    if ((k === 'flyby' || k === 'low') && bad()) {
      this.fix.addScaledVector(R, -2 * R.dot(this.fix.clone().sub(pos)));
      if (bad()) this.until = now;
    }
    if (k === 'heli') {
      this.ang = Math.random() < 0.5 ? 1 : -1;
      this.label = 'HELI';
    }
    if (k === 'orbit') {
      this.ang = Math.atan2(-hdg.x, -hdg.z) + (Math.random() - 0.5) * 2;
      this.label = 'DRONE';
    }
    if (k === 'deck') {
      DECK.cur = null;
      DECK.cur = deckPick(pos, now);
      DECK.lkV = null;
      this.label = 'SHIP DECK';
    }
    if (k === 'chase') this.label = 'CHASE';
    if (k === 'cockpit') this.label = 'ONBOARD';
    if (k === 'bird') this.label = 'BIRD';
    this.kind = k;
  },
  shot(dt, pos, hdg) {
    const now = performance.now();
    if (!G.running) {
      if (this.kind !== 0) {
        this.kind = 0;
        this.label = 'CHASE';
        camInit = false;
      }
      return 0;
    } // take-off and out lap: chase
    if (this.kind === 0 || now > this.until) {
      if (this.kind === 'spire' && !this.passT && now < this.t0 + 20000) {
        /* hold until the turn is done */
      } else this.pick(now, pos, hdg);
    }
    if (this.kind === 'spire' && G.next !== this.spire && !this.passT) {
      this.passT = now;
      this.until = Math.min(this.until, now + 1800);
    }
    if (this.kind === 'flyby' || this.kind === 'low') {
      const to = pos.clone().sub(this.fix);
      if (to.dot(hdg) > 60 && now - this.t0 > 1500) this.until = Math.min(this.until, now + 900);
    }
    return { chase: 0, cockpit: 1, bird: 2, deck: 3 }[this.kind] ?? 5;
  },
  // Smooth camera work: a critically damped spring (no overshoot, no sudden starts) on the aim point, the moving camera
  // positions and the zoom; the heading used to place cameras is filtered so turns don't swing them; the aim leads the
  // SkyRacer slightly. A cut is a clean snap: every spring restarts at its target on the first frame of a shot.
  cam(dt, pos, hdg, Rb) {
    const k = this.kind,
      s = G.s,
      vel = ned(s.v),
      fresh = !camInit;
    if (fresh || !this.h) this.h = hdg.clone();
    else {
      this.h
        .lerp(hdg, 1 - Math.exp(-dt * 1.4))
        .setY(0)
        .normalize();
    }
    const tgt = pos
      .clone()
      .addScaledVector(vel, 0.12)
      .add(new THREE.Vector3(0, 0.8, 0));
    if (fresh) {
      this.lk.copy(tgt);
      this.lkV = new THREE.Vector3();
    } else springV(this.lk, this.lkV, tgt, 7, dt);
    let want = 40,
      w = null,
      om = 2;
    const H = this.h,
      R = new THREE.Vector3(-H.z, 0, H.x);
    if (k === 'spire' || k === 'flyby' || k === 'low') {
      cam.position.copy(this.fix);
      const d = Math.max(this.fix.distanceTo(pos), 18);
      want = clamp((2 * Math.atan(9 / d)) / D2R, 6, 62);
    } else if (k === 'heli') {
      w = pos
        .clone()
        .addScaledVector(R, this.ang * 34)
        .addScaledVector(H, -8)
        .add(new THREE.Vector3(0, 9, 0));
      om = 1.7;
      want = 34;
    } else if (k === 'orbit') {
      this.ang += dt * 0.32;
      w = pos.clone().add(new THREE.Vector3(Math.sin(this.ang) * 30, 6, Math.cos(this.ang) * 30));
      om = 2.6;
      want = 46;
    }
    if (w) {
      if (fresh || !this.cp || this.cp.distanceTo(w) > 250) {
        this.cp = w.clone();
        this.cpV = new THREE.Vector3();
      } else springV(this.cp, this.cpV, w, om, dt);
      cam.position.copy(this.cp);
    }
    if (cam.position.y < 1.2) cam.position.y = 1.2;
    if ((k === 'heli' || k === 'orbit') && !tvLOS(cam.position, pos))
      this.until = Math.min(this.until, performance.now() + 600);
    if (fresh) {
      this.fov = want;
      this.fovV = 0;
    } else {
      const r = spring1(this.fov, this.fovV, want, 2.2, dt);
      this.fov = r[0];
      this.fovV = r[1];
    }
    camInit = true;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lk);
    cam.fov = this.fov;
  },
};
// critically damped spring step (stable at any frame time): moves x toward target with velocity v, natural frequency om
function spring1(x, v, t, om, dt) {
  const f = 1 + 2 * dt * om,
    oo = om * om,
    hoo = dt * oo,
    det = 1 / (f + dt * hoo);
  return [(f * x + dt * v + dt * hoo * t) * det, (v + hoo * (t - x)) * det];
}
function springV(x, v, t, om, dt) {
  for (const c of ['x', 'y', 'z']) {
    const r = spring1(x[c], v[c], t[c], om, dt);
    x[c] = r[0];
    v[c] = r[1];
  }
}
// clear view: no ship hull and no spire between the camera and the SkyRacer, and the camera not inside either
function tvLOS(a, b) {
  const d = b.clone().sub(a);
  for (let i = 0; i <= 16; i++) {
    const q = a.clone().addScaledVector(d, i / 16);
    if (SHIP.objs && shipHit(q.x, -q.z, q.y)) return false;
    if (q.y < 62) for (const sp of SP) if (Math.hypot(q.x - sp.x, -q.z - sp.y) < 8) return false;
  }
  return true;
}
function tvTag() {
  const s = G.s,
    p = proj(ned(s.p));
  g2.shadowColor = 'rgba(0,0,0,.6)';
  g2.shadowBlur = 5;
  if (G.camV !== 1 && !p.behind) {
    g2.font = '700 15px "Barlow Condensed",sans-serif';
    g2.textAlign = 'center';
    g2.fillStyle = '#fff';
    g2.fillText(
      'X1 SKYRACER  ·  SI  ·  ' + Math.round(s.V * 2.23694) + ' MPH',
      p.x,
      p.y - clamp(9000 / Math.max(cam.position.distanceTo(ned(s.p)), 1) / cam.fov, 26, 140),
    );
  }
  g2.textAlign = 'left';
  g2.font = '700 14px "Barlow Condensed",sans-serif';
  g2.fillStyle = '#e8690f';
  g2.fillText('● TV', 18, H2 - 150);
  g2.fillStyle = 'rgba(255,255,255,.85)';
  g2.fillText(TV.label || 'CHASE', 56, H2 - 150);
  g2.shadowBlur = 0;
}
