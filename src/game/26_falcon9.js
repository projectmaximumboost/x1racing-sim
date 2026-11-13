/* ---------- Falcon 9 on its pad (fork) ----------
   "Falcon 9 & Launching Pad" by Aashish_3D (Sketchfab), CC BY 4.0, reduced from 920k to 58k triangles by
   tools/f9/decimate.py and split into a 'rocket' node (lifts off) and a 'pad' node. It loads last, after the ships, from
   X1_SkyRacer_F9.glb next to the sim (X1_SkyRacer_F9.wasm on the Claude artifact host).
   It stands on the shore between turn 1 and turn 2, at the water's edge, with the rocket end of the pad and the rocket's
   lettered side turned toward the cruise ships. In the opening sequence it launches straight after the course flyover:
   ignition as the shot opens, liftoff about a second later, then the climb from the water, from the ship, and from afar. */
const F9 = {
  ready: false,
  started: false,
  K: 2.4,
  root: null,
  piv: null,
  tau: -1,
  h: 0,
  v: 0,
  pitch: 0,
  dx: 0,
  thr: 0,
  cx: 430,
  cy: -150,
  ship: new THREE.Vector3(),
  base: new THREE.Vector3(),
  dirS: new THREE.Vector3(),
  snd: null,
};
// model-space facts (metres x2.4 = world): footprint x -7.4..26.1, z -10.9..15.5, lower deck y -2.8, rocket axis x -0.05 z -0.75, engines y 0.5
const F9M = { x0: -7.4, x1: 26.1, z0: -10.9, z1: 15.5, deck: -2.8, ax: -0.05, az: -0.75, eng: 0.5, top: 29.4 };
async function f9Fetch() {
  const f = 'X1_SkyRacer_F9',
    seen = new Set();
  for (const u of [f + '.glb', f + '.wasm']) {
    const abs = new URL(u, location.href).href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    try {
      const r = await fetch(abs);
      if (!r.ok) continue;
      if (/text\/html/.test(r.headers.get('content-type') || '')) continue;
      const b = await r.arrayBuffer();
      if (new Uint32Array(b, 0, 1)[0] === 0x46546c67) return b;
    } catch (e) {}
  }
  console.warn('Falcon 9 pack not found');
  return null;
}
// The launch pad is part of Max detail: it loads after the ships, and turning Max detail off (K) takes it away again
function f9Kick() {
  if (!F9_ON || F9.started || !SHIP.on) return;
  F9.started = true;
  setTimeout(f9Load, 400);
}
function f9Unload() {
  F9.token = (F9.token || 0) + 1; // a load still in flight is dropped when it lands
  F9.started = false;
  if (!F9.root) return;
  F9.cd = null;
  F9.tau = -1;
  f9CamEnd();
  if (F9.snd) F9.snd.g.gain.value = 0;
  for (let k = FLAGS.length - 1; k >= 0; k--) if (FLAGS[k].f9) FLAGS.splice(k, 1);
  for (const o of [F9.root, F9.sm && F9.sm.pts]) {
    if (!o) continue;
    scene.remove(o);
    disposeTree(o);
  }
  F9.ready = false;
  F9.root = F9.piv = F9.rocket = F9.flags = F9.sm = F9.fx = F9.cxy = F9.arm = null;
  F9G.pad = F9G.arm = null;
  F9.grid = false;
  $('bLaunch').hidden = true;
}
async function f9Load() {
  const tok = F9.token || 0;
  const buf = await f9Fetch();
  if (!buf || tok !== (F9.token || 0)) return;
  const gl = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)).catch((e) => {
    console.error('Falcon 9 failed', e);
    return null;
  });
  if (!gl || tok !== (F9.token || 0)) return;
  const sc = gl.scene,
    rk = sc.getObjectByName('rocket');
  sc.traverse((m) => {
    if (m.isMesh) {
      m.frustumCulled = true;
      if (m.material) {
        m.material.side = THREE.DoubleSide;
        m.material.envMapIntensity = 0.8;
      }
    }
  });
  // pivot on the rocket's own axis, so it can be turned (lettering toward the ships) and pitched over in flight
  const piv = new THREE.Group();
  piv.position.set(F9M.ax, 0, F9M.az);
  sc.add(piv);
  rk.position.set(-F9M.ax, 0, -F9M.az);
  piv.add(rk);
  piv.rotation.y = -Math.PI / 2;
  // place: aim the rocket end (model -x) at the ships, then slide inland until every corner of the pad is on land
  const sx = (SHIP.place[0].x + SHIP.place[1].x) / 2,
    sy = (SHIP.place[0].y + SHIP.place[1].y) / 2;
  let cx = F9.cx,
    cy = F9.cy;
  const dx = sx - cx,
    dy = sy - cy,
    dl = Math.hypot(dx, dy),
    dwx = dx / dl,
    dwz = -dy / dl,
    psi = Math.atan2(dwz, -dwx),
    K = F9.K,
    mcx = (F9M.x0 + F9M.x1) / 2,
    mcz = (F9M.z0 + F9M.z1) / 2;
  const corner = (cx, cy, mx, mz) => {
    const lx = (mx - mcx) * K,
      lz = (mz - mcz) * K,
      wx = lx * Math.cos(psi) + lz * Math.sin(psi),
      wz = -lx * Math.sin(psi) + lz * Math.cos(psi);
    return [cx + wx, cy - wz];
  };
  for (let i = 0; i < 200; i++) {
    let ok = true;
    for (const [mx, mz] of [
      [F9M.x0, F9M.z0],
      [F9M.x1, F9M.z0],
      [F9M.x0, F9M.z1],
      [F9M.x1, F9M.z1],
    ]) {
      const [x, y] = corner(cx, cy, mx, mz);
      if (DEF.shoreY(x) - y < 0) {
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
  root.scale.setScalar(K);
  sc.position.set(-mcx, -F9M.deck, -mcz);
  root.add(sc);
  scene.add(root);
  root.updateMatrixWorld(true);
  F9.root = root;
  F9.piv = piv;
  F9.rocket = rk;
  F9.cxy = [cx, cy];
  F9.dirS.set(dwx, 0, dwz);
  F9.base.copy(piv.getWorldPosition(new THREE.Vector3()));
  F9.pivY0 = piv.position.y;
  f9Arm(sc);
  {
    const t0 = performance.now();
    f9Grid(sc);
    F9.gridMs = performance.now() - t0;
  }
  f9Fx();
  f9Flags(sc);
  F9.ready = true;
  console.log('Falcon 9 on its pad at', cx.toFixed(0), cy.toFixed(0));
}
/* ---------- collision with the pad and tower ----------
   The pad's own triangles (not the rocket) are rasterised into a 3-D grid of 0.2 model-unit (0.48 m) cells in the pad's
   own frame, then grown by 3 cells (about 1.4 m, the SkyRacer's body) so a hit is a hit on the real structure. Gaps in the
   lattice tower, the arms and the open deck edges stay open where the gap is wider than about 3 m. The rocket is checked
   as a cylinder wherever it is, on the pad or in the air. */
const F9G = {
  C: 0.2,
  R: 3,
  x0: -7.6,
  y0: -6.4,
  z0: -11.1,
  nx: 0,
  ny: 0,
  nz: 0,
  inv: new THREE.Matrix4(),
  v: new THREE.Vector3(),
};
/* ---------- the upper arm ----------
   The covered access arm that reaches from the service building to the top of the rocket is cut out of the pad model
   (by the faces' centres: the gallery along x at z -8.7..-5.2 from the rocket to the building face at x 15.9, and the
   spur and hood that turn in to the rocket at z down to -1.55, all between y 22.5 and 29.5, model units) into its own
   group, hinged at the building face. It swings 9 degrees away from the rocket: during a countdown from T-10 to T-4,
   eased in and out, so it is clear well before liftoff; for a launch with no countdown (the opening) it swings in the
   first second, before the rocket moves. */
const F9ARM = { hinge: [15.85, 0, -6.45], deg: 9 };
function f9ArmPick(x, y, z) {
  if (y < 22.5 || y > 29.5 || x < -2.6) return false;
  return (x < 15.9 && z > -8.7 && z < -5.2) || (x < 1.3 && z >= -5.2 && z < -1.55);
}
function f9Arm(sc) {
  const pad = sc.getObjectByName('pad'),
    g = new THREE.Group(),
    [hx, , hz] = F9ARM.hinge,
    box = new THREE.Box3(),
    v = new THREE.Vector3();
  g.position.set(hx, 0, hz);
  sc.add(g);
  pad.updateMatrixWorld(true);
  const toSc = new THREE.Matrix4().copy(sc.matrixWorld).invert();
  for (const m of [...pad.children]) {
    if (!m.isMesh || !m.geometry.index || /Main_Body|Silver/.test(m.material.name)) continue;
    const M = new THREE.Matrix4().multiplyMatrices(toSc, m.matrixWorld),
      P = m.geometry.attributes.position,
      I = m.geometry.index,
      keep = [],
      take = [];
    for (let t = 0; t < I.count; t += 3) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(P, I.getX(t + k)).applyMatrix4(M));
      v.multiplyScalar(1 / 3);
      (f9ArmPick(v.x, v.y, v.z) ? take : keep).push(I.getX(t), I.getX(t + 1), I.getX(t + 2));
    }
    if (!take.length) continue;
    m.geometry.setIndex(keep);
    const ag = new THREE.BufferGeometry();
    for (const k in m.geometry.attributes) ag.setAttribute(k, m.geometry.attributes[k]);
    ag.setIndex(take);
    const am = new THREE.Mesh(ag, m.material);
    am.matrix.copy(M).premultiply(new THREE.Matrix4().makeTranslation(-hx, 0, -hz));
    am.matrix.decompose(am.position, am.quaternion, am.scale);
    g.add(am);
    // the box of the faces taken (the position attribute is shared with the pad, so not ag.boundingBox)
    for (const i of take) box.expandByPoint(v.fromBufferAttribute(P, i).applyMatrix4(am.matrix));
  }
  F9.arm = { g, box, k: 0 };
}
// the arm's swing, 0 (at the rocket) to 1 (clear)
function f9ArmTick(dt) {
  const A = F9.arm;
  if (!A) return;
  let k = A.k;
  if (F9.cd != null) {
    const u = clamp((10 - F9.cd) / 6, 0, 1);
    k = u * u * (3 - 2 * u);
  } else if (F9.tau >= 0) k = Math.min(1, k + dt / 1.0);
  if (k !== A.k) {
    A.k = k;
    A.g.rotation.y = -k * F9ARM.deg * D2R; // tip away from the rocket, toward -z
  }
}
// rasterise the triangles of objs (in the frame of the object `frame`) into a grown voxel grid over the given box
function f9Vox(objs, frame, x0, y0, z0, x1, y1, z1) {
  const g = { C: F9G.C, R: F9G.R, x0, y0, z0 };
  g.nx = Math.ceil((x1 - x0) / g.C);
  g.ny = Math.ceil((y1 - y0) / g.C);
  g.nz = Math.ceil((z1 - z0) / g.C);
  const N = g.nx * g.ny * g.nz,
    A = new Uint8Array(N),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    p = new THREE.Vector3();
  frame.updateMatrixWorld(true);
  const toF = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const mark = (v) => {
    const i = Math.floor((v.x - g.x0) / g.C),
      j = Math.floor((v.y - g.y0) / g.C),
      k = Math.floor((v.z - g.z0) / g.C);
    if (i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz) A[(j * g.nz + k) * g.nx + i] = 1;
  };
  for (const o of objs)
    o.traverse((m) => {
      if (!m.isMesh) return;
      const M = new THREE.Matrix4().multiplyMatrices(toF, m.matrixWorld),
        P = m.geometry.attributes.position,
        I = m.geometry.index;
      for (let t = 0; t < I.count; t += 3) {
        a.fromBufferAttribute(P, I.getX(t)).applyMatrix4(M);
        b.fromBufferAttribute(P, I.getX(t + 1)).applyMatrix4(M);
        c.fromBufferAttribute(P, I.getX(t + 2)).applyMatrix4(M);
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
    });
  // grow by R cells along each axis in turn (a cube of side 2R+1)
  const grow = (st, len) => {
    const B = new Uint8Array(N);
    for (let base = 0; base < N; base++) {
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
const f9VoxHit = (g, q) => {
  const i = Math.floor((q.x - g.x0) / g.C),
    j = Math.floor((q.y - g.y0) / g.C),
    k = Math.floor((q.z - g.z0) / g.C);
  return i >= 0 && j >= 0 && k >= 0 && i < g.nx && j < g.ny && k < g.nz && !!g.A[(j * g.nz + k) * g.nx + i];
};
function f9Grid(sc) {
  // the pad without the swinging arm, in the pad's frame; the arm in its own hinged frame, so it is solid wherever it is
  F9G.pad = f9Vox([sc.getObjectByName('pad')], sc, F9G.x0, F9G.y0, F9G.z0, 26.3, 39.7, 15.7);
  const A = F9.arm;
  if (A) {
    const b = A.box;
    F9G.arm = f9Vox([A.g], A.g, b.min.x - 1, b.min.y - 1, b.min.z - 1, b.max.x + 1, b.max.y + 1, b.max.z + 1);
  }
  F9.grid = true;
}
function f9Hit(x, y, h) {
  const g = F9G;
  if (!F9.root) return false;
  const w = toW(x, y, h);
  // the rocket: a 3.9 m-wide column, 70 m tall, wherever it is
  F9.piv.updateMatrixWorld(true);
  const lp = F9.piv.worldToLocal(g.v.copy(w));
  if (lp.y > F9M.eng - 0.6 && lp.y < F9M.top + 0.2 && Math.hypot(lp.x, lp.z) < 1.65)
    return true; /* 1.1 model units of rocket radius plus the body clearance */
  g.inv.copy(F9.root.children[0].matrixWorld).invert();
  if (f9VoxHit(g.pad, g.v.copy(w).applyMatrix4(g.inv))) return true;
  if (!g.arm) return false;
  F9.arm.g.updateMatrixWorld(true);
  g.inv.copy(F9.arm.g.matrixWorld).invert();
  return f9VoxHit(g.arm, g.v.copy(w).applyMatrix4(g.inv));
}
/* ---------- flags on top of the launch tower: Old Glory over the X1 Racing flag, flying away from the ships ----------
   They stand on the very top of the pad's tallest feature (the mast, about 95 m up), found by measuring the pad model;
   a 5-unit (12 m) pole, flags 3.6 m on the hoist, same cloth as the ships'. */
function f9Flags(sc) {
  if (!FLAG_TEX) {
    FLAG_TEX = new THREE.CanvasTexture(usFlag(256, false));
    FLAG_TEX.encoding = THREE.sRGBEncoding;
    FLAG_TEX.anisotropy = 8;
    X1_TEX = x1FlagTex();
  }
  const tip = highest(sc.getObjectByName('pad'), () => true) || new THREE.Vector3(18.68, 39.46, 0.12);
  sc.updateMatrixWorld(true);
  sc.worldToLocal(sc.getObjectByName('pad').localToWorld(tip));
  const g = new THREE.Group();
  g.position.set(tip.x, tip.y - 0.04, tip.z);
  g.rotation.y = -Math.PI / 2;
  sc.add(g);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.08, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.6, roughness: 0.35 }),
  );
  pole.position.y = 2.5;
  g.add(pole);
  const fh = 1.5,
    top = new THREE.Vector3(0, 4.9, -0.06);
  const n0 = FLAGS.length;
  g.add(flagMesh(FLAG_TEX, fh * 1.9, fh, top, 7));
  g.add(flagMesh(X1_TEX, fh * 1.5, fh, top.clone().add(new THREE.Vector3(0, -fh - 0.25, 0)), 7.5));
  for (let k = n0; k < FLAGS.length; k++) FLAGS[k].f9 = true;
  F9.flags = g;
}
/* ---------- T-minus countdown ----------
   From SI flying (button or C), or in VR on the ship (X, or the menu). T-10 to liftoff at T-0, engines lighting a second
   before. Off the headset, the camera goes to the launch for its duration: the pad from the water, the ship's bow, then
   afar, and comes back to the view you had. Changing view ends it early. */
function f9CountOK() {
  return F9.ready && F9.cd == null && (F9.tau < 0 || F9.tau > 75);
}
function f9Count() {
  if (!f9CountOK()) return;
  f9Reset();
  if (F9.arm) {
    F9.arm.k = 0;
    F9.arm.g.rotation.y = 0; // back against the rocket for the new countdown
  }
  F9.cd = 10;
  F9.cdLast = null;
  if (!XR() && !G.intro) {
    G.f9cam = { was: G.view };
  }
}
function f9CountTick(dt) {
  if (F9.cd == null) return;
  F9.cd -= dt;
  const n = Math.ceil(F9.cd);
  if (n !== F9.cdLast && n > 0) {
    F9.cdLast = n;
    banner('T−' + n, 'Falcon 9', 950, n <= 3 ? '#e8690f' : '#ffffff');
    if (typeof sfx === 'function') sfx(n <= 3 ? 'gate' : 'buzz');
  }
  if (F9.cd <= F9T.lift && F9.tau < 0) f9Launch();
  if (F9.cd <= 0) {
    F9.cd = null;
    banner(
      'LIFTOFF',
      'Designed with American Super Intelligence and Built with American Might',
      6500,
      '#e8690f',
      'big',
    );
  }
}
const F9SH = () => SHOTS.filter((s) => s.f9);
function f9Cam(dt) {
  const sh = F9SH(),
    tau = F9.tau < 0 ? 0 : F9.tau,
    i = tau < 7 ? 0 : tau < 14 ? 1 : 2,
    u = (tau % 7) / 7;
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  cam.up.set(0, 1, 0);
  sh[i].f(u, cam);
  if (F9.cd == null && (F9.tau < 0 || F9.tau > 21)) f9CamEnd();
}
function f9CamEnd() {
  if (!G.f9cam) return;
  const v = G.f9cam.was;
  G.f9cam = null;
  camInit = false;
  if (typeof viewOK === 'function' && viewOK(v)) G.view = v;
}
/* ---------- effects: exhaust plume, light, smoke and steam ---------- */
function f9Fx() {
  const pl = new THREE.Group();
  pl.position.set(0, F9M.eng, 0);
  F9.piv.add(pl);
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
      vec3 c=mix(vec3(1.,.97,.85),mix(vec3(1.,.62,.2),vec3(.9,.3,.08),smoothstep(.35,1.,a)),smoothstep(.0,.3,a));float al=(1.-smoothstep(.55,1.,a))*smoothstep(0.,.04,a+.02)*k*fl;gl_FragColor=vec4(c*al*2.4,al);}`,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.4, 1, 24, 8, true).translate(0, -0.5, 0), pm);
  pl.add(cone); // unit length, scaled by thrust; v runs 0 at the nozzle to 1 at the tail
  const pc = pm.clone();
  pc.blending = THREE.NormalBlending;
  pc.uniforms = pm.uniforms; // the core draws over smoke and bright sky, so it reads in daylight
  pc.fragmentShader = pm.fragmentShader.replace(
    'gl_FragColor=vec4(c*al*2.4,al);',
    'gl_FragColor=vec4(c*1.15,clamp(al*1.5,0.,1.));',
  );
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 1, 16, 4, true).translate(0, -0.5, 0), pc);
  pl.add(core);
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d'),
    rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,240,200,1)');
  rg.addColorStop(0.3, 'rgba(255,150,60,.6)');
  rg.addColorStop(1, 'rgba(255,90,20,0)');
  gg.fillStyle = rg;
  gg.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
      toneMapped: false,
    }),
  );
  glow.scale.setScalar(0);
  pl.add(glow);
  const lt = new THREE.PointLight(0xff9a40, 0, 900, 1.6);
  lt.position.set(0, -3, 0);
  pl.add(lt);
  F9.fx = { pl, pm, cone, core, glow, lt };
  // smoke: one pool of soft particles in world space, fed by the deluge steam at the pad and the trail behind the rocket
  const N = 700,
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
      { h: { value: 540 }, tint: { value: new THREE.Color(1, 1, 1) } },
    ]),
    vertexShader: `attribute float a,sz,c;varying float va,vc;uniform float h;
      #include <fog_pars_vertex>
      void main(){va=a;vc=c;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_PointSize=min(sz*h/-mvPosition.z,900.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying float va,vc;uniform vec3 tint;
      #include <fog_pars_fragment>
      void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;float al=va*(1.-r)*(1.-r);vec3 col=tint*mix(.93,.62,vc)*(1.-.18*q.y);gl_FragColor=vec4(col,al);
      #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(g, sm);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene.add(pts);
  F9.sm = { N, P, A, S, Cc, g, sm, pts, p: [], free: [...Array(N).keys()] };
}
function f9Emit(x, y, z, vx, vy, vz, s0, s1, life, grey) {
  const S = F9.sm;
  if (!S.free.length) return;
  const i = S.free.pop();
  S.p.push({ i, x, y, z, vx, vy, vz, s0, s1, life, age: 0, grey });
}
/* ---------- the launch ---------- */
function f9Reset() {
  F9.tau = -1;
  F9.tailPrev = null;
  F9.h = 0;
  F9.v = 0;
  F9.pitch = 0;
  F9.dx = 0;
  F9.thr = 0;
  F9.rocket.visible = true;
  F9.piv.position.set(F9M.ax, F9.pivY0, F9M.az);
  F9.piv.rotation.set(0, -Math.PI / 2, 0);
}
function f9Launch() {
  if (!F9.ready) return;
  f9Reset();
  F9.tau = 0;
}
const F9T = { ign: 0.35, lift: 1.35 }; // ignition, then liftoff a second later
function f9Tick(dt) {
  if (!F9.ready) return;
  const fx = F9.fx,
    S = F9.sm;
  fx.pm.uniforms.t.value += dt;
  f9CountTick(dt);
  f9ArmTick(dt);
  {
    const show = G.mode === 'demo' && !G.intro && !XR(),
      b = $('bLaunch');
    if (b.hidden === show) b.hidden = !show;
    const ok = f9CountOK();
    if (b.disabled === ok) b.disabled = !ok;
  }
  if (F9.tau >= 0) {
    F9.tau += dt;
    const tau = F9.tau;
    // thrust: engines light at ign and spool to full in half a second
    F9.thr = tau < F9T.ign ? 0 : Math.min(1, (tau - F9T.ign) / 0.5);
    if (tau > F9T.lift) {
      const a = 3.2 + 0.9 * (tau - F9T.lift) + Math.min(14, 0.004 * F9.h);
      F9.v += a * dt;
      F9.h += F9.v * dt;
      // gravity turn: start pitching over away from the ships once clear of the tower, up to 35 degrees
      F9.pitch = clamp((F9.h - 220) / 2600, 0, 1) * 35 * D2R;
      F9.dx += F9.v * Math.sin(F9.pitch) * dt;
    }
    const K = F9.K;
    F9.piv.position.y = F9.pivY0 + F9.h / K;
    F9.piv.position.x = F9M.ax + F9.dx / K;
    F9.piv.rotation.set(0, -Math.PI / 2, 0);
    F9.piv.rotateX(-F9.pitch);
    if (tau > 75 && F9.cd == null) {
      F9.tau = -1;
      F9.thr = 0;
      F9.rocket.visible = false;
      setTimeout(() => {
        if (F9.tau < 0) {
          F9.h = F9.v = F9.dx = F9.pitch = 0;
          F9.piv.position.set(F9M.ax, F9.pivY0, F9M.az);
          F9.piv.rotation.set(0, -Math.PI / 2, 0);
          F9.rocket.visible = true;
        }
      }, 4000);
    }
    f9Sound(tau);
  }
  // plume: grows with thrust and with altitude (thinner air), flickers
  const k = F9.thr,
    len = k * (8 + Math.min(30, F9.h / 60)) * (1 + 0.06 * Math.sin(fx.pm.uniforms.t.value * 29));
  fx.pm.uniforms.k.value = k;
  fx.cone.scale.set(1 + F9.h / 900, len, 1 + F9.h / 900);
  fx.core.scale.set(1, len * 0.8, 1);
  fx.glow.scale.setScalar(k * (7 + F9.h / 150));
  fx.lt.intensity = k * (TWI.on ? 14 : 6);
  fx.cone.visible = fx.core.visible = fx.glow.visible = k > 0.01;
  // smoke: steam rolling out across the pad from ignition until the rocket is well up, then a trail behind it
  if (k > 0) {
    F9.root.updateMatrixWorld(true);
    const b = F9.base,
      pw = fx.pl.getWorldPosition(new THREE.Vector3()),
      n = Math.min(12, Math.ceil(dt * 90));
    if (F9.h < 140)
      for (let j = 0; j < n; j++) {
        const a = Math.random() * Math.PI * 2,
          sp = 10 + Math.random() * 24;
        f9Emit(
          b.x + Math.cos(a) * 4,
          b.y + 1 + Math.random() * 3,
          b.z + Math.sin(a) * 4,
          Math.cos(a) * sp,
          1 + Math.random() * 4,
          Math.sin(a) * sp,
          10,
          48 + Math.random() * 30,
          7 + Math.random() * 6,
          0,
        );
      }
    // trail: born at the tail of the flame, along the rocket's own axis (it pitches over), and spread evenly along the path
    // flown since the last frame so it stays a continuous column at any frame rate
    if (F9.h > 25) {
      const tail = fx.pl.localToWorld(new THREE.Vector3(0, -len * 0.85, 0)),
        dn = tail.clone().sub(pw).normalize(),
        pv = F9.tailPrev || tail,
        m = Math.ceil(n * 0.6) + Math.min(30, Math.floor(pv.distanceTo(tail) / 3));
      for (let j = 0; j < m; j++) {
        const f = (j + Math.random()) / m,
          x = lerp(pv.x, tail.x, f),
          y = lerp(pv.y, tail.y, f),
          z = lerp(pv.z, tail.z, f),
          sp = 2 + Math.random() * 4;
        f9Emit(
          x + (Math.random() - 0.5) * 2,
          y + (Math.random() - 0.5) * 2,
          z + (Math.random() - 0.5) * 2,
          dn.x * sp + (Math.random() - 0.5),
          dn.y * sp,
          dn.z * sp + (Math.random() - 0.5),
          12 + F9.h / 200,
          40 + F9.h / 60,
          6 + Math.random() * 4,
          1,
        );
      }
      F9.tailPrev = tail;
    } else F9.tailPrev = null;
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
    const dr = Math.exp(-dt * (p.grey ? 0.4 : 0.9));
    p.vx *= dr;
    p.vz *= dr;
    p.vy = p.vy * dr + (p.grey ? 0.4 : 1.1) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const u = p.age / p.life;
    S.P[p.i * 3] = p.x;
    S.P[p.i * 3 + 1] = p.y;
    S.P[p.i * 3 + 2] = p.z;
    S.S[p.i] = lerp(p.s0, p.s1, Math.sqrt(u));
    S.A[p.i] = (1 - u) * (1 - u) * Math.min(1, p.age * 3) * (p.grey ? 0.55 : 0.8);
    S.Cc[p.i] = p.grey;
  }
  S.g.attributes.position.needsUpdate =
    S.g.attributes.a.needsUpdate =
    S.g.attributes.sz.needsUpdate =
    S.g.attributes.c.needsUpdate =
      true;
  S.sm.uniforms.h.value = innerHeight / (2 * Math.tan((cam.fov * D2R) / 2));
  S.sm.uniforms.tint.value.setRGB(TWI.on ? 0.62 : 1, TWI.on ? 0.56 : 1, TWI.on ? 0.62 : 1);
}
// sound: a deep rumble with crackle, arriving at the speed of sound and fading with distance
function f9Sound(tau) {
  if (!ac || !na || muted) return;
  const t = ac.currentTime,
    d = cam.position.distanceTo(F9.fx.pl.getWorldPosition(new THREE.Vector3()));
  if (!F9.snd) {
    const src = ac.createBufferSource();
    src.buffer = na.nb;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const g1 = ac.createGain(),
      g2 = ac.createGain(),
      g = ac.createGain();
    g1.gain.value = 1.4;
    g2.gain.value = 0.35;
    g.gain.value = 0;
    src.connect(lp).connect(g1).connect(g);
    src.connect(bp).connect(g2).connect(g);
    g.connect(na.out);
    src.start();
    F9.snd = { g, g2 };
  }
  const heard = tau - F9T.ign - d / 343,
    lvl = heard > 0 ? Math.min(1, heard / 1.2) * F9.thr * clamp(260 / Math.max(d, 60), 0, 1) : 0;
  F9.snd.g.gain.setTargetAtTime(lvl * 0.55, t, 0.15);
  F9.snd.g2.gain.setTargetAtTime(0.25 + 0.25 * Math.random(), t, 0.03);
  if (F9.tau < 0 || tau > 70) F9.snd.g.gain.setTargetAtTime(0, t, 0.8);
}
$('bLaunch').onclick = (e) => {
  f9Count();
  e.target.blur();
};
