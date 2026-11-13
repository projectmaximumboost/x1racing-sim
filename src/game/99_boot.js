/* ---------- boot ---------- */
loadLaps();
reset('demo');
resize();
window.__x1 = {
  banner,
  CLIP,
  SP,
  f9Unload,
  f9Reset,
  f9CamEnd,
  tick,
  LERP,
  AU,
  hornBlast,
  recalc,
  LIV,
  liverySet,
  MOTION,
  motionTick,
  simStep,
  recover,
  DASH,
  dashTick,
  inner,
  craft,
  SL,
  starlinkTick,
  f9Count,
  F9G,
  f9Hit,
  F9,
  f9Launch,
  f9Tick,
  VM,
  vmT,
  vmDraw,
  vMenu,
  SCR,
  INTRO,
  introStart,
  introGo,
  SHOTS,
  twiT,
  TWI,
  flagTick,
  FLAGS,
  renderer,
  scene,
  THREE,
  shipGround,
  SHM,
  groundH,
  audioDbg: () => ({ ac, master, na, AU }),
  sfx,
  TC,
  LB,
  lbT,
  recordLap,
  cam,
  TV,
  SHIP,
  shipsT,
  shipHit,
  vr: { vrDeck, vrNearest, vrAutoT, VRS, vMark, vrPanel, vc, bc, vrCam, rig, VRB },
  shareT,
  toggleFans,
  spireTexs,
  toggleFold,
  land,
  G,
  X,
  course,
  inp,
  keys,
  setView,
  reset,
  handover,
  takeoff,
  ff(sec) {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) {
      simStep();
      if (G.running) G.lapT += DT;
      G.raceT += DT;
      lateralCheck();
      if (G.s.crash) {
        G.s.crash = null;
        recover();
      }
      if (i % 20 === 0) G.idx = nearestFwd();
    }
  },
};
const start = () => {
  initAudio();
  {
    let pref = null;
    try {
      pref = localStorage.getItem(DETAIL);
    } catch (e) {}
    if (pref !== '0') {
      SHIP.on = true;
      $('bDetail').classList.add('on');
      setTimeout(shipsLoad, 900);
    }
  }
  drawHist();
  lastT = performance.now();
  renderer.setAnimationLoop(tick);
  // full boost once two frames of the sim have been drawn (the first compiles the shaders); the opening sequence
  // starts again from its first shot as the loading screen opens on it
  if (window.X1L) {
    X1L.p(0.9);
    X1L.onReveal = () => {
      if (G.intro) introShow(true);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => X1L.p(1)));
  } else $('loading').hidden = true;
};
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(() => {
    SP.forEach((s) => {});
  });
if (window.X1L) X1L.p(0.7);
loadCraft()
  .then(start)
  .catch((e) => {
    console.error(e);
    if (window.X1L) X1L.fail('Could not load the airframe: ' + e.message);
    else $('loading').textContent = 'Could not load the airframe: ' + e.message;
  });
