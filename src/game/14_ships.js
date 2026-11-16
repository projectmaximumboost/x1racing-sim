/* ---------- Max detail: two cruise ships in the infield ----------
   Off by default, and nothing is downloaded or put on the GPU until it is switched on. The ship pack sits next to the sim
   as X1_SkyRacer_Ships.bin (scrambled GLB; the asset licence forbids shipping a raw model file). Converted from the PLE
   Large Cruise Ship: native 290 m, scaled to 1,188 ft long, about 238 ft above the water. */
const SHIP = {
  on: false,
  objs: null,
  radars: null,
  token: 0,
  K: 362.1 / 289.8,
  WL: 2.5 - 1.524 / (362.1 / 289.8), // WL: model height raised to the waterline, set 5 ft lower than the first fit

  place: [
    { x: -30, y: 215, dir: 1, night: false },
    { x: 10, y: 315, dir: -1, night: true },
  ],
  box: { x: 20.3, y0: -8, y1: 52, z0: -136, z1: 149 },
}; // hull in model metres (x beam, y up, z bow)
const DETAIL = 'x1-skyracer-maxdetail-v2'; // v2: max detail defaults on again, older 'off' choices are dropped
function shipNear(x, y, m) {
  if (!SHIP.objs) return false;
  const K = SHIP.K,
    b = SHIP.box;
  for (const p of SHIP.place) {
    const lz = (p.dir * (x - p.x)) / K,
      lx = (y - p.y) / K,
      e = m / K;
    if (Math.abs(lx) < b.x + e && lz > b.z0 - e && lz < b.z1 + e) return true;
  }
  return false;
}
/* Ship surface. When the pack loads, the hull mesh is rasterised from above into a height map (0.5 m model cells): the top
   surface at every point. From it:
   - clearance: the top raised to its highest point within the machine's half-span (2.4 m), so the rotors keep off walls
     and rails; you can fly anywhere above that, close to the decks and along the sides;
   - landing spots: cells where a 4.25 m radius circle round them is flat to 30 cm and at least 12 m up (helipad, sport
     courts, the open sun decks). There the deck is solid ground: you can land, sit and take off again.
   Railings are not in the map. Touching anything else is a ship strike. */
