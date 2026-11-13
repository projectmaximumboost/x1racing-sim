/* ---------- cockpit: centre dash screen and side-stick ----------
   The airframe's one 15.4 in screen (Screen_Display, 0.332 x 0.207 m, UVs 0..1) is split in two.
   Left half: a live camera under the nose, looking forward and 35 degrees down, so you see what you are about to fly over
   (water, the shoreline, a helipad as you come in to land). It is the full scene drawn into a 320 x 400 texture with the
   craft itself hidden, about 20 times a second.
   Right half: a north-up moving map of the course (land, shoreline, the path, the spires, the start gate, the X1 pad,
   the ships and the Falcon 9 pad) with this SkyRacer as an arrow pointing along its heading, plus heading, speed and height, about
   10 times a second.
   Both only run while the screen can be seen: cockpit view, or the camera within 8 m with the screen in frame; and
   less often when the frame rate sags (PERF.k). The side-stick follows the
   right stick. */
const DASH = {
  scr: null,
  stick: null,
  rt: null,
  cv: null,
  g: null,
  tex: null,
  acc: 0,
  macc: 0,
  init: false,
  stick0: null,
  cam: new THREE.PerspectiveCamera(62, 0.8, 0.15, 12000),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  clr: new THREE.Color(),
  map: null,
  ships: null,
  shipsKey: null,
  fr: new THREE.Frustum(),
  m: new THREE.Matrix4(),
};
const DASH_W = 320,
  DASH_H = 400;
