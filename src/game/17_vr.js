/* ---------- VR (WebXR, Meta Quest) ----------
   The headset rides on `rig`: in the cockpit the rig is fixed to the airframe at the eye point; in chase and zoomed out it
   follows the chase position, turning with the heading but never rolling or pitching. The HUD is a glass panel on the
   rig, shown only in the cockpit. */
const XR = () => renderer.xr.isPresenting;
const yAxis = new THREE.Vector3(0, 1, 0),
  flipY = new THREE.Quaternion().setFromAxisAngle(yAxis, Math.PI);
function vrCam(pos, hdg, F, k) {
  if (G.view === 4) camVis(0);
  // HUD glass: only in the cockpit, at the eye-line spot; the outside and spectator views show the scene alone
  vPanel.visible = G.view === 1;
  if (G.view === 3) vrDeck(pos, k);
  else if (G.view === 5) vrPool();
  else if (G.view === 1) {
    craft.updateMatrixWorld(true);
    rig.position.copy(EYE.clone().add(inner.position).applyMatrix4(craft.matrixWorld));
    rig.quaternion.copy(craft.quaternion).multiply(flipY);
  } else {
    const back = G.view === 0 ? 11 : 58,
      up = G.view === 0 ? 3.6 : 28;
    const wantP = pos
        .clone()
        .addScaledVector(hdg, -back)
        .add(new THREE.Vector3(0, up, 0)),
      wantL = pos.clone().addScaledVector(hdg, G.view === 0 ? 9 : 70);
    if (!camInit || camPos.distanceTo(wantP) > back * 4) {
      camPos.copy(wantP);
      camLook.copy(wantL);
      camInit = true;
    }
    camPos.lerp(wantP, k);
    camLook.lerp(wantL, k * 1.3);
    if (camPos.y < 1.6) camPos.y = 1.6;
    const d = camLook.clone().sub(camPos);
    rig.position.copy(camPos);
    rig.quaternion.setFromAxisAngle(yAxis, Math.atan2(-d.x, -d.z));
  }
  rig.updateMatrixWorld(true);
}
// HUD glass: just below the line of sight, tilted toward the eyes
const VW = 1024,
  VH = 400,
  vc = document.createElement('canvas');
vc.width = VW;
vc.height = VH;
const vg = vc.getContext('2d'),
  vTex = new THREE.CanvasTexture(vc);
vTex.encoding = THREE.sRGBEncoding;
vTex.anisotropy = 8;
const vMat = (o) =>
  new THREE.MeshBasicMaterial({
    map: o,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
const vPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.84, (0.84 * VH) / VW), vMat(vTex));
vPanel.position.set(0, -0.36, -0.95);
vPanel.rotation.x = -0.36;
vPanel.renderOrder = 999;
vPanel.visible = false;
rig.add(vPanel);
const bc = document.createElement('canvas');
bc.width = 1024;
bc.height = 200;
const bg = bc.getContext('2d'),
  bTex = new THREE.CanvasTexture(bc);
