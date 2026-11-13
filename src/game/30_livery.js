/* ---------- liveries: all white, XXONE 51, Yonder 01 ----------
   Y (or the Livery button) steps through the paint schemes; the choice is remembered.
   A livery is three things, packed into src/liveries.json by tools/livery/pack.py from the design repo's viewers:
     base     a side-projected paint map. The body and sponsons already carry UVs for it in the GLB (it replaces the
              white livery's map); the flank panels are given the same projection here.
     recolor  which white or red painted parts (ducts, wings, pushers, pylons, fillers) take which colour
     decals   lettering and numbers. Each is a PNG laid over the faces of the parts it names, projected in model
              millimetres (+x craft left, +y aft, +z up, which is GLB x, -z, y in metres):
                side     faces pointing sideways; reads correctly from each side
                top      faces pointing up; nose at the top of the picture, seen from above
                top-out  faces pointing up; read from outboard of each side
                bottom   faces pointing down; nose at the top of the picture, seen from below
              Boxes are given for the left side and mirrored for right-hand parts. A decal marked clear_glass is left
              off any skin under the canopy, so the door number shows once, on the glass.
   Decals are separate meshes parented to the part they sit on, so they fold with the wings and hide with the
   cockpit parts. They are built the first time a livery is chosen, with the wings deployed. */
const LIV = {
  KEY: 'x1-skyracer-livery-v1',
  list: [{ id: 'white', name: 'White' }],
  i: 0,
  root: null,
  mats: new Map(), // recoloured copies of the GLB paints, by paint + colour
  tex: {},
  built: {},
  livMat: null,
  whiteMap: null,
  sill: null,
};
try {
  const el = $('liveries');
  if (el) LIV.list.push(...JSON.parse(el.textContent));
} catch (e) {
  console.warn('Liveries not loaded:', e);
}
const LIV_MM = 1000;
// a part is the named GLB node; a multi-material part arrives as a group of meshes named Part_1, Part_2...
function livPart(o) {
  return o.parent && o.parent.name && o.name.indexOf(o.parent.name) === 0 && /_\d+$/.test(o.name)
    ? o.parent.name
    : o.name;
}
function liveryInit(root) {
  LIV.root = root;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.paint0 = o.material;
    if (o.material.name === 'Livery' && !LIV.livMat) {
      LIV.livMat = o.material;
      LIV.whiteMap = o.material.map;
    }
  });
  // flank panels: the body's own side projection (u along the length, v down from the roof line), as in the GLB
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(),
    M = new THREE.Matrix4(),
    v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !/^Flank_Swoosh_[LR]$/.test(o.name)) return;
    const p = o.geometry.attributes.position,
      uv = new Float32Array(p.count * 2);
    M.multiplyMatrices(inv, o.matrixWorld);
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k).applyMatrix4(M);
      uv[k * 2] = 0.5 - 0.178571 * v.z;
      uv[k * 2 + 1] = 1.263158 - 1.052632 * v.y;
    }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  let want = 'white';
  try {
    want = localStorage.getItem(LIV.KEY) || 'white';
  } catch (e) {}
  const i = LIV.list.findIndex((l) => l.id === want);
  liverySet(i > 0 ? i : 0, true);
}
function livTexture(url) {
  const t = new THREE.TextureLoader().load(url);
  t.encoding = THREE.sRGBEncoding;
  t.flipY = false; // glTF UVs run top-down
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function livRecolored(base, hex) {
  const k = base.uuid + hex;
  let m = LIV.mats.get(k);
  if (!m) {
    m = base.clone();
    m.color.set(hex).convertSRGBToLinear(); // the hex is an sRGB paint colour; r147 materials hold linear
    LIV.mats.set(k, m);
  }
  return m;
}
function liverySet(i, quiet) {
  if (!LIV.root) return;
  LIV.i = ((i % LIV.list.length) + LIV.list.length) % LIV.list.length;
  const L = LIV.list[LIV.i],
    white = L.id === 'white';
  if (!white && !LIV.tex[L.id]) LIV.tex[L.id] = livTexture(L.base);
  if (LIV.livMat) {
    LIV.livMat.map = white ? LIV.whiteMap : LIV.tex[L.id];
    LIV.livMat.needsUpdate = true;
  }
  if (!white && !LIV.built[L.id]) livBuildDecals(L);
  const rec = white
    ? []
    : L.recolor.map(([re, paint, hex]) => [new RegExp(re), paint === 'red' ? 'Paint_Red' : 'Paint_White', hex]);
  LIV.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.decal) {
      o.visible = o.userData.decal === L.id;
      return;
    }
    const base = o.userData.paint0;
    if (!base) return;
    // only touch paint this file put there: other code swaps in its own materials (the live dash screen, the clear
    // canopy) and those must stay
    const cur = o.material;
    if (cur !== base && cur !== LIV.livMat && ![...LIV.mats.values()].includes(cur)) return;
    let m = base;
    if (!white) {
      const part = livPart(o);
      if (/^Flank_Swoosh_[LR]$/.test(part) && LIV.livMat) m = LIV.livMat;
      else
        for (const [re, paint, hex] of rec)
          if (re.test(part) && base.name === paint) {
            m = livRecolored(base, hex);
            break;
          }
    }
    if (o.material !== m) o.material = m;
  });
  const b = $('bLiv');
  if (b) {
    b.textContent = 'Livery: ' + L.name;
    b.classList.toggle('on', !white);
  }
  try {
    localStorage.setItem(LIV.KEY, L.id);
  } catch (e) {}
  if (!quiet) banner(L.name.toUpperCase(), 'Press Y for the next livery', 1200);
}
function liveryNext() {
  liverySet(LIV.i + 1);
}

