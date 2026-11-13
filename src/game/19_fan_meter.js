/* ---------- fan power meter: plan view of all 10 fans ---------- */
const fc = $('fans'),
  fx = fc.getContext('2d'),
  FAN = { on: false, hp: new Float32Array(10), pk: new Float32Array(10), spin: new Float32Array(10) };
const FW = 250,
  FH = 292,
  RINGS = [
    { u: 0, l: 1, x: 58, y: 62, n: 'FL' },
    { u: 2, l: 3, x: 192, y: 62, n: 'FR' },
    { u: 4, l: 5, x: 58, y: 172, n: 'RL' },
    { u: 6, l: 7, x: 192, y: 172, n: 'RR' },
  ],
  PUSH = [
    { i: 8, x: 96, y: 254, n: 'PL' },
    { i: 9, x: 154, y: 254, n: 'PR' },
  ];
function toggleFans() {
  FAN.on = !FAN.on;
  fc.hidden = !FAN.on;
  $('bFans').classList.toggle('on', FAN.on);
}
const fanCol = (f) => (f < 0.6 ? '#58d7ff' : f < 0.85 ? '#7dffb0' : f < 0.97 ? '#ffc53d' : '#ff3b3b');
const A0 = Math.PI * 0.75,
  AS = Math.PI * 1.5;
function arc(x, y, r, w, f, pk) {
  fx.lineCap = 'butt';
  fx.lineWidth = w;
  fx.strokeStyle = 'rgba(255,255,255,.14)';
  fx.beginPath();
  fx.arc(x, y, r, A0, A0 + AS);
  fx.stroke();
  const c = fanCol(f);
  fx.strokeStyle = c;
  fx.shadowColor = c;
  fx.shadowBlur = 9;
  fx.beginPath();
  fx.arc(x, y, r, A0, A0 + AS * Math.max(0.004, f));
  fx.stroke();
  fx.shadowBlur = 0;
  const a = A0 + AS * pk;
  fx.strokeStyle = '#fff';
  fx.lineWidth = 1.5;
  fx.beginPath();
  fx.moveTo(x + Math.cos(a) * (r - w / 2 - 1), y + Math.sin(a) * (r - w / 2 - 1));
  fx.lineTo(x + Math.cos(a) * (r + w / 2 + 1), y + Math.sin(a) * (r + w / 2 + 1));
  fx.stroke();
}
function blades(x, y, r, a, sp) {
  fx.strokeStyle = `rgba(88,215,255,${0.18 + 0.3 * Math.min(1, sp)})`;
  fx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const b = a + i * 2.094;
    fx.beginPath();
    fx.arc(x, y, r, b, b + 0.5);
    fx.stroke();
  }
}
function fanMeter(dt) {
  if (!FAN.on) return;
  const s = G.s,
    HP = X.HP,
    raw = new Float32Array(10);
  for (let d = 0; d < 4; d++) {
    const u = s.spool[2 * d] ** 2,
      l = s.spool[2 * d + 1] ** 2,
      a = Math.pow(u, 1.5),
      b = Math.pow(l, 1.5),
      t = a + b || 1;
    raw[2 * d] = ((s.ductP[d] / HP) * a) / t;
    raw[2 * d + 1] = ((s.ductP[d] / HP) * b) / t;
  }
  raw[8] = s.pushW[0] / HP;
  raw[9] = s.pushW[1] / HP;
  const FS = [...Array(8).fill(320), 320, 320],
    k = 1 - Math.exp(-dt * 14);
  for (let i = 0; i < 10; i++) {
    FAN.hp[i] += (raw[i] - FAN.hp[i]) * k;
    FAN.pk[i] = Math.max(FAN.hp[i], FAN.pk[i] - dt * 40);
    FAN.spin[i] += s.spool[i] * dt * 7 * (i % 2 ? -1 : 1);
  }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (fc.width !== FW * dpr) {
    fc.width = FW * dpr;
    fc.height = FH * dpr;
  }
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fx.clearRect(0, 0, FW, FH);
  // dark glass under each ring so the numbers read over bright sky and water
  fx.fillStyle = 'rgba(6,10,15,.58)';
  for (const r of RINGS) {
    fx.beginPath();
    fx.arc(r.x, r.y, 47, 0, 7);
    fx.fill();
  }
  for (const r of PUSH) {
    fx.beginPath();
    fx.arc(r.x, r.y, 31, 0, 7);
    fx.fill();
  }
  // airframe outline
  fx.strokeStyle = 'rgba(255,255,255,.3)';
  fx.lineWidth = 1;
  fx.beginPath();
  fx.moveTo(125, 8);
  fx.bezierCurveTo(150, 30, 150, 110, 142, 190);
  fx.lineTo(136, 232);
  fx.lineTo(114, 232);
  fx.lineTo(108, 190);
  fx.bezierCurveTo(100, 110, 100, 30, 125, 8);
  fx.fillStyle = 'rgba(6,10,15,.5)';
  fx.fill();
  fx.stroke();
  fx.beginPath();
  fx.moveTo(101, 62);
  fx.lineTo(98, 62);
  fx.moveTo(149, 62);
  fx.lineTo(152, 62);
  fx.moveTo(105, 172);
  fx.lineTo(98, 172);
  fx.moveTo(145, 172);
  fx.lineTo(152, 172);
  fx.stroke();
  fx.textAlign = 'center';
  fx.textBaseline = 'middle';
  for (const r of RINGS) {
    const fu = clamp(FAN.hp[r.u] / 320, 0, 1),
      fl = clamp(FAN.hp[r.l] / 320, 0, 1);
    arc(r.x, r.y, 41, 6, fu, clamp(FAN.pk[r.u] / 320, 0, 1));
    arc(r.x, r.y, 32, 6, fl, clamp(FAN.pk[r.l] / 320, 0, 1));
    blades(r.x, r.y, 24, FAN.spin[r.u], s.spool[r.u]);
    fx.font = '600 15px "IBM Plex Mono",monospace';
    fx.fillStyle = '#f6f3ee';
    fx.fillText(Math.round(FAN.hp[r.u]), r.x, r.y - 7);
    fx.fillStyle = '#dfe2e6';
    fx.fillText(Math.round(FAN.hp[r.l]), r.x, r.y + 8);
    fx.font = '700 12px "Barlow Condensed",sans-serif';
    fx.fillStyle = '#c3c6cc';
    fx.fillText(r.n, r.x, r.y + 36);
  }
  for (const r of PUSH) {
    const f = clamp(FAN.hp[r.i] / 320, 0, 1);
    arc(r.x, r.y, 25, 6, f, clamp(FAN.pk[r.i] / 320, 0, 1));
    blades(r.x, r.y, 17, FAN.spin[r.i], s.spool[r.i]);
    fx.font = '600 14px "IBM Plex Mono",monospace';
    fx.fillStyle = '#f6f3ee';
    fx.fillText(Math.round(FAN.hp[r.i]), r.x, r.y);
    fx.font = '700 11px "Barlow Condensed",sans-serif';
    fx.fillStyle = '#c3c6cc';
    fx.fillText(r.n, r.x, r.y + 21);
  }
  fx.font = '600 20px "IBM Plex Mono",monospace';
  fx.fillStyle = '#f6f3ee';
  fx.fillText(Math.round(s.P), 125, 112);
  fx.font = '700 11px "Barlow Condensed",sans-serif';
  fx.fillStyle = '#c3c6cc';
  fx.fillText('HP', 125, 128);
}