const SHM = { C: 0.5, x0: -22, z0: -139, W: 88, L: 584, top: null, dil: null, land: null };
function shipMap(gscene) {
  const { C, x0, z0, W, L } = SHM,
    top = new Float32Array(W * L).fill(-99);
  gscene.updateMatrixWorld(true);
  const v = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  gscene.traverse((m) => {
    if (!m.isMesh || /^LCS_Radar/.test(m.name)) return;
    const g = m.geometry,
      pos = g.attributes.position,
      idx = g.index,
      mw = m.matrixWorld,
      groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const mt = Array.isArray(m.material) ? m.material[gr.materialIndex] : m.material;
      if (mt && mt.alphaTest > 0) continue; // railings
      for (let t = gr.start; t < gr.start + gr.count; t += 3) {
        const ia = idx ? idx.getX(t) : t,
          ib = idx ? idx.getX(t + 1) : t + 1,
          ic = idx ? idx.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(mw);
        b.fromBufferAttribute(pos, ib).applyMatrix4(mw);
        c.fromBufferAttribute(pos, ic).applyMatrix4(mw);
        const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(den) < 1e-9) continue;
        const i0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / C)),
          i1 = Math.min(L - 1, Math.ceil((Math.max(a.z, b.z, c.z) - z0) / C)),
          k0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / C)),
          k1 = Math.min(W - 1, Math.ceil((Math.max(a.x, b.x, c.x) - x0) / C));
        for (let i = i0; i <= i1; i++) {
          const pz = z0 + (i + 0.5) * C;
          for (let k = k0; k <= k1; k++) {
            const px = x0 + (k + 0.5) * C,
              l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / den,
              l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / den,
              l3 = 1 - l1 - l2;
            if (l1 >= -0.02 && l2 >= -0.02 && l3 >= -0.02) {
              const y = l1 * a.y + l2 * b.y + l3 * c.y,
                j = i * W + k;
              if (y > top[j]) top[j] = y;
            }
          }
        }
      }
    }
  });
  const win = (src, r, f, init) => {
    const o = new Float32Array(W * L),
      tmp = new Float32Array(W * L);
    for (let i = 0; i < L; i++)
      for (let k = 0; k < W; k++) {
        let m = init;
        for (let d = -r; d <= r; d++) {
          const kk = k + d;
          m = f(m, kk < 0 || kk >= W ? -99 : src[i * W + kk]);
        }
        tmp[i * W + k] = m;
      }
    for (let i = 0; i < L; i++)
      for (let k = 0; k < W; k++) {
        let m = init;
        for (let d = -r; d <= r; d++) {
          const ii = i + d;
          m = f(m, ii < 0 || ii >= L ? -99 : tmp[ii * W + k]);
        }
        o[i * W + k] = m;
      }
    return o;
  };
  const rD = Math.round(2.4 / SHIP.K / C),
    rL = Math.round(4.25 / SHIP.K / C);
  const dil = win(top, rD, Math.max, -99),
    mx = win(top, rL, Math.max, -99),
    mn = win(top, rL, Math.min, 99),
    land = new Uint8Array(W * L);
  for (let j = 0; j < W * L; j++) land[j] = top[j] > 12 && mx[j] - mn[j] < 0.3 ? 1 : 0;
  SHM.top = top;
  SHM.dil = dil;
  SHM.land = land;
}
// where the point is over a ship: which ship and the map cell, else null
function shipCell(x, y) {
  if (!SHIP.objs || !SHM.top) return null;
  const K = SHIP.K;
  for (let n = 0; n < SHIP.place.length; n++) {
    const p = SHIP.place[n],
      lz = (p.dir * (x - p.x)) / K,
      lx = (p.dir * (y - p.y)) / K,
      i = Math.floor((lz - SHM.z0) / SHM.C),
      k = Math.floor((lx - SHM.x0) / SHM.C);
    if (i >= 0 && i < SHM.L && k >= 0 && k < SHM.W) {
      const j = i * SHM.W + k;
      if (SHM.dil[j] > -50) return { n, j, lz };
    }
  }
  return null;
}
const shipWorldH = (y) => (y + SHIP.WL) * SHIP.K;
// a landing spot under the machine (deck height in world metres), when it is at or just above the deck
function shipGround(x, y, h) {
  const c = shipCell(x, y);
  if (!c || !SHM.land[c.j]) return null;
  const t = shipWorldH(SHM.top[c.j]);
  return h >= t - 1.5 ? t : null;
}
// ship strike: the machine's centre within 0.9 m of the clearance surface, except sitting on a landing spot
function shipHit(x, y, h) {
  const c = shipCell(x, y);
  if (!c) return false;
  if (SHM.land[c.j] && h >= shipWorldH(SHM.top[c.j]) - 0.6) return false;
  return h < shipWorldH(SHM.dil[c.j]) + 0.9;
}
function shipSpotName(x, y) {
  const c = shipCell(x, y);
  if (!c) return '';
  return 'SHIP ' + (c.n + 1) + (c.lz > 120 ? ' HELIPAD' : ' TOP DECK');
}
function unscramble(buf) {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== 0x50533158) throw new Error('not a ship pack');
  const n = v.getUint32(4, true),
    w = new ArrayBuffer((n + 3) & ~3);
  new Uint8Array(w).set(new Uint8Array(buf, 8, n));
  const u = new Uint32Array(w);
  let x = 0x9e3779b9 >>> 0;
  for (let i = 0; i < u.length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    u[i] ^= x;
  }
  return w.slice(0, n);
}
// Where the pack might be: next to the page, inside the page's own folder when the URL has no trailing slash (x1racing.com/sim
// served from /sim/index.html), or the site root. A web host that answers a missing file with its home page gives HTML back,
// so only a response that starts with the pack's 'X1SP' tag counts. The .wasm copy is for the Claude artifact host.
async function shipFetch() {
  const f = 'X1_SkyRacer_Ships',
    p = location.pathname.replace(/\/[^\/]*\.html?$/, '').replace(/\/$/, ''),
    seen = new Set(),
    tried = [];
  for (const u of [
    f + '.bin',
    p + '/' + f + '.bin',
    p.replace(/\/[^\/]*$/, '') + '/' + f + '.bin',
    '/' + f + '.bin',
    f + '.wasm',
  ]) {
    const abs = new URL(u, location.href).href;
    if (seen.has(abs)) continue;
    seen.add(abs);
    tried.push(abs);
    try {
      const r = await fetch(abs);
      if (!r.ok) continue;
      const t = r.headers.get('content-type') || '';
      if (/text\/html/.test(t)) continue;
      return r;
    } catch (e) {}
  }
  console.warn('Ship pack not found. Tried:', tried);
  return null;
}
async function shipsLoad() {
  const tok = ++SHIP.token;
  banner('LOADING SHIPS', '', 60000);
  try {
    const r = await shipFetch();
    if (!r) throw new Error('no pack');
    const tot = +r.headers.get('content-length') || 0;
    let buf;
    if (r.body && tot) {
      const rd = r.body.getReader(),
        parts = [];
      let got = 0,
        lastP = -1;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        const pc = Math.floor((got / tot) * 100);
        if (pc !== lastP && tok === SHIP.token) {
          lastP = pc;
          banner('LOADING SHIPS', pc + '%', 60000);
        }
      }
      const a = new Uint8Array(got);
      let o = 0;
      for (const p of parts) {
        a.set(p, o);
        o += p.length;
      }
      buf = a.buffer;
    } else buf = await r.arrayBuffer();
    if (tok !== SHIP.token) return;
    const gl = await new Promise((res, rej) => new THREE.GLTFLoader().parse(unscramble(buf), '', res, rej));
    if (tok !== SHIP.token) {
      disposeTree(gl.scene);
      return;
    }
    shipMap(gl.scene);
    const objs = [],
      radars = [],
      bases = SHIP.place.map((p, i) => (i ? gl.scene.clone(true) : gl.scene));
    SHIP.place.forEach((p, i) => {
      const o = bases[i];
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.frustumCulled = true;
        if (m.material) {
          if (i) m.material = m.material.clone();
          m.material.emissiveIntensity = p.night ? 1.4 : 0.55;
          if (m.material.map) m.material.map.anisotropy = 8;
        }
        if (/^LCS_Radar/.test(m.name) && !p.night) {
          m.userData.y0 = m.rotation.y + i;
          radars.push(m);
        }
      });
      (SHIP.flagG || (SHIP.flagG = []))[i] = shipFlag(o, i);
      shipScreen(o);
      o.scale.setScalar(SHIP.K);
      o.rotation.y = (p.dir * Math.PI) / 2;
      o.position.copy(toW(p.x, p.y, SHIP.WL * SHIP.K));
      scene.add(o);
      objs.push(o);
    });
    SHIP.objs = objs;
    SHIP.radars = radars;
    shipsLight();
    f9Kick();
    if (performance.now() < bT && /LOADING SHIPS/.test($('banner').textContent))
      (($('banner').style.opacity = 0), (bT = 0));
  } catch (e) {
    if (tok !== SHIP.token) return;
    f9Kick();
    SHIP.on = false;
    const miss = /no pack/.test((e && e.message) || '');
    SHIP.err = miss ? 'pack not found' : String((e && e.message) || e).slice(0, 70);
    console.error('Ships failed:', e);
    const bd = $('bDetail');
    bd.classList.remove('on');
    bd.textContent = miss ? 'Ships missing' : 'Ships failed';
    bd.title =
      (miss ? 'X1_SkyRacer_Ships.bin was not found next to the sim.' : 'Ships failed to load: ' + SHIP.err) +
      ' Press to try again.';
    setTimeout(
      () =>
        banner(
          miss ? 'SHIPS NOT FOUND' : 'SHIPS FAILED TO LOAD',
          miss ? 'Upload X1_SkyRacer_Ships.bin next to the sim' : SHIP.err,
          6000,
          '#ffc53d',
        ),
      G.foldWait > 0 || G.foldTarget !== null ? 3600 : 0,
    );
  }
}
/* US ensign on a gaff off the aft side of the radar mast, flying aft. Model metres: the mast's twin posts stand at z 65.8,
   their tops about 51.5 up. The flag is 3 m by 5.7 m on the real scale. */
