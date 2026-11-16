/* ---------- Starship and its launch tower (fork of the Falcon 9 pad) ----------
   The tower model (starship_tower.glb) is reduced by tools/starship/prep.py to X1_SkyRacer_Starship.glb: 28k triangles,
   vertex colours instead of textures, metres, origin on the rocket axis at the ground, tower on -z. Its nodes:
     pad       tower, launch mount, crane: static
     carriage  rides up and down the tower; the chopsticks hang on it
     armL/armR the chopsticks, each node on its own vertical hinge at the tower face (rotation.y swings it)
     qd        the quick-disconnect arm boom, on its hinge
     booster   Super Heavy (62 m)   ship  Starship (60 m)
   Model facts (hinges, heights) come from the file's asset.extras.x1, so a re-run of prep.py keeps the JS right.

   It stands where the Falcon 9 pad stood, on the shore between turn 1 and turn 2, rocket side toward the ships.
   The same code runs inside the sim (it uses the sim's scene, toW, DEF, SHIP, FLAGS, banner) and in the standalone
   launch page, which supplies those names. Everything is driven by stTick(dt).

   Sequences (stLaunch / stShipCatch), all scripted in mission time ST.t (seconds, T-minus negative):
     launch     T-10 countdown: QD arm swings clear, chopsticks open; ignition T-2.5; liftoff T-0; gravity turn over
                the sea; hot staging at T+38; Super Heavy flips, boosts back, falls engines first and lights its landing
                burn over the tower; the chopsticks close on it at T+86 and it settles on them. Starship flies on.
     shipcatch  Super Heavy back on the mount, carriage at the top, chopsticks open. Starship (Ship 42, the Flight 15
                ship: tools/starship/ship42.py) falls belly first from 2.6 km, flaps spread, coming from the land side
                over the tower with its nose toward the sea; it flips, folds its flaps back, burns, is caught on its two
                catch pins with the heat shield facing away from the tower, and is lowered onto the booster.
   Manual (when no sequence runs): stArms(k) 0 closed..1 open, stCarriage(dy) metres, stQD(k) 0 mated..1 clear. */
const ST = {
  ready: false,
  started: false,
  root: null,
  sc: null,
  M: null, // model facts from the file
  cx: 430,
  cy: -150,
  base: new THREE.Vector3(), // world: rocket axis at the ground
  dirS: new THREE.Vector3(), // world: horizontal, from the pad toward the ships (downrange)
  mode: 'idle', // 'idle' | 'launch' | 'shipcatch'
  t: 0,
  phase: 'STACKED',
  // mechanism state: current value and target, moved at a fixed rate unless a sequence sets them directly
  arm: { k: 0, to: 0 },
  car: { y: 0, to: 0 },
  qd: { k: 0, to: 0 },
  fin: { k: 0, to: 0 }, // Super Heavy's four grid fins: 0 stowed flat against the hull, 1 deployed (return only)
  flap: { k: 0, to: 0, trim: 0 }, // Starship's four flaps: 0 stowed (pad, ascent), 1 spread for the belly flop, 2 folded back for landing
  bv: null, // booster vehicle: { g, p, q, v, thr, ... }
  sv: null, // ship vehicle
  sm: null, // smoke pool
  snd: null,
  grid: false,
  token: 0,
};
const STC = {
  OPEN: 26 * D2R, // chopsticks open angle
  GRIP: -3 * D2R, // clamped on a vehicle: set on load so the arms' inner faces stand 0.12 m off the hull
  QD: -92 * D2R, // QD boom swung flat along the tower face
  B_MID: 61.7, // booster pivot height on the mount (mid hull)
  S_MID: 122.1, // ship pivot height when stacked
  B_CATCH: 44, // booster caught: lifted this far above its seat; set on load so its grid fins sit on the arms' top chord
  S_CATCH: 21, // ship caught with the carriage at the top of its travel, this far above the stack; then lowered onto the booster
  CAR_MAX: 21, // carriage travel above its modelled (stacking) height: arms top 156 m, just under the crane
  g: 9.81,
};
const stLtP = new THREE.Vector3(),
  stE = new THREE.Euler(),
  stG = new THREE.Vector3(0, 9.81, 0), // add to a path's acceleration for the thrust it needs
  stB = new THREE.Vector3(),
  stUp = new THREE.Vector3(0, 1, 0),
  stFq = new THREE.Quaternion();
