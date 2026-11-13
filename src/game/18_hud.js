/* ---------- 2D overlay ---------- */
const o2 = $('o2d'),
  g2 = o2.getContext('2d');
let W2 = 1,
  H2 = 1,
  dpr2 = 1;
function resize() {
  if (renderer.xr.isPresenting) return;
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  dpr2 = Math.min(devicePixelRatio || 1, 2);
  o2.width = w * dpr2;
  o2.height = h * dpr2;
  W2 = w;
  H2 = h;
}
addEventListener('resize', resize);
function proj(v) {
  const p = v.clone().project(cam),
    behind = v.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())) < 0;
  return { x: (p.x * 0.5 + 0.5) * W2, y: (-p.y * 0.5 + 0.5) * H2, behind };
}
function marker() {
  g2.setTransform(dpr2, 0, 0, dpr2, 0, 0);
  g2.clearRect(0, 0, W2, H2);
  const s = G.s;
  // the Falcon 9 launch shot and the opening sequence are clean pictures: no pitch ladder, no spire markers
  if (G.f9cam || G.intro) return;
  if (G.view === 4) {
    tvTag();
    return;
  }
  if (G.view === 3) {
    deckTag();
    return;
  }
  if (G.view === 1) horizon();
  if (!G.s) return;
  if (G.land) {
    const p = proj(toW(PAD.x, PAD.y, PAD.h));
    if (!p.behind) {
      g2.strokeStyle = '#e8690f';
      g2.lineWidth = 3;
      g2.strokeRect(p.x - 26, p.y - 26, 52, 52);
    }
    return;
  }
  const onCourse = G.running && G.next < SP.length;
  const tgtS = onCourse ? SP[G.next] : null;
  const tx = onCourse ? tgtS.x : 0,
    ty = onCourse ? tgtS.y : (DEF.gate.a[1] + DEF.gate.b[1]) / 2;
  const h = -s.p[2];
  const colr = !onCourse ? '#fff' : tgtS.side === 'L' ? '#ff3b3b' : '#21d97e';
  const v = toW(tx, ty, Math.max(h, 12));
  let p = proj(v);
  const m = 46;
  const off = p.behind || p.x < m || p.x > W2 - m || p.y < m || p.y > H2 - m;
  const d = Math.hypot(tx - s.p[1], ty - s.p[0]);
  if (off) {
    let dx = p.x - W2 / 2,
      dy = p.y - H2 / 2;
    if (p.behind) {
      dx = -dx;
      dy = -dy;
    }
    const a = Math.atan2(dy, dx),
      r = Math.min((W2 / 2 - 70) / Math.abs(Math.cos(a) || 0.001), (H2 / 2 - 120) / Math.abs(Math.sin(a) || 0.001)),
      x = W2 / 2 + Math.cos(a) * r,
      y = H2 / 2 + Math.sin(a) * r;
    g2.save();
    g2.translate(x, y);
    g2.rotate(a);
    g2.fillStyle = colr;
    g2.beginPath();
    g2.moveTo(22, 0);
    g2.lineTo(-12, -16);
    g2.lineTo(-5, 0);
    g2.lineTo(-12, 16);
    g2.closePath();
    g2.fill();
    g2.restore();
    g2.font = '600 15px "IBM Plex Mono",monospace';
    g2.textAlign = 'center';
    g2.fillStyle = '#fff';
    g2.fillText(Math.round(d * 3.28) + ' ft', x, y + 32);
    return;
  }
  // brackets on the spire and a sweeping arrow on the side to pass
  const size = clamp(5200 / Math.max(d, 60), 26, 120),
    x = p.x,
    y = p.y;
  g2.lineWidth = 3;
  g2.strokeStyle = colr;
  g2.shadowColor = 'rgba(0,0,0,.6)';
  g2.shadowBlur = 6;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    g2.beginPath();
    g2.moveTo(x + sx * size, y + sy * (size * 0.5));
    g2.lineTo(x + sx * size, y + sy * size);
    g2.lineTo(x + sx * (size * 0.5), y + sy * size);
    g2.stroke();
  }
  if (onCourse) {
    const left = tgtS.side === 'L';
    const sideX = left ? 1 : -1; // spire stays on your left, so you pass to its right
    const ax = x + sideX * (size + 26);
    g2.fillStyle = colr;
    g2.save();
    g2.translate(ax, y);
    g2.scale(left ? -1 : 1, 1);
    for (let i = 0; i < 3; i++) {
      const o = i * 20 - ((performance.now() / 120) % 20);
      g2.globalAlpha = 0.45 + 0.2 * i;
      g2.beginPath();
      g2.moveTo(-14 + o, -20);
      g2.lineTo(4 + o, 0);
      g2.lineTo(-14 + o, 20);
      g2.lineTo(-24 + o, 20);
      g2.lineTo(-6 + o, 0);
      g2.lineTo(-24 + o, -20);
      g2.closePath();
      g2.fill();
    }
    g2.restore();
    g2.globalAlpha = 1;
  }
  g2.shadowBlur = 4;
  g2.font = '700 17px "Barlow Condensed",sans-serif';
  g2.textAlign = 'center';
  g2.fillStyle = '#fff';
  g2.fillText(
    (onCourse ? (tgtS.side === 'L' ? 'LEFT TURN' : 'RIGHT TURN') + '  ' : 'START / FINISH  ') +
      Math.round(d * 3.28) +
      ' ft',
    x,
    y + size + 20,
  );
  g2.shadowBlur = 0;
}
function horizon() {
  const s = G.s,
    cx = W2 / 2,
    cy = H2 / 2;
  g2.save();
  g2.translate(cx, cy);
  g2.rotate(-s.phi);
  const ppd = H2 / 74;
  g2.strokeStyle = 'rgba(120,255,190,.85)';
  g2.fillStyle = 'rgba(120,255,190,.9)';
  g2.lineWidth = 1.6;
  g2.font = '600 12px "IBM Plex Mono",monospace';
  const th = s.theta / D2R;
  g2.beginPath();
  g2.moveTo(-W2 * 0.8, th * ppd);
  g2.lineTo(-140, th * ppd);
  g2.moveTo(140, th * ppd);
  g2.lineTo(W2 * 0.8, th * ppd);
  g2.stroke();
  for (let a = -20; a <= 20; a += 10) {
    if (!a) continue;
    const y = (th - a) * ppd;
    g2.beginPath();
    g2.moveTo(-50, y);
    g2.lineTo(50, y);
    g2.stroke();
    g2.fillText(a, 56, y + 4);
  }
  g2.restore();
  g2.strokeStyle = 'rgba(120,255,190,.9)';
  g2.lineWidth = 2;
  g2.beginPath();
  g2.moveTo(cx - 34, cy);
  g2.lineTo(cx - 12, cy);
  g2.lineTo(cx, cy + 9);
  g2.lineTo(cx + 12, cy);
  g2.lineTo(cx + 34, cy);
  g2.stroke();
}
const mp = $('map'),
  mg = mp.getContext('2d');
