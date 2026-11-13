/* ---------- VR menu ----------
   Y on the left controller opens it: a panel about a metre in front of you, where you are looking when you open it. Point
   with the right controller (a laser shows where), trigger or A to select, B or Y to close. While it is open the sticks
   and triggers do nothing, and when you are flying the sim holds still (SI keeps flying when you are only watching). */
const VM = {
  open: false,
  hover: -1,
  dirty: true,
  t: 0,
  btn: [],
  ray: new THREE.Raycaster(),
  hp: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  pausedByMenu: false,
};
const MW = 1024,
  MH = 760,
  mc = document.createElement('canvas');
mc.width = MW;
mc.height = MH;
const vmg = mc.getContext('2d'),
  mTex = new THREE.CanvasTexture(mc);
mTex.encoding = THREE.sRGBEncoding;
mTex.anisotropy = 8;
const vMenu = new THREE.Mesh(new THREE.PlaneGeometry(1.0, (1.0 * MH) / MW), vMat(mTex));
vMenu.renderOrder = 1004;
vMenu.visible = false;
rig.add(vMenu);
// right-hand laser and the dot where it lands
const vCtl = renderer.xr.getController(0),
  vCtl2 = renderer.xr.getController(1);
rig.add(vCtl, vCtl2);
for (const c of [vCtl, vCtl2])
  c.addEventListener('connected', (e) => {
    c.userData.hand = e.data && e.data.handedness;
  });