bTex.encoding = THREE.sRGBEncoding;
const vBan = new THREE.Mesh(new THREE.PlaneGeometry(1.1, (1.1 * 200) / 1024), vMat(bTex));
vBan.position.set(0, 0.02, -1.7);
vBan.renderOrder = 1000;
vBan.visible = false;
rig.add(vBan);
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function vBar(c, x, y, w, lab, f, col, val) {
  c.font = '600 24px "Barlow Condensed",sans-serif';
  c.fillStyle = '#aab0b8';
  c.textAlign = 'left';
  c.fillText(lab, x, y + 9);
  c.fillStyle = 'rgba(255,255,255,.18)';
  c.fillRect(x + 92, y, w - 200, 12);
  c.fillStyle = col;
  c.fillRect(x + 92, y, (w - 200) * clamp(f, 0, 1), 12);
  c.font = '600 24px "IBM Plex Mono",monospace';
  c.fillStyle = '#f4f1ec';
  c.textAlign = 'right';
  c.fillText(val, x + w, y + 10);
}
function vrPanel() {
  const s = G.s,
    c = vg,
    now = performance.now();
  c.clearRect(0, 0, VW, VH);
  rr(c, 4, 4, VW - 8, VH - 8, 26);
  c.fillStyle = 'rgba(8,12,18,.66)';
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.22)';
  c.lineWidth = 2;
  c.stroke();
  c.textBaseline = 'middle';
  // next target with a bearing arrow (up = straight ahead)
  const onC = G.running && G.next < SP.length,
    sp = SP[G.next],
    col =
      G.land || G.foldT > 0 || (G.mode === 'player' && s.onGround)
        ? '#e8690f'
        : onC
          ? sp.side === 'L'
            ? '#ff3b3b'
            : '#21d97e'
          : '#f4f1ec';
  const tx = G.land ? PAD.x : onC ? sp.x : 0,
    ty = G.land ? PAD.y : onC ? sp.y : (DEF.gate.a[1] + DEF.gate.b[1]) / 2;
  let rel = Math.atan2(tx - s.p[1], ty - s.p[0]) - s.psi;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  c.fillStyle = col;
  rr(c, 24, 22, 96, 96, 14);
  c.fill();
  c.save();
  c.translate(72, 70);
  c.rotate(rel);
  c.fillStyle = '#0b0e12';
  c.beginPath();
  c.moveTo(0, -34);
  c.lineTo(24, 4);
  c.lineTo(8, 4);
  c.lineTo(8, 32);
  c.lineTo(-8, 32);
  c.lineTo(-8, 4);
  c.lineTo(-24, 4);
  c.closePath();
  c.fill();
  c.restore();
  c.textAlign = 'left';
  c.fillStyle = '#f4f1ec';
  c.font = '700 50px "Barlow Condensed",sans-serif';
  c.fillText($('nextTitle').textContent, 140, 52);
  c.font = '500 26px "Barlow Condensed",sans-serif';
  c.fillStyle = '#c3c6cc';
  c.fillText(
    G.foldT > 0 || G.land || (G.mode === 'player' && s.onGround && !G.liftReq)
      ? $('nextSub')
          .textContent.replace('Press A or Enter, then hold RT or Shift', 'Press A, then hold the right trigger')
          .replace('Press F to unfold', 'Press the left stick to unfold')
          .replace('Press L to cancel', 'Left grip cancels')
      : Math.round(Math.hypot(tx - s.p[1], ty - s.p[0]) * 3.28) + ' ft',
    140,
    96,
  );
  // lap clock
  c.textAlign = 'right';
  c.font = '700 26px "Barlow Condensed",sans-serif';
  c.fillStyle = G.mode === 'demo' ? '#e8690f' : '#c3c6cc';
  c.fillText($('lapNo').textContent + (G.mode === 'demo' ? '  ·  SI PILOT' : ''), VW - 30, 40);
  c.font = '600 62px "IBM Plex Mono",monospace';
  c.fillStyle = '#f4f1ec';
  c.fillText($('clock').textContent, VW - 30, 92);
  c.font = '600 22px "IBM Plex Mono",monospace';
  c.fillStyle = '#aab0b8';
  c.fillText('LAST ' + $('tLast').textContent + '   BEST ' + $('tBest').textContent, VW - 30, 134);
  const dl = $('delta');
  if (dl.textContent) {
    c.fillStyle = dl.style.color.includes('stbd') ? '#21d97e' : dl.style.color.includes('port') ? '#ff3b3b' : '#ffc53d';
    c.textAlign = 'left';
    c.fillText(dl.textContent, 140, 134);
  }
  c.fillStyle = 'rgba(255,255,255,.14)';
  c.fillRect(24, 158, VW - 48, 2);
  // speed and altitude
  c.textAlign = 'left';
  c.font = '700 104px "Barlow Condensed",sans-serif';
  c.fillStyle = '#f4f1ec';
  const mph = String(Math.round(s.V * 2.23694));
  c.fillText(mph, 30, 236);
  const mw = c.measureText(mph).width;
  c.font = '600 26px "Barlow Condensed",sans-serif';
  c.fillStyle = '#aab0b8';
  c.fillText('MPH', 40 + mw, 262);
  c.textAlign = 'right';
  c.font = '700 104px "Barlow Condensed",sans-serif';
  c.fillStyle = '#f4f1ec';
  const ft = String(Math.round(-s.p[2] * 3.28084));
  c.fillText(ft, VW - 76, 236);
  c.font = '600 26px "Barlow Condensed",sans-serif';
  c.fillStyle = '#aab0b8';
  c.fillText('FT', VW - 30, 262);
  c.textAlign = 'center';
  c.font = '600 24px "IBM Plex Mono",monospace';
  c.fillStyle = G.altHold || G.mode === 'demo' ? '#21d97e' : '#aab0b8';
  c.fillText('ALT HOLD ' + $('vHold').textContent, VW / 2, 206);
  c.fillStyle = s.boostOn ? '#ffc53d' : '#aab0b8';
  c.fillText('BOOST ' + $('vBoost').textContent + '   PUSHERS ' + $('vTh').textContent, VW / 2, 246);
  // power, LTO, fuel
  const lbF = s.fuel * 2.20462,
    kw = Math.round(s.battKW);
  vBar(c, 30, 312, 470, 'POWER', s.P / 2000, s.P > 1500 ? '#ffc53d' : '#e8690f', Math.round(s.P) + ' hp');
  vBar(
    c,
    30,
    354,
    470,
    'FUEL',
    s.fuel / C.fuelKg,
    lbF < 30 ? '#ff3b3b' : '#21d97e',
    Math.min(200, lbF).toFixed(0) + ' lb',
  );
  vBar(
    c,
    524,
    312,
    470,
    'LTO',
    s.soc,
    kw > 0 ? '#ffc53d' : kw < 0 ? '#21d97e' : '#58d7ff',
    Math.round(s.soc * 100) + '%',
  );
  vBar(c, 524, 354, 470, 'LOAD', s.nz / 3, '#ffc53d', s.nz.toFixed(1) + ' g');
  vTex.needsUpdate = true;
  // event banner (lap times, penalties)
  const on = now < VRB.until;
  vBan.visible = on;
  if (on && VRB.dirty) {
    VRB.dirty = false;
    const b = bg;
    b.clearRect(0, 0, 1024, 200);
    rr(b, 4, 4, 1016, 192, 24);
    b.fillStyle = 'rgba(8,12,18,.7)';
    b.fill();
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.fillStyle = VRB.c;
    b.font = '700 italic 84px "Barlow Condensed",sans-serif';
    b.fillText(VRB.a, 512, VRB.b ? 78 : 100);
    if (VRB.b) {
      b.fillStyle = '#c3c6cc';
      b.font = '500 34px "Barlow Condensed",sans-serif';
      b.fillText(VRB.b, 512, 152);
    }
    bTex.needsUpdate = true;
  }
}