let mapBG = null;
const xs = P.map((p) => p.x),
  ys = P.map((p) => p.y),
  x0 = Math.min(...xs, PAD.x) - 60,
  x1 = Math.max(...xs) + 60,
  y0 = Math.min(...ys, PAD.y) - 40,
  y1 = Math.max(...ys) + 60;
const ms = Math.min(530 / (x1 - x0), 346 / (y1 - y0)),
  mx = (x) => 270 + (x - (x0 + x1) / 2) * ms,
  my = (y) => 178 - (y - (y0 + y1) / 2) * ms;
function map() {
  const c = mg;
  c.clearRect(0, 0, 540, 356);
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,255,255,.2)';
  c.lineWidth = 11;
  c.beginPath();
  P.forEach((p, i) => (i ? c.lineTo(mx(p.x), my(p.y)) : c.moveTo(mx(p.x), my(p.y))));
  c.closePath();
  c.stroke();
  c.strokeStyle = '#f4f1ec';
  c.lineWidth = 2.5;
  c.stroke();
  if (G.showPath) {
    c.strokeStyle = '#ffc53d';
    c.lineWidth = 7;
    c.beginPath();
    for (let k = 0; k < 70; k++) {
      const p = P[(G.idx + k) % N];
      k ? c.lineTo(mx(p.x), my(p.y)) : c.moveTo(mx(p.x), my(p.y));
    }
    c.stroke();
  }
  c.fillStyle = '#f4f1ec';
  c.fillRect(mx(0) - 2, my(DEF.gate.b[1]), 5, my(DEF.gate.a[1]) - my(DEF.gate.b[1]));
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '700 21px "Barlow Condensed",sans-serif';
  SP.forEach((s, i) => {
    c.fillStyle = s.side === 'L' ? '#ff3b3b' : '#21d97e';
    c.beginPath();
    c.arc(mx(s.x), my(s.y), i === G.next ? 17 : 13, 0, 7);
    c.fill();
    if (i === G.next) {
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.stroke();
    }
    c.fillStyle = '#0b0e12';
    c.fillText(i + 1, mx(s.x), my(s.y) + 1);
  });
  c.fillStyle = '#e8690f';
  c.fillRect(mx(PAD.x) - 6, my(PAD.y) - 6, 12, 12);
  const s = G.s,
    x = mx(s.p[1]),
    y = my(s.p[0]);
  c.save();
  c.translate(x, y);
  c.rotate(s.psi);
  c.fillStyle = '#fff';
  c.strokeStyle = '#0b0e12';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(0, -17);
  c.lineTo(11, 13);
  c.lineTo(0, 7);
  c.lineTo(-11, 13);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}