async function stFetch() {
  // the standalone page embeds the pack; the sim fetches it from beside the page (.wasm copy for the artifact host)
  const emb = typeof document !== 'undefined' && document.getElementById('stglb');
  if (emb && emb.textContent.length > 100) {
    const s = atob(emb.textContent.trim()),
      a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a.buffer;
  }
  const f = 'X1_SkyRacer_Starship',
    seen = new Set();
  for (const u of [f + '.glb', f + '.wasm']) {
    const abs = new URL(u, location.href).href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      const r = await fetch(abs);
      if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) continue;
      const b = await r.arrayBuffer();
      if (new Uint32Array(b, 0, 1)[0] === 0x46546c67) return b;
    } catch (e) {}
  }
  console.warn('Starship pack not found');
  return null;
}
function stUnload() {
  ST.token++;
  ST.started = false;
  if (!ST.root) return;
  for (let k = FLAGS.length - 1; k >= 0; k--) if (FLAGS[k].st) FLAGS.splice(k, 1);
  for (const o of [ST.root, ST.sm && ST.sm.pts]) {
    if (!o) continue;
    scene.remove(o);
    disposeTree(o);
  }
  if (ST.snd) ST.snd.g.gain.value = 0;
  ST.ready = false;
  ST.root = ST.sc = ST.bv = ST.sv = ST.sm = null;
  STG.pad = STG.car = STG.armL = STG.armR = STG.qd = null;
  ST.grid = false;
}
async function stLoad() {
  if (ST.started) return;
  ST.started = true;
  const tok = ST.token;
  const buf = await stFetch();
  if (!buf || tok !== ST.token) return;
  const gl = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)).catch((e) => {
    console.error('Starship failed', e);
    return null;
  });
  if (!gl || tok !== ST.token) return;
  const sc = gl.scene,
    M = (gl.parser.json.asset.extras || {}).x1;
  ST.M = M;
  sc.traverse((m) => {
    if (!m.isMesh) return;
    m.frustumCulled = true;
    m.material.side = THREE.DoubleSide;
    m.material.envMapIntensity = /steel/.test(m.material.name) ? 1.1 : 0.7;
  });
  const N = (n) => sc.getObjectByName(n);
  // the chopsticks ride the carriage; the vehicles get pivots at mid-hull so they turn about their own middle
  const car = N('carriage'),
    armL = N('armL'),
    armR = N('armR');
  car.add(armL, armR);
  const veh = (name, mid, eng, top, r) => {
    const mesh = N(name),
      g = new THREE.Group();
    g.name = name + 'V';
    mesh.parent.add(g);
    g.position.set(0, mid, 0);
    g.add(mesh);
    mesh.position.set(0, -mid, 0);
    return {
      g,
      mesh,
      mid,
      eng: eng - mid, // engine plane, local
      top: top - mid,
      r,
      p: g.position, // root frame
      q: g.quaternion,
      v: new THREE.Vector3(),
      thr: 0,
      nz: 1, // plume width factor (fraction of the engines lit)
      vis: true,
    };
  };
  // grid fins: nodes on their hinge lines, stowed angle in extras.fold (gltf extras arrive as userData)
  ST.fins = [];
  N('booster').traverse((o) => o.userData && o.userData.fold != null && ST.fins.push(o));
  // Starship's flaps (Ship 42: the aft pair on the sides, the forward pair on the nose cone angled round to leeward):
  // nodes on their hinge lines; extras.a = [stowed, belly flop, landing] degrees leeward, extras.s the side
  ST.flaps = [];
  N('ship').traverse((o) => {
    if (!o.userData || !o.userData.flap) return;
    o.userData.q0 = o.quaternion.clone();
    ST.flaps.push(o);
  });
  // the clamp: swing each arm in until the nearest part of its truss is 0.12 m off the hull, so the arms close right up
  // against the rocket and the fins (booster) or hooks (ship) sit on their top chords
  {
    const g = armR.geometry.attributes.position,
      h = armR.position,
      want = M.radius + 0.12,
      near = (th) => {
        let m = 1e9;
        const c = Math.cos(th),
          sn = Math.sin(th);
        for (let i = 0; i < g.count; i++) {
          const x = g.getX(i),
            z = g.getZ(i),
            wx = h.x + x * c + z * sn,
            wz = h.z - x * sn + z * c;
          m = Math.min(m, Math.hypot(wx, wz));
        }
        return m;
      };
    // armR swings in with a negative angle; bisect for the angle that leaves exactly `want`
    let lo = -0.25,
      hi = 0;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (near(mid) < want) lo = mid;
      else hi = mid;
    }
    STC.GRIP = hi;
    ST.gripGap0 = near(0);
    // HOLD: how far in the arms may swing while the ship's aft flaps, folded back for landing, pass between them. The
    // flaps' reach (|x|) over their z span, against the arm's nearest point to the axis's side plane in that span.
    let fx = 0,
      z0 = 1e9,
      z1 = -1e9;
    const fq = new THREE.Quaternion(),
      v = new THREE.Vector3();
    N('ship').traverse((o) => {
      if (!o.userData || o.userData.flap !== 'aft') return;
      fq.copy(o.quaternion).multiply(
        new THREE.Quaternion().setFromAxisAngle(stUp, o.userData.s * o.userData.a[2] * D2R),
      );
      // a flap node is a group of two meshes (steel and tile faces) at its origin
      o.traverse((m) => {
        if (!m.geometry) return;
        const q = m.geometry.attributes.position;
        for (let i = 0; i < q.count; i++) {
          v.fromBufferAttribute(q, i).applyQuaternion(fq).add(o.position);
          fx = Math.max(fx, Math.abs(v.x));
          z0 = Math.min(z0, v.z);
          z1 = Math.max(z1, v.z);
        }
      });
    });
    const minX = (th) => {
      let m = 1e9;
      const c = Math.cos(th),
        sn = Math.sin(th);
      for (let i = 0; i < g.count; i++) {
        const x = g.getX(i),
          z = g.getZ(i),
          wz = h.z - x * sn + z * c;
        if (wz < z0 - 0.4 || wz > z1 + 0.4) continue;
        m = Math.min(m, h.x + x * c + z * sn);
      }
      return m;
    };
    let klo = 0,
      khi = 1;
    if (minX(0) >= fx + 0.3) khi = 0;
    else
      for (let k = 0; k < 30; k++) {
        const km = (klo + khi) / 2;
        if (minX(km * STC.OPEN) >= fx + 0.3) khi = km;
        else klo = km;
      }
    STC.HOLD = Math.max(0.1, khi);
    ST.flapReach = [fx, z0, z1];
  }
  // the booster is caught by its grid fins: hung so their undersides rest on the arms' top chord
  STC.B_CATCH = M.box.armL[1][1] - (M.finY - M.finD / 2);
  ST.bv = veh('booster', STC.B_MID, M.box.booster[0][1] + 0.3, M.split, M.radius);
  ST.sv = veh('ship', STC.S_MID, M.split, M.top, M.radius);
  // place: rocket side (model +z) toward the ships, then slide inland until the whole footprint is on land
  const sx = (SHIP.place[0].x + SHIP.place[1].x) / 2,
    sy = (SHIP.place[0].y + SHIP.place[1].y) / 2;
  let cx = ST.cx,
    cy = ST.cy;
  const dx = sx - cx,
    dy = sy - cy,
    dl = Math.hypot(dx, dy),
    dwx = dx / dl,
    dwz = -dy / dl,
    psi = Math.atan2(dwx, dwz),
    pb = M.box.pad;
  const corner = (cx, cy, mx, mz) => {
    const wx = mx * Math.cos(psi) + mz * Math.sin(psi),
      wz = -mx * Math.sin(psi) + mz * Math.cos(psi);
    return [cx + wx, cy - wz];
  };
  for (let i = 0; i < 300; i++) {
    let ok = true;
    for (const [mx, mz] of [
      [pb[0][0], pb[0][2]],
      [pb[1][0], pb[0][2]],
      [pb[0][0], pb[1][2] + 6],
      [pb[1][0], pb[1][2] + 6],
    ]) {
      const [x, y] = corner(cx, cy, mx, mz);
      if (DEF.shoreY(x) - y < 4) {
        ok = false;
        break;
      }
    }
    if (ok) break;
    cy -= 2;
  }
  const root = new THREE.Group();
  root.position.copy(toW(cx, cy, DEF.landH(cx, cy)));
  root.rotation.y = psi;
  root.add(sc);
  scene.add(root);
  root.updateMatrixWorld(true);
  ST.root = root;
  ST.sc = sc;
  ST.car = car;
  ST.armL = armL;
  ST.armR = armR;
  ST.qdN = N('qd');
  ST.hook = N('hook'); // the crane hook rides up on top of the carriage and its cables shorten
  ST.cable = N('cable');
  ST.cxy = [cx, cy];
  ST.base.copy(root.position);
  ST.dirS.set(dwx, 0, dwz);
  stFx();
  stFlags(N('pad'));
  stReset();
  ST.ready = true;
  // prepare every material now (the engine lights are in place), not the first time each comes into view
  stPrecompile();
  // collision grids are built when the browser is idle, so the pad appears at once
  (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(
    () => {
      if (!ST.ready || tok !== ST.token) return;
      const t0 = performance.now();
      stGrid();
      ST.gridMs = performance.now() - t0;
    },
    { timeout: 2500 },
  );
  console.log('Starship on its pad at', cx.toFixed(0), cy.toFixed(0));
}
/* ---------- mechanisms ---------- */
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
function stMech(dt) {
  // manual targets move at a steady rate; sequences set .to and let these run, or set .k/.y directly
  const step = (o, key, rate) => {
    const d = o.to - o[key];
    o[key] += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  };
  step(ST.arm, 'k', 0.22); // full swing in about 4.5 s
  step(ST.car, 'y', 2.5); // m/s
  step(ST.qd, 'k', 0.25);
  step(ST.fin, 'k', 0.4);
  // each fin's frame: yawed to the radial at its hinge (extras.yaw), then folded about its own hinge line
  for (const f of ST.fins)
    f.rotation.set((1 - ease(ST.fin.k)) * f.userData.fold * D2R, (f.userData.yaw || 0) * D2R, 0, 'YXZ');
  // flaps: each turns about its hinge (local y) from its rest frame; trim is the small steering movement in the fall
  step(ST.flap, 'k', 0.7);
  for (const f of ST.flaps) {
    const A = f.userData.a,
      k = ST.flap.k,
      deg = k <= 1 ? lerp(A[0], A[1], ease(k)) : lerp(A[1], A[2], ease(k - 1)),
      tr = ST.flap.trim * (f.userData.flap === 'fwd' ? 1 : -0.7) * Math.max(0, 1 - Math.abs(k - 1));
    f.quaternion.copy(f.userData.q0).multiply(stFq.setFromAxisAngle(stUp, f.userData.s * (deg + tr) * D2R));
  }
  const a = ST.arm.k >= 0 ? ST.arm.k * STC.OPEN : (-ST.arm.k / 0.115) * STC.GRIP; // GRIP < 0: swung in past the modelled pose
  ST.armL.rotation.y = -a; // left arm tip swings to -x
  ST.armR.rotation.y = a;
  ST.car.position.y = ST.car.y;
  ST.qdN.rotation.y = ST.qd.k * STC.QD;
  // the crane's hook block rides with the carriage all the way, up and down: the cables shorten and pay out to match
  const lift = ST.car.y;
  ST.hook.position.y = lift;
  ST.cable.scale.y = Math.max(0.02, 1 - lift / ST.M.cableLen);
}
const stArms = (k) => (k > 0.05 && stHanging() ? false : (ST.arm.to = clamp(k, -0.115, 1)));
/* ---------- lifting with the chopsticks (when no sequence runs) ----------
   Arms closed under Starship's hooks: raising the carriage lifts it off the booster and carries it; lowering sets it
   back down on the booster (the carriage stops there, where the hooks rest on the arms). Super Heavy caught in the
   arms rides the carriage the same way: lowered the 44 m to the mount it is set down and let go, and with the arms
   closed round it there (no ship on top), raising the carriage picks it up again. The arms will not open with a vehicle hanging. */
const stShipUp = () => ST.sv.vis && ST.sv.p.y > STC.S_MID + 0.01;
const stHanging = () => ST.held === 'booster' || stShipUp();
function stCarry() {
  const S = ST.sv,
    B = ST.bv,
    closed = ST.arm.k < -0.08; // gripping: in under the hooks / round the booster
  if (ST.held === 'booster') {
    if (ST.car.y <= -STC.B_CATCH + 0.02) {
      ST.held = null; // on the mount: let go
      B.p.set(0, STC.B_MID, 0);
      stSay('BOOSTER ON THE MOUNT');
    }
  } else if (
    B.vis &&
    closed &&
    Math.abs(B.p.y - STC.B_MID) < 0.01 &&
    ST.car.y < -STC.B_CATCH + 0.3 &&
    ST.car.to > ST.car.y + 0.01 &&
    !S.vis
  ) {
    ST.held = 'booster'; // closed round it on the mount and the carriage starts up: picked up
    stSay('LIFTING SUPER HEAVY');
  }
  if (ST.held === 'booster') B.p.set(0, STC.B_MID + STC.B_CATCH + ST.car.y, 0);
  else if (ST.bv.p.y < STC.B_MID + 0.01) B.p.set(0, STC.B_MID, 0);
  const seated = !ST.held && Math.abs(B.p.y - STC.B_MID) < 0.01;
  if (S.vis && !ST.held && closed && ST.car.y >= -0.01) {
    const was = S.p.y;
    S.p.set(0, STC.S_MID + Math.max(0, ST.car.y), 0);
    if (S.p.y > STC.S_MID + 0.5 && was <= STC.S_MID + 0.5) stSay('LIFTING STARSHIP');
    if (S.p.y <= STC.S_MID + 0.01 && was > STC.S_MID + 0.01) stSay('STACKED', 'Starship set down on Super Heavy');
  }
  ST.stack = S.vis && seated && S.p.y <= STC.S_MID + 0.01;
}
// the carriage's travel: up to just under the crane; down to the mount, except that closed arms stop at Starship's hooks
// (they would run into its flaps)
function stCarriage(y) {
  const lo = ST.arm.k < -0.08 && ST.sv.vis && ST.held !== 'booster' && ST.car.y >= -0.05 ? 0 : -STC.B_CATCH;
  ST.car.to = clamp(y, lo, STC.CAR_MAX);
}
const stQD = (k) => (ST.qd.to = clamp(k, 0, 1));
const stFins = (k) => (ST.fin.to = clamp(k, 0, 1));
/* ---------- collision (for the race sim) ----------
   As for the Falcon 9 pad, but the tower is 196 m tall, so cells are 0.8 m and grown by 2 (1.6 m, the SkyRacer's
   body): bays in the lattice wider than about 3 m stay flyable. The pad, carriage, each chopstick and the QD boom have
   their own grids in their own frames, so they are solid wherever they have moved to. Vehicles are columns. */