const vLaser = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
  new THREE.LineBasicMaterial({
    color: 0xe8690f,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    toneMapped: false,
  }),
);
vLaser.renderOrder = 1005;
vLaser.visible = false;
const vDot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), xrMat(0xffffff));
vDot.renderOrder = 1006;
vDot.visible = false;
vMenu.add(vDot);
const rightCtl = () => (vCtl.userData.hand === 'right' ? vCtl : vCtl2.userData.hand === 'right' ? vCtl2 : null);
// the buttons: label, state (lit when on), available, action
const VMB = () => {
  const demo = G.mode === 'demo',
    b = [];
  const row = (y, h, items) => {
    const gap = 14,
      w = (MW - 80 - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => b.push(Object.assign({ x: 40 + i * (w + gap), y, w, h }, it)));
  };
  row(96, 74, [
    {
      l: 'Fly it',
      on: () => !demo,
      a: () => {
        reset('player');
        vmT(false);
      },
    },
    {
      l: 'Watch SI',
      on: () => demo,
      a: () => {
        reset('demo');
        vmT(false);
      },
    },
  ]);
  row(
    218,
    64,
    [0, 1, 2, 3, 4, 5].map((v) => ({
      l: ['Chase', 'Cockpit', 'Bird', 'Ship', 'TV', 'Pool deck'][v],
      on: () => G.view === v,
      ok: () => viewOK(v),
      a: () => setView(v),
    })),
  );
  row(328, 64, [
    {
      l: 'Back to pad',
      a: () => {
        reset(demo ? 'demo' : 'player');
        vmT(false);
      },
    },
    {
      l: G.foldT > 0 ? 'Unfold' : 'Fold',
      ok: () => !demo && foldAtRest(),
      a: () => {
        toggleFold();
        vmT(false);
      },
    },
    {
      l: demo ? 'Take over' : 'Hand to SI',
      ok: () => !G.land,
      a: () => {
        handover();
        vmT(false);
      },
    },
    {
      l: 'Land',
      ok: () => !demo && !G.land,
      a: () => {
        land();
        vmT(false);
      },
    },
  ]);
  row(438, 64, [
    { l: 'Max detail', on: () => SHIP.on, a: shipsT },
    { l: 'Twilight', on: () => TWI.on, a: () => twiT() },
    { l: LIV.list[LIV.i].name, on: () => LIV.i > 0, a: liveryNext },
    { l: 'Path', on: () => G.showPath, a: togglePath },
    { l: 'Sound', on: () => !muted, a: mute },
    { l: 'Alt hold', on: () => G.altHold, ok: () => !demo, a: toggleAlt },
  ]);
  {
    const it = F9_ON
      ? [
          {
            l: F9.cd != null ? 'Countdown T-' + Math.ceil(F9.cd) : 'Launch Falcon 9',
            on: () => F9.cd != null,
            ok: () => F9.ready && demo && f9CountOK(),
            a: () => {
              f9Count();
              vmT(false);
            },
          },
        ]
      : [];
    if (G.view === 3)
      it.push(
        { l: VRS.auto ? 'Ship view: auto' : 'Ship view: manual', on: () => VRS.auto, a: vrAutoT },
        {
          l: 'Range finder',
          on: () => VRS.range,
          a: () => {
            VRS.range = !VRS.range;
          },
        },
      );
    if (it.length) row(526, 58, it);
  }
  row(MH - 150, 70, [
    { l: 'Resume', pri: 1, a: () => vmT(false) },
    {
      l: 'Exit VR',
      a: () => {
        vmT(false);
        const s = renderer.xr.getSession();
        if (s) s.end();
      },
    },
  ]);
  return b;
};
function vmDraw() {
  const c = vmg;
  c.clearRect(0, 0, MW, MH);
  rr(c, 4, 4, MW - 8, MH - 8, 28);
  c.fillStyle = 'rgba(8,12,18,.9)';
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.25)';
  c.lineWidth = 2;
  c.stroke();
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = '#e8690f';
  c.font = 'italic 700 40px "Barlow Condensed",sans-serif';
  c.fillText('X1 RACING', 40, 50);
  const tw = c.measureText('X1 RACING').width;
  c.fillStyle = '#f4f1ec';
  c.font = '600 40px "Barlow Condensed",sans-serif';
  c.fillText('SKYRACER MENU', 40 + tw + 16, 50);
  c.font = '600 22px "Barlow Condensed",sans-serif';
  c.fillStyle = '#8f97a1';
  c.textAlign = 'right';
  c.fillText(G.mode === 'demo' ? 'SI PILOT' : 'YOU ARE FLYING', MW - 40, 50);
  c.textAlign = 'left';
  c.fillText('VIEW', 40, 200);
  c.fillText('MACHINE', 40, 310);
  c.fillText('SETTINGS', 40, 420);
  VM.btn = VMB();
  VM.btn.forEach((b, i) => {
    const ok = !b.ok || b.ok(),
      on = ok && b.on && b.on(),
      hv = i === VM.hover && ok;
    rr(c, b.x, b.y, b.w, b.h, 12);
    c.fillStyle = b.pri
      ? hv
        ? '#ff8a3d'
        : '#e8690f'
      : on
        ? hv
          ? '#ffffff'
          : '#e9e6e0'
        : hv
          ? 'rgba(255,255,255,.28)'
          : 'rgba(255,255,255,.1)';
    c.fill();
    if (hv) {
      c.strokeStyle = '#e8690f';
      c.lineWidth = 4;
      c.stroke();
    }
    c.fillStyle = !ok ? 'rgba(255,255,255,.28)' : b.pri ? '#10141a' : on ? '#10141a' : '#f4f1ec';
    let fs = b.h > 66 ? 34 : 28;
    c.font = '700 ' + fs + 'px "Barlow Condensed",sans-serif';
    while (fs > 16 && c.measureText(b.l.toUpperCase()).width > b.w - 20) {
      fs -= 2;
      c.font = '700 ' + fs + 'px "Barlow Condensed",sans-serif';
    }
    c.textAlign = 'center';
    c.fillText(b.l.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 1);
  });
  c.textAlign = 'left';
  c.font = '500 21px "Barlow Condensed",sans-serif';
  c.fillStyle = '#aab0b8';
  c.fillText('LEFT   stick yaw / climb · trigger boost · grip land · X alt hold · Y menu · click fold', 40, MH - 50);
  c.fillText(
    'RIGHT  stick bank / speed · trigger boost · grip hand over · A take off · B next view · click path',
    40,
    MH - 24,
  );
  mTex.needsUpdate = true;
  VM.dirty = false;
}
function vmT(on) {
  if (on === VM.open) return;
  VM.open = on;
  vMenu.visible = on;
  vLaser.visible = false;
  VM.hover = -1;
  if (on) {
    // in front of the head, level, a little below the eyes
    const xc = renderer.xr.getCamera(),
      p = new THREE.Vector3(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3();
    xc.matrix.decompose(p, q, sc);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    f.y = 0;
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    vMenu.position.copy(p).addScaledVector(f, 1.05);
    vMenu.position.y -= 0.12;
    // face the eye (rig-local; Object3D.lookAt would work in world space): +z of the panel points back at the head
    vMenu.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(p.clone().setY(p.y - 0.12), vMenu.position, new THREE.Vector3(0, 1, 0)),
    );
    inp.roll = inp.pitch = inp.yaw = inp.climb = inp.boost = 0;
    if (G.mode !== 'demo' && !G.paused) {
      G.paused = true;
      VM.pausedByMenu = true;
    }
    VM.dirty = true;
  } else {
    if (VM.pausedByMenu) {
      G.paused = false;
      VM.pausedByMenu = false;
    }
  }
}
// each frame while open: aim, hover, select
function vmInput(L, R, bt, ed) {
  const rc = rightCtl();
  let hit = -1;
  if (rc) {
    rc.updateMatrixWorld(true);
    const o = new THREE.Vector3().setFromMatrixPosition(rc.matrixWorld),
      d = new THREE.Vector3(0, 0, -1).transformDirection(rc.matrixWorld);
    VM.ray.set(o, d);
    vMenu.updateMatrixWorld(true);
    const h = VM.ray.intersectObject(vMenu, false)[0];
    if (!vLaser.parent) rc.add(vLaser);
    vLaser.visible = true;
    vLaser.scale.z = h ? h.distance / rc.matrixWorld.getMaxScaleOnAxis() : 1.5;
    if (h && h.uv) {
      const x = h.uv.x * MW,
        y = (1 - h.uv.y) * MH;
      vDot.visible = true;
      vDot.position.set((h.uv.x - 0.5) * 1.0, ((h.uv.y - 0.5) * 1.0 * MH) / MW, 0.002);
      hit = VM.btn.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    } else vDot.visible = false;
  }
  if (hit !== VM.hover) {
    VM.hover = hit;
    VM.dirty = true;
  }
  const pick = () => {
    const b = VM.btn[VM.hover];
    if (b && (!b.ok || b.ok())) {
      b.a();
      VM.dirty = true;
    }
  };
  ed(R, 'R', 0, pick);
  ed(R, 'R', 4, pick);
  ed(R, 'R', 5, () => vmT(false));
  ed(L, 'L', 5, () => vmT(false));
  const now = performance.now();
  if (VM.dirty || now - VM.t > 300) {
    VM.t = now;
    vmDraw();
  }
}