/* VR ship view. Auto: the deck spot changes for the best view and you turn to follow the SkyRacer, like the screen view.
   Manual: you stay put facing outboard; A moves you to the deck spot nearest the SkyRacer. Zoom (right stick) moves your
   eye along the line toward the SkyRacer, like binoculars, never closer than 25 m. */
const VRS = { auto: true, k: null, zoom: 1, zt: 1, range: false, yaw: null };
function vrNearest() {
  const t = ned(G.s.p);
  let best = null;
  for (const c of deckCands()) {
    const d = c.p.distanceTo(t),
      f = c.n.dot(t.clone().sub(c.p)) / d,
      sc = d * (f < -0.1 || !deckClear(c, t) ? 3 : 1);
    if (!best || sc < best.sc) best = { c, sc };
  }
  VRS.auto = false;
  VRS.k = best.c.k;
  VRS.yaw = null;
  banner(
    'SHIP ' + (best.c.ship + 1) + (best.c.side ? ' PORT' : ' STARBOARD') + (best.c.fwd ? ' FWD' : ' AFT'),
    'Manual. Auto is in the menu (Y).',
    1300,
  );
}
function vrAutoT() {
  VRS.auto = !VRS.auto;
  VRS.yaw = null;
  if (!VRS.auto && VRS.k == null) VRS.k = (DECK.cur || deckCands()[0]).k;
  banner(
    VRS.auto ? 'AUTO VIEW' : 'MANUAL VIEW',
    VRS.auto ? 'Follows the SkyRacer' : 'A moves you to the nearest deck',
    1300,
  );
}
const VIEWN = ['CHASE', 'COCKPIT', 'BIRD', 'SHIP', 'TV', 'POOL DECK'];
function vrDeck(pos, k) {
  const now = performance.now();
  let c;
  if (VRS.auto) c = deckPick(pos, now);
  else c = deckCands().find((x) => x.k === VRS.k) || deckPick(pos, now);
  if (!DECK.cur || DECK.cur.k !== c.k) VRS.yaw = null;
  DECK.cur = c;
  VRS.zoom = lerp(VRS.zoom, VRS.zt, 0.12);
  const to = pos.clone().sub(c.p),
    L = to.length(),
    go = Math.min(L * (1 - 1 / VRS.zoom), Math.max(0, L - 25));
  rig.position.copy(c.p).addScaledVector(to, go / Math.max(L, 1));
  const want = VRS.auto ? Math.atan2(-to.x, -to.z) : Math.atan2(-c.n.x, -c.n.z);
  if (VRS.yaw == null) VRS.yaw = want;
  else {
    let d = want - VRS.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    VRS.yaw += d * k * 0.6;
  }
  rig.quaternion.setFromAxisAngle(yAxis, VRS.yaw);
}
/* VR pool deck: standing on the pool deck about 10 m forward of the big screen, eye 1.7 m up, starting faced toward it so
   it is above you (about 19 degrees up). Head tracking does the rest: look round the deck, the course, the other ship.
   A swaps between the two ships. */