/* decals */
function livDecalMat(L, d) {
  const t = livTexture(d.png);
  t.flipY = true; // decal UVs run bottom-up, as in the viewers
  const m = new THREE.MeshStandardMaterial({
    map: t,
    transparent: true,
    depthWrite: false,
    roughness: 0.35,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  return m;
}
// model-millimetre corners of every triangle of a mesh, with the mesh-local corners alongside
function livTris(o, inv) {
  const g = o.geometry,
    p = g.attributes.position,
    ix = g.index,
    n = ix ? ix.count : p.count,
    M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld),
    v = new THREE.Vector3(),
    mm = new Float32Array(n * 3),
    loc = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = ix ? ix.getX(k) : k;
    v.fromBufferAttribute(p, i);
    loc[k * 3] = v.x;
    loc[k * 3 + 1] = v.y;
    loc[k * 3 + 2] = v.z;
    v.applyMatrix4(M);
    mm[k * 3] = v.x * LIV_MM;
    mm[k * 3 + 1] = -v.z * LIV_MM;
    mm[k * 3 + 2] = v.y * LIV_MM;
  }
  return { mm, loc, n: n / 3 };
}
// Canopy footprint from the canopy mesh: rows of [y, half-width, sill z] in model mm
function livCanopySill(inv) {
  const o = LIV.root.getObjectByName('Canopy');
  if (!o) return null;
  const T = livTris(o, inv),
    by = new Map();
  for (let k = 0; k < T.n * 3; k++) {
    const y = Math.round(T.mm[k * 3 + 1] / 10) * 10;
    let r = by.get(y);
    if (!r) by.set(y, (r = { n: 0, hw: 0, z: 1e9 }));
    r.n++;
    r.hw = Math.max(r.hw, Math.abs(T.mm[k * 3]));
    r.z = Math.min(r.z, T.mm[k * 3 + 2]);
  }
  const S = [...by]
    .filter(([, r]) => r.n >= 6)
    .map(([y, r]) => [y, r.hw, r.z])
    .sort((a, b) => a[0] - b[0]);
  return S.length > 1 ? S : null;
}
function livUnderGlass(x, y, z) {
  const S = LIV.sill;
  if (!S || y < S[0][0] || y > S[S.length - 1][0]) return false;
  let i = 1;
  while (i < S.length - 1 && S[i][0] < y) i++;
  const a = S[i - 1],
    b = S[i],
    t = (y - a[0]) / (b[0] - a[0] || 1),
    hw = a[1] + (b[1] - a[1]) * t,
    sz = a[2] + (b[2] - a[2]) * t;
  return Math.abs(x) < hw + 15 && z > sz - 10;
}
function livBuildDecals(L) {
  LIV.built[L.id] = true;
  // project with the wings deployed, whatever they are doing now
  const ft = typeof foldA !== 'undefined' && foldA ? foldA.time : null;
  if (ft !== null) {
    foldA.time = 0;
    mixer.update(0);
  }
  LIV.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(LIV.root.matrixWorld).invert();
  if (!LIV.sill) LIV.sill = livCanopySill(inv);
  const meshes = [];
  LIV.root.traverse((o) => {
    if (o.isMesh && !o.userData.decal) meshes.push(o);
  });
  const mats = {};
  for (const o of meshes) {
    const name = livPart(o),
      list = L.decals.filter((d) => new RegExp(d.parts).test(name));
    if (!list.length) continue;
    const T = livTris(o, inv),
      q = T.mm;
    // which way is out: the sign of the part's signed volume (the GLB's faces are wound inward on most parts)
    let vol = 0,
      cx = 0,
      cy = 0,
      cz = 0;
    for (let k = 0; k < T.n * 3; k++) {
      cx += q[k * 3];
      cy += q[k * 3 + 1];
      cz += q[k * 3 + 2];
    }
    cx /= T.n * 3;
    cy /= T.n * 3;
    cz /= T.n * 3;
    for (let f = 0; f < T.n; f++) {
      const a = f * 9,
        ax = q[a] - cx,
        ay = q[a + 1] - cy,
        az = q[a + 2] - cz,
        bx = q[a + 3] - cx,
        by = q[a + 4] - cy,
        bz = q[a + 5] - cz,
        ex = q[a + 6] - cx,
        ey = q[a + 7] - cy,
        ez = q[a + 8] - cz;
      vol += ax * (by * ez - bz * ey) - ay * (bx * ez - bz * ex) + az * (bx * ey - by * ex);
    }
    const out = vol < 0 ? -1 : 1,
      right = /_R$/.test(name);
    for (const d of list) {
      const b = d.box,
        x0 = b.x ? (right ? -b.x[1] : b.x[0]) : 0,
        x1 = b.x ? (right ? -b.x[0] : b.x[1]) : 0,
        ps = [],
        us = [];
      for (let f = 0; f < T.n; f++) {
        const a = f * 9,
          v = [
            [q[a], q[a + 1], q[a + 2]],
            [q[a + 3], q[a + 4], q[a + 5]],
            [q[a + 6], q[a + 7], q[a + 8]],
          ],
          e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]],
          e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(n[0], n[1], n[2]);
        if (len < 1e-9) continue;
        n = n.map((c) => (c * out) / len);
        let uv;
        if (d.proj === 'side') {
          if (Math.abs(n[0]) < d.nmin) continue;
          const sd = n[0] > 0 ? 1 : -1; // +1 left side, -1 right side
          uv = v.map((p) => [
            sd > 0 ? (p[1] - b.y[0]) / (b.y[1] - b.y[0]) : (b.y[1] - p[1]) / (b.y[1] - b.y[0]),
            (p[2] - b.z[0]) / (b.z[1] - b.z[0]),
          ]);
        } else if (d.proj === 'top') {
          if (n[2] < d.nmin) continue;
          uv = v.map((p) => [(x1 - p[0]) / (x1 - x0), (b.y[1] - p[1]) / (b.y[1] - b.y[0])]);
        } else if (d.proj === 'top-out') {
          if (n[2] < d.nmin) continue;
          uv = v.map((p) =>
            right
              ? [(b.y[1] - p[1]) / (b.y[1] - b.y[0]), (p[0] - x0) / (x1 - x0)]
              : [(p[1] - b.y[0]) / (b.y[1] - b.y[0]), (x1 - p[0]) / (x1 - x0)],
          );
        } else {
          // bottom
          if (n[2] > -d.nmin) continue;
          uv = v.map((p) => [(p[0] - b.x[0]) / (b.x[1] - b.x[0]), (b.y[1] - p[1]) / (b.y[1] - b.y[0])]);
        }
        if (
          uv.every((t) => t[0] < 0) ||
          uv.every((t) => t[0] > 1) ||
          uv.every((t) => t[1] < 0) ||
          uv.every((t) => t[1] > 1)
        )
          continue;
        if (
          d.clear_glass &&
          !/^Canopy/.test(name) &&
          livUnderGlass(
            (v[0][0] + v[1][0] + v[2][0]) / 3,
            (v[0][1] + v[1][1] + v[2][1]) / 3,
            (v[0][2] + v[1][2] + v[2][2]) / 3,
          )
        )
          continue;
        // emit the corners so the decal's front face points outward
        for (const k of out > 0 ? [0, 1, 2] : [0, 2, 1]) {
          ps.push(T.loc[a + k * 3], T.loc[a + k * 3 + 1], T.loc[a + k * 3 + 2]);
          us.push(uv[k][0], uv[k][1]);
        }
      }
      if (!ps.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(us, 2));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats[d.id] || (mats[d.id] = livDecalMat(L, d)));
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      mesh.userData.decal = L.id;
      mesh.name = 'Decal_' + L.id + '_' + d.id;
      o.add(mesh);
    }
  }
  if (ft !== null) {
    foldA.time = ft;
    mixer.update(0);
  }
}
$('bLiv').onclick = (e) => {
  liveryNext();
  e.target.blur();
};
addEventListener('keydown', (e) => {
  if (
    e.code === 'KeyY' &&
    !e.repeat &&
    !e.ctrlKey &&
    !e.metaKey &&
    $('help').hidden &&
    $('lb').hidden &&
    $('share').hidden &&
    !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')
  )
    liveryNext();
});