let FLAG_TEX = null,
  X1_TEX = null;
const FLAGS = [];
// X1 Racing house flag: the orange X1 mark and wordmark on black, 3:2
function x1FlagTex() {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#050505';
  g.fillRect(0, 0, 384, 256);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  const im = new Image();
  im.onload = () => {
    const h = 212,
      w = (h * im.width) / im.height;
    g.drawImage(im, (384 - w) / 2, (256 - h) / 2, w, h);
    t.needsUpdate = true;
  };
  im.src = X1LOGO;
  return t;
}
function flagMesh(tex, fl, fh, at, i) {
  const geo = new THREE.PlaneGeometry(fl, fh, 24, 10);
  geo.translate(fl / 2, -fh / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    side: THREE.DoubleSide,
    roughness: 0.85,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0,
  });
  const f = new THREE.Mesh(geo, mat);
  f.userData.flag = true;
  f.position.copy(at);
  f.rotation.y = Math.PI / 2;
  FLAGS.push({ geo, x0: Float32Array.from(geo.attributes.position.array), ph: i * 2.1 + at.y, L: fl });
  return f;
}
/* Where the flags go is measured from the model, so a re-exported ship keeps its flags on its poles:
     mast  the top of the forward mast: the highest point on the centreline in the forward half
     jack  the tip of the bow jackstaff: the highest point on the centreline within 3 units of the stem
   Both in the ship's own frame (x to port, y up, z to the bow), before it is scaled and placed. Measured once. */