const VRP = { ship: 0, v: new THREE.Vector3(), w: new THREE.Vector3() };
function vrPool() {
  const o = SHIP.objs[VRP.ship];
  if (!o) return;
  o.updateMatrixWorld(true);
  o.localToWorld(VRP.v.set(0, 29.7 + 1.7 / SHIP.K, 8.5));
  o.localToWorld(VRP.w.set(0, 33.9, 0.43));
  rig.position.copy(VRP.v);
  const d = VRP.w.sub(VRP.v);
  rig.quaternion.setFromAxisAngle(yAxis, Math.atan2(-d.x, -d.z));
}
function vrPoolSwap() {
  VRP.ship = (VRP.ship + 1) % SHIP.place.length;
  banner('POOL DECK', 'Ship ' + (VRP.ship + 1) + '. A for the other ship', 1300);
}
// marker on the SkyRacer, an arrow in front of you when it is out of view, and the range finder label
const xrMat = (c) =>
  new THREE.MeshBasicMaterial({
    color: c,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    fog: false,
    toneMapped: false,
  });
const vMark = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 32), xrMat(0xe8690f));
vMark.renderOrder = 1001;
vMark.visible = false;
scene.add(vMark);
const vArrow = new THREE.Group();
{
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8).rotateX(Math.PI / 2), xrMat(0xe8690f));
  sh.position.z = -0.02;
  const hd = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 12).rotateX(Math.PI / 2), xrMat(0xe8690f));
  hd.position.z = 0.075;
  vArrow.add(sh, hd);
  vArrow.children.forEach((m) => (m.renderOrder = 1002));
}
vArrow.visible = false;
scene.add(vArrow);
const rc = document.createElement('canvas');
rc.width = 512;
rc.height = 128;
const rgx = rc.getContext('2d'),
  rTex = new THREE.CanvasTexture(rc);
