/* ---------- input ---------- */
const keys = {};
const K = (c) => (keys[c] ? 1 : 0);
let gp = null,
  gpBlocked = false;
const prevBtn = [];
let inp = { roll: 0, pitch: 0, yaw: 0, climb: 0, boost: 0 };
addEventListener('keydown', (e) => {
  if (!$('lb').hidden) {
    if (e.code === 'Escape') lbT(false);
    if (e.code === 'Enter' && document.activeElement === $('lbHandle')) lbSave();
    return;
  }
  if (!$('share').hidden) {
    if (e.code === 'Escape') shareT(false);
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = 1;
  initAudio();
  const k = e.code;
  if (!$('help').hidden) {
    if (k === 'KeyH' || k === 'Escape' || k === 'Enter') helpT(false);
    return;
  }
  if (k === 'KeyV') nextView();
  if (k === 'KeyH') helpT(true);
  if (k === 'KeyR') reset(G.mode === 'demo' ? 'demo' : 'player');
  if (k === 'KeyG') toggleAlt();
  if (k === 'KeyP') togglePath();
  if (k === 'KeyL') land();
  if (k === 'KeyF') toggleFold();
  if (k === 'KeyN') toggleFans();
  if (k === 'KeyU') handover();
  if (k === 'KeyT') shareT(true);
  if (k === 'Enter') takeoff();
  if (k === 'Escape') $('menu').hidden = !$('menu').hidden;
  if (k === 'KeyM') mute();
  if (k === 'KeyK') shipsT();
  if (k === 'KeyB') lbT(true);
});
addEventListener('keyup', (e) => {
  keys[e.code] = 0;
});
addEventListener('blur', () => {
  for (const k in keys) keys[k] = 0;
});
const dz = (v) => {
  const a = Math.abs(v);
  return a < 0.09 ? 0 : Math.sign(v) * ((a - 0.09) / 0.91) ** 1.5;
};
// right stick (roll and pitch) gets RC-style expo on top: soft around centre, full rate at the stops
const EXPO = 0.55,
  ex = (v) => v * (1 - EXPO + EXPO * v * v);
/* A thumbstick moves inside a round gate, so pushed into a corner it reads about 0.71 on each axis and never reaches full
   roll and full pitch together. Each stick is read as one vector instead: a round dead zone, the response curve (and expo)
   on how far it is pushed, then stretched from the circle out to the square, so the rim of the gate is full deflection in
   every direction (corner = full on both axes) and a straight push along one axis is exactly as before. */
function stick(x, y, expo) {
  const r = Math.hypot(x, y);
  if (r < 0.09) return [0, 0];
  let m = Math.min((r - 0.09) / 0.91, 1) ** 1.5;
  if (expo) m = ex(m);
  const ux = x / r,
    uy = y / r,
    k = m / Math.max(Math.abs(ux), Math.abs(uy));
  return [clamp(ux * k, -1, 1), clamp(uy * k, -1, 1)];
}
function pollPad() {
  let pads = [];
  try {
    pads = navigator.getGamepads ? navigator.getGamepads() : [];
  } catch (e) {
    gpBlocked = true;
  }
  gp = null;
  for (const p of pads)
    if (p && p.connected && p.mapping !== 'xr-standard') {
      gp = p;
      break;
    }
  const el = $('gp');
  if (gp) {
    el.textContent = 'Controller: ' + gp.id.replace(/\s*\(.*\)/, '').slice(0, 38);
    el.className = 'ok';
  } else if (gpBlocked) {
    el.textContent = 'This view blocks controllers. Open the standalone file to use one.';
    el.className = '';
  } else if (el.className === 'ok') {
    el.textContent = 'Controller disconnected. Press any controller button to reconnect.';
    el.className = '';
  }
  const a = (i) => (gp ? dz(gp.axes[i] || 0) : 0),
    b = (i) => (gp && gp.buttons[i] ? gp.buttons[i].value : 0);
  const kbR = K('ArrowRight') - K('ArrowLeft'),
    kbP = K('ArrowUp') - K('ArrowDown');
  const ax = (i) => (gp ? gp.axes[i] || 0 : 0),
    sL = stick(ax(0), ax(1)),
    sR = stick(ax(2), ax(3), true);
  inp.roll = clamp(sR[0] + kbR, -1, 1);
  inp.pitch = clamp(-sR[1] + kbP, -1, 1);
  inp.yaw = clamp(sL[0] + K('KeyD') - K('KeyA'), -1, 1);
  inp.climb = clamp(-sL[1] + K('KeyW') - K('KeyS'), -1, 1);
  touchInput();
  // no throttle: the right stick fore and aft is the speed control. Boost is a button: Space, RB, or either trigger
  inp.boost =
    K('Space') || K('ShiftLeft') || K('ShiftRight') || TC.boost || b(5) > 0.5 || b(6) > 0.5 || b(7) > 0.5 ? 1 : 0;
  vrInput();
  if (gp) {
    const ed = (i, f) => {
      const v = b(i) > 0.5;
      if (v && !prevBtn[i]) f();
      prevBtn[i] = v;
    };
    if (!$('lb').hidden) {
      ed(0, () => lbT(false));
      ed(1, () => lbT(false));
      ed(9, () => lbT(false));
      for (const i of [2, 3, 4, 8, 12, 13, 15]) prevBtn[i] = b(i) > 0.5;
      return;
    }
    if (!$('share').hidden) {
      ed(0, () => shareT(false));
      ed(1, () => shareT(false));
      ed(9, () => shareT(false));
      for (const i of [2, 3, 4, 8, 12, 13, 15]) prevBtn[i] = b(i) > 0.5;
      return;
    }
    if (!$('help').hidden) {
      ed(0, () => helpT(false));
      ed(1, () => helpT(false));
      ed(9, () => helpT(false));
      for (const i of [2, 3, 4, 8, 12, 13, 15]) prevBtn[i] = b(i) > 0.5;
      return;
    }
    ed(0, () => {
      initAudio();
      if (G.mode === 'demo') reset('player');
      else takeoff();
    });
    ed(1, () => reset(G.mode === 'demo' ? 'demo' : 'player'));
    ed(2, toggleAlt);
    ed(3, () => nextView());
    ed(4, togglePath);
    ed(13, land);
    ed(12, toggleFold);
    ed(15, toggleFans);
    ed(14, () => twiT());
    ed(8, handover);
    ed(9, () => helpT(true));
  }
}
function takeoff() {
  if (G.land) return;
  if (G.mode === 'demo') {
    reset('player');
    return;
  }
  if (G.foldT > 0 || G.foldTarget === 1) {
    G.foldWait = 0;
    if (G.foldTarget !== 0) banner('UNFOLDING', 'Lift off follows', 1400);
    G.foldTarget = 0;
  }
  $('menu').hidden = true;
  const s = G.s,
    g = groundH(s);
  if (s.onGround || -s.p[2] < g + 3) {
    G.liftReq = true;
    s.hT = g + 13;
    banner('LIFT OFF', 'Right stick forward to accelerate, RB or Space for boost', 1600);
  }
}
function land() {
  if (G.land) {
    G.land = null;
    if (G.s) G.s.hT = -G.s.p[2];
    banner('LANDING CANCELLED', 'You have control', 1100);
    if (G.mode === 'demo') G.si = X.makeSI(course);
    return;
  }
  if (G.s.onGround && DEF.landH(G.s.p[1], G.s.p[0]) > 0.2) return;
  G.land = X.makeLander(PAD);
  G.running = false;
  G.next = 0;
  G.prevAlong = undefined;
  G.pen = 0;
  $('menu').hidden = true;
  banner('AUTOLAND', 'Flying back to the pad. Press L to cancel.', 1800);
}
function foldAtRest() {
  const s = G.s;
  return s.onGround && s.V < 1 && DEF.landH(s.p[1], s.p[0]) > 0.2 && !G.land && !G.liftReq;
}
function syncFold() {
  const out = G.foldTarget === null ? G.foldT > 0 : G.foldTarget === 1;
  $('bFold').textContent = out ? 'Unfold' : 'Fold';
  $('bFold').classList.toggle('lock', !foldAtRest() || G.mode === 'demo');
}
function toggleFold() {
  if (G.mode === 'demo') {
    banner('SI IS FLYING', 'Press Fly it to use the fold', 1200);
    return;
  }
  if (!foldAtRest()) {
    banner('FOLD LOCKED', 'Land and stop on the pad first', 1300, '#ffc53d');
    return;
  }
  const out = G.foldTarget === null ? G.foldT > 0 : G.foldTarget === 1;
  G.foldWait = 0;
  G.foldTarget = out ? 0 : 1;
  banner(out ? 'UNFOLDING' : 'FOLDING', out ? 'Wings and ducts opening' : 'Stowing for the hauler', 1400);
  syncFold();
}
function toggleAlt() {
  if (G.mode !== 'player') return; // SI flies its own altitude; the button only matters when you fly
  G.altHold = !G.altHold;
  if (G.altHold && G.s) G.s.hT = -G.s.p[2];
  banner(
    G.altHold ? 'ALTITUDE HOLD ON' : 'ALTITUDE HOLD OFF',
    G.altHold ? 'Left stick sets climb rate' : 'Left stick is direct collective',
    1000,
  );
}
function togglePath() {
  G.showPath = !G.showPath;
  ribU.on.value = G.showPath ? 1 : 0;
}
function handover() {
  if (G.mode === 'demo') {
    $('menu').hidden = true;
    G.mode = 'player';
    G.assist = true;
    G.at = X.makeAutoThrust();
    G.s.hT = -G.s.p[2];
    /* auto-thrust latches the speed you took over at */ banner('YOU HAVE CONTROL', 'This lap counts as yours', 1200);
  } else {
    G.mode = 'demo';
    G.si = X.makeSI(course);
    G.si.t = 5;
    G.assist = true;
    banner('SI HAS CONTROL', '', 1000);
  }
  $('pilotChip').textContent = G.mode === 'demo' ? 'SI PILOT' : 'YOU';
  $('pilotChip').className = G.mode === 'demo' ? '' : 'you';
  syncMode();
}
let wasPaused = false;
function helpT(open) {
  const el = $('help');
  if (open === !el.hidden) return;
  if (open)
    $('build').textContent =
      'Build ' +
      BUILD +
      '  ·  Ships: ' +
      (SHIP.objs ? 'loaded' : SHIP.on ? 'loading' : SHIP.err ? 'failed (' + SHIP.err + ')' : 'off');
  if (open) {
    wasPaused = G.paused;
    G.paused = true;
  } else G.paused = wasPaused;
  el.hidden = !open;
}
let sharePaused = false;
function shareTextFor(t) {
  const r = lbRankOf(t);
  return `\u2708\uFE0F\u{1F3C1}\u{1F3C6} I ran a ${fmt(t)} lap in the X1 Racing SkyRacer Flying Car Grand Prix${r ? ` and I'm P${r} on the leaderboard` : ''}. Can you beat it? @realx1racing x1racing.com/sim`;
}
function shareHref() {
  $('shareX').href = 'https://x.com/intent/post?text=' + encodeURIComponent($('shareText').value);
}
function shareT(open) {
  const el = $('share');
  if (open === !el.hidden) return;
  if (open) {
    if (G.bestYou == null) {
      banner('NO LAP TO POST', 'Finish a clean lap first', 1600, '#ffc53d');
      return;
    }
    sharePaused = G.paused;
    G.paused = true;
    $('shareTime').textContent = fmt(G.bestYou);
    $('shareText').value = shareTextFor(G.bestYou);
    shareHref();
    el.hidden = false;
    $('shareX').focus();
  } else {
    G.paused = sharePaused;
    el.hidden = true;
  }
}
const deckOK = () => G.mode === 'demo' && !!SHIP.objs && !G.land,
  tvOK = () => G.mode === 'demo' && !G.land,
  poolOK = () => XR() && deckOK() && SCR.meshes.length > 0,
  viewOK = (v) => (v === 3 ? deckOK() : v === 4 ? tvOK() : v === 5 ? poolOK() : true);
function nextView() {
  let v = G.view;
  for (let i = 0; i < 6; i++) {
    v = (v + 1) % 6;
    if (viewOK(v)) break;
  }
  setView(v);
}
function syncViewBtns() {
  const b = $('v3');
  b.hidden = G.mode !== 'demo';
  b.classList.toggle('lock', !deckOK());
  $('v4').hidden = G.mode !== 'demo';
}
function f9Key(e) {
  if (
    e.code === 'KeyC' &&
    !e.repeat &&
    G.mode === 'demo' &&
    $('help').hidden &&
    !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')
  )
    f9Count();
}
addEventListener('keydown', f9Key);
function setView(v, auto) {
  if (G.f9cam && !auto) {
    G.f9cam = null;
    camInit = false;
  }
  if (!viewOK(v)) {
    if (auto) {
      v = 0;
    } else {
      banner(
        v === 3 ? 'SHIP VIEW' : v === 5 ? 'POOL DECK' : 'TV VIEW',
        v === 3
          ? 'Needs max detail on and SI flying'
          : v === 5
            ? 'VR only, with max detail on and SI flying'
            : 'Needs SI flying',
        1500,
        '#ffc53d',
      );
      return;
    }
  }
  G.view = v;
  if (v === 5 && !auto)
    banner('POOL DECK', 'Ship ' + (VRP.ship + 1) + '. A for the other ship. Look up at the race feed', 2000);
  if (!auto) {
    if (G.mode === 'demo') G.siView = v;
    else G.flyView = v;
  }
  DECK.cur = null;
  if (v === 4) TV.reset();
  camVis(v === 4 ? 0 : v);
  [0, 1, 2, 3, 4].forEach((i) => $('v' + i).classList.toggle('on', i === v));
  camInit = false;
}
// what the camera shows: cockpit hides the seats and thins the canopy (TV switches this per shot)
let camVisV = -1;
function camVis(v) {
  G.camV = v;
  if (v === camVisV) return;
  camVisV = v;
  cam.near = v === 1 ? 0.12 : 0.7;
  G.cockpitParts.forEach((o) => {
    o.visible = v !== 1;
  });
  if (canopy) canopy.material.opacity = v === 1 ? 0.1 : 0.3;
}
$('bFans').onclick = (e) => {
  toggleFans();
  e.target.blur();
};
$('shareText').oninput = shareHref;
$('bShareX').onclick = () => shareT(false);
$('bShareCopy').onclick = (e) => {
  const t = $('shareText'),
    b = e.target,
    ok = () => {
      b.textContent = 'Copied';
      setTimeout(() => {
        b.textContent = 'Copy text';
      }, 1200);
    },
    fb = () => {
      t.select();
      b.textContent = 'Press Cmd+C';
    };
  try {
    navigator.clipboard.writeText(t.value).then(ok, fb);
  } catch (_) {
    fb();
  }
};
$('bFold').onclick = (e) => {
  toggleFold();
  e.target.blur();
};
$('bHelp').onclick = (e) => {
  helpT(true);
  e.target.blur();
};
$('bHelpX').onclick = (e) => {
  helpT(false);
  e.target.blur();
};
$('menuPill').onclick = (e) => {
  $('menu').hidden = !$('menu').hidden;
  e.target.blur();
};
$('bFly').onclick = () => {
  initAudio();
  reset('player');
  $('bFly').blur();
};
$('bDemo').onclick = () => {
  initAudio();
  reset('demo');
  $('bDemo').blur();
};
[0, 1, 2, 3, 4].forEach((i) => {
  $('v' + i).onclick = (e) => {
    setView(i);
    e.target.blur();
  };
});
addEventListener('gamepadconnected', () => {
  $('gp').className = 'ok';
});
