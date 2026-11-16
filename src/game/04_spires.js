/* ---------- spires on barges ---------- */
function spireGeo() {
  const pts = [];
  const add = (r, y) => pts.push(new THREE.Vector2(r, y));
  add(9.9, 0);
  for (let i = 0; i < PROF.length; i++) {
    const [y, r] = PROF[i];
    if (i && i < 4) {
      add(r * 1.02, y - 0.2);
      add(r + 0.28, y);
      add(r * 0.97, y + 0.25);
    } else add(r, y);
    if (i < PROF.length - 1) {
      const [yb, rb] = PROF[i + 1];
      for (let t = 0.25; t < 1; t += 0.25) add(lerp(r, rb, t) + Math.sin(t * Math.PI) * 0.1, lerp(y, yb, t));
    }
  }
  for (let a = 10; a <= 90; a += 16) add(0.76 * Math.cos(a * D2R), 60.3 + 0.76 * Math.sin(a * D2R));
  const g = new THREE.LatheGeometry(pts, 56),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, p.getY(i) / SPIRE_H);
  g.computeVertexNormals();
  return g;
}
const SG = spireGeo(),
  spireObjs = [],
  spireTexs = [];
function makeBarge(sz) {
  const G = new THREE.Group(),
    m = new THREE.MeshStandardMaterial({ color: 0x2a313a, roughness: 0.75, metalness: 0.35 });
  const d = new THREE.Mesh(
    new THREE.BoxGeometry(sz, 1.7, sz),
    [0, 1, 2, 3, 4, 5].map((i) =>
      i === 2
        ? new THREE.MeshStandardMaterial({ color: 0x444c55, roughness: 0.9 })
        : i === 3
          ? m
          : new THREE.MeshStandardMaterial({ map: bargeTex, roughness: 0.6 }),
    ),
  );
  d.position.y = 0.75;
  G.add(d);
  const rail = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.5, roughness: 0.4 });
  const rg = new THREE.BoxGeometry(0.12, 1.2, 0.12);
  const n = Math.round(sz / 4);
  const im = new THREE.InstancedMesh(rg, rail, n * 4);
  const M = new THREE.Matrix4();
  for (let k = 0; k < 4; k++)
    for (let i = 0; i < n; i++) {
      const a = -sz / 2 + ((i + 0.5) * sz) / n,
        s = sz / 2 - 0.2,
        xy = [
          [a, s],
          [a, -s],
          [s, a],
          [-s, a],
        ][k];
      M.makeTranslation(xy[0], 2.1, xy[1]);
      im.setMatrixAt(k * n + i, M);
    }
  G.add(im);
  for (const [w, l, x, z] of [
    [sz, 0.1, 0, sz / 2 - 0.2],
    [sz, 0.1, 0, -sz / 2 + 0.2],
    [0.1, sz, sz / 2 - 0.2, 0],
    [0.1, sz, -sz / 2 + 0.2, 0],
  ]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, l), rail);
    b.position.set(x, 2.7, z);
    G.add(b);
  }
  return G;
}
function addSpire(x, y, kind, label, idx) {
  const G = new THREE.Group();
  G.position.copy(toW(x, y, 0));
  const b = makeBarge(25);
  G.add(b);
  const inner = new THREE.Group();
  inner.position.y = 1.6;
  G.add(inner);
  const map = spireTex(kind, label);
  spireTexs.push(map);
  const s = new THREE.Mesh(
    SG,
    new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0, envMapIntensity: 0.7 }),
  );
  inner.add(s);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 14, 10),
    new THREE.MeshBasicMaterial({
      color: kind === 'R' ? 0x1dff8a : kind === 'L' ? 0xff3030 : 0xffffff,
      toneMapped: false,
    }),
  );
  lamp.position.y = 61.5;
  inner.add(lamp);
  scene.add(G);
  const o = { G, inner, lamp, x, y, kind, wob: 0, ph: Math.random() * 6, idx };
  spireObjs.push(o);
  return o;
}
SP.forEach((s, i) => {
  s.obj = addSpire(s.x, s.y, s.side, String(i + 1), i);
});
const gateA = addSpire(DEF.gate.a[0], DEF.gate.a[1], 'G', '', -1),
  gateB = addSpire(DEF.gate.b[0], DEF.gate.b[1], 'G', '', -2);
{
  // start line buoys
  const b = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.8, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4 }),
      60,
    ),
    M = new THREE.Matrix4();
  let i = 0;
  for (let k = 1; k < 10; k++) {
    M.makeTranslation(0, 0.3, -lerp(DEF.gate.a[1], DEF.gate.b[1], k / 10));
    b.setMatrixAt(i++, M);
  }
  SP.forEach((s, j) => {
    for (let k = 0; k < 2 && i < 60; k++) {
      const a = j * 2.1 + k * 2.4,
        r = 24;
      M.makeTranslation(s.x + Math.cos(a) * r, 0.3, -(s.y + Math.sin(a) * r));
      b.setMatrixAt(i++, M);
    }
  });
  b.count = i;
  scene.add(b);
}

{
  // round X1 logo on every spire, mid-height white tier only
  const im = new Image();
  im.onload = () => {
    for (const t of spireTexs) {
      const c = t.image.getContext('2d'),
        w = t.image.width,
        h = t.image.height,
        put = (x, ft, d) => {
          const pw = (d * w) / (2 * Math.PI * spireR(ft * 0.3048)),
            ph = (d * h) / SPIRE_H;
          for (const wrap of [-w, 0, w]) c.drawImage(im, x + wrap - pw / 2, h - (ft / 200) * h - ph / 2, pw, ph);
        };
      for (let i = 0; i < 3; i++) put(((i + 0.5) * w) / 3, 125, 5.6);
      t.needsUpdate = true;
    }
  };
  im.src = $('logo').src;
}