rTex.encoding = THREE.sRGBEncoding;
const vRange = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: rTex,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    fog: false,
    toneMapped: false,
  }),
);
vRange.renderOrder = 1003;
vRange.visible = false;
scene.add(vRange);
let rT = 0;
function vrPointer() {
  const on = XR() && (G.view === 3 || G.view === 2);
  vMark.visible = vArrow.visible = vRange.visible = false;
  if (!on) return;
  const xc = renderer.xr.getCamera();
  xc.updateMatrixWorld(true);
  const hp = new THREE.Vector3().setFromMatrixPosition(xc.matrixWorld),
    fwd = new THREE.Vector3(0, 0, -1).transformDirection(xc.matrixWorld),
    t = ned(G.s.p),
    to = t.clone().sub(hp),
    d = to.length();
  vMark.visible = true;
  vMark.position.copy(t);
  vMark.scale.setScalar(Math.max(d * 0.022, 6));
  vMark.lookAt(hp);
  if (fwd.angleTo(to) > 0.24) {
    vArrow.visible = true;
    const dn = new THREE.Vector3(0, -1, 0).transformDirection(xc.matrixWorld);
    vArrow.position.copy(hp).addScaledVector(fwd, 0.9).addScaledVector(dn, 0.18);
    vArrow.lookAt(t);
  }
  if (VRS.range) {
    vRange.visible = true;
    vRange.position.copy(t).add(new THREE.Vector3(0, Math.max(d * 0.022, 6) * 1.9, 0));
    vRange.scale.set(d * 0.12, d * 0.03, 1);
    const now = performance.now();
    if (now - rT > 120) {
      rT = now;
      rgx.clearRect(0, 0, 512, 128);
      rr(rgx, 4, 4, 504, 120, 20);
      rgx.fillStyle = 'rgba(8,12,18,.72)';
      rgx.fill();
      rgx.textAlign = 'center';
      rgx.textBaseline = 'middle';
      rgx.fillStyle = '#f4f1ec';
      rgx.font = '600 50px "IBM Plex Mono",monospace';
      rgx.fillText(Math.round(d * 3.28084).toLocaleString() + ' ft  ' + Math.round(G.s.V * 2.23694) + ' mph', 256, 66);
      rTex.needsUpdate = true;
    }
  }
}

/* Touch controllers. One rule throughout: the left hand is the machine and the menu, the right hand is flying and where
   you look from.
   LEFT   stick yaw / climb    trigger boost    grip land on the pad    X altitude hold    Y menu    stick click fold
   RIGHT  stick bank / speed (forward accelerates, back brakes, centred holds)   trigger boost   grip hand over to SI
          A take off (watching SI: fly it)    B next view
          stick click path
   Ship view: A jumps to the deck nearest the SkyRacer, right stick zooms, right stick click range finder.
   Pool deck: A swaps ships.  Menu open: point with the right hand, trigger or A selects, B or Y closes; flying is held. */
