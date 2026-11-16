/* ---------- land, pits, skyline ---------- */
{
  const W = 7000,
    D = 1700,
    nx = 280,
    ny = 80,
    g = new THREE.PlaneGeometry(W, D, nx, ny).rotateX(-Math.PI / 2);
  const p = g.attributes.position,
    col = new Float32Array(p.count * 3),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = -(p.getZ(i) + 0) - D / 2 + 160 + 0 - 0;
    const yy = y - 140 + 0;
    const ny2 = yy;
    const sy = DEF.shoreY(x);
    let h = DEF.landH(x, ny2);
    if (ny2 > sy) h = -1.2 - (ny2 - sy) * 0.05;
    else
      h +=
        0.35 *
        Math.max(
          0,
          1 - (sy - ny2) / 18,
        ); /* only the strip at the waterline is lifted 0.35 m clear of the water (it flickered from high up); inland, the pad and the ground are where they were */
    const d = sy - ny2;
    p.setXYZ(i, x, h, -ny2);
    const rock = Math.sin(x * 0.02) * 0.5 + Math.cos(x * 0.05 + d * 0.03) * 0.5;
    if (d < 34) c.setRGB(0.52, 0.46, 0.33);
    else if (d < 120) c.setRGB(0.36, 0.34, 0.23);
    else c.setRGB(0.19 + 0.04 * rock, 0.27 + 0.05 * rock, 0.14);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.25 }),
  );
  scene.add(m);
  // launch pad
  const padT = tex(1024, 1024, (g, w) => {
    g.fillStyle = '#3c4247';
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},.03)`;
      g.fillRect(Math.random() * w, Math.random() * w, 4, 4);
    }
    g.strokeStyle = '#f4f1ec';
    g.lineWidth = 18;
    g.beginPath();
    g.arc(512, 512, 410, 0, 7);
    g.stroke();
    g.strokeStyle = '#e8690f';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(512, 512, 470, 0, 7);
    g.stroke();
    g.translate(512, 512);
    g.fillStyle = '#f4f1ec';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'italic 700 300px "Barlow Condensed",Arial';
    g.fillText('X1', -200, 0);
    g.fillText('X1', 200, 0);
  });
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(24, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: padT, roughness: 0.9, envMapIntensity: 0.3 }),
  );
  pad.position.copy(toW(PAD.x, PAD.y, PAD.h + 0.03));
  pad.material.polygonOffset = true;
  pad.material.polygonOffsetFactor = -4;
  pad.material.polygonOffsetUnits = -4;
  pad.rotation.y = PAD.yaw * -1 + (Math.PI / 2) * 0 + 1.57 - 1.57;
  scene.add(pad);
  // hauler park: 45 haulers in three rows of 15, side by side, all parallel with their rear doors facing the X1 pad.
  // Laid out like a real paddock: a loading apron in front of the rear doors, a two-way perimeter taxiway around the
  // rows, two-way aisles between them, a road from the pad that tees into the apron, and the team building at the back
  // (inland, away from the race).
  const body = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }),
    dark = new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.5 }),
    orange = new THREE.MeshStandardMaterial({ color: 0xe8690f, roughness: 0.5 });
  const ROWS = 3,
    PER = 15,
    STALL = 4.5 + 3.05, // side-by-side spacing: 4.5 m plus 10 ft
    LEN = 19.7, // rear door to cab front
    APRON = 20, // loading apron between the pad-side edge and the first row's rear doors
    AISLE = 18, // between rows
    SIDE = 18, // taxiway down each side
    BACK = 16, // taxiway behind the last row
    WALK = 8, // pavement in front of the building
    cx = PAD.x,
    rowW = PER * STALL,
    ppm = 10; // texture pixels per metre
  const LOT = { x0: cx - rowW / 2 - SIDE, x1: cx + rowW / 2 + SIDE, y0: PAD.y - 62 }; // y0: the pad-side edge
  const rear = (r) => LOT.y0 - APRON - r * (LEN + AISLE); // y of row r's rear doors
  const yBack = rear(ROWS - 1) - LEN; // the last row's cab fronts
  LOT.y1 = yBack - BACK - WALK; // building frontage
  const lw = LOT.x1 - LOT.x0,
    ld = LOT.y0 - LOT.y1,
    rx0 = cx - rowW / 2;
  const drape = (geo, lift) => {
    const q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) q.setY(i, DEF.landH(q.getX(i), -q.getZ(i)) + lift);
    geo.computeVertexNormals();
    return geo;
  };
  const flat = (m) => {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  };
  const grain = (g, W, H, a) => {
    for (let i = 0; i < (W * H) / 70; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${a})`;
      g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
  };
  const WHITE = 'rgba(240,238,230,.9)',
    YEL = '#e6b417';
  // painting helpers in metres, course coordinates (x east, y north) on the lot canvas
  const lotT = tex(Math.round(lw * ppm), Math.round(ld * ppm), (g, W, H) => {
    const X = (x) => (x - LOT.x0) * ppm,
      Y = (y) => (LOT.y0 - y) * ppm;
    const line = (pts, w, col, dash) => {
      g.strokeStyle = col;
      g.lineWidth = w * ppm;
      g.setLineDash(dash ? dash.map((d) => d * ppm) : []);
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
      g.stroke();
      g.setLineDash([]);
    };
    const arrow = (x, y, dir) => {
      // a painted lane arrow 5 m long pointing along dir (radians, 0 = east)
      g.save();
      g.translate(X(x), Y(y));
      g.rotate(-dir);
      g.fillStyle = WHITE;
      const s = ppm;
      g.beginPath();
      g.moveTo(2.5 * s, 0);
      g.lineTo(0.6 * s, -0.9 * s);
      g.lineTo(0.6 * s, -0.3 * s);
      g.lineTo(-2.5 * s, -0.3 * s);
      g.lineTo(-2.5 * s, 0.3 * s);
      g.lineTo(0.6 * s, 0.3 * s);
      g.lineTo(0.6 * s, 0.9 * s);
      g.closePath();
      g.fill();
      g.restore();
    };
    const text = (s, x, y, size, col, rot = 0) => {
      g.save();
      g.translate(X(x), Y(y));
      g.rotate(rot);
      g.fillStyle = col;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 ${size * ppm}px "Barlow Condensed",Arial`;
      g.fillText(s, 0, 0);
      g.restore();
    };
    // asphalt lanes, lighter concrete under the stalls and the building pavement
    g.fillStyle = '#2d3236';
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.04);
    g.fillStyle = '#5a5f62';
    for (let r = 0; r < ROWS; r++) g.fillRect(X(rx0), Y(rear(r)), rowW * ppm, LEN * ppm);
    g.fillStyle = '#9a9890';
    g.fillRect(0, Y(LOT.y1 + WALK), W, WALK * ppm);
    // stalls: separators, a stop bar at the rear doors, and painted stall numbers
    for (let r = 0; r < ROWS; r++) {
      const ya = rear(r),
        yb = ya - LEN;
      for (let k = 0; k <= PER; k++)
        line(
          [
            [rx0 + k * STALL, ya],
            [rx0 + k * STALL, yb + 1],
          ],
          0.15,
          WHITE,
        );
      line(
        [
          [rx0, ya],
          [rx0 + rowW, ya],
        ],
        0.3,
        WHITE,
      );
      for (let k = 0; k < PER; k++)
        text(String(r * PER + PER - k), rx0 + (k + 0.5) * STALL, ya - 1.6, 1.5, WHITE, Math.PI);
    }
    // edge line all round, open where the road tees in
    const e = 0.8,
      gap = 7;
    line(
      [
        [cx - gap, LOT.y0 - e],
        [LOT.x0 + e, LOT.y0 - e],
        [LOT.x0 + e, LOT.y1 + WALK],
        [LOT.x1 - e, LOT.y1 + WALK],
        [LOT.x1 - e, LOT.y0 - e],
        [cx + gap, LOT.y0 - e],
      ],
      0.25,
      WHITE,
    );
    // perimeter taxiway: two-way, yellow centre line around the rows, keep-right arrows
    const cl = { x0: LOT.x0 + SIDE / 2, x1: LOT.x1 - SIDE / 2, y0: LOT.y0 - APRON / 2, y1: yBack - BACK / 2 };
    line(
      [
        [cl.x0, cl.y0],
        [cl.x0, cl.y1],
        [cl.x1, cl.y1],
        [cl.x1, cl.y0],
        [cl.x0, cl.y0],
      ],
      0.2,
      YEL,
      [3, 3],
    );
    for (const f of [0.25, 0.75]) {
      arrow(cl.x0 - 3.5, LOT.y0 + (cl.y1 - LOT.y0) * f, -Math.PI / 2); // west side heads inland
      arrow(cl.x0 + 3.5, LOT.y0 + (cl.y1 - LOT.y0) * f, Math.PI / 2); // and back
      arrow(cl.x1 - 3.5, LOT.y0 + (cl.y1 - LOT.y0) * f, -Math.PI / 2);
      arrow(cl.x1 + 3.5, LOT.y0 + (cl.y1 - LOT.y0) * f, Math.PI / 2);
    }
    // aisles between the rows: two-way, dashed centre line and arrows each side
    for (let r = 1; r < ROWS; r++) {
      const ym = rear(r) + AISLE / 2;
      line(
        [
          [cl.x0, ym],
          [cl.x1, ym],
        ],
        0.2,
        YEL,
        [3, 3],
      );
      for (const f of [0.3, 0.7]) {
        arrow(rx0 + rowW * f, ym + 3.5, Math.PI);
        arrow(rx0 + rowW * f, ym - 3.5, 0);
      }
    }
    // apron in front of the rear doors: loading zone hatching beside the road junction, labels
    line(
      [
        [cl.x0, cl.y1],
        [cl.x1, cl.y1],
      ],
      0.2,
      YEL,
      [3, 3],
    );
    text('LOADING APRON', cx - rowW / 4, LOT.y0 - APRON / 2 - 4.2, 2.2, WHITE, Math.PI);
    text('LOADING APRON', cx + rowW / 4, LOT.y0 - APRON / 2 - 4.2, 2.2, WHITE, Math.PI);
    text('X1 PADDOCK', cx, LOT.y0 - 3.5, 2.6, YEL, Math.PI);
    // road tee: double yellow centre line runs in to the apron centre line, stop bar on the way out
    line(
      [
        [cx - 0.3, LOT.y0 - 6],
        [cx - 0.3, cl.y0],
      ],
      0.15,
      YEL,
    );
    line(
      [
        [cx + 0.3, LOT.y0 - 6],
        [cx + 0.3, cl.y0],
      ],
      0.15,
      YEL,
    );
    line(
      [
        [cx + 0.6, cl.y0 + 1.5],
        [cx + 5.6, cl.y0 + 1.5],
      ],
      0.5,
      WHITE,
    );
    // crosswalk to the building door across the back taxiway
    g.fillStyle = WHITE;
    for (let x = cx - 4; x <= cx + 4; x += 1.6) g.fillRect(X(x), Y(LOT.y1 + WALK), 0.8 * ppm, BACK * 0.55 * ppm);
    text('STAFF  ·  VISITORS', cx, LOT.y1 + WALK / 2, 1.6, '#2d3236');
  });
  const lot = new THREE.Mesh(
    drape(new THREE.PlaneGeometry(lw, ld, 24, 30).rotateX(-Math.PI / 2).translate(cx, 0, -(LOT.y0 + LOT.y1) / 2), 0.1),
    flat(new THREE.MeshStandardMaterial({ map: lotT, roughness: 0.92, envMapIntensity: 0.25 })),
  );
  scene.add(lot);
  // the road from the pad to the paddock: edge lines, double yellow centre line, and an airfield-style hold line at the pad
  const rw = 14,
    ry0 = PAD.y - 20, // starts under the pad (the pad draws over it)
    rl = ry0 - LOT.y0 + 0.5;
  const roadT = tex(rw * ppm, Math.round(rl * ppm), (g, W, H) => {
    g.fillStyle = '#2d3236';
    g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.04);
    g.fillStyle = WHITE;
    g.fillRect(0.6 * ppm, 0, 0.25 * ppm, H);
    g.fillRect(W - 0.85 * ppm, 0, 0.25 * ppm, H);
    g.fillStyle = YEL;
    g.fillRect(W / 2 - 0.45 * ppm, 0, 0.15 * ppm, H);
    g.fillRect(W / 2 + 0.3 * ppm, 0, 0.15 * ppm, H);
    // hold-short: two solid and two dashed yellow bars across the road, just off the pad rim
    const yh = (24 - 20 + 3) * ppm;
    for (let i = 0; i < 2; i++) g.fillRect(0, yh + i * 0.6 * ppm, W, 0.25 * ppm);
    for (let i = 0; i < 2; i++)
      for (let x = 0; x < W; x += 2 * ppm) g.fillRect(x, yh + (1.8 + i * 0.6) * ppm, ppm, 0.25 * ppm);
  });
  const road = new THREE.Mesh(
    drape(new THREE.PlaneGeometry(rw, rl, 2, 12).rotateX(-Math.PI / 2).translate(cx, 0, -(ry0 - rl / 2)), 0.09),
    flat(new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.92, envMapIntensity: 0.25 })),
  );
  scene.add(road);
  // the haulers themselves: same three boxes as before, instanced (3 draw calls for all 45)
  {
    const parts = [
      [new THREE.BoxGeometry(16, 4, 2.6), body, new THREE.Matrix4().makeTranslation(0, 2.6, 0)],
      [new THREE.BoxGeometry(3.4, 3.5, 2.6), dark, new THREE.Matrix4().makeTranslation(10, 2.1, 0)],
      [new THREE.BoxGeometry(16, 0.5, 2.62), orange, new THREE.Matrix4().makeTranslation(0, 1.5, 0)],
    ].map(([geo, mat, off]) => [new THREE.InstancedMesh(geo, mat, ROWS * PER), off]);
    const G4 = new THREE.Matrix4(),
      E = new THREE.Euler(),
      Q = new THREE.Quaternion(),
      S = new THREE.Vector3(1, 1, 1),
      P = new THREE.Vector3(),
      I4 = new THREE.Matrix4();
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let k = 0; k < PER; k++) {
        const x = rx0 + (k + 0.5) * STALL,
          yr = rear(r) - 0.6, // rear doors, just behind the stop bar
          yf = yr - (LEN - 1.2), // cab front
          y = yr - 8, // trailer centre (local origin; the rear is local -x)
          hr = DEF.landH(x, yr),
          hf = DEF.landH(x, yf);
        // local +x (cab) points away from the pad, i.e. course -y = world +z; pitched to the slope
        E.set(0, -Math.PI / 2, Math.atan2(hf - hr, LEN), 'XYZ');
        Q.setFromEuler(E);
        P.copy(toW(x, y, (hr + hf) / 2 + 0.1));
        G4.compose(P, Q, S);
        for (const [im, off] of parts) im.setMatrixAt(n, I4.multiplyMatrices(G4, off));
        n++;
      }
    for (const [im] of parts) scene.add(im);
  }
  // team building behind the trucks: two-storey offices with a glass front facing the paddock, a taller glass
  // entrance atrium, an orange fascia, the X1 RACING sign and roof plant
  {
    const BW = 110,
      BD = 26,
      BH = 9,
      by0 = LOT.y1, // front face
      bcy = by0 - BD / 2,
      floor = DEF.landH(cx, by0) + 0.1,
      sink = 4; // walls run below the ground where it rises behind
    const wall = new THREE.MeshStandardMaterial({ color: 0xdfe2e4, roughness: 0.75, envMapIntensity: 0.4 });
    const glassT = tex(512, 128, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#5b7a96');
      gr.addColorStop(0.5, '#1f3346');
      gr.addColorStop(1, '#2a4257');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9ced2';
      for (let x = 0; x <= W; x += W / 16) g.fillRect(x - 2, 0, 4, H);
      g.fillRect(0, H / 2 - 3, W, 6);
      g.fillRect(0, 0, W, 4);
      g.fillRect(0, H - 4, W, 4);
    });
    const glass = (w, h) => {
      const t = glassT.clone();
      t.needsUpdate = true;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(w / 24, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.15, metalness: 0.5, envMapIntensity: 1.2 });
    };
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.copy(toW(x, y, z));
      scene.add(m);
      return m;
    };
    box(BW, BH + sink, BD, wall, cx, bcy, floor + (BH - sink) / 2); // main block
    box(BW - 6, 6.2, 0.4, glass(BW - 6, 6.2), cx, by0 + 0.1, floor + 4.3); // glass front, both storeys
    box(BW + 0.6, 1.1, BD + 0.6, orange, cx, bcy, floor + BH + 0.2); // fascia
    box(BW - 2, 0.25, BD - 2, dark, cx, bcy, floor + BH + 0.8); // roof
    // entrance atrium: glass box standing proud of the front, taller than the offices, with a canopy
    box(18, BH + 4 + sink, 8, glass(18, BH + 4), cx, by0 + 3, floor + (BH + 4 - sink) / 2);
    box(20, 0.6, 10, orange, cx, by0 + 3, floor + BH + 4.3);
    box(14, 0.4, 5, wall, cx, by0 + 9, floor + 3.6); // canopy over the doors
    // sign on the atrium parapet
    const signT = tex(1024, 192, (g, W, H) => {
      g.fillStyle = '#1b2026';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#e8690f';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'italic 800 150px "Barlow Condensed",Arial';
      g.fillText('X1 RACING', W / 2, H / 2 + 6);
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3),
      new THREE.MeshStandardMaterial({ map: signT, roughness: 0.6 }),
    );
    sign.position.copy(toW(cx, by0 + 7.05, floor + BH + 2.3));
    sign.rotation.y = Math.PI; // faces the paddock
    scene.add(sign);
    // roof plant
    for (const dx of [-42, -28, -16, 16, 28, 42]) box(5, 2, 4, wall, cx + dx, bcy - 2, floor + BH + 1.9);
    // flagpoles on the pavement either side of the doors
    for (const dx of [-16, 16]) box(0.25, 12, 0.25, wall, cx + dx, by0 + 6, floor + 6);
  }
  const tw = new THREE.Mesh(new THREE.BoxGeometry(7, 20, 7), dark);
  tw.position.copy(toW(PAD.x + 90, PAD.y - 46, PAD.h + 10));
  scene.add(tw);
  const tc = new THREE.Mesh(new THREE.BoxGeometry(11, 3, 11), orange);
  tc.position.copy(toW(PAD.x + 90, PAD.y - 46, PAD.h + 20));
  scene.add(tc);
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(130, 7, 14),
    new THREE.MeshStandardMaterial({ color: 0x55606b, roughness: 0.8 }),
  );
  stand.position.copy(toW(PAD.x + 190, -178, 6));
  stand.rotation.x = 0.0;
  scene.add(stand);
  // trees + town on the shore, harbour hills across the water
  const rnd = (a, b) => a + Math.random() * (b - a);
  const tr = new THREE.InstancedMesh(
      new THREE.ConeGeometry(4, 13, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c4a2d, roughness: 1, envMapIntensity: 0.2 }),
      900,
    ),
    M = new THREE.Matrix4();
  for (let i = 0; i < 900; i++) {
    let x, y;
    do {
      x = rnd(-3300, 3300);
      y = DEF.shoreY(x) - rnd(130, 620);
    } while (x > PAD.x - 100 && x < PAD.x + 100 && y > PAD.y - 260); // not on the hauler park or the team building
    M.makeScale(1, rnd(0.7, 1.5), 1);
    M.setPosition(x, DEF.landH(x, y) + 6, -y);
    tr.setMatrixAt(i, M);
  }
  scene.add(tr);
  const bl = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe4e0d8, roughness: 0.8, envMapIntensity: 0.4 }),
    170,
  );
  const c2 = new THREE.Color();
  for (let i = 0; i < 170; i++) {
    const north = i % 2 === 0;
    const x = rnd(-3600, 3600),
      y = north ? rnd(2600, 2900) : -rnd(760, 1000),
      h = north ? rnd(10, 55) : rnd(8, 40),
      w = rnd(20, 70);
    M.makeScale(w, h, rnd(20, 60));
    M.setPosition(x, h / 2 + (north ? 1 : DEF.landH(x, y)), -y);
    bl.setMatrixAt(i, M);
    c2.setHSL(0.09, rnd(0.02, 0.15), rnd(0.72, 0.92));
    bl.setColorAt(i, c2);
  }
  scene.add(bl);
  const hg = new THREE.PlaneGeometry(13000, 1500, 180, 16).rotateX(-Math.PI / 2),
    hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i),
      z = hp.getZ(i),
      t = (z + 750) / 1500;
    const nz = Math.sin(x * 0.0023) * 40 + Math.sin(x * 0.0061 + 1) * 22 + Math.sin(x * 0.013 + 2) * 11;
    hp.setY(
      i,
      Math.max(-2, (95 + nz) * (1 - t) ** 0.7 * Math.min(1, (1 - t) * 6) * (z < 660 ? 1 : 0) * 1 + (z > 600 ? -3 : 0)),
    );
  }
  hg.computeVertexNormals();
  const hills = new THREE.Mesh(
    hg,
    new THREE.MeshStandardMaterial({ color: 0x3f5a48, roughness: 1, envMapIntensity: 0.15 }),
  );
  hills.position.z = -3600;
  scene.add(hills);
}
