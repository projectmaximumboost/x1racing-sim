/* ---------- Starship page: the sim's launch-site hooks, driving the Starship tower (src/starship/26_starship.js) ----------
   The tower, chopsticks, Super Heavy, Starship and their launch and catch sequences are the Starship launch page's own
   code (src/starship/26_starship.js, model dist/X1_SkyRacer_Starship.glb), built into this page unchanged. This file
   gives it the same hooks the Falcon 9 page has (f9Kick, f9Tick, f9Count, f9Hit, f9Cam ...), so the button, C key,
   VR menu, opening sequence, dash map and collisions work the same, and runs the whole show from one button:

     launch (T-10 countdown, liftoff, hot staging, boostback, landing burn, booster caught by its grid fins)
     -> the carriage lowers Super Heavy onto the mount, opens, and climbs to the top of the tower
     -> Starship comes back belly first, flips, burns and is caught at the top, then lowered onto the booster
     -> stacked again, and the button comes back.

   The launch camera turns between the launch page's director shots, the cruise ship's bow and the SkyRacer's cockpit
   (liftoff and both catches always on the director), then hands back your view. During the show the Starship button
   (and C) becomes the camera switch: each click moves to the next camera and holds it. */
const LV = { name: 'Starship', short: 'SS', btn: 'Starship' };
const F9G = {}; // the Falcon 9 page's collision grids; nothing here (named in the debug export)
// the rest of the sim reads the launch site through F9; here it is a view of ST
const F9 = {
  get ready() {
    return ST.ready;
  },
  get started() {
    return ST.started;
  },
  get grid() {
    return ST.grid;
  },
  get cxy() {
    return ST.cxy;
  },
  get base() {
    return ST.base;
  },
  get dirS() {
    return ST.dirS;
  },
  get piv() {
    return ST.bv && ST.bv.g; // Super Heavy's mid-hull pivot: the middle of the stack on the pad
  },
  // seconds since ignition while a launch runs, else -1 (the opening sequence keys its shots off it)
  get tau() {
    return ST.mode === 'launch' ? ST.t - STT.ign : -1;
  },
  // T-minus seconds while counting down, else null
  get cd() {
    return ST.mode === 'launch' && ST.t < 0 ? -ST.t : null;
  },
  get h() {
    return ST.bv ? ST.bv.p.y - STC.B_MID : 0;
  },
  auto: null, // the chained sequence: 'launch' | 'lower' | 'open' | 'raise' | 'ship' | null
  post: 0,
  dbg: { ST, STC, STT, STS, f9Cam, stShipCatch, stTick, stReset }, // for the tests
};
const F9M = { eng: 0, top: 0 }; // f9Mid(): the booster's pivot, the middle of the stack
$('bLaunch').textContent = LV.btn;
$('bLaunch').title = 'Starship: launch, booster catch and ship catch (C)';
document.querySelectorAll('#help .f9only td').forEach((td, i) => {
  if (i === 0) td.textContent = 'Starship launch and catches (watching SI)';
  if (i === 1) td.textContent = 'Starship button';
});
function f9Kick() {
  if (!F9_ON || ST.started || !SHIP.on) return;
  const tok = ST.token;
  setTimeout(() => tok === ST.token && !ST.started && SHIP.on && stLoad(), 400);
}
function f9Unload() {
  f9CamEnd();
  F9.auto = null;
  stUnload();
  $('bLaunch').hidden = true;
}
function f9Reset() {
  if (!ST.ready) return;
  F9.auto = null;
  stReset();
}
const f9Hit = (x, y, h) => ST.ready && stHit(x, y, h);
function f9CountOK() {
  return ST.ready && ST.mode === 'idle' && !F9.auto;
}
// the opening sequence's launch shot: the stack on the pad, or the launch it has just started
const f9IntroOK = () => ST.ready && ((ST.mode === 'idle' && !F9.auto) || (F9.auto === 'launch' && ST.t < 8));
// the opening sequence: no countdown, ignition as the shot opens and liftoff a few seconds in
function f9Launch() {
  if (!f9CountOK()) return;
  if (stLaunch()) {
    ST.t = STT.ign - 0.5;
    F9.auto = 'launch';
  }
}
// the button, C, the VR menu: the full countdown, with the launch camera
function f9Count() {
  // watching SI: during the show the same button (and C) switches camera
  if (F9.auto && !G.intro) return G.mode === 'demo' ? ssNextCam() : undefined;
  if (!f9CountOK()) return;
  if (!stLaunch()) return;
  F9.auto = 'launch';
  F9.post = 0;
  // the launch camera only while watching SI; flying, you keep your own view and watch it happen around you
  if (!XR() && !G.intro && G.mode === 'demo') G.f9cam = { was: G.view };
}
// the launch page's events, as the sim's banners (not over the opening sequence's own captions)
function stOnCount(n) {
  if (G.intro) return;
  banner('T−' + n, LV.name, 950, n <= 3 ? '#e8690f' : '#ffffff');
  if (typeof sfx === 'function') sfx(n <= 3 ? 'gate' : 'buzz');
}
const SSB = {
  LIFTOFF: ['Designed with American Super Intelligence and Built with American Might', 6500, 'big'],
  'HOT STAGING': ['Starship lights up on top of Super Heavy', 2600],
  'BOOSTBACK BURN': ['Super Heavy turns for home', 2600],
  'LANDING BURN': ['', 2200],
  CAUGHT: ['', 4200],
  'BOOSTER ON THE MOUNT': ['Set down by the chopsticks', 2600],
  'STARSHIP RETURNING': ['Chopsticks open at the top of the tower', 2800],
  FLIP: ['', 1800],
  STACKING: ['', 2600],
  STACKED: ['', 3200],
};
function stOnPhase(p, sub) {
  const b = SSB[p];
  if (!b || G.intro) return;
  banner(p, sub || b[0], b[1], '#e8690f', b[2]);
}
// after the booster catch: lower it onto the mount, open, climb to the top, then bring Starship home
const SSA = { fast: 2.5 }; // extra carriage speed (m/s) for the chained moves, on top of the tower's own 2.5
function ssAuto(dt) {
  const A = F9.auto;
  if (!A || !ST.ready) return;
  const hurry = () => {
    const d = ST.car.to - ST.car.y;
    ST.car.y += Math.sign(d) * Math.min(Math.abs(d), SSA.fast * dt);
  };
  if (A === 'launch') {
    if (ST.mode !== 'idle') return;
    if (ST.held !== 'booster') {
      F9.auto = null; // stopped some other way
      return;
    }
    F9.auto = 'lower';
    F9.wait = 2;
  } else if (A === 'lower') {
    if ((F9.wait -= dt) > 0) return;
    stQD(1);
    stCarriage(-STC.B_CATCH);
    hurry();
    if (ST.held !== 'booster') F9.auto = 'open'; // set down on the mount and let go
  } else if (A === 'open') {
    stArms(1);
    if (ST.arm.k > 0.99) F9.auto = 'raise';
  } else if (A === 'raise') {
    stCarriage(STC.S_CATCH);
    hurry();
    if (ST.car.y >= STC.S_CATCH - 0.01) {
      F9.auto = stShipCatch() ? 'ship' : null;
      F9.shipT = 0;
    }
  } else if (A === 'ship') {
    if (ST.mode === 'idle') F9.auto = null; // stacked again
  }
}
function f9Tick(dt) {
  if (!ST.ready) return;
  stTick(dt);
  ssAuto(dt);
  if (!F9.auto && G.f9cam) F9.post += dt;
  // in the menu only while watching SI (the VR menu has its own)
  const show = G.mode === 'demo' && !G.intro && !XR(),
    b = $('bLaunch');
  if (b.hidden === show) b.hidden = !show;
  // idle: launch; during the show: the camera switch, labelled with the camera it is on
  const cams = G.mode === 'demo',
    ok = f9CountOK() || (!!F9.auto && cams),
    lbl = F9.auto && cams ? 'Camera: ' + (G.f9cam ? SSR[G.f9cam.ri || 0][2] : 'race') : LV.btn;
  if (b.disabled === ok) b.disabled = !ok;
  if (b.textContent !== lbl) b.textContent = lbl;
}