const ARROW = {
  L: 'M30 6 12 24l18 18 6-6-12-12 12-12z',
  R: 'M18 6l18 18-18 18-6-6 12-12-12-12z',
  G: 'M8 21h22L20 11l5-5 18 18-18 18-5-5 10-10H8z',
};
let hudT = 0;
function hud(now) {
  if (!XR()) marker();
  if (now - hudT < 70) return;
  hudT = now;
  const s = G.s;
  const onC = G.next < SP.length,
    sp = SP[G.next];
  const e = $('nextArrow');
  if (G.land) {
    $('nextTitle').textContent = G.land.down ? 'LANDING' : 'RETURNING TO PAD';
    $('nextSub').textContent =
      Math.round(Math.hypot(s.p[1] - PAD.x, s.p[0] - PAD.y) * 3.28) + ' ft out. Press L to cancel';
    e.style.background = 'var(--x1)';
    $('arrowP').setAttribute('d', 'M24 42L8 24h10V6h12v18h10z');
  } else if (G.foldT > 0) {
    const op = G.foldTarget === 0 || G.foldWait > 0,
      cl = G.foldTarget === 1;
    $('nextTitle').textContent = cl ? 'FOLDING' : op ? 'UNFOLDING' : 'FOLDED';
    $('nextSub').textContent = op || cl ? Math.round((1 - G.foldT) * 100) + '% open' : 'Press F to unfold';
    e.style.background = 'var(--x1)';
    $('arrowP').setAttribute('d', 'M6 21h36v6H6z');
  } else if (G.mode === 'player' && s.onGround && !G.liftReq) {
    $('nextTitle').textContent = 'READY TO LIFT OFF';
    $('nextSub').textContent = TC.on ? 'Tap Take off, then hold Pushers' : 'Press A or Enter, then hold RT or Shift';
    e.style.background = 'var(--x1)';
    $('arrowP').setAttribute('d', 'M24 6l16 18h-10v18H18V24H8z');
  } else if (!G.running) {
    $('nextTitle').textContent = 'START GATE';
    $('nextSub').textContent = 'Fly between the checkered spires';
    e.style.background = '#f4f1ec';
    $('arrowP').setAttribute('d', ARROW.G);
    G._nx = -1;
  } else if (onC) {
    $('nextTitle').textContent = 'TURN ' + (G.next + 1) + ' ' + (sp.side === 'L' ? 'LEFT' : 'RIGHT');
    $('nextSub').textContent =
      'Keep the ' + (sp.side === 'L' ? 'red' : 'green') + ' spire on your ' + (sp.side === 'L' ? 'left' : 'right');
    e.style.background = sp.side === 'L' ? 'var(--port)' : 'var(--stbd)';
    $('arrowP').setAttribute('d', ARROW[sp.side]);
  } else {
    $('nextTitle').textContent = 'FINISH';
    $('nextSub').textContent = 'Fly between the checkered spires';
    e.style.background = '#f4f1ec';
    $('arrowP').setAttribute('d', ARROW.G);
  }
  const q = $('seq');
  q.innerHTML = '';
  for (let k = G.running ? 1 : 0; k <= (G.running ? 3 : 2); k++) {
    const j = G.next + k;
    if (j > SP.length) break;
    const c = document.createElement('span');
    if (j === SP.length) {
      c.textContent = 'F';
      c.style.background = '#f4f1ec';
    } else {
      c.textContent = j + 1;
      c.style.background = SP[j].side === 'L' ? 'var(--port)' : 'var(--stbd)';
    }
    q.append(c);
  }
  $('lapNo').textContent = G.running ? 'LAP ' + G.lap : s.onGround ? 'ON THE PAD' : 'OUT LAP';
  $('clock').textContent = fmt(G.running ? G.lapT + G.pen : 0);
  const refB = G.mode === 'demo' ? G.bestSI : G.bestYou,
    de = $('delta');
  if (G.running && refB) {
    const prog = G.idx / N;
    const dl = G.lapT + G.pen - refB * prog;
    de.textContent = (dl >= 0 ? '+' : '-') + Math.abs(dl).toFixed(2);
    de.style.color = dl <= 0 ? 'var(--stbd)' : 'var(--port)';
  } else {
    de.textContent = G.pen ? '+' + G.pen + ' s penalty' : '';
    de.style.color = 'var(--warn)';
  }
  $('spd').textContent = Math.round(s.V * 2.23694);
  $('alt').textContent = Math.round(-s.p[2] * 3.28084);
  $('bP').style.width = clamp((s.P / 2000) * 100, 0, 100) + '%';
  $('bP').style.background = s.P > 1500 ? 'var(--warn)' : 'var(--x1)';
  $('vP').textContent = Math.round(s.P);
  {
    const lbF = s.fuel * 2.20462;
    $('bF').style.width = clamp(s.fuel / C.fuelKg, 0, 1) * 100 + '%';
    $('bF').style.background = lbF < 30 ? 'var(--port)' : 'var(--stbd)';
    $('vF').textContent = Math.min(200, lbF).toFixed(1) + ' lb';
  }
  $('bS').style.width = s.soc * 100 + '%';
  {
    const kw = Math.round(s.battKW);
    $('vLto').textContent = (kw > 0 ? '-' : kw < 0 ? '+' : '') + Math.abs(kw) + ' KW';
    $('cLto').className = 'chip' + (kw > 0 ? ' dis' : kw < 0 ? ' chg' : '');
    $('bS').style.background = kw > 0 ? 'var(--warn)' : kw < 0 ? 'var(--stbd)' : 'var(--cyan)';
  }
  $('vS').textContent = Math.round(s.soc * 100) + '%';
  $('bG').style.width = clamp(s.nz / 3, 0, 1) * 100 + '%';
  $('vG').textContent = s.nz.toFixed(1) + ' g';
  $('cAlt').classList.toggle('on', G.mode === 'demo' || G.altHold);
  $('vBoost').textContent = Math.round((s.boostCmd || 0) * 100) + '%';
  $('vHold').textContent = G.mode === 'demo' || G.land || G.altHold ? Math.round(s.hT * 3.28084) + ' FT' : 'OFF';
  $('cBoost').classList.toggle('on', s.boostOn);
  $('vTh').textContent = Math.round(s.spool[8] * s.spool[8] * 100) + '%';
  {
    const bk = Math.abs(s.phi / D2R);
    $('cBank').textContent = Math.round(bk) + '°';
    $('bB').style.width = clamp(bk / 72, 0, 1) * 100 + '%';
  }
  if (performance.now() > bT) $('banner').style.opacity = 0;
  {
    const sh = $('sndHint');
    if (sh) sh.hidden = !!(muted || (ac && ac.state === 'running'));
  }
  map();
  syncFold();
  syncViewBtns();
  touchSync();
  lbPillSync();
  if (XR()) vrPanel();
}