const STG = { C: 0.8, R: 2, v: new THREE.Vector3(), inv: new THREE.Matrix4() };
function stVox(obj, frame, skip) {
  frame.updateMatrixWorld(true);
  const toF = new THREE.Matrix4().copy(frame.matrixWorld).invert(),
    box = new THREE.Box3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    p = new THREE.Vector3(),
    meshes = [];
  const walk = (m) => {
    if (skip && skip.includes(m)) return; // a moving part with its own grid
    if (m.isMesh && m.geometry.index) {
      const Mx = new THREE.Matrix4().multiplyMatrices(toF, m.matrixWorld);
      meshes.push([m, Mx]);
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) box.expandByPoint(a.fromBufferAttribute(P, i).applyMatrix4(Mx));
    }
    for (const ch of m.children) walk(ch);
  };
  walk(obj);
  const g = { C: STG.C, R: STG.R, x0: box.min.x - 2, y0: box.min.y - 2, z0: box.min.z - 2 };
  g.nx = Math.ceil((box.max.x + 2 - g.x0) / g.C);
  g.ny = Math.ceil((box.max.y + 2 - g.y0) / g.C);
  g.nz = Math.ceil((box.max.z + 2 - g.z0) / g.C);
  const NN = g.nx * g.ny * g.nz,
    A = new Uint8Array(NN);
  const mark = (v) => {
    const i = Math.floor((v.x - g.x0) / g.C),
      j = Math.floor((v.y - g.y0) / g.C),
      k = Math.floor((v.z - g.z0) / g.C);
    if (i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz) A[(j * g.nz + k) * g.nx + i] = 1;
  };
  for (const [m, Mx] of meshes) {
    const P = m.geometry.attributes.position,
      I = m.geometry.index;
    for (let t = 0; t < I.count; t += 3) {
      a.fromBufferAttribute(P, I.getX(t)).applyMatrix4(Mx);
      b.fromBufferAttribute(P, I.getX(t + 1)).applyMatrix4(Mx);
      c.fromBufferAttribute(P, I.getX(t + 2)).applyMatrix4(Mx);
      const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (g.C * 0.5)));
      for (let u = 0; u <= n; u++)
        for (let w = 0; w <= n - u; w++) {
          const s = u / n,
            r = w / n;
          p.set(
            a.x + (b.x - a.x) * s + (c.x - a.x) * r,
            a.y + (b.y - a.y) * s + (c.y - a.y) * r,
            a.z + (b.z - a.z) * s + (c.z - a.z) * r,
          );
          mark(p);
        }
    }
  }
  const grow = (st, len) => {
    const B = new Uint8Array(NN);
    for (let base = 0; base < NN; base++) {
      const pos = Math.floor(base / st) % len;
      let v = 0;
      for (let d = -g.R; d <= g.R && !v; d++) {
        const q = pos + d;
        if (q >= 0 && q < len && A[base + d * st]) v = 1;
      }
      B[base] = v;
    }
    A.set(B);
  };
  grow(1, g.nx);
  grow(g.nx, g.nz);
  grow(g.nx * g.nz, g.ny);
  g.A = A;
  return g;
}
const stVoxHit = (g, q) => {
  if (!g) return false;
  const i = Math.floor((q.x - g.x0) / g.C),
    j = Math.floor((q.y - g.y0) / g.C),
    k = Math.floor((q.z - g.z0) / g.C);
  return i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz && !!g.A[(j * g.nz + k) * g.nx + i];
};
function stGrid() {
  const N = (n) => ST.sc.getObjectByName(n);
  // grids are made in each part's own frame with the part as built (hinges at zero), so they follow it as it moves
  const save = [ST.armL.rotation.y, ST.armR.rotation.y, ST.car.position.y, ST.qdN.rotation.y];
  ST.armL.rotation.y = ST.armR.rotation.y = ST.qdN.rotation.y = 0;
  ST.car.position.y = 0;
  ST.root.updateMatrixWorld(true);
  STG.pad = stVox(N('pad'), N('pad'));
  STG.car = stVox(ST.car, ST.car, [ST.armL, ST.armR]); // the carriage alone: its arms have their own grids
  STG.armL = stVox(ST.armL, ST.armL);
  STG.armR = stVox(ST.armR, ST.armR);
  STG.qd = stVox(ST.qdN, ST.qdN);
  STG.hook = stVox(ST.hook, ST.hook);
  [ST.armL.rotation.y, ST.armR.rotation.y, ST.car.position.y, ST.qdN.rotation.y] = save;
  ST.root.updateMatrixWorld(true);
  ST.grid = true;
}
// x, y course metres (east, north), h height: true if a craft there touches the tower, its parts or a vehicle
function stHit(x, y, h) {
  if (!ST.ready) return false;
  const w = toW(x, y, h),
    v = STG.v;
  for (const V of [ST.bv, ST.sv]) {
    if (!V.vis) continue;
    V.g.updateMatrixWorld(true);
    const lp = V.g.worldToLocal(v.copy(w));
    if (lp.y > V.eng - 1 && lp.y < V.top + 0.5 && Math.hypot(lp.x, lp.z) < V.r + 1.6) return true;
  }
  if (!ST.grid) return false;
  for (const [g, o] of [
    [STG.pad, ST.sc.getObjectByName('pad')],
    [STG.car, ST.car],
    [STG.armL, ST.armL],
    [STG.armR, ST.armR],
    [STG.qd, ST.qdN],
    [STG.hook, ST.hook],
  ]) {
    o.updateMatrixWorld(true);
    STG.inv.copy(o.matrixWorld).invert();
    if (stVoxHit(g, v.copy(w).applyMatrix4(STG.inv))) return true;
  }
  return false;
}
/* ---------- flags on the lightning mast at the top of the tower ---------- */
function stFlags(pad) {
  if (typeof flagMesh !== 'function') return;
  if (!FLAG_TEX) {
    FLAG_TEX = new THREE.CanvasTexture(usFlag(256, false));
    FLAG_TEX.encoding = THREE.sRGBEncoding;
    FLAG_TEX.anisotropy = 8;
    X1_TEX = x1FlagTex();
  }
  // on the crane deck under the mast: the highest point of the pad that is clear of the mast itself
  const tip = highest(pad, (v) => v.y < 176 && Math.abs(v.x) < 2 && v.z < -20) || new THREE.Vector3(0, 173, -30);
  const g = new THREE.Group();
  g.position.set(tip.x, tip.y - 0.1, tip.z);
  g.rotation.y = Math.PI / 2;
  pad.add(g);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.6, roughness: 0.35 }),
  );
  pole.position.y = 6;
  g.add(pole);
  const fh = 3.6,
    top = new THREE.Vector3(0, 11.8, -0.15),
    n0 = FLAGS.length;
  g.add(flagMesh(FLAG_TEX, fh * 1.9, fh, top, 9));
  g.add(flagMesh(X1_TEX, fh * 1.5, fh, top.clone().add(new THREE.Vector3(0, -fh - 0.6, 0)), 9.5));
  for (let k = n0; k < FLAGS.length; k++) FLAGS[k].st = true;
}
/* ---------- Super Heavy's 33 Raptors ----------
   The source model ends in a flat white cap. Under it go a dark aft heat shield and 33 engines in the real pattern:
   3 in the middle, a ring of 10, an outer ring of 20. Bells hang 1.9 m below the cap. Three instanced meshes (one draw
   call each): the bells, a hot glow in each throat, and a short jet from each that runs into the main plume. Which
   engines burn follows the vehicle's nz: all 33 for the climb, the 13 inner for boostback and the start of the landing
   burn, the centre 3 at the end. */