function highest(o, ok) {
  const inv = new THREE.Matrix4(),
    M = new THREE.Matrix4(),
    v = new THREE.Vector3(),
    best = new THREE.Vector3(0, -1e9, 0);
  o.updateMatrixWorld(true);
  inv.copy(o.matrixWorld).invert();
  o.traverse((m) => {
    if (!m.isMesh || !m.geometry || m.userData.flag) return;
    const a = m.geometry.attributes.position;
    M.multiplyMatrices(inv, m.matrixWorld);
    for (let k = 0; k < a.count; k++) {
      v.fromBufferAttribute(a, k).applyMatrix4(M);
      if (v.y > best.y && ok(v)) best.copy(v);
    }
  });
  return best.y > -1e8 ? best : null;
}
function shipPoints(o) {
  if (SHIP.pts) return SHIP.pts;
  const box = new THREE.Box3(),
    inv = new THREE.Matrix4();
  o.updateMatrixWorld(true);
  inv.copy(o.matrixWorld).invert();
  o.traverse((m) => {
    if (m.isMesh && m.geometry && !m.userData.flag) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    }
  });
  const bow = box.max.z;
  SHIP.pts = {
    mast: highest(o, (v) => Math.abs(v.x) < 1 && v.z > 0 && v.z < bow - 20) || new THREE.Vector3(0, 52.05, 66.02),
    jack: highest(o, (v) => Math.abs(v.x) < 0.5 && v.z > bow - 3) || new THREE.Vector3(0, 19.02, 150.73),
  };
  return SHIP.pts;
}
function shipFlag(o, i) {
  if (!FLAG_TEX) {
    FLAG_TEX = new THREE.CanvasTexture(usFlag(256, false));
    FLAG_TEX.encoding = THREE.sRGBEncoding;
    FLAG_TEX.anisotropy = 8;
    X1_TEX = x1FlagTex();
  }
  const pt = shipPoints(o),
    n0 = FLAGS.length,
    g = new THREE.Group();
  g.userData.flag = true;
  g.position.set(pt.mast.x, pt.mast.y - 2.75, pt.mast.z - 0.32);
  o.add(g); // the gaff springs from the mast 2.75 m below its top
  const pm = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: 0.6, roughness: 0.35 });
  const gl = 3.4,
    ga = 0.62,
    gaff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, gl, 8), pm);
  gaff.position.set(0, (Math.cos(ga) * gl) / 2, (-Math.sin(ga) * gl) / 2);
  gaff.rotation.x = -ga;
  g.add(gaff);
  const tip = new THREE.Vector3(0, Math.cos(ga) * gl - 0.05, -Math.sin(ga) * gl - 0.05),
    fh = 2.4;
  g.add(flagMesh(FLAG_TEX, fh * 1.9, fh, tip, i)); // US ensign on top
  g.add(flagMesh(X1_TEX, fh * 1.5, fh, tip.clone().add(new THREE.Vector3(0, -fh - 0.3, 0)), i + 0.5)); // X1 Racing flag below it
  // a little US jack at the tip of the bow's own jackstaff, flying aft
  const jh = 0.8;
  g.add(
    flagMesh(
      FLAG_TEX,
      jh * 1.9,
      jh,
      pt.jack
        .clone()
        .sub(g.position)
        .add(new THREE.Vector3(0, -0.02, -0.05)),
      i + 0.25,
    ),
  );
  for (let k = n0; k < FLAGS.length; k++) FLAGS[k].ship = true; // so unloading the ships leaves any other flags waving
  return g;
}
// cloth: a travelling wave that grows toward the fly end, with a little droop and flutter
function flagTick(t) {
  for (const F of FLAGS) {
    const p = F.geo.attributes.position,
      a = p.array,
      x0 = F.x0,
      L = F.L;
    for (let k = 0; k < p.count; k++) {
      const x = x0[k * 3],
        y = x0[k * 3 + 1],
        u = x / L;
      a[k * 3 + 2] =
        u * (0.42 * Math.sin(x * 1.5 - t * 6.3 + F.ph + y * 0.35) + 0.12 * Math.sin(x * 4.1 - t * 11 + y * 1.3 + F.ph));
      a[k * 3] = x - u * u * 0.18;
      a[k * 3 + 1] = y - u * u * 0.12 * (1 + Math.sin(t * 1.7 + F.ph));
    }
    p.needsUpdate = true;
    F.geo.computeVertexNormals();
  }
}
// ship lighting: the night ship has her lights up; at twilight both do, and the ensigns are floodlit
function shipsLight() {
  if (!SHIP.objs) return;
  const tw = typeof TWI !== 'undefined' && TWI.on;
  SHIP.objs.forEach((o, i) =>
    o.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      if (m.userData.flag) {
        m.material.emissiveIntensity = tw ? 0.22 : 0;
        return;
      }
      m.material.emissiveIntensity = tw ? 1.7 : SHIP.place[i].night ? 1.4 : 0.55;
    }),
  );
}
function disposeTree(o) {
  const seen = new Set();
  o.traverse((m) => {
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const ms = m.material ? [].concat(m.material) : [];
    for (const mt of ms) {
      if (seen.has(mt)) continue;
      seen.add(mt);
      for (const k in mt) {
        const t = mt[k];
        if (t && t.isTexture && !t.isRenderTargetTexture && !seen.has(t)) {
          seen.add(t);
          t.dispose();
          if (t.image && t.image.close) t.image.close();
        }
      }
      mt.dispose();
    }
  });
}
function shipsUnload() {
  SHIP.token++;
  for (let k = FLAGS.length - 1; k >= 0; k--) if (FLAGS[k].ship) FLAGS.splice(k, 1);
  SHIP.pts = null;
  SCR.meshes.length = 0;
  SHIP.flagG = null;
  SHM.top = SHM.dil = SHM.land = null;
  if (SHIP.objs) {
    SHIP.objs.forEach((o) => {
      scene.remove(o);
    });
    disposeTree(SHIP.objs[0]);
    SHIP.objs.slice(1).forEach(disposeTree);
  }
  SHIP.objs = null;
  SHIP.radars = null;
}
function syncDetail() {
  $('bDetail').classList.toggle('on', SHIP.on);
  $('bDetail').textContent = 'Max detail';
  try {
    localStorage.setItem(DETAIL, SHIP.on ? '1' : '0');
  } catch (e) {}
}
function shipsT() {
  SHIP.on = !SHIP.on;
  syncDetail();
  if (SHIP.on) shipsLoad();
  else {
    shipsUnload();
    f9Unload();
    banner('MAX DETAIL OFF', 'Press K to turn it back on', 1200);
  }
}
$('bDetail').onclick = (e) => {
  shipsT();
  e.target.blur();
};