const vPrev = {};
function vrInput() {
  if (!XR()) return;
  const ses = renderer.xr.getSession();
  if (!ses) return;
  let L = null,
    R = null;
  for (const src of ses.inputSources) {
    if (!src.gamepad) continue;
    if (src.handedness === 'left') L = src.gamepad;
    else if (src.handedness === 'right') R = src.gamepad;
  }
  if (!L && !R) return;
  const ax = (p, i) => (p ? dz(p.axes[i] || 0) : 0),
    bt = (p, i) => (p && p.buttons[i] ? p.buttons[i].value : 0);
  const ed = (p, h, i, f) => {
    const k = h + i,
      v = bt(p, i) > 0.5;
    if (v && !vPrev[k]) f();
    vPrev[k] = v;
  };
  if (VM.open) {
    vmInput(L, R, bt, ed);
    return;
  }
  const raw = (p, i) => (p ? p.axes[i] || 0 : 0),
    vL = stick(raw(L, 2), raw(L, 3)),
    vR = stick(raw(R, 2), raw(R, 3), true);
  inp.yaw = clamp(inp.yaw + vL[0], -1, 1);
  inp.climb = clamp(inp.climb - vL[1], -1, 1);
  inp.roll = clamp(inp.roll + vR[0], -1, 1);
  inp.pitch = clamp(inp.pitch - vR[1], -1, 1);
  if (bt(L, 0) > 0.5 || bt(R, 0) > 0.5) inp.boost = 1; // boost: either trigger, as a button
  if (F9_ON && (G.view === 3 || G.view === 5) && G.mode === 'demo') ed(L, 'L', 4, f9Count); // on the ship, watching SI: X starts the Falcon 9 countdown
  if (G.view === 3) {
    ed(R, 'R', 4, vrNearest);
    ed(R, 'R', 3, () => {
      VRS.range = !VRS.range;
      banner(VRS.range ? 'RANGE FINDER ON' : 'RANGE FINDER OFF', '', 900);
    });
    const zy = ax(R, 3);
    if (zy) VRS.zt = clamp(VRS.zt * (1 - zy * 0.035), 1, 12);
  } else if (G.view === 5) {
    ed(R, 'R', 4, vrPoolSwap);
    ed(R, 'R', 3, togglePath);
  } else {
    ed(R, 'R', 4, () => {
      if (G.mode === 'demo') reset('player');
      else takeoff();
    });
    ed(R, 'R', 3, togglePath);
  }
  ed(R, 'R', 5, () => {
    nextView();
    banner(VIEWN[G.view], '', 900);
  });
  ed(R, 'R', 1, handover);
  if (!(F9_ON && (G.view === 3 || G.view === 5) && G.mode === 'demo')) ed(L, 'L', 4, toggleAlt);
  ed(L, 'L', 5, () => vmT(true));
  ed(L, 'L', 1, land);
  ed(L, 'L', 3, toggleFold);
}
async function enterVR() {
  const b = $('bVR');
  const cur = renderer.xr.getSession();
  if (cur) {
    cur.end();
    return;
  }
  try {
    initAudio();
    const ses = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    renderer.xr.setReferenceSpaceType('local');
    if (renderer.xr.setFoveation) renderer.xr.setFoveation(1);
    await renderer.xr.setSession(ses);
    setView(1);
    camInit = false;
    b.textContent = 'Exit VR';
    $('menu').hidden = true;
    banner(
      G.mode === 'demo' ? 'SI PILOT' : 'YOUR MACHINE',
      (G.mode === 'demo' ? 'A to take over' : 'A to lift off') + '. Y for the menu',
      2600,
    );
    ses.addEventListener('end', () => {
      vmT(false);
      vPanel.visible = false;
      vBan.visible = false;
      rig.position.set(0, 0, 0);
      rig.quaternion.identity();
      camInit = false;
      b.textContent = 'VR';
      $('menu').hidden = false;
      resize();
    });
  } catch (e) {
    banner('VR UNAVAILABLE', String((e && e.message) || e).slice(0, 60), 2200, '#ffc53d');
  }
}
$('bVR').onclick = (e) => {
  enterVR();
  e.target.blur();
};
if (navigator.xr && navigator.xr.isSessionSupported)
  navigator.xr
    .isSessionSupported('immersive-vr')
    .then((ok) => {
      if (ok) {
        $('bVR').hidden = false;
        $('vrHelp').hidden = false;
      }
    })
    .catch(() => {});
