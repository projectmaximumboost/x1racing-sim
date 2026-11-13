/* ---------- opening sequence ----------
   The sim opens on a produced title sequence instead of starting straight away: the flags, the machine on the pad, then the
   ships and spires in broadcast-style shots with fades, letterbox and lower-third captions. The sim is held still meanwhile.
   Any key, click, tap or controller button starts it: the camera cuts to the chase view, the wings unfold and SI flies.
   ~ (the key left of 1) resets everything and comes back here. */
const INTRO = { i: 0, t: 0, cap: -1, fade: -1, padDown: false, v: new THREE.Vector3(), c: new THREE.Vector3() };
$('introLogo').src = X1LOGO;
$('introGo').textContent = matchMedia('(pointer:coarse)').matches ? 'Tap to start' : 'Press any key to start';
const smooth = (u) => u * u * (3 - 2 * u);
const shipW = (n, x, y, z, out) => (out || new THREE.Vector3()).set(x, y, z).applyMatrix4(SHIP.objs[n].matrixWorld);
const haveShips = () => !!(SHIP.objs && SHIP.flagG && SHIP.flagG.length === SHIP.place.length);
// the course's bounding box: the flyover frames all of it, the long way across the screen
const CB = (() => {
    let a = [1e9, -1e9, 1e9, -1e9];
    for (const p of P) {
      a[0] = Math.min(a[0], p.x);
      a[1] = Math.max(a[1], p.x);
      a[2] = Math.min(a[2], p.y);
      a[3] = Math.max(a[3], p.y);
    }
    return { x: (a[0] + a[1]) / 2, y: (a[2] + a[3]) / 2, w: a[1] - a[0] };
  })(),
  courseC = toW(CB.x, CB.y, 0);
/* ---------- the race clip ----------
   While the opening plays, the SI flies two laps from the pad on a copy of the physics, out of sight, a few hundred steps
   a frame. Its second lap (race pace) is recorded at 60 frames a second around turns 2 and 3, the left-right S. The clip
   runs from the first frame in which a cruise ship is inside the cockpit camera's view, on the way into turn 3, to 2.5 s
   past the spire; without the ships it runs the last 7 s into the turn. During the shot the sim's state is swapped for
   the recorded one, so the craft, its fans, the dash screen and the sound all play the lap; the pad state comes back
   after. */
const CLIP = {
  ready: false,
  s: null,
  si: null,
  t: 0,
  rec: [],
  tc3: 0,
  d3: 1e9,
  t0: 0,
  t1: 0,
  play: null,
};
// the SI's second lap passes turn 3 about 103.5 s after leaving the pad (the first lap at 43 s): record 88 to 110 s
const CLIP_DT = 1 / 60,
  CLIP_FROM = 88,
  CLIP_TO = 110;
function clipRecord() {
  if (CLIP.ready || CLIP.t >= CLIP_TO) return;
  if (!CLIP.s) {
    CLIP.s = X.newState({ n: PAD.y, e: PAD.x, yaw: PAD.yaw, hT: PAD.h });
    CLIP.s.p[2] = -(PAD.h + C.cg[2] - 0.02);
    X.euler(CLIP.s);
    CLIP.si = X.makeSI(course);
  }
  const s = CLIP.s,
    t3 = SP[2],
    every = Math.round(CLIP_DT / DT);
  for (let n = 0; n < 1200 && CLIP.t < CLIP_TO; n++) {
    const u = X.fbw(s, CLIP.si.step(s, DT, PAD.h), DT, groundH(s));
    X.step(s, u, DT, env);
    CLIP.t += DT;
    if (CLIP.t < CLIP_FROM) continue;
    if (Math.round(CLIP.t / DT) % every === 0) {
      if (!CLIP.play)
        CLIP.play = Object.assign({}, s, {
          p: [...s.p],
          q: [...s.q],
          v: [...s.v],
          w: [...s.w],
          spool: Float64Array.from(s.spool),
        });
      CLIP.rec.push({
        t: CLIP.t,
        p: [...s.p],
        q: [...s.q],
        v: [...s.v],
        w: [...s.w],
        spool: Float64Array.from(s.spool),
        V: s.V,
        P: s.P,
        phi: s.phi,
        theta: s.theta,
        psi: s.psi,
      });
    }
    // turn 3 is where the recorded lap comes closest to its spire (inside 80 m: the SI passes about 72 m off it)
    const d3 = Math.hypot(s.p[1] - t3.x, s.p[0] - t3.y);
    if (d3 < 80 && d3 < CLIP.d3) [CLIP.d3, CLIP.tc3] = [d3, CLIP.t];
  }
  if (CLIP.t >= CLIP_TO || (CLIP.tc3 && CLIP.t > CLIP.tc3 + 3)) clipCut();
}
// pose of the craft (three frame) for a recorded frame, as render() builds it
const clipM = new THREE.Matrix4(),
  clipQ = new THREE.Quaternion();
