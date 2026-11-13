/* ---------- touch controls (phones and tablets) ----------
   Right thumb: flight stick (bank and pitch; at low speed it also yaws, so you can point the nose in the hover).
   Right thumb forward and back is the speed: forward accelerates, back brakes, centred holds the speed.
   Left thumb: BOOST, held while pressed. Small up and down keys change altitude.
   Shown only in fly mode, once the device has actually been touched. */
const TC = { on: false, x: 0, y: 0, push: false, boost: false, climb: 0, R: 52 };
try {
  TC.on = matchMedia('(pointer:coarse)').matches && (navigator.maxTouchPoints || 0) > 0;
} catch (e) {}
addEventListener(
  'touchstart',
  () => {
    TC.on = true;
  },
  { passive: true, capture: true },
);
{
  const pad = $('tPad'),
    bB = $('tBoost'),
    zone = $('tZone'),
    base = $('tBase'),
    knob = $('tKnob');
  let padId = null,
    stId = null;
  const inR = (el, x, y, r) => {
    const q = el.getBoundingClientRect();
    return x > q.left - r && x < q.right + r && y > q.top - r && y < q.bottom + r;
  };
  const padSet = (e) => {
    TC.boost = true;
    bB.classList.add('on');
  };
  const padOff = () => {
    padId = null;
    TC.boost = TC.push = false;
    bB.classList.remove('on');
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padId = e.pointerId;
    try {
      pad.setPointerCapture(padId);
    } catch (_) {}
    audioKick();
    padSet(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === padId) padSet(e);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    pad.addEventListener(ev, (e) => {
      if (e.pointerId === padId) padOff();
    });
  const stSet = (e) => {
    const q = base.getBoundingClientRect(),
      cx = q.left + q.width / 2,
      cy = q.top + q.height / 2;
    let dx = e.clientX - cx,
      dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > TC.R) {
      dx *= TC.R / l;
      dy *= TC.R / l;
    }
    TC.x = dx / TC.R;
    TC.y = -dy / TC.R;
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  const stOff = () => {
    stId = null;
    TC.x = TC.y = 0;
    knob.style.transform = '';
    zone.classList.remove('on');
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stId = e.pointerId;
    try {
      zone.setPointerCapture(stId);
    } catch (_) {}
    zone.classList.add('on');
    audioKick();
    stSet(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === stId) stSet(e);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    zone.addEventListener(ev, (e) => {
      if (e.pointerId === stId) stOff();
    });
  for (const [id, v] of [
    ['tUp', 1],
    ['tDn', -1],
  ]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch (_) {}
      TC.climb = v;
      b.classList.add('on');
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
      b.addEventListener(ev, () => {
        if (TC.climb === v) TC.climb = 0;
        b.classList.remove('on');
      });
  }
  $('tGo').onclick = () => {
    audioKick();
    takeoff();
  };
  $('bLand').onclick = (e) => {
    land();
    e.target.blur();
  };
  $('bPadR').onclick = (e) => {
    reset(G.mode === 'demo' ? 'demo' : 'player');
    e.target.blur();
  };
  for (const el of [pad, zone, $('tAlt')]) el.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('blur', () => {
    padOff();
    stOff();
    TC.climb = 0;
  });
}
// folded into the frame's input after keyboard and controller
/* The one touch stick does everything a controller's right stick does: sideways banks, forward and back is the speed
   (accelerate, hold, brake). A hard sideways push is a hard turn: full bank, pushers back to the 10 % cooling flow. At
   low speed sideways also turns the nose, standing in for the controller's left stick. The round pad is stretched to a
   square like a thumbstick, so a push into a corner gives full bank and full speed input together. */
function touchInput() {
  if (!TC.on) return;
  const e = (v) => Math.sign(v) * Math.abs(v) ** 1.4,
    r = Math.hypot(TC.x, TC.y),
    k = r > 0.02 ? Math.min(r, 1) / Math.max(Math.abs(TC.x), Math.abs(TC.y)) : 1,
    sx = clamp(TC.x * k, -1, 1),
    sy = clamp(TC.y * k, -1, 1),
    rx = e(sx);
  inp.roll = clamp(inp.roll + rx, -1, 1);
  inp.pitch = clamp(inp.pitch + e(sy), -1, 1);
  inp.yaw = clamp(inp.yaw + rx * clamp(1 - (G.s ? G.s.V : 0) / 22, 0, 1) * 0.8, -1, 1);
  inp.climb = clamp(inp.climb + TC.climb, -1, 1);
}
function touchSync() {
  const fly =
      TC.on && G.mode === 'player' && !G.land && !XR() && $('help').hidden && $('share').hidden && $('lb').hidden,
    s = G.s;
  document.documentElement.classList.toggle('touch', TC.on);
  $('touchHelp').hidden = !TC.on;
  $('touch').hidden = !fly;
  if (!fly) {
    if (TC.push || TC.boost || TC.x || TC.y) {
      TC.push = TC.boost = false;
      TC.x = TC.y = 0;
      TC.climb = 0;
    }
    return;
  }
  const pad = s.onGround && !G.liftReq;
  $('tGo').hidden = !pad;
  $('tPad').style.opacity = $('tZone').style.opacity = pad ? 0.45 : 1;
}