const RAP = { bell: 1.9, rIn: 0.95, rMid: 2.55, rOut: 4.35 };
// engine layouts: [ring radius, angle, exit radius, bell length factor], inner (first to light, last to go out) first
const RAPL = {
  booster: { drop: RAP.bell, mid: 13, min: 3, pos: [] },
  // Starship: 3 sea-level Raptors in the middle, 3 big vacuum bells round them; recessed in the skirt so the stack
  // still sits flush on Super Heavy. The sea-level three do the flip and the landing burn.
  ship: { drop: 0.35, mid: 3, min: 3, pos: [] },
};
for (let i = 0; i < 3; i++) RAPL.booster.pos.push([RAP.rIn, (i / 3) * Math.PI * 2 + 0.5, 0.62, 1]);
for (let i = 0; i < 10; i++) RAPL.booster.pos.push([RAP.rMid, (i / 10) * Math.PI * 2, 0.62, 1]);
for (let i = 0; i < 20; i++) RAPL.booster.pos.push([RAP.rOut, ((i + 0.5) / 20) * Math.PI * 2, 0.64, 1]);
for (let i = 0; i < 3; i++) RAPL.ship.pos.push([0.95, (i / 3) * Math.PI * 2 + Math.PI / 6, 0.62, 1]);
for (let i = 0; i < 3; i++) RAPL.ship.pos.push([3.55, (i / 3) * Math.PI * 2 + Math.PI / 6 + Math.PI / 3, 1.15, 1.7]);
function stRaptors(V, L) {
  const pos = L.pos;
  const y0 = V.eng, // the cap
    ex = y0 - L.drop; // the bells' exit plane
  // bell: a lathe from the throat to the exit, open at both ends; a short powerhead above, hidden in the skirt
  const prof = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    prof.push(new THREE.Vector2(0.22 + 0.78 * Math.pow(u, 0.62), -u * RAP.bell));
  }
  const bellG = new THREE.LatheGeometry(prof, 20),
    bellM = new THREE.MeshStandardMaterial({
      color: 0x3f4247,
      metalness: 0.8,
      roughness: 0.45,
      side: THREE.DoubleSide,
      fog: false,
    });
  const glowG = new THREE.CircleGeometry(1, 16).rotateX(Math.PI / 2).translate(0, -0.35, 0),
    glowM = new THREE.MeshBasicMaterial({
      color: 0xffd7a0,
      toneMapped: false,
      fog: false,
      transparent: true,
      opacity: 1,
    });
  const jetM = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    uniforms: { t: { value: 0 }, k: { value: 0 } },
    vertexShader: `varying float v;void main(){v=-position.y;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float v;uniform float t,k;void main(){float a=clamp(v,0.,1.);float d=.8+.2*sin(a*30.-t*70.);
      vec3 c=mix(vec3(.75,.85,1.),vec3(1.,.72,.35),smoothstep(.1,.6,a));float al=k*(1.-smoothstep(.35,1.,a))*d;gl_FragColor=vec4(c*al*1.8,al);}`,
  });
  const jetG = new THREE.CylinderGeometry(0.5, 0.75, 1, 12, 6, true).translate(0, -0.5, 0);
  const n = pos.length,
    bells = new THREE.InstancedMesh(bellG, bellM, n),
    glow = new THREE.InstancedMesh(glowG, glowM, n),
    jets = new THREE.InstancedMesh(jetG, jetM, n),
    M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    Sv = new THREE.Vector3(),
    T = new THREE.Vector3();
  const at = pos.map(([r, a, s, ly]) => ({ x: Math.cos(a) * r, z: Math.sin(a) * r, s, ly, top: ex + RAP.bell * ly }));
  at.forEach((p, i) => {
    bells.setMatrixAt(i, M.compose(T.set(p.x, p.top, p.z), Q, Sv.set(p.s, p.ly, p.s)));
    glow.setMatrixAt(i, M.compose(T.set(p.x, p.top, p.z), Q, Sv.set(0, 1, 0)));
    jets.setMatrixAt(i, M.compose(T.set(p.x, ex, p.z), Q, Sv.set(0, 0, 0)));
  });
  // the aft heat shield: a dark disc just under the white cap, the bells through it
  const shield = new THREE.Mesh(
    new THREE.CircleGeometry(V.r * 0.985, 48).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x1e2024,
      roughness: 0.8,
      metalness: 0.2,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  shield.position.y = y0 - 0.06;
  for (const o of [bells, glow, jets, shield]) {
    o.frustumCulled = false; // instanced: the box of one bell would cull them all
    V.g.add(o);
  }
  jets.renderOrder = 3;
  V.rap = { at, bells, glow, jets, jetM, lit: -1, y0, ex, L, M, Q, Sv, T };
}
// light the engines that burn: count 33, 13 or 3 (inner first), length of the jets with thrust
function stRaptorTick(V, dt) {
  const R = V.rap,
    k = V.vis ? V.thr : 0,
    lit = k < 0.01 ? 0 : V.nz >= 0.9 ? R.at.length : V.nz >= 0.35 ? R.L.mid : R.L.min,
    len = 4 + 10 * k;
  R.jetM.uniforms.t.value += dt;
  R.jetM.uniforms.k.value = k;
  if (lit === R.lit && Math.abs(len - (R.len || 0)) < 0.2) return;
  R.lit = lit;
  R.len = len;
  const { M, Q, Sv, T } = R;
  R.at.forEach((p, i) => {
    const on = i < lit;
    R.glow.setMatrixAt(
      i,
      M.compose(T.set(p.x, p.top - 0.2, p.z), Q, Sv.set(on ? p.s * 0.9 : 0, 1, on ? p.s * 0.9 : 0)),
    );
    R.jets.setMatrixAt(
      i,
      M.compose(T.set(p.x, R.ex, p.z), Q, Sv.set(on ? p.s * 1.25 : 0, on ? len * p.ly : 0, on ? p.s * 1.25 : 0)),
    );
  });
  R.glow.instanceMatrix.needsUpdate = R.jets.instanceMatrix.needsUpdate = true;
  R.glow.visible = R.jets.visible = lit > 0;
}
/* ---------- effects: plumes, light, smoke ---------- */
function stPlume(V, rNoz, rTail, lenK) {
  const pl = new THREE.Group();
  pl.position.set(0, V.eng, 0);
  V.g.add(pl);
  const pm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
    uniforms: { t: { value: 0 }, k: { value: 0 } },
    vertexShader: `varying float v;varying vec2 u;void main(){v=-position.y;u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float v;varying vec2 u;uniform float t,k;void main(){float a=clamp(v,0.,1.);float fl=.85+.15*sin(t*53.+u.x*40.)*sin(t*37.+a*20.);
      float sh=.75+.25*sin(a*38.-t*90.);
      vec3 c=mix(vec3(1.,.97,.88),mix(vec3(1.,.66,.3),vec3(.95,.38,.12),smoothstep(.35,1.,a)),smoothstep(.0,.25,a));float al=(1.-smoothstep(.5,1.,a))*smoothstep(0.,.03,a+.02)*k*fl*mix(1.,sh,smoothstep(.05,.4,a)*(1.-smoothstep(.4,.7,a)));gl_FragColor=vec4(c*al*2.2,al);}`,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(rNoz, rTail, 1, 28, 10, true).translate(0, -0.5, 0), pm);
  pl.add(cone);
  const pc = pm.clone();
  pc.blending = THREE.NormalBlending;
  pc.uniforms = pm.uniforms;
  pc.fragmentShader = pm.fragmentShader.replace(
    'gl_FragColor=vec4(c*al*2.2,al);',
    'gl_FragColor=vec4(c*1.15,clamp(al*1.5,0.,1.));',
  );
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(rNoz * 0.6, rTail * 0.45, 1, 18, 4, true).translate(0, -0.5, 0),
    pc,
  );
  pl.add(core);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ST.glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
      toneMapped: false,
    }),
  );
  glow.scale.setScalar(0);
  pl.add(glow);
  /* The engine light hangs off the pad's root, not the vehicle, and is never hidden: only its brightness changes.
     In three.js the number of lights in view is built into every material's shader, so hiding a light, or hiding the
     vehicle it rides on, makes every material in the scene rebuild its shader: a stall of a fraction of a second. */
  const lt = new THREE.PointLight(0xff9a40, 0, 1400, 1.5);
  ST.root.add(lt);
  V.fx = { pl, pm, cone, core, glow, lt, rNoz, lenK };
}
// compile the shaders of everything in the scene now, so nothing stalls when the tower, the vehicles or their plumes
// are first seen. (Where the page has no renderer of its own to hand, it does nothing.)
function stPrecompile() {
  const r = typeof renderer !== 'undefined' ? renderer : null,
    c = typeof cam !== 'undefined' ? cam : r && ST.cam;
  if (!r || !c || !r.compile) return;
  try {
    const t0 = performance.now();
    r.compile(scene, c);
    ST.compileMs = performance.now() - t0;
  } catch (e) {
    console.warn('precompile', e);
  }
}
function stFx() {
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d'),
    rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,240,200,1)');
  rg.addColorStop(0.3, 'rgba(255,150,60,.6)');
  rg.addColorStop(1, 'rgba(255,90,20,0)');
  gg.fillStyle = rg;
  gg.fillRect(0, 0, 64, 64);
  ST.glowTex = new THREE.CanvasTexture(gc);
  stRaptors(ST.bv, RAPL.booster);
  stPlume(ST.bv, 4.6, 2.2, 1); // 33 Raptors across 9 m
  ST.bv.fx.pl.position.y -= RAP.bell + 3; // the merged plume starts where the 33 jets run together
  stRaptors(ST.sv, RAPL.ship);
  stPlume(ST.sv, 2.6, 1.4, 0.8); // 6 Raptors
  ST.sv.fx.pl.position.y -= RAPL.ship.drop + 2.5;
  // the vehicles stay visible far beyond the haze: they and their plumes ignore fog
  for (const V of [ST.bv, ST.sv])
    V.mesh.traverse((m) => m.isMesh && ((m.material = m.material.clone()), (m.material.fog = false)));
  const N = 2600,
    g = new THREE.BufferGeometry(),
    P = new Float32Array(N * 3),
    A = new Float32Array(N),
    S = new Float32Array(N),
    Cc = new Float32Array(N);
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('a', new THREE.BufferAttribute(A, 1));
  g.setAttribute('sz', new THREE.BufferAttribute(S, 1));
  g.setAttribute('c', new THREE.BufferAttribute(Cc, 1));
  const sm = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { h: { value: 540 }, maxPx: { value: 300 }, tint: { value: new THREE.Color(1, 1, 1) } },
    ]),
    // a puff is never wider than maxPx on screen, and one the camera is inside (closer than about its own size) fades
    // out and is not drawn at all: those were the puffs that filled the whole screen, many deep
    vertexShader: `attribute float a,sz,c;varying float va,vc;uniform float h,maxPx;
      #include <fog_pars_vertex>
      void main(){vc=c;vec4 mvPosition=modelViewMatrix*vec4(position,1.);float d=-mvPosition.z,nf=smoothstep(.45,1.3,d/max(sz,1.));va=a*nf;
      gl_PointSize=nf>0.&&a>.004?min(sz*h/d,maxPx):0.;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying float va,vc;uniform vec3 tint;
      #include <fog_pars_fragment>
      void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;float al=min(va*(1.-r)*(1.-r),.95);vec3 col=tint*mix(.95,.62,vc)*(1.-.18*q.y);gl_FragColor=vec4(col,al);
      #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(g, sm);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene.add(pts);
  ST.sm = { N, P, A, S, Cc, g, sm, pts, p: [], free: [...Array(N).keys()], keep: 1, layers: 0 };
}
function stEmit(x, y, z, vx, vy, vz, s0, s1, life, grey, shade) {
  const S = ST.sm;
  if (!S.free.length) return;
  S.p.push({
    i: S.free.pop(),
    x,
    y,
    z,
    vx,
    vy,
    vz,
    s0,
    s1,
    life,
    age: 0,
    grey,
    shade: shade == null ? grey : shade,
    lo: !!(shade != null && !grey),
  });
}
/* ---------- the flight script ---------- */
/* ---------- landing and catch: modelled on Flight 15 ----------
   The final approach follows the descent Ship 42 actually flew into the chopsticks, tracked frame by frame from a phone
   video (pin height above the catch point h, and descent speed v, against seconds to contact s):
     280 m at 58 m/s, 135 m at 38, 60 m at 14, then a slow stretch at 12-13 m/s, 16 m at 8 m/s, and a gentle settle
     onto the arms, speed reaching zero at contact.
   The chopsticks start swinging shut about 11 s out (135 m) and are nearly shut 4.3 s out (16 m); here they swing in
   to HOLD (computed on load: as far in as they go while the folded aft flaps still pass between them), then clamp the
   last bit once the flaps are below the arms, so the vehicle settles the last metres into closed arms and its engines
   cut on contact. Both vehicles fly it.
   Before it, each swings in over the tower on its landing burn, attitude following the thrust the path needs: the ship
   flips out of its belly flop (aft swinging down, past vertical to tilted back against its sideways speed) and arcs in
   braking, like the Flight 15 time-lapse; the booster lights 1.25 km up and 160 m offshore, leans toward the tower, then
   back to brake, and comes upright over it. */
const STF = [
  [13.8, 280, 58],
  [10.8, 135, 38],
  [7.8, 60, 14],
  [6.3, 39, 12.5],
  [4.3, 16, 8],
  [2.0, 2.5, 2.2],
  [0, 0, 0],
];
STF.T = STF[0][0];
// scalar cubic Hermite over T seconds at u in 0..1 (time running forward): [position, rate, acceleration]
function hs(p0, v0, p1, v1, T, u) {
  const u2 = u * u,
    u3 = u2 * u;
  return [
    (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * T * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * T * v1,
    ((6 * u2 - 6 * u) * p0 + (3 * u2 - 4 * u + 1) * T * v0 + (-6 * u2 + 6 * u) * p1 + (3 * u2 - 2 * u) * T * v1) / T,
    ((12 * u - 6) * p0 + (6 * u - 4) * T * v0 + (-12 * u + 6) * p1 + (6 * u - 2) * T * v1) / (T * T),
  ];
}
// the final approach at s seconds to contact: [height above contact, vertical rate (negative going down), acceleration]
function stFinal(s) {
  if (s <= 0) return [0, 0, 0];
  let i = 0;
  while (i < STF.length - 2 && s < STF[i + 1][0]) i++;
  const [s0, h0, v0] = STF[i],
    [s1, h1, v1] = STF[i + 1];
  return hs(h0, -v0, h1, -v1, s0 - s1, clamp((s0 - s) / (s0 - s1), 0, 1));
}
/* sideways, over the whole landing burn (u seconds since it lit), so the lean changes smoothly:
   ship     arrives gliding toward the tower at V: braking all the way, hardest at first, z = -A (1 - u/T)^3, T = 3A/V
   booster  falls straight, then swings across: z = A (1 - S(u/T)), S the smootherstep: it leans toward the tower, then
            back to brake, and is upright over it */
function stLatShip(u, A, V) {
  const T = (3 * A) / V,
    w = 1 - u / T;
  if (w <= 0) return [0, 0, 0];
  return [-A * w * w * w, (3 * A * w * w) / T, (-6 * A * w) / (T * T)];
}
function stLatBooster(u, A, T) {
  const x = clamp(u / T, 0, 1);
  return [
    A * (1 - x * x * x * (x * (6 * x - 15) + 10)),
    (-A * 30 * x * x * (x - 1) * (x - 1)) / T,
    (-A * 60 * x * (2 * x * x - 3 * x + 1)) / (T * T),
  ];
}
// chopsticks during the final approach: swing in to HOLD, then clamp (to the grip, k -0.115) between c0 and c1 seconds out
function stArmsAt(s, c0, c1) {
  const H = STC.HOLD;
  if (s > 10.8) return 1;
  if (s > 4.3) return lerp(1, H, ease((10.8 - s) / 6.5));
  if (s > c0) return H;
  if (s > c1) return lerp(H, -0.115, ease((c0 - s) / (c0 - c1)));
  return -0.115;
}
// the booster: burn start 1250 m over the arms at 235 m/s, 130 m out to sea; gate 280 m up, 8 m out
const STB = { b1: 6.6, H: 1250, v: 235, lat: 160, swing: 11, c0: 1.6, c1: 0.5 };
const STT = { ign: -2.5, meco: 37.5, sep: 38, flip: 43, bbEnd: 52, lbStart: 74 };
STT.gate = STT.lbStart + STB.b1;
STT.lbEnd = STT.gate + STF.T; // contact
STT.done = STT.lbEnd + 5.5;
// the carriage's shock absorbers taking a vehicle's weight: a dip of A metres that peaks after tau seconds and dies away
const stDip = (x, A = 0.32, tau = 0.5) =>
  x <= 0 || x >= 2.5 ? 0 : A * (x / tau) * Math.exp(1 - x / tau) * (1 - ease(x - 1.5)); // back to exactly 0 by 2.5 s
// the ship: belly flop until end, flip at 820 m over the arms falling 78 m/s and gliding 70 m/s toward the tower from
// 330 m out on the land side, b1 s of braking arc to the gate (280 m up, 10 m out), then the final approach; caught at
// the top of the tower, lowered onto the booster
const STS = { end: 22, b1: 8, flip: 4.5, lat: 330, vlat: 70, c0: 2.6, c1: 1.0, hold: 3, lower: 14 };
STS.lb = STS.b1 + STF.T; // flip start to contact
// cubic Hermite: position, velocity and acceleration at u in 0..1 over a segment of T seconds
function herm(P0, V0, P1, V1, T, u, out, vel, acc) {
  const u2 = u * u,
    u3 = u2 * u,
    h00 = 2 * u3 - 3 * u2 + 1,
    h10 = u3 - 2 * u2 + u,
    h01 = -2 * u3 + 3 * u2,
    h11 = u3 - u2;
  out
    .set(0, 0, 0)
    .addScaledVector(P0, h00)
    .addScaledVector(V0, h10 * T)
    .addScaledVector(P1, h01)
    .addScaledVector(V1, h11 * T);
  if (vel) {
    const d00 = 6 * u2 - 6 * u,
      d10 = 3 * u2 - 4 * u + 1,
      d01 = -6 * u2 + 6 * u,
      d11 = 3 * u2 - 2 * u;
    vel
      .set(0, 0, 0)
      .addScaledVector(P0, d00 / T)
      .addScaledVector(V0, d10)
      .addScaledVector(P1, d01 / T)
      .addScaledVector(V1, d11);
  }
  if (acc) {
    const a00 = 12 * u - 6,
      a10 = 6 * u - 4,
      a01 = -12 * u + 6,
      a11 = 6 * u - 2;
    acc
      .set(0, 0, 0)
      .addScaledVector(P0, a00 / (T * T))
      .addScaledVector(V0, a10 / T)
      .addScaledVector(P1, a01 / (T * T))
      .addScaledVector(V1, a11 / T);
  }
}
const stQ = new THREE.Quaternion(),
  stQ2 = new THREE.Quaternion(),
  stV = new THREE.Vector3(),
  stA = new THREE.Vector3(),
  stP = new THREE.Vector3();
// turn the vehicle so its nose (local +y) points along dir, easing at rate (1/s; Infinity snaps)
function aim(V, dir, rate, dt) {
  stQ.setFromUnitVectors(stUp, stV.copy(dir).normalize());
  if (!isFinite(rate)) V.q.copy(stQ);
  else V.q.slerp(stQ, 1 - Math.exp(-rate * dt));
}
function stReset(mode) {
  // everything back on the pad, stacked (or booster only, for the ship catch)
  ST.mode = 'idle';
  ST.t = 0;
  ST.cd = null;
  const B = ST.bv,
    S = ST.sv;
  B.p.set(0, STC.B_MID, 0);
  B.q.identity();
  S.p.set(0, STC.S_MID, 0);
  S.q.identity();
  B.v.set(0, 0, 0);
  S.v.set(0, 0, 0);
  B.thr = S.thr = 0;
  B.vis = S.vis = true;
  B.g.visible = S.g.visible = true;
  ST.arm.k = ST.arm.to = -0.115; // stacked: closed in under Starship's hooks
  ST.car.y = ST.car.to = 0;
  ST.qd.k = ST.qd.to = 0;
  ST.fin.k = ST.fin.to = 0;
  ST.flap.k = ST.flap.to = ST.flap.trim = 0;
  ST.phase = 'STACKED';
  ST.stack = true;
  ST.held = null;
  if (mode === 'shipcatch') {
    S.vis = false;
    S.g.visible = false;
    ST.arm.k = ST.arm.to = 1;
    ST.car.y = ST.car.to = STC.S_CATCH;
    ST.qd.k = ST.qd.to = 1;
    ST.phase = 'BOOSTER ON THE MOUNT';
    ST.stack = false;
    ST.flap.k = ST.flap.to = 1; // it arrives in its belly flop, flaps spread
  }
  stMech(0);
}
// countdown and launch: from the pad, stacked. Returns false if a sequence is already running.
function stLaunch() {
  if (!ST.ready || ST.mode !== 'idle') return false;
  if (!ST.stack || ST.held || ST.car.y !== 0) stReset();
  ST.mode = 'launch';
  ST.t = -10;
  ST.cdLast = null;
  ST.phase = 'COUNTDOWN';
  ST.trail = null;
  return true;
}
function stShipCatch() {
  if (!ST.ready || ST.mode !== 'idle') return false;
  stReset('shipcatch');
  ST.mode = 'shipcatch';
  ST.t = 0;
  ST.phase = 'STARSHIP RETURNING';
  const c = new THREE.Vector3(0, STC.S_MID + STC.S_CATCH, 0);
  ST.sc0 = {
    c,
    // it comes home from the land side, gliding toward the tower in its belly flop, nose toward the sea
    P0: c.clone().add(new THREE.Vector3(0, 2650, -1650)),
    V0: new THREE.Vector3(0, -90, 55),
    PF: c.clone().add(new THREE.Vector3(0, 820, -STS.lat)), // the flip
    VF: new THREE.Vector3(0, -78, STS.vlat),
    PG: c.clone().add(new THREE.Vector3(0, STF[0][1], 0)), // the gate: the final approach starts (sideways: stLatShip)
    VG: new THREE.Vector3(0, -STF[0][2], 0),
  };
  stShipCatchTick(0);
  return true;
}
function stAbort() {
  stReset();
}
// staged events say what is happening (the page shows ST.phase; the sim can banner them)
function stSay(p, sub) {
  if (ST.phase === p) return;
  ST.phase = p;
  if (typeof stOnPhase === 'function') stOnPhase(p, sub);
}
function stLaunchTick(dt) {
  const t = ST.t,
    B = ST.bv,
    S = ST.sv;
  // countdown: QD arm swings clear T-10..-5, chopsticks open T-9..-4
  if (t < 0) {
    const n = Math.ceil(-t);
    if (n !== ST.cdLast) {
      ST.cdLast = n;
      if (typeof stOnCount === 'function') stOnCount(n);
    }
    ST.qd.k = ST.qd.to = ease((t + 10) / 5);
    ST.arm.k = ST.arm.to = lerp(-0.115, 1, ease((t + 9) / 5));
    B.thr = t < STT.ign ? 0 : Math.min(1, (t - STT.ign) / 1.6) * 0.92;
    if (t > STT.ign) stSay('IGNITION');
    return;
  }
  if (t < STT.sep) {
    // stacked ascent: net acceleration builds as propellant burns off; gravity turn toward the sea once clear
    B.thr = t > STT.meco ? lerp(1, 0.15, clamp((t - STT.meco) / 0.4, 0, 1)) : 1;
    const a = 4 + 0.35 * t,
      h = B.p.y - STC.B_MID,
      th = clamp((h - 300) / 6500, 0, 1) * 32 * D2R;
    const sp = B.v.length() + a * dt;
    B.v.set(0, Math.cos(th), Math.sin(th)).multiplyScalar(sp);
    B.p.addScaledVector(B.v, dt);
    aim(B, B.v, Infinity, dt);
    // the ship rides on top
    S.p.copy(
      stV
        .set(0, STC.S_MID - STC.B_MID, 0)
        .applyQuaternion(B.q)
        .add(B.p),
    );
    S.q.copy(B.q);
    S.v.copy(B.v);
    S.thr = t > STT.meco - 0.6 ? Math.min(1, (t - (STT.meco - 0.6)) / 0.4) : 0; // hot staging: ship lights before sep
    stSay(S.thr > 0 ? 'HOT STAGING' : B.p.y < 260 ? 'LIFTOFF' : t < 30 ? 'MAX Q' : t < STT.meco ? 'ASCENT' : 'MECO');
    ST.ret = null;
    return;
  }
  // ---- separated ----
  if (!ST.ret) {
    // plan the booster's way home: up and back over an apex, then down to the top of the landing burn
    const c = new THREE.Vector3(0, STC.B_MID + STC.B_CATCH, 0),
      P0 = B.p.clone(),
      V0 = B.v.clone(),
      PA = new THREE.Vector3(0, P0.y + 1300, P0.z * 0.82),
      VA = new THREE.Vector3(0, 0, -Math.max(80, P0.z / 18)),
      P1 = c.clone().add(new THREE.Vector3(0, STB.H, STB.lat)),
      V1 = new THREE.Vector3(0, -STB.v, 0),
      PG = c.clone().add(new THREE.Vector3(0, STF[0][1], 0)),
      VG = new THREE.Vector3(0, -STF[0][2], 0);
    ST.ret = { c, P0, V0, PA, VA, P1, V1, PG, VG };
    S.v.multiplyScalar(1.02);
  }
  const R = ST.ret;
  // ship: on up and over toward orbit, until it is a speck
  {
    const ts = t - STT.sep,
      a = 14 + 0.3 * ts,
      th = Math.min(72, 32 + ts * 0.8) * D2R,
      sp = S.v.length() + a * dt;
    S.v.set(0, Math.cos(th), Math.sin(th)).multiplyScalar(sp);
    S.p.addScaledVector(S.v, dt);
    aim(S, S.v, 2, dt);
    S.thr = 1;
    if (ts > 90 && S.vis) {
      S.vis = false;
      S.g.visible = false;
    }
  }
  // booster
  if (t < STT.bbEnd) {
    herm(R.P0, R.V0, R.PA, R.VA, STT.bbEnd - STT.sep, (t - STT.sep) / (STT.bbEnd - STT.sep), stP, stV, stA);
    B.p.copy(stP);
    B.v.copy(stV);
    // flip toward home, then boostback with the thrust along the path's acceleration (plus holding up against gravity)
    const thrust = stA.clone().add(new THREE.Vector3(0, STC.g, 0));
    ST.fin.to = t > STT.sep + 1 ? 1 : 0; // fins open out as it turns for home
    if (t < STT.flip) {
      stSay('BOOSTER FLIP');
      B.thr = 0.12;
      B.nz = 0.2;
      aim(B, thrust, 0.9, dt);
    } else {
      stSay('BOOSTBACK BURN');
      B.thr = 0.75;
      B.nz = 0.45;
      aim(B, thrust, 3, dt);
    }
  } else if (t < STT.lbStart) {
    stSay('BOOSTER RETURNING');
    herm(R.PA, R.VA, R.P1, R.V1, STT.lbStart - STT.bbEnd, (t - STT.bbEnd) / (STT.lbStart - STT.bbEnd), stP, stV);
    B.p.copy(stP);
    B.v.copy(stV);
    B.thr = 0;
    aim(B, stA.copy(B.v).negate(), 1.2, dt); // falls engines first
  } else if (t < STT.lbEnd) {
    // landing burn: 13 engines through the swing in over the tower, then the centre 3 for the final approach
    if (t < STT.gate) {
      const u = t - STT.lbStart;
      herm(R.P1, R.V1, R.PG, R.VG, STB.b1, u / STB.b1, stP, stV, stA);
      const l = stLatBooster(u, STB.lat, STB.swing);
      stP.z = l[0];
      stV.z = l[1];
      stA.z = l[2];
      B.nz = 0.45;
      stThr(B, stA, 42, dt, u < 0.6 ? u / 0.6 : null);
    } else {
      const sl = STT.lbEnd - t,
        f = stFinal(sl),
        l = stLatBooster(t - STT.lbStart, STB.lat, STB.swing);
      stP.set(0, R.c.y + f[0], l[0]);
      stV.set(0, f[1], l[1]);
      stA.set(0, f[2], l[2]);
      B.nz = 0.18;
      stThr(B, stA, 42, dt);
      ST.arm.k = ST.arm.to = stArmsAt(sl, STB.c0, STB.c1);
    }
    B.p.copy(stP);
    B.v.copy(stV);
    aim(B, stA.add(stG), 4, dt); // leans along the thrust: toward the tower, then back to brake, then upright
    stSay(t < STT.lbEnd - 4.3 ? 'LANDING BURN' : 'CATCH', 'Super Heavy caught by its grid fins');
  } else {
    // contact: the grid fins are on the arms, the engines cut, the carriage's shock absorbers take the weight
    const x = t - STT.lbEnd,
      dip = stDip(x);
    B.thr = Math.max(0, B.thr - dt / 0.25);
    aim(B, stUp, 5, dt);
    ST.arm.k = ST.arm.to = -0.115;
    ST.car.y = ST.car.to = -dip;
    B.p.set(0, R.c.y - dip, 0);
    B.v.set(0, 0, 0);
    stSay('CAUGHT', 'Super Heavy caught by its grid fins');
    if (t > STT.done) {
      ST.car.y = ST.car.to = 0;
      ST.mode = 'idle';
      S.vis = S.g.visible = false; // Starship is long gone toward orbit
      ST.held = 'booster';
      ST.stack = false;
      stSay('BOOSTER IN THE ARMS');
    }
  }
}
// throttle from the thrust the path needs (acceleration plus holding up against gravity), eased; amax = full throttle.
// lit: an ignition ramp 0..1, or null
function stThr(V, acc, amax, dt, lit) {
  const k = clamp(stB.copy(acc).add(stG).length() / amax, 0.25, 1) * (lit == null ? 1 : lit);
  V.thr += (k - V.thr) * (lit != null ? 1 : 1 - Math.exp(-6 * dt));
}
function stShipCatchTick(dt) {
  const t = ST.t,
    S = ST.sv,
    K = ST.sc0;
  S.vis = true;
  S.g.visible = true;
  if (t < STS.end) {
    stSay(t < 4 ? 'STARSHIP RETURNING' : 'BELLY FLOP');
    herm(K.P0, K.V0, K.PF, K.VF, STS.end, t / STS.end, stP, stV);
    S.p.copy(stP);
    S.v.copy(stV);
    // belly down (heat shield, local +z, toward the ground), nose toward the sea the way it is going, a little
    // nose-high; flaps spread, working a little to steer
    stQ2.setFromEuler(new THREE.Euler(90 * D2R - 8 * D2R, 0, Math.sin(t * 0.9) * 0.04));
    if (dt === 0) S.q.copy(stQ2);
    else S.q.slerp(stQ2, 1 - Math.exp(-2 * dt));
    S.thr = 0;
    ST.flap.to = 1;
    ST.flap.trim = Math.sin(t * 1.7) * 5 + Math.sin(t * 0.6) * 3;
    ST.arm.to = 1;
    return;
  }
  const u = t - STS.end,
    sl = STS.lb - u; // seconds to contact
  if (sl > 0) {
    if (u < STS.b1) {
      // flip and braking arc: the engines light (an ignition flash), the aft end swings down, the ship goes past
      // vertical to lean back against its sideways speed and arcs in over the tower, righting itself as it slows
      herm(K.PF, K.VF, K.PG, K.VG, STS.b1, u / STS.b1, stP, stV, stA);
      const l = stLatShip(u, STS.lat, STS.vlat);
      stP.z = l[0];
      stV.z = l[1];
      stA.z = l[2];
      S.nz = u < 0.6 ? 1 : 0.5;
      stThr(S, stA, 24, dt, u < 0.6 ? 1 : null);
      stSay(u < STS.flip ? 'FLIP' : 'LANDING BURN');
    } else {
      const f = stFinal(sl),
        l = stLatShip(u, STS.lat, STS.vlat);
      stP.set(0, K.c.y + f[0], l[0]);
      stV.set(0, f[1], l[1]);
      stA.set(0, f[2], l[2]);
      S.nz = 0.5;
      stThr(S, stA, 24, dt);
      ST.arm.k = ST.arm.to = stArmsAt(sl, STS.c0, STS.c1);
      stSay(sl > 4.3 ? 'LANDING BURN' : 'CATCH', 'Starship caught by the tower');
    }
    S.p.copy(stP);
    S.v.copy(stV);
    ST.flap.to = 2; // folded back to leeward for the landing, clear of the chopsticks
    ST.flap.trim = 0;
    // attitude along the thrust (pitch only: the flaps stay facing the arms); through the flip, a turn from the
    // belly-flop attitude to it
    const th = stA.add(stG),
      want = Math.atan2(th.z, th.y);
    if (u < STS.flip) {
      const e = ease(u / STS.flip);
      S.q.setFromEuler(stE.set(lerp(82 * D2R, want, e * e * (2 - e)), 0, 0));
    } else S.q.slerp(stQ2.setFromEuler(stE.set(want, 0, 0)), 1 - Math.exp(-5 * dt));
    ST.car.y = ST.car.to = STC.S_CATCH;
    return;
  }
  // contact: the pins are on the arms, the engines cut, the shock absorbers take the weight; then lowered onto the booster
  const v = -sl,
    L0 = STS.hold;
  S.q.slerp(stQ2.identity(), 1 - Math.exp(-5 * dt));
  S.thr = Math.max(0, S.thr - dt / 0.25);
  if (v < L0) {
    const dip = stDip(v, 0.26);
    ST.arm.k = ST.arm.to = -0.115;
    ST.car.y = ST.car.to = STC.S_CATCH - dip;
    S.p.set(0, K.c.y - dip, 0);
    S.v.set(0, 0, 0);
    stSay('CAUGHT', 'Starship caught by the tower');
  } else if (v < L0 + STS.lower) {
    S.thr = 0;
    stSay('STACKING', 'Lowering Starship onto Super Heavy');
    const e = ease((v - L0) / STS.lower);
    ST.car.y = ST.car.to = STC.S_CATCH * (1 - e);
    S.p.set(0, K.c.y - STC.S_CATCH * e, 0);
  } else {
    S.p.set(0, STC.S_MID, 0);
    S.q.identity();
    ST.car.y = ST.car.to = 0;
    ST.qd.to = 0; // QD arm back to the ship
    ST.flap.to = 0;
    ST.mode = 'idle';
    ST.stack = true;
    stSay('STACKED', 'Ready to fly again');
  }
}
function stTick(dt) {
  if (!ST.ready) return;
  dt = Math.min(dt, 0.1);
  const B = ST.bv,
    S = ST.sv;
  if (ST.mode === 'launch') {
    ST.t += dt;
    stLaunchTick(dt);
  } else if (ST.mode === 'shipcatch') {
    ST.t += dt;
    stShipCatchTick(dt);
  }
  stMech(dt);
  if (ST.mode === 'idle') stCarry();
  else if (ST.held === 'booster') B.p.set(0, STC.B_MID + STC.B_CATCH + ST.car.y, 0);
  // plumes
  for (const V of [B, S]) {
    const fx = V.fx;
    fx.pm.uniforms.t.value += dt;
    const k = V.vis ? V.thr : 0,
      alt = V.p.y;
    // long and bright at the pad, longer and opening out as the air thins
    let len =
      k *
      (62 + Math.min(220, alt / 28)) *
      fx.lenK *
      (0.45 + 0.55 * V.nz) *
      (1 + 0.05 * Math.sin(fx.pm.uniforms.t.value * 29));
    const wide = (0.35 + 0.65 * V.nz) * (1 + Math.min(3.5, alt / 3500));
    // in the ship catch the flame stops short of the booster waiting on the mount below
    if (V === S && ST.mode === 'shipcatch' && B.vis)
      len = Math.min(len, Math.max(6, S.p.y + S.eng - (B.p.y + B.top) - 3));
    fx.pm.uniforms.k.value = k;
    fx.cone.scale.set(wide, Math.max(len, 0.01), wide);
    fx.core.scale.set(0.35 + 0.65 * V.nz, Math.max(len * 0.75, 0.01), 0.35 + 0.65 * V.nz);
    fx.glow.scale.setScalar(k * (fx.rNoz * 4 + alt / 120) * (0.5 + 0.5 * V.nz));
    fx.lt.intensity = k * (typeof TWI !== 'undefined' && TWI.on ? 22 : 9);
    fx.cone.visible = fx.core.visible = fx.glow.visible = k > 0.01;
    // the light follows the plume (6 m below the engines), its brightness alone says whether it is lit
    fx.pl.getWorldPosition(stLtP);
    stLtP.y -= 6;
    ST.root.worldToLocal(fx.lt.position.copy(stLtP));
  }
  stRaptorTick(B, dt);
  stRaptorTick(S, dt);
  stSmoke(dt);
  stSound();
}
function stSmoke(dt) {
  const S = ST.sm,
    B = ST.bv,
    n = Math.min(14, Math.ceil(dt * 110));
  ST.root.updateMatrixWorld(true);
  const b = ST.base,
    mountY = b.y + ST.M.base - 2;
  /* launch cloud: steam and dust from under the mount, from ignition until the stack is well up, then a few seconds of
     tail-off. Three parts: a fast ring blasting out between the mount's legs, a low cloud that rolls along the ground and
     wraps the foot of the tower, and columns that boil up round the legs. */
  if (ST.mode === 'launch' && ST.t > STT.ign && ST.t < 22) {
    const h = B.p.y - STC.B_MID,
      f = B.thr > 0 && h < 600 ? 1 : clamp(1 - (ST.t - 12) / 10, 0, 1) * 0.35,
      m = Math.ceil(Math.min(30, dt * 200) * f),
      cs = Math.cos(ST.root.rotation.y),
      sn = Math.sin(ST.root.rotation.y),
      tw = { x: b.x - 30 * sn, z: b.z - 30 * cs }; // the tower's foot, 30 m behind the mount
    for (let j = 0; j < m; j++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.random(),
        sh = Math.random() * 0.3;
      if (r < 0.45) {
        const sp = 22 + Math.random() * 40;
        stEmit(
          b.x + Math.cos(a) * 10,
          b.y + 1 + Math.random() * 6,
          b.z + Math.sin(a) * 10,
          Math.cos(a) * sp,
          1 + Math.random() * 4,
          Math.sin(a) * sp,
          18,
          90 + Math.random() * 60,
          10 + Math.random() * 8,
          0,
          sh,
        );
      } else if (r < 0.75) {
        const sp = 6 + Math.random() * 14,
          rr = 15 + Math.random() * 30;
        stEmit(
          tw.x + Math.cos(a) * rr,
          b.y + 2 + Math.random() * 8,
          tw.z + Math.sin(a) * rr,
          Math.cos(a) * sp,
          0.5 + Math.random() * 2,
          Math.sin(a) * sp,
          30,
          110 + Math.random() * 60,
          14 + Math.random() * 8,
          0,
          sh,
        );
      } else {
        const rr = 8 + Math.random() * 14;
        stEmit(
          b.x + Math.cos(a) * rr,
          b.y + 4 + Math.random() * 20,
          b.z + Math.sin(a) * rr,
          Math.cos(a) * 6,
          8 + Math.random() * 14,
          Math.sin(a) * 6,
          25,
          80 + Math.random() * 50,
          9 + Math.random() * 6,
          0,
          sh,
        );
      }
    }
  }
  // the landing burn's flame reaches the mount: dust and steam blown out across the pad
  if (ST.mode === 'launch' && ST.t > STT.lbStart + 2 && B.thr > 0.05 && B.p.y < STC.B_MID + STC.B_CATCH + 260) {
    const m = Math.ceil(Math.min(10, dt * 70) * B.thr);
    for (let j = 0; j < m; j++) {
      const a = Math.random() * Math.PI * 2,
        sp = 12 + Math.random() * 22;
      stEmit(
        b.x + Math.cos(a) * 8,
        b.y + ST.M.base + Math.random() * 4,
        b.z + Math.sin(a) * 8,
        Math.cos(a) * sp,
        1 + Math.random() * 3,
        Math.sin(a) * sp,
        14,
        55 + Math.random() * 30,
        6 + Math.random() * 4,
        0,
        0.15 + Math.random() * 0.25,
      );
    }
  }
  // trails behind lit engines in the air (the landing burn too)
  for (const V of [ST.bv, ST.sv]) {
    if (!V.vis || V.thr < 0.05) {
      V.tailPrev = null;
      continue;
    }
    const tail = V.fx.pl.localToWorld(stP.set(0, -V.fx.cone.scale.y * 0.7, 0)).clone(),
      hi = tail.y - b.y;
    // no trail high up (thin air) or for the ship's small landing burn
    if (hi > 4500 || (V === ST.sv && ST.mode === 'shipcatch') || (V === ST.bv && ST.t > STT.sep)) {
      V.tailPrev = null;
      continue;
    }
    if (tail.y < mountY + 6 && V === B && ST.mode === 'launch' && ST.t < 5) {
      V.tailPrev = null;
      continue;
    }
    const pv = V.tailPrev || tail,
      dn = V.fx.pl
        .localToWorld(stA.set(0, -1, 0))
        .sub(V.fx.pl.getWorldPosition(stV))
        .normalize(),
      m = Math.ceil(n * 0.5 * V.thr * V.nz) + Math.min(28, Math.floor(pv.distanceTo(tail) / 4));
    for (let j = 0; j < m; j++) {
      const f = (j + Math.random()) / m,
        sp = 3 + Math.random() * 5;
      stEmit(
        lerp(pv.x, tail.x, f) + (Math.random() - 0.5) * 3,
        lerp(pv.y, tail.y, f) + (Math.random() - 0.5) * 3,
        lerp(pv.z, tail.z, f) + (Math.random() - 0.5) * 3,
        dn.x * sp,
        dn.y * sp,
        dn.z * sp,
        16 + hi / 200,
        50 + hi / 80,
        5 + Math.random() * 4,
        1,
      );
    }
    V.tailPrev = tail;
  }
  for (let q = S.p.length - 1; q >= 0; q--) {
    const p = S.p[q];
    p.age += dt;
    if (p.age >= p.life) {
      S.A[p.i] = 0;
      S.free.push(p.i);
      S.p.splice(q, 1);
      continue;
    }
    const dr = Math.exp(-dt * (p.grey ? 0.4 : 0.8));
    p.vx *= dr;
    p.vz *= dr;
    p.vy = p.vy * dr + (p.grey ? 0.4 : p.lo ? 0.5 : 1.2) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const u = p.age / p.life;
    S.P[p.i * 3] = p.x;
    S.P[p.i * 3 + 1] = p.y;
    S.P[p.i * 3 + 2] = p.z;
    S.S[p.i] = lerp(p.s0, p.s1, Math.sqrt(u));
    S.A[p.i] = (1 - u) * (1 - u) * Math.min(1, p.age * 3) * (p.grey ? 0.5 : 0.7);
    S.Cc[p.i] = p.shade;
  }
  stSmokeBudget(S, dt);
  S.g.attributes.position.needsUpdate =
    S.g.attributes.a.needsUpdate =
    S.g.attributes.sz.needsUpdate =
    S.g.attributes.c.needsUpdate =
      true;
  S.sm.uniforms.h.value = innerHeight / (2 * Math.tan((cam.fov * D2R) / 2));
  const tw = typeof TWI !== 'undefined' && TWI.on;
  S.sm.uniforms.tint.value.setRGB(tw ? 0.62 : 1, tw ? 0.56 : 1, tw ? 0.62 : 1);
}
/* Smoke budget. A soft puff costs a blend on every pixel it covers, and the launch cloud stacked them up to 50 deep on
   a desktop screen and 150 on a phone, which is what slowed launches. Each frame the cloud's cover is estimated (the
   screen area of every puff the camera sees, counted as layers deep over the whole screen); over the budget, a share of
   the puffs is left out (always the same ones, by index, so nothing flickers) and the rest are made thicker to keep the
   cloud's look. The budget is 8 layers, 5 on phones and in VR, and lower again when the frame rate is already down. */
const SMB = { v: new THREE.Vector3(), m: new THREE.Matrix4() };
function stSmokeBudget(S, dt) {
  const vrOn = typeof XR === 'function' && XR(),
    small =
      Math.min(innerWidth, innerHeight) < 700 ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches),
    slow = typeof PERF !== 'undefined' && PERF.k > 1;
  const budget = (vrOn || small ? 5 : 8) * (slow ? 0.6 : 1),
    H = S.sm.uniforms.h.value,
    maxPx = Math.round(0.4 * Math.min(innerWidth, innerHeight) + 60),
    W = innerWidth,
    Hh = innerHeight;
  cam.updateMatrixWorld();
  SMB.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  let area = 0;
  for (const p of S.p) {
    if (S.A[p.i] < 0.004) continue;
    const v = SMB.v.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse),
      d = -v.z,
      sz = S.S[p.i];
    if (d < 0.45 * sz) continue; // not drawn (inside it)
    const px = Math.min((sz * H) / d, maxPx),
      c = v.applyMatrix4(cam.projectionMatrix),
      sx = (c.x * 0.5 + 0.5) * W,
      sy = (c.y * 0.5 + 0.5) * Hh,
      hw = px / 2,
      ox = Math.min(W, sx + hw) - Math.max(0, sx - hw),
      oy = Math.min(Hh, sy + hw) - Math.max(0, sy - hw);
    if (ox > 0 && oy > 0) area += ox * oy;
  }
  S.layers = area / (W * Hh);
  const want = clamp(budget / Math.max(S.layers, 1e-3), 0.12, 1),
    ease = (cur, to) => cur + (to - cur) * (to < cur ? 1 - Math.exp(-dt * 8) : 1 - Math.exp(-dt * 1.5)); // cut fast, restore slowly
  S.keep = ease(S.keep, want);
  // right beside the cloud even the share left is too much: then the biggest puffs are drawn smaller too
  S.pxK = ease(S.pxK || 1, clamp(Math.sqrt(budget / Math.max(S.layers * S.keep, 1e-3)), 0.25, 1));
  S.sm.uniforms.maxPx.value = Math.max(60, Math.round(maxPx * S.pxK));
  S.drawn = S.layers * S.keep * Math.min(1, S.pxK * S.pxK * 1.6);
  if (S.keep > 0.999) return;
  const gain = Math.pow(1 / S.keep, 0.75);
  for (const p of S.p) {
    // golden-ratio hash of the slot: the same puffs drop out as the share falls
    if ((p.i * 0.6180339887) % 1 > S.keep) S.A[p.i] = 0;
    else S.A[p.i] = Math.min(0.95, S.A[p.i] * gain);
  }
}
// sound: rumble with crackle from whichever engines burn, arriving at the speed of sound, fading with distance.
// Uses the sim's audio graph (ac, na) when it is there, else ST.audio set up by the page on its first click.
function stSound() {
  const A =
    typeof ac !== 'undefined' && ac && typeof na !== 'undefined' && na ? { ac, nb: na.nb, out: na.out } : ST.audio;
  if (!A || (typeof muted !== 'undefined' && muted)) return;
  const t = A.ac.currentTime;
  if (!ST.snd) {
    const src = A.ac.createBufferSource();
    src.buffer = A.nb;
    src.loop = true;
    const lp = A.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const bp = A.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.6;
    const g1 = A.ac.createGain(),
      g2 = A.ac.createGain(),
      g = A.ac.createGain();
    g1.gain.value = 1.6;
    g2.gain.value = 0.35;
    g.gain.value = 0;
    src.connect(lp).connect(g1).connect(g);
    src.connect(bp).connect(g2).connect(g);
    g.connect(A.out);
    src.start();
    ST.snd = { g, g2, hist: [] };
  }
  // loudness now, remembered so it can be heard later at the listener (distance / 343 m/s)
  let lvl = 0;
  const now = performance.now() / 1000;
  for (const V of [ST.bv, ST.sv]) {
    if (!V.vis || V.thr < 0.01) continue;
    const d = cam.position.distanceTo(V.fx.pl.getWorldPosition(stV));
    ST.snd.hist.push([now + d / 343, V.thr * (0.3 + 0.7 * V.nz) * clamp(420 / Math.max(d, 80), 0, 1)]);
  }
  const H = ST.snd.hist;
  while (H.length && H[0][0] <= now) lvl = Math.max(lvl, H.shift()[1]);
  ST.snd.lvl = H.length || lvl ? Math.max(lvl, (ST.snd.lvl || 0) * 0.9) : 0;
  ST.snd.g.gain.setTargetAtTime(Math.min(1, ST.snd.lvl) * 0.6, t, 0.15);
  ST.snd.g2.gain.setTargetAtTime(0.25 + 0.25 * Math.random(), t, 0.03);
}
// world-space helpers for cameras: a point up a vehicle's axis (0 engines .. 1 nose), and the pad's frame
function stVehPt(V, f, out) {
  V.g.updateMatrixWorld(true);
  return V.g.localToWorld(out.set(0, lerp(V.eng, V.top, f), 0));
}
function stPadPt(x, y, z, out) {
  ST.root.updateMatrixWorld(true);
  return ST.root.localToWorld(out.set(x, y, z));
}