function clipPose(f, out) {
  const F = ned(X.rotV(f.q, [1, 0, 0])),
    R = ned(X.rotV(f.q, [0, 1, 0])),
    Dn = ned(X.rotV(f.q, [0, 0, 1]));
  clipM.makeBasis(R.negate(), Dn.negate(), F);
  clipQ.setFromRotationMatrix(clipM);
  return out.compose(ned(f.p), clipQ, new THREE.Vector3(1, 1, 1));
}
function clipCut() {
  const R = CLIP.rec;
  if (!R.length || !CLIP.tc3) return;
  const end = CLIP.tc3 + 2.5,
    from = Math.max(R[0].t, CLIP.tc3 - 11);
  let start = CLIP.tc3 - 7;
  if (haveShips()) {
    // the first frame, coming into turn 3, with a ship inside the cockpit camera's view
    const boxes = SHIP.objs.map((o) => new THREE.Box3().setFromObject(o)),
      eye = new THREE.Vector3(),
      M = new THREE.Matrix4(),
      fr = new THREE.Frustum(),
      pc = new THREE.PerspectiveCamera(74, cam.aspect || 16 / 9, 0.5, 4000);
    for (const f of R) {
      if (f.t < from || f.t > CLIP.tc3 - 2) continue;
      clipPose(f, M);
      eye.copy(EYE).add(inner.position).applyMatrix4(M);
      pc.position.copy(eye);
      pc.quaternion.setFromRotationMatrix(M);
      pc.rotateY(Math.PI); // a camera looks down its -z; the craft's nose is its +z
      pc.updateMatrixWorld(true);
      fr.setFromProjectionMatrix(M.multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse));
      if (boxes.some((b) => fr.intersectsBox(b))) {
        start = f.t;
        break;
      }
    }
  }
  CLIP.t0 = start;
  CLIP.t1 = end;
  CLIP.ships = haveShips();
  CLIP.ready = true;
  const sh = SHOTS.find((s) => s.fly);
  sh.T = end - start;
}
// before each intro frame is drawn: the recorded state during the clip, the pad state otherwise
function introPre() {
  const sh = SHOTS[INTRO.i];
  // ships arriving after the clip was cut: cut it again so it starts when they come into view
  if (CLIP.ready && !CLIP.ships && haveShips() && !(sh && sh.fly)) clipCut();
  if (!CLIP.ready) clipRecord();
  if (sh && sh.fly && CLIP.ready) {
    if (G.s !== CLIP.play) INTRO.pad = G.s;
    const R = CLIP.rec,
      t = CLIP.t0 + INTRO.t,
      i = clamp(Math.floor((t - R[0].t) / CLIP_DT), 0, R.length - 2),
      a = R[i],
      b = R[i + 1],
      k = clamp((t - a.t) / (b.t - a.t), 0, 1),
      S = CLIP.play;
    for (let j = 0; j < 3; j++) {
      S.p[j] = a.p[j] + (b.p[j] - a.p[j]) * k;
      S.v[j] = a.v[j] + (b.v[j] - a.v[j]) * k;
      S.w[j] = a.w[j] + (b.w[j] - a.w[j]) * k;
    }
    const d = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3],
      sg = d < 0 ? -1 : 1;
    let n = 0;
    for (let j = 0; j < 4; j++) {
      S.q[j] = a.q[j] + (sg * b.q[j] - a.q[j]) * k;
      n += S.q[j] * S.q[j];
    }
    n = Math.sqrt(n);
    for (let j = 0; j < 4; j++) S.q[j] /= n;
    S.spool.set(b.spool);
    S.V = a.V + (b.V - a.V) * k;
    S.P = b.P;
    S.phi = a.phi + (b.phi - a.phi) * k;
    S.theta = a.theta + (b.theta - a.theta) * k;
    S.psi = b.psi;
    S.onGround = false;
    G.s = S;
  } else if (INTRO.pad && G.s === CLIP.play) G.s = INTRO.pad;
}
// each shot: duration, caption, whether it needs the ships, and where the camera is at progress u (0..1)
const SHOTS = [
  {
    T: 8,
    cap: () => ['FREEDOM AT EVERY TURN', ''],
    f(u, cm) {
      const o = spireObjs[0].G.position,
        c = INTRO.c.set(o.x, 10, o.z),
        a = 0.5 + u * 1.1;
      cm.position.set(c.x + Math.cos(a) * 25, c.y + 1 + 2.5 * u, c.z + Math.sin(a) * 25);
      cm.lookAt(c);
      cm.fov = 50;
    },
  },
  {
    T: 9,
    ship: 1,
    cap: () => ['WELCOME TO X1 RACING', ''],
    f(u, cm) {
      const g = SHIP.flagG[0];
      g.updateMatrixWorld(true);
      const a = -0.75 + u * 1.5,
        c = g.localToWorld(INTRO.c.set(0, -0.4, -3.4));
      g.localToWorld(cm.position.set(Math.cos(a) * 14, 1.6 - 2.6 * u, -3.4 + Math.sin(a) * 14));
      cm.lookAt(c);
      cm.fov = 42;
    },
  },
  {
    T: 9,
    unfold: 1,
    cap: () => ['THE X1 SKYRACER', 'Wings unfolding on the pad'],
    f(u, cm, pos, hdg) {
      const sd = INTRO.v.set(-hdg.z, 0, hdg.x),
        e = smooth(u);
      cm.position
        .copy(pos)
        .addScaledVector(hdg, -(13 - 4.5 * e))
        .addScaledVector(sd, 3.5 - 7 * e);
      cm.position.y = pos.y + 3.4;
      cm.lookAt(
        INTRO.c
          .copy(pos)
          .addScaledVector(hdg, 6)
          .setY(pos.y + 1.2),
      );
      cm.fov = 55;
    },
  },
  {
    T: 7,
    ship: 1,
    cap: () => ['CRUISE SHIP INFIELD', ''],
    f(u, cm) {
      SHIP.objs[1].updateMatrixWorld(true);
      shipW(1, -49, 2.3, -115 + 215 * u, cm.position);
      cm.lookAt(shipW(1, 0, 22, -70 + 215 * u, INTRO.c));
      cm.fov = 50;
    },
  },
  // a race clip from the cockpit: the SI through the S of turns 2 and 3, from the moment the cruise ships come into view
  {
    T: 6,
    fly: 1,
    cap: () => ['TURN 3', 'Race pace, from the cockpit'],
    f(u, cm) {
      if (!CLIP.ready) {
        // the clip is still being flown: the old spire shot meanwhile
        const o = spireObjs[2].G.position,
          a = 1.2 + u * 0.3;
        cm.position.set(o.x + Math.cos(a) * 17, 2.4, o.z + Math.sin(a) * 17);
        cm.lookAt(INTRO.c.set(o.x, lerp(7, 56, smooth(u)), o.z));
        cm.fov = 60;
        return;
      }
      craft.updateMatrixWorld(true);
      cm.position.copy(EYE).add(inner.position).applyMatrix4(craft.matrixWorld);
      cm.up.set(0, 1, 0).applyQuaternion(craft.quaternion);
      cm.lookAt(INTRO.c.set(0, 0, 1).applyQuaternion(craft.quaternion).add(cm.position));
      cm.fov = 74;
    },
  },
  {
    T: 7,
    ship: 1,
    cap: () => ['BOW HELIPAD', 'Land on it in Fly mode'],
    f(u, cm) {
      SHIP.objs[0].updateMatrixWorld(true);
      shipW(0, 20, 24 + 40 * smooth(u), 178 - 12 * u, cm.position);
      cm.lookAt(shipW(0, 0, 15, 138, INTRO.c));
      cm.fov = 50;
    },
  },
  {
    T: 6,
    cap: () => ['START GATE', 'Fly between the checkered spires'],
    f(u, cm) {
      const a = gateA.G.position,
        b = gateB.G.position,
        m = INTRO.c.copy(a).add(b).multiplyScalar(0.5),
        ab = INTRO.v.copy(b).sub(a).normalize(),
        pp = new THREE.Vector3(ab.z, 0, -ab.x);
      cm.position
        .copy(m)
        .addScaledVector(pp, 95)
        .addScaledVector(ab, -40 + 80 * u);
      cm.position.y = 26 - 10 * u;
      m.y = 24;
      cm.lookAt(m);
      cm.fov = 50;
    },
  },
  {
    T: 8,
    course: 1,
    cap: () => ['THE COURSE', SP.length + ' turns over the water'],
    f(u, cm) {
      const b = -0.22 + u * 0.44,
        R = CB.w * 0.48,
        H = CB.w * 0.6;
      const q = toW(CB.x + Math.sin(b) * R, CB.y - Math.cos(b) * R, H);
      cm.position.copy(q);
      cm.lookAt(courseC);
      cm.fov = Math.max(50, Math.min(75, 50 / Math.min(1, cm.aspect / 1.6)));
    },
  },
  // Falcon 9: ignition as the first launch shot opens, liftoff a second later, then the climb from the water, the ship, and afar
  {
    T: 10,
    f9: 1,
    big: 1,
    go: () => f9Launch(),
    cap: () => ['AMERICA MAXXING', 'Designed with American Super Intelligence and Built with American Might'],
    f(u, cm) {
      const b = F9.base,
        d = F9.dirS,
        sd = INTRO.v.set(-d.z, 0, d.x);
      cm.position.copy(b).addScaledVector(d, 235).addScaledVector(sd, 70);
      cm.position.y = b.y + 9 + 6 * u;
      cm.lookAt(f9Mid(INTRO.c));
      cm.fov = 36;
    },
  },
  {
    T: 7,
    f9: 2,
    cap: () => ['FALCON 9', 'Clearing the tower'],
    f(u, cm) {
      const b = F9.base,
        d = F9.dirS,
        sd = INTRO.v.set(-d.z, 0, d.x);
      if (haveShips()) {
        SHIP.objs[0].updateMatrixWorld(true);
        shipW(0, 4, 15.3 + 1.5 / SHIP.K, 138, cm.position);
      } /* standing on ship 1's bow helipad */ else {
        cm.position.copy(b).addScaledVector(d, 140).addScaledVector(sd, -90);
        cm.position.y = b.y + 5;
      }
      const m = f9Mid(INTRO.c),
        dist = cm.position.distanceTo(m);
      cm.lookAt(m);
      cm.fov = clamp((2 * Math.atan(95 / dist)) / D2R, 7, 45);
    },
  },
  {
    T: 7,
    f9: 2,
    cap: () => ['TO ORBIT', ''],
    f(u, cm) {
      cm.position.copy(toW(560, 200, 24));
      /* out on the water past turn 2 */ const m = f9Mid(INTRO.c),
        dist = cm.position.distanceTo(m);
      cm.lookAt(m);
      cm.fov = clamp((2 * Math.atan(Math.max(160, F9.h * 0.35) / dist)) / D2R, 5, 40);
    },
  },
];
// middle of the rocket (35 m up its axis), wherever it is
const f9Mid = (out) => {
  F9.piv.updateMatrixWorld(true);
  return F9.piv.localToWorld(out.set(0, F9M.eng + F9M.top * 0.45, 0));
};
const skipShot = (sh) =>
  (sh.ship && !haveShips()) || (sh.f9 === 1 && !F9.ready) || (sh.f9 === 2 && !(F9.ready && F9.tau >= 0));