/* ---------- the launch camera: the launch page's director shots ---------- */
const SSC = { v: new THREE.Vector3(), w: new THREE.Vector3() };
const ssFit = (size, d) => clamp((2 * Math.atan(size / 2 / Math.max(d, 1))) / D2R, 2.5, 60);
const ssPP = (x, y, z) => stPadPt(x, y, z, new THREE.Vector3());
// [from, to, shot(u, cam)] in mission time; u runs 0..1 across the shot
const SS_L = [
  [
    -99,
    -3.5,
    (u, c) => {
      c.position.copy(ssPP(150 - 40 * u, 10 + 4 * u, 320 - 70 * u));
      c.lookAt(ssPP(0, 78, -6));
      c.fov = 38 - 6 * u;
    },
  ],
  [
    -3.5,
    6,
    (u, c) => {
      c.position.copy(ssPP(150, 9, 230));
      c.lookAt(stVehPt(ST.bv, 0.2 + 0.25 * u, SSC.v));
      c.fov = 40;
    },
  ],
  [
    6,
    17,
    (u, c) => {
      c.position.copy(ssPP(-300, 5, 620));
      const m = stVehPt(ST.bv, 0.9, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(230 + 80 * u, c.position.distanceTo(m));
    },
  ],
  [
    17,
    34,
    (u, c) => {
      c.position.copy(ssPP(140, 30, 260));
      const m = stVehPt(ST.bv, 1, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(280, c.position.distanceTo(m));
    },
  ],
  [
    34,
    47,
    (u, c) => {
      // staging, from alongside: a camera that keeps pace with the stack
      const m = stVehPt(ST.bv, 1, SSC.w);
      ST.root.updateMatrixWorld(true);
      const off = SSC.v.set(320, -40, -160).applyQuaternion(ST.root.quaternion);
      c.position.copy(m).add(off);
      c.lookAt(m);
      c.fov = 26;
    },
  ],
  [
    47,
    70,
    (u, c) => {
      c.position.copy(ssPP(260, 45, 420));
      const m = stVehPt(ST.bv, 0.5, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(420 - 200 * u, c.position.distanceTo(m));
    },
  ],
  [
    70,
    STT.lbEnd - 4,
    (u, c) => {
      c.position.copy(ssPP(170, 150, 170));
      const m = stVehPt(ST.bv, 0.5, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(150 + 60 * (1 - u), c.position.distanceTo(m));
    },
  ],
  [
    STT.lbEnd - 4,
    9999,
    (u, c) => {
      // the catch at arm level
      c.position.copy(ssPP(Math.cos(0.55) * 95, 128, Math.sin(0.55) * 95));
      c.lookAt(ssPP(0, 120, -10));
      c.fov = 44;
    },
  ],
];
const SS_S = [
  [
    -99,
    12,
    (u, c) => {
      c.position.copy(ssPP(-180, 14, 360));
      const m = stVehPt(ST.sv, 0.5, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(260, c.position.distanceTo(m));
    },
  ],
  [
    12,
    20.5,
    (u, c) => {
      c.position.copy(ssPP(220, 60, 300));
      const m = stVehPt(ST.sv, 0.5, SSC.v);
      c.lookAt(m);
      c.fov = ssFit(170, c.position.distanceTo(m));
    },
  ],
  [
    20.5,
    37,
    (u, c) => {
      // the flip and the arc in over the tower, side on and low, like the Flight 15 time-lapse
      // square-on to the plane it flies in (the pad's y-z plane), level with it and keeping pace, so the pitch reads true
      const m = stVehPt(ST.sv, 0.5, SSC.v),
        l = ST.root.worldToLocal(new THREE.Vector3().copy(m));
      c.position.copy(ssPP(480, Math.max(25, l.y - 15), l.z - 25));
      c.lookAt(m);
      c.fov = ssFit(150, c.position.distanceTo(m));
    },
  ],
];
// with the carriage: the catch at the top of the tower, the set-downs, a slow drift round the tower
function ssCarriageShot(c, s) {
  const y = ST.car.y + 128;
  c.position.copy(ssPP(Math.cos(0.7 + s) * 110, y + 12, Math.sin(0.7 + s) * 110));
  c.lookAt(ssPP(0, y, -8));
  c.fov = 48;
}
// the director's cut: the launch page's shots for each part of the show
function ssDirector(dt) {
  const A = F9.auto;
  if (A === 'launch' && ST.mode === 'launch') {
    for (const [a, b, f] of SS_L)
      if (ST.t >= a && ST.t < b) return f(clamp((ST.t - Math.max(a, -10)) / (b - Math.max(a, -10)), 0, 1), cam);
  }
  if (A === 'ship' && ST.mode === 'shipcatch') {
    for (const [a, b, f] of SS_S)
      if (ST.t >= a && ST.t < b) return f(clamp((ST.t - Math.max(a, 0)) / (b - Math.max(a, 0)), 0, 1), cam);
  }
  // between the sequences, the ship's catch and lowering, and the end: with the carriage
  F9.drift = (F9.drift || 0) + dt * 0.02;
  ssCarriageShot(cam, F9.drift);
}
// what the other cameras look at: whichever part of the show is happening
function ssSubject(out) {
  const A = F9.auto;
  if (A === 'launch' && ST.mode === 'launch') return stVehPt(ST.bv, ST.t < STT.sep ? 1 : 0.5, out);
  if (A === 'ship' && ST.mode === 'shipcatch' && ST.t < STS.end + STS.lb) return stVehPt(ST.sv, 0.5, out);
  return stPadPt(0, ST.car.y + 110, -6, out); // the carriage and what it holds
}
// from the bow helipad of the first cruise ship (the opening sequence's spot), on a long lens
function ssShipCam() {
  SHIP.objs[0].updateMatrixWorld(true);
  shipW(0, 4, 15.3 + 1.5 / SHIP.K, 138, cam.position);
  const m = ssSubject(SSC.w);
  cam.lookAt(m);
  cam.fov = ssFit(F9.auto === 'launch' && ST.mode === 'launch' ? 170 : 240, cam.position.distanceTo(m));
}
/* The launch camera turns between the director's cut, the cruise ship's bow and the SkyRacer's cockpit (the race goes
   on), and round again. The moments that matter, liftoff and both catches, always go to the director. */
const SSR = [
  ['director', 10, 'Director'],
  ['ship', 7, 'Cruise ship'],
  ['cockpit', 6, 'Cockpit'],
];
// a click (or C) during the show: on to the next camera, and stay on it; from a race view, back to the director
function ssNextCam() {
  if (XR()) return;
  const C = G.f9cam;
  if (!C) {
    G.f9cam = { was: G.view, ri: 0, rt: 0, man: true };
  } else {
    C.ri = ((C.ri || 0) + 1) % SSR.length;
    if (SSR[C.ri][0] === 'ship' && !haveShips()) C.ri = (C.ri + 1) % SSR.length;
    C.rt = 0;
    C.man = true;
  }
  camInit = false;
  banner(SSR[G.f9cam.ri][2].toUpperCase(), 'Starship camera', 1200);
}
function ssMust() {
  const A = F9.auto,
    t = ST.t;
  if (!A) return true; // the end: on the restacked rocket
  if (A === 'launch') return ST.mode !== 'launch' || t < 8 || t > STT.lbEnd - 4; // liftoff; the booster catch
  if (A === 'lower') return F9.wait > 0; // just caught
  if (A === 'ship') return ST.mode !== 'shipcatch' || t > STS.end + STS.lb - 3; // the ship's catch and set-down
  return false;
}
// returns true when it set the camera; false hands this frame to race view G.f9cam.view (the cockpit)
function f9Cam(dt) {
  if (!ST.ready) {
    f9CamEnd();
    return true;
  }
  const C = G.f9cam;
  C.ri = C.ri || 0;
  C.rt = (C.rt || 0) + dt;
  if (C.man) {
    // picked by hand: stays until the next click or the end of the show
  } else if (ssMust()) {
    if (C.ri !== 0) camInit = false;
    C.ri = 0;
    C.rt = 0;
  } else if (C.rt > SSR[C.ri][1]) {
    C.ri = (C.ri + 1) % SSR.length;
    if (SSR[C.ri][0] === 'ship' && !haveShips()) C.ri = (C.ri + 1) % SSR.length;
    C.rt = 0;
    camInit = false;
  }
  const mode = SSR[C.ri][0];
  if (!F9.auto && F9.post > 5) {
    f9CamEnd();
    return true;
  }
  if (mode === 'cockpit') {
    C.view = 1;
    C.look = ssSubject(C.look || new THREE.Vector3()); // the driver looks round at the rocket (render clamps the head turn)
    return false;
  }
  C.hy = C.hp = null; // the head starts from straight ahead next time
  C.view = null;
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  cam.up.set(0, 1, 0);
  if (mode === 'ship') ssShipCam();
  else ssDirector(dt);
  return true;
}
function f9CamEnd() {
  if (!G.f9cam) return;
  const v = G.f9cam.was;
  G.f9cam = null;
  camInit = false;
  F9.drift = 0;
  if (typeof viewOK === 'function' && viewOK(v)) G.view = v;
}
$('bLaunch').onclick = (e) => {
  f9Count();
  e.target.blur();
};