function dashMapFrame() {
  // fixed north-up frame that fits the course, the pad and a margin
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  const add = (x, y) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  P.forEach((p) => add(p.x, p.y));
  SP.forEach((s) => add(s.x, s.y));
  add(PAD.x, PAD.y);
  const m = 70;
  x0 -= m;
  x1 += m;
  y0 -= m;
  y1 += m;
  const top = 46,
    bot = 40,
    H = DASH_H - top - bot,
    k = Math.min((DASH_W - 16) / (x1 - x0), H / (y1 - y0));
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  return {
    k,
    cx,
    cy,
    ox: DASH_W / 2,
    oy: top + H / 2,
    X: (x) => DASH_W / 2 + (x - cx) * k,
    Y: (y) => top + H / 2 - (y - cy) * k,
  };
}
function dashShips() {
  // ship footprints as rotated rectangles in course coordinates, worked out once per ship load
  if (!SHIP.objs) {
    DASH.ships = null;
    DASH.shipsKey = null;
    return;
  }
  if (DASH.shipsKey === SHIP.objs) return;
  DASH.shipsKey = SHIP.objs;
  const b = new THREE.Box3(),
    v = new THREE.Vector3();
  DASH.ships = SHIP.objs.map((o) => {
    o.updateMatrixWorld(true);
    const yaw = Math.atan2(-o.matrixWorld.elements[8], o.matrixWorld.elements[10]);
    const inv = new THREE.Matrix4()
      .makeRotationY(-yaw)
      .multiply(new THREE.Matrix4().makeTranslation(-o.position.x, 0, -o.position.z));
    b.makeEmpty();
    o.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(m.matrixWorld)
          .applyMatrix4(inv);
        b.expandByPoint(v);
      }
    });
    const cx = (b.min.x + b.max.x) / 2,
      cz = (b.min.z + b.max.z) / 2,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    // back to world, then three (x, -z) -> course (east, north)
    const wx = o.position.x + cx * c + cz * s,
      wz = o.position.z - cx * s + cz * c;
    return { x: wx, y: -wz, hx: (b.max.x - b.min.x) / 2, hy: (b.max.z - b.min.z) / 2, yaw };
  });
}
function dashMapBase() {
  // static layer: water, land, path, spires, gate, pad, ships
  const F = DASH.map || (DASH.map = dashMapFrame()),
    c = document.createElement('canvas');
  c.width = DASH_W;
  c.height = DASH_H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b2a3d';
  g.fillRect(0, 0, DASH_W, DASH_H);
  // land: everything south of the shoreline
  const xa = F.cx - (DASH_W / 2 + 10) / F.k,
    xb = F.cx + (DASH_W / 2 + 10) / F.k;
  g.beginPath();
  g.moveTo(-10, DASH_H + 10);
  for (let x = xa; x <= xb; x += 4) g.lineTo(F.X(x), F.Y(DEF.shoreY(x)));
  g.lineTo(DASH_W + 10, DASH_H + 10);
  g.closePath();
  g.fillStyle = '#4a4a36';
  g.fill();
  g.strokeStyle = '#c9b98a';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = xa; x <= xb; x += 4) {
    const X = F.X(x),
      Y = F.Y(DEF.shoreY(x));
    x === xa ? g.moveTo(X, Y) : g.lineTo(X, Y);
  }
  g.stroke();
  // grid every 200 m
  g.strokeStyle = 'rgba(160,200,230,.10)';
  g.lineWidth = 1;
  for (let x = Math.ceil(xa / 200) * 200; x < xb; x += 200) {
    g.beginPath();
    g.moveTo(F.X(x), 0);
    g.lineTo(F.X(x), DASH_H);
    g.stroke();
  }
  for (let y = -1000; y < 1400; y += 200) {
    const Y = F.Y(y);
    if (Y < 0 || Y > DASH_H) continue;
    g.beginPath();
    g.moveTo(0, Y);
    g.lineTo(DASH_W, Y);
    g.stroke();
  }
  // ships
  if (DASH.ships)
    DASH.ships.forEach((s) => {
      g.save();
      g.translate(F.X(s.x), F.Y(s.y));
      g.rotate(-s.yaw);
      g.fillStyle = '#d8dde2';
      g.strokeStyle = '#8a96a0';
      g.lineWidth = 1;
      const w = s.hx * F.k,
        h = s.hy * F.k;
      g.beginPath();
      g.moveTo(-w, h);
      g.lineTo(-w, -h * 0.75);
      g.quadraticCurveTo(0, -h * 1.15, w, -h * 0.75);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    });
  // course path
  g.strokeStyle = '#ffb347';
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.setLineDash([]);
  g.beginPath();
  P.forEach((p, i) => (i ? g.lineTo(F.X(p.x), F.Y(p.y)) : g.moveTo(F.X(p.x), F.Y(p.y))));
  g.closePath();
  g.stroke();
  // start gate: checkered pair joined by the line
  const ga = DEF.gate.a,
    gb = DEF.gate.b;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(F.X(ga[0]), F.Y(ga[1]));
  g.lineTo(F.X(gb[0]), F.Y(gb[1]));
  g.stroke();
  g.setLineDash([]);
  [ga, gb].forEach((p) => {
    const X = F.X(p[0]),
      Y = F.Y(p[1]);
    g.fillStyle = '#fff';
    g.fillRect(X - 4, Y - 4, 8, 8);
    g.fillStyle = '#111';
    g.fillRect(X - 4, Y - 4, 4, 4);
    g.fillRect(X, Y, 4, 4);
  });
  // spires: red keep-left, green keep-right, numbered
  g.font = 'bold 11px system-ui,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  SP.forEach((s, i) => {
    const X = F.X(s.x),
      Y = F.Y(s.y);
    g.fillStyle = s.side === 'L' ? '#e8423a' : '#2fbf5a';
    g.beginPath();
    g.arc(X, Y, 5.5, 0, 7);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#fff';
    const a = Math.atan2(Y - F.oy, X - F.ox);
    g.fillText(String(i + 1), X + Math.cos(a) * 12, Y + Math.sin(a) * 12);
  });
  // X1 pad
  {
    const X = F.X(PAD.x),
      Y = F.Y(PAD.y);
    g.fillStyle = '#e8690f';
    g.beginPath();
    g.arc(X, Y, 6, 0, 7);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 8px system-ui,sans-serif';
    g.fillText('X1', X, Y + 0.5);
  }
  // Falcon 9 pad, once it has loaded
  if (F9.cxy) {
    const X = F.X(F9.cxy[0]),
      Y = F.Y(F9.cxy[1]);
    g.fillStyle = '#f4f2ee';
    g.strokeStyle = '#111';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X, Y - 8);
    g.lineTo(X + 3, Y + 5);
    g.lineTo(X - 3, Y + 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold 9px system-ui,sans-serif';
    g.fillText('F9', X + 12, Y + 2);
  }
  return c;
}
let dashBase = null;
function dashMap() {
  dashShips();
  const f9 = !!F9.cxy;
  if (!dashBase || dashBase.ships !== DASH.ships || dashBase.f9 !== f9) {
    dashBase = dashMapBase();
    dashBase.ships = DASH.ships;
    dashBase.f9 = f9;
  }
  const g = DASH.g,
    F = DASH.map,
    s = G.s;
  g.drawImage(dashBase, 0, 0);
  // trail-free arrow at our position, along the heading
  const X = F.X(s.p[1]),
    Y = F.Y(s.p[0]),
    h = s.psi;
  g.save();
  g.translate(clamp(X, 8, DASH_W - 8), clamp(Y, 50, DASH_H - 44));
  g.rotate(h);
  g.fillStyle = '#2ee6ff';
  g.strokeStyle = '#04161f';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -13);
  g.lineTo(8, 9);
  g.lineTo(0, 4);
  g.lineTo(-8, 9);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
  // header and footer bands
  g.fillStyle = 'rgba(6,14,22,.88)';
  g.fillRect(0, 0, DASH_W, 38);
  g.fillRect(0, DASH_H - 34, DASH_W, 34);
  const hd = ((Math.round(h / D2R) % 360) + 360) % 360,
    mph = Math.round(s.V * 2.23694),
    ft = Math.round(Math.max(0, -s.p[2] - groundH(s)) * 3.28084);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#8fb3c9';
  g.font = 'bold 11px system-ui,sans-serif';
  g.fillText('HDG', 10, 19);
  g.fillText('N', DASH_W - 20, 19);
  g.fillStyle = '#fff';
  g.font = 'bold 22px system-ui,sans-serif';
  g.fillText(String(hd).padStart(3, '0') + '°', 40, 20);
  // north pointer
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(DASH_W - 30, 27);
  g.lineTo(DASH_W - 26, 12);
  g.lineTo(DASH_W - 22, 27);
  g.closePath();
  g.fill();
  g.font = 'bold 16px system-ui,sans-serif';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.fillText(mph + ' mph', 10, DASH_H - 17);
  g.textAlign = 'right';
  g.fillText(ft + ' ft', DASH_W - 10, DASH_H - 17);
  DASH.tex.needsUpdate = true;
}
function dashInit() {
  DASH.init = true;
  const s = inner.getObjectByName('Screen_Display');
  if (!s) return;
  DASH.scr = s;
  DASH.rt = new THREE.WebGLRenderTarget(DASH_W, DASH_H, { samples: 0 });
  DASH.cv = document.createElement('canvas');
  DASH.cv.width = DASH_W;
  DASH.cv.height = DASH_H;
  DASH.g = DASH.cv.getContext('2d');
  DASH.tex = new THREE.CanvasTexture(DASH.cv);
  DASH.tex.anisotropy = 4;
  DASH.tex.minFilter = THREE.LinearFilter;
  DASH.tex.generateMipmaps = false;
  // the camera picture is linear (tone-mapped) and goes out through sRGB; the map canvas is already sRGB and goes out as is
  s.material = new THREE.ShaderMaterial({
    uniforms: { tA: { value: DASH.rt.texture }, tB: { value: DASH.tex } },
    toneMapped: false,
    fog: false,
    vertexShader:
      'varying vec2 vU;void main(){vU=vec2(uv.x,1.-uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'uniform sampler2D tA,tB;varying vec2 vU;void main(){vec3 c;' +
      'if(vU.x<.5){c=pow(max(texture2D(tA,vec2(vU.x*2.,vU.y)).rgb,0.),vec3(1./2.2));}else{c=texture2D(tB,vec2((vU.x-.5)*2.,vU.y)).rgb;}' +
      'if(abs(vU.x-.5)<.004)c=vec3(.05,.08,.1);gl_FragColor=vec4(c,1.);}',
  });
  DASH.g.fillStyle = '#0b2a3d';
  DASH.g.fillRect(0, 0, DASH_W, DASH_H);
  DASH.tex.needsUpdate = true;
  const st = inner.getObjectByName('Stick');
  if (st) {
    DASH.stick = st;
    DASH.stick0 = st.rotation.clone();
  }
}
function dashTick(dt, pos, hdg) {
  if (!DASH.init && inner.children.length) dashInit();
  if (!DASH.scr) return;
  // side-stick: model axes are x left, y up, z forward; stick pivots about its own origin (the Stick_Pivot point)
  if (DASH.stick) {
    const r = G.mode === 'demo' ? 0 : inp.roll,
      p = G.mode === 'demo' ? 0 : inp.pitch;
    DASH.stick.rotation.set(DASH.stick0.x + p * 0.2, DASH.stick0.y, DASH.stick0.z + r * 0.25);
  }
  DASH.acc += dt;
  DASH.macc += dt;
  if (DASH.acc < 0.05 * PERF.k) return;
  DASH.acc = 0;
  // seen from the seat, or from outside only close up and in frame (through the canopy)
  const sw = DASH.scr.getWorldPosition(DASH.c);
  if (G.camV !== 1 || G.f9cam) {
    // G.camV: the cockpit view, or the opening's cockpit race clip
    if (XR() ? rig.position.distanceTo(sw) > 8 : cam.position.distanceTo(sw) > 8) return;
    if (!XR()) {
      DASH.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      DASH.fr.setFromProjectionMatrix(DASH.m);
      if (!DASH.fr.containsPoint(sw)) return;
    }
  }
  if (DASH.macc >= 0.1) {
    DASH.macc = 0;
    dashMap();
  }
  // nose camera: under the nose (model +z forward, y up), looking forward and 35 deg down, rolling and pitching with the craft
  inner.updateMatrixWorld();
  DASH.cam.position.set(0, 0.3, 2.78).applyMatrix4(inner.matrixWorld);
  inner.getWorldQuaternion(DASH.q);
  DASH.d.set(0, -Math.sin(35 * D2R), Math.cos(35 * D2R)).applyQuaternion(DASH.q);
  DASH.cam.up.set(0, 1, 0).applyQuaternion(DASH.q);
  DASH.cam.lookAt(DASH.d.add(DASH.cam.position));
  DASH.cam.updateMatrixWorld();
  const xe = renderer.xr.enabled,
    a = renderer.getClearAlpha();
  renderer.getClearColor(DASH.clr);
  renderer.xr.enabled = false;
  const cv = craft.visible,
    skyP = sky.position.clone();
  craft.visible = false;
  sky.position.copy(DASH.cam.position); // the sky dome follows whichever camera is drawing
  renderer.setRenderTarget(DASH.rt);
  renderer.clear();
  renderer.render(scene, DASH.cam);
  renderer.setRenderTarget(null);
  craft.visible = cv;
  sky.position.copy(skyP);
  renderer.setClearColor(DASH.clr, a);
  renderer.xr.enabled = xe;
}