function introCam(dt, pos, hdg) {
  let sh = SHOTS[INTRO.i];
  if (skipShot(sh)) {
    INTRO.i = (INTRO.i + 1) % SHOTS.length;
    INTRO.t = 0;
    INTRO.went = -1;
    return introCam(dt, pos, hdg);
  }
  if (INTRO.went !== INTRO.i) {
    INTRO.went = INTRO.i;
    if (sh.go) sh.go();
  }
  INTRO.t += dt;
  if (INTRO.t >= sh.T) {
    INTRO.t = 0;
    do {
      INTRO.i = (INTRO.i + 1) % SHOTS.length;
    } while (skipShot(SHOTS[INTRO.i]));
    sh = SHOTS[INTRO.i];
    INTRO.went = INTRO.i;
    if (sh.go) sh.go();
  }
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  cam.up.set(0, 1, 0);
  sh.f(INTRO.t / sh.T, cam, pos, hdg);
  // the course flyover shows the whole lap of the path ribbon, widened so it reads from 250 m up; faded in and out with the shot
  {
    const fly = sh.course ? clamp(Math.min(INTRO.t / 1.2, (sh.T - INTRO.t) / 0.6), 0, 1) : 0;
    ribU.full.value = fly;
    ribU.wide.value = 1 + fly * 4;
  }
  if (sh.unfold) {
    const k = clamp((INTRO.t - 1.3) / FOLD_S, 0, 1);
    G.foldT = 1 - k;
    G.foldTarget = k > 0 && k < 1 ? 0 : null;
  } else if (sh.fly && CLIP.ready) {
    G.foldT = 0;
    G.foldTarget = null;
  } else if (G.foldT !== 1 || G.foldTarget !== null) {
    G.foldT = 1;
    G.foldTarget = null;
  }
  if (INTRO.cap !== INTRO.i) {
    INTRO.cap = INTRO.i;
    const [a, b] = sh.cap(),
      c = $('introCap');
    c.firstChild.textContent = a;
    c.lastChild.textContent = b;
    c.lastChild.hidden = !b;
    c.classList.toggle('big', !!sh.big);
    c.classList.remove('in');
    void c.offsetWidth;
    c.classList.add('in');
  }
  const f = Math.max(clamp(1 - INTRO.t / 0.45, 0, 1), clamp((INTRO.t - (sh.T - 0.35)) / 0.35, 0, 1)),
    fq = Math.round(f * 20) / 20;
  if (fq !== INTRO.fade) {
    INTRO.fade = fq;
    $('introFade').style.opacity = fq;
  }
}
function introShow(on) {
  if (INTRO.pad && G.s === CLIP.play) G.s = INTRO.pad;
  INTRO.pad = null;
  G.intro = on;
  G.f9cam = null;
  ribU.full.value = 0;
  ribU.wide.value = 1;
  document.body.classList.toggle('intro', on);
  $('intro').hidden = !on;
  INTRO.i = 0;
  INTRO.t = 0;
  INTRO.went = -1;
  INTRO.cap = -1;
  INTRO.fade = -1;
  INTRO.padDown = false;
}
// the SI flies when the sim starts, so it starts in the TV view (in a headset, the chase view)
function introStart(v = XR() ? 0 : 4) {
  if (!G.intro) return;
  introShow(false);
  G.foldT = 1; // folded on the pad, ready to unfold, even if the race clip had the wings out
  G.foldTarget = null;
  G.siView = 0;
  setView(v, true);
  camInit = false;
  G.foldWait = 0.5;
  banner('SI PILOT', 'Autonomous demo. Press Fly it to take over.', 2200);
}
function introGo() {
  if (XR()) return;
  for (const id of ['help', 'lb', 'share', 'pb']) $(id).hidden = true;
  G.paused = false;
  reset('demo');
  introShow(true);
}
// a controller starts it on release, so the same press is not also read as A (fly) or B (reset)
function introPad() {
  let any = false;
  try {
    for (const p of navigator.getGamepads ? navigator.getGamepads() : [])
      if (p && p.connected && p.buttons.some((b) => b.pressed)) any = true;
  } catch (e) {}
  if (any) INTRO.padDown = true;
  else if (INTRO.padDown) introStart();
}
addEventListener(
  'keydown',
  (e) => {
    const typing = /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '');
    if (e.code === 'Backquote' && !typing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      introGo();
      return;
    }
    if (G.intro) {
      if (['Meta', 'Control', 'Alt'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) introStart();
    }
  },
  { capture: true },
);
$('intro').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  introStart();
});
introShow(true);
