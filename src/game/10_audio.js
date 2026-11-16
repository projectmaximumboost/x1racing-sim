/* ---------- audio: synthesized sound engine (no sound files) ----------
   What you hear is built from the flight model every frame and heard from where the camera is.
   Machine: four lift ducts (blade-pass tone per duct, so uneven thrust beats), two pushers (higher, buzzier), fan
     broadband noise, the free-piston generator (three-module firing note, port crackle, intake roar, e-turbo whistle),
     and an inverter whine while the LTO pack discharges.
   Listener: level and treble fall with camera distance; the pitch bends with closing speed (Doppler), so TV fly-bys
     sweep; the machine pans left and right across the picture; wind follows the camera's own speed, so it roars
     on board and is silent from a fixed camera; the cockpit is muffled.
   World: sea ambience, a ship's horn now and then when the ships are in.
   Events: gate beep, lap chimes, best-lap fanfare, penalty buzzer, spire thump, splash, touchdown, close spire whoosh,
     fold motors. */
let ac = null,
  na = null,
  muted = false,
  master = null;
const AU = {
  pd: null,
  pc: new THREE.Vector3(),
  vr: 0,
  camV: 0,
  gnd: true,
  spD: 1e9,
  spI: -1,
  spW: false,
  horn: 25,
  dist: 15,
};
// Browsers (Safari above all) keep sound off until the first click, tap or key on the page. The sound engine is built at
// load so it can start the moment that happens; a small hint shows until then.
function audioKick() {
  initAudio();
  if (ac && ac.state !== 'running') ac.resume().catch(() => {});
}
for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown'])
  addEventListener(ev, audioKick, { capture: true, passive: true });
function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ac.destination);
    master = ac.createGain();
    master.gain.value = 1;
    master.connect(comp);
    const G0 = (v, to) => {
        const g = ac.createGain();
        g.gain.value = v;
        g.connect(to);
        return g;
      },
      F = (type, f, q, to) => {
        const b = ac.createBiquadFilter();
        b.type = type;
        b.frequency.value = f;
        if (q) b.Q.value = q;
        b.connect(to);
        return b;
      };
    // one noise buffer feeds every noise voice
    const len = ac.sampleRate * 3,
      nb = ac.createBuffer(1, len, ac.sampleRate),
      d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = (to) => {
      const n = ac.createBufferSource();
      n.buffer = nb;
      n.loop = true;
      n.loopStart = Math.random();
      n.connect(to);
      n.start(0, Math.random() * 2);
      return n;
    };
    const wave = (n, p) => {
      const re = new Float32Array(n + 1),
        im = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) im[k] = 1 / Math.pow(k, p);
      return ac.createPeriodicWave(re, im);
    };
    const osc = (w, to) => {
      const o = ac.createOscillator();
      if (typeof w === 'string') o.type = w;
      else o.setPeriodicWave(w);
      o.connect(to);
      o.start();
      return o;
    };
    // the machine, heard through distance: tone, level, left-right
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const out = pan || G0(1, master);
    if (pan) pan.connect(master);
    const cg = G0(1, out),
      clp = F('lowpass', 16000, 0.3, cg);
    const wLift = wave(14, 1.25),
      wPush = wave(20, 0.85);
    const lift = [0, 1, 2, 3].map((i) => {
      const g = G0(0, clp);
      return { g, o: osc(wLift, g), det: 1 + (i - 1.5) * 0.012 };
    });
    const subG = G0(0, clp),
      sub = osc('sine', subG);
    const push = [0, 1].map((i) => {
      const g = G0(0, clp);
      return { g, o: osc(wPush, g), det: 1 + (i - 0.5) * 0.016 };
    });
    const fnG = G0(0, clp),
      fnF = F('bandpass', 500, 0.8, fnG);
    noise(fnF);
    // Generator: opposed free-piston linear generator. Three modules (six pistons) run at about 100 strokes a second,
    // 120 degrees apart, uniflow two-stroke, so there are three exhaust pulses per cycle: a 300 Hz firing note on a 100 Hz
    // cycle. The exhaust goes through the e-turbo, which smooths the pulses and adds its own whistle and hiss.
    const exWave = (imb) => {
      const n = 24,
        re = new Float32Array(n + 1),
        im = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) im[k] = (k % 3 === 0 ? 1 : imb) / Math.pow(k, 1.05);
      return ac.createPeriodicWave(re, im);
    };
    const eng = G0(1, clp),
      chest = F('peaking', 190, 1.1, eng);
    chest.gain.value = 7; // chest: a body resonance under the firing note
    // throat: the exhaust is driven into a soft clipper for growl, and every other cycle hits a little harder (free-piston
    // engines do this), which puts a half-rate subharmonic and its sidebands under the note
    const shp = ac.createWaveShaper();
    {
      const c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = i / 511.5 - 1;
        c[i] = Math.tanh(2.6 * x) / Math.tanh(2.6);
      }
      shp.curve = c;
      shp.oversample = '2x';
    }
    const alt = ac.createGain();
    alt.gain.value = 0.75;
    alt.connect(G0(0.2, chest));
    shp.connect(alt);
    const altM = ac.createGain();
    altM.gain.value = 0.25;
    const subO = osc('sine', altM);
    altM.connect(alt.gain);
    const exF = F('lowpass', 900, 0.9, shp),
      exD = G0(1, exF),
      exA = G0(0, exD),
      exB = G0(0, exD),
      exO = osc(exWave(0.3), exA),
      exL = osc(exWave(0.62), exB); // even running, and the lumpier idle
    const sbG = G0(0, chest),
      sbF = F('lowpass', 260, 0.5, sbG),
      sb = osc(wave(4, 1.3), sbF); // the subharmonic itself, with a few overtones so small speakers carry it
    const thG = G0(0, chest),
      th = osc('sine', thG); // the 100 Hz cycle you feel
    const fire = osc('sawtooth', ac.createGain()),
      mk = (f, q, type) => {
        const g = G0(0, eng),
          am = ac.createGain();
        am.gain.value = 0.5;
        am.connect(g);
        const md = ac.createGain();
        md.gain.value = 0.5;
        fire.connect(md).connect(am.gain);
        noise(F(type || 'bandpass', f, q, am));
        return g;
      };
    const raspG = mk(1700, 0.7),
      inG = mk(330, 1.1); // port crackle and intake roar, both chopped at the firing rate
    const humG = G0(0, eng),
      hum = osc('triangle', humG); // linear generator and inverter hum
    const tbG = G0(0, eng),
      tb = osc('sine', tbG),
      tb2G = G0(0.3, tbG),
      tb2 = osc('sine', tb2G),
      hsG = G0(0, eng);
    noise(F('highpass', 5200, 0.5, hsG)); // e-turbo whistle and compressor hiss
    const whG = G0(0, clp),
      wh = osc('sine', whG),
      wh2G = G0(0.35, whG),
      wh2 = osc('sine', wh2G);
    // hydraulics for the wing fold: an electric gear pump (motor note with a strong tooth-pass whine at 9x), fluid hissing
    // through the valves, and a low strain from the actuators under load
    const hyW = (() => {
      const n = 20,
        re = new Float32Array(n + 1),
        im = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) im[k] = (k === 9 ? 2.2 : k === 18 ? 1.1 : 1) / Math.pow(k, 1.1);
      return ac.createPeriodicWave(re, im);
    })();
    const hyG = G0(0, clp),
      hyP = osc(hyW, F('lowpass', 1700, 0.7, hyG));
    const hyHG = G0(0, clp);
    noise(F('bandpass', 3100, 1.3, hyHG));
    const hyLG = G0(0, clp);
    noise(F('lowpass', 150, 1.2, hyLG));
    // at the listener: wind, sea
    const wdG = G0(0, master),
      wdF = F('lowpass', 600, 0.4, wdG);
    noise(wdF);
    const wd2G = G0(0, master),
      wd2F = F('bandpass', 2400, 0.7, wd2G);
    noise(wd2F);
    const seaG = G0(0, master),
      seaF = F('lowpass', 520, 0.3, seaG);
    noise(seaF);
    const lfo = ac.createOscillator(),
      lfoG = ac.createGain();
    lfo.frequency.value = 0.13;
    lfoG.gain.value = 0.012;
    lfo.connect(lfoG).connect(seaG.gain);
    lfo.start();
    na = {
      pan,
      cg,
      clp,
      lift,
      sub,
      subG,
      push,
      fnG,
      fnF,
      eng,
      exF,
      exD,
      exA,
      exB,
      exO,
      exL,
      subO,
      altM,
      sb,
      sbG,
      th,
      thG,
      fire,
      raspG,
      inG,
      hum,
      humG,
      tb,
      tb2,
      tbG,
      hsG,
      wh,
      wh2,
      whG,
      hyP,
      hyG,
      hyHG,
      hyLG,
      wdG,
      wdF,
      wd2G,
      wd2F,
      seaG,
      nb,
      out: clp,
    };
  } catch (e) {
    ac = null;
    na = null;
  }
}
function mute() {
  muted = !muted;
}
// one-shot helpers. to: master for cues you should always hear, na.out for sounds that come from the machine
function sTone(f, dur, o = {}) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime + (o.at || 0),
    os = ac.createOscillator(),
    g = ac.createGain();
  os.type = o.type || 'sine';
  os.frequency.setValueAtTime(f, t);
  if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.g || 0.12, t + (o.a || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  os.connect(g).connect(o.bus || master);
  os.start(t);
  os.stop(t + dur + 0.05);
}
function sNoise(dur, f0, f1, o = {}) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime + (o.at || 0),
    n = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  n.buffer = na.nb;
  n.loop = true;
  f.type = o.type || 'lowpass';
  f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.g || 0.2, t + (o.a || 0.02));
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  n.connect(f)
    .connect(g)
    .connect(o.bus || master);
  n.start(t, Math.random() * 2);
  n.stop(t + dur + 0.05);
}
let sfxT = {};
/* the ships' horn, full blast, for a fast lap. The ambient horn waits a while so the two don't overlap */
function hornBlast() {
  AU.hornG = 0.6;
  sfx('horn');
  AU.horn = Math.max(AU.horn, 40);
}
function sfx(k) {
  if (!ac || !na) return;
  const now = performance.now();
  if (now - (sfxT[k] || 0) < 120) return;
  sfxT[k] = now;
  if (k === 'gate') {
    sTone(880, 0.09, { g: 0.1 });
    sTone(1320, 0.16, { g: 0.1, at: 0.1 });
  } else if (k === 'lap') {
    sTone(660, 0.12, { g: 0.11 });
    sTone(880, 0.22, { g: 0.11, at: 0.13 });
  } else if (k === 'best') {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      sTone(f, i === 3 ? 0.5 : 0.14, { g: 0.1, at: i * 0.11, type: 'triangle' }),
    );
  } else if (k === 'void') {
    sTone(220, 0.32, { g: 0.09, type: 'sawtooth', to: 120 });
  } else if (k === 'buzz') {
    sTone(155, 0.26, { g: 0.08, type: 'square' });
    sTone(160, 0.26, { g: 0.06, type: 'square' });
  } else if (k === 'hit') {
    sTone(90, 0.28, { g: 0.3, to: 38, bus: na.out });
    sTone(1180, 0.4, { g: 0.05, bus: na.out });
    sNoise(0.18, 2500, 400, { g: 0.18, bus: na.out });
  } else if (k === 'splash') {
    sNoise(1.1, 3200, 260, { g: 0.5, a: 0.01, bus: na.out });
    sTone(70, 0.35, { g: 0.3, to: 30, bus: na.out });
  } else if (k === 'thud') {
    sTone(64, 0.16, { g: 0.22, to: 40, bus: na.out });
    sNoise(0.12, 900, 200, { g: 0.1, bus: na.out });
  } else if (k === 'whoosh') {
    sNoise(0.55, 500, 2600, { g: 0.16, type: 'bandpass', q: 1.2, a: 0.2 });
  } else if (k === 'hydOn') {
    sNoise(0.05, 3200, 1400, { g: 0.07, bus: na.out });
    sTone(140, 0.07, { g: 0.06, to: 90, bus: na.out });
  } // valve opens
  else if (k === 'hydOff') {
    sTone(105, 0.14, { g: 0.16, to: 55, bus: na.out });
    sNoise(0.07, 1600, 350, { g: 0.09, bus: na.out }); // actuators bottom out and lock,
    sNoise(0.5, 4800, 2400, { g: 0.045, type: 'highpass', a: 0.01, at: 0.09, bus: na.out });
  } // then the line pressure bleeds off
  else if (k === 'horn') {
    const b = ac.createBiquadFilter();
    b.type = 'lowpass';
    b.frequency.value = 520;
    const g = ac.createGain();
    g.gain.value = AU.hornG || 0.3;
    b.connect(g).connect(master);
    for (const f of [98, 123.4, 147]) sTone(f, 7.8, { g: 0.09, type: 'sawtooth', a: 0.25, bus: b });
    setTimeout(() => {
      try {
        g.disconnect();
      } catch (e) {}
    }, 8800);
  }
}
// every frame: set every voice from the flight state and the camera
function audio(dt) {
  if (!ac || !na) return;
  const t = ac.currentTime,
    s = G.s,
    set = (p, v, k) => p.setTargetAtTime(v, t, k || 0.045);
  master.gain.setTargetAtTime(
    muted ? 0 : !$('help').hidden || !$('share').hidden || !$('lb').hidden ? 0.2 : 2,
    t,
    0.12,
  );
  if (ac.state !== 'running') return;
  // listener: where the camera is, how fast it moves, how fast the machine closes on it
  const cw = XR() ? rig.position : cam.position,
    cp = ned(s.p),
    d = cw.distanceTo(cp);
  let dop = 1;
  if (dt > 0) {
    const cut =
      AU.pd === null || Math.abs(d - AU.pd) > Math.max(40, 180 * dt) || cw.distanceTo(AU.pc) > Math.max(60, 400 * dt);
    if (cut) {
      AU.vr = 0;
      AU.camV = G.camV === 1 || G.camV === 0 ? s.V : 0;
    } else {
      AU.vr = lerp(AU.vr, (d - AU.pd) / dt, 1 - Math.exp(-dt * 10));
      AU.camV = lerp(AU.camV, cw.distanceTo(AU.pc) / dt, 1 - Math.exp(-dt * 6));
    }
    AU.pd = d;
    AU.pc.copy(cw);
  }
  dop = clamp(343 / (343 + AU.vr), 0.72, 1.38);
  const onb = G.camV === 1,
    far = 1 / (1 + Math.pow(d / 70, 1.35)),
    lvl = Math.max(far, G.view === 4 || G.view === 3 ? 0.16 : 0.04) * (onb ? 0.8 : 1);
  AU.dist = d;
  set(na.cg.gain, lvl, 0.06);
  set(na.clp.frequency, onb ? 2600 : clamp(17000 / (1 + d / 110), 900, 17000), 0.08);
  if (na.pan) {
    const v = cp.clone().project(cam);
    set(na.pan.pan, d < 20 || onb || !isFinite(v.x) ? 0 : clamp(v.x * 0.75, -0.8, 0.8), 0.1);
  }
  // lift ducts: blade-pass tone per duct (upper and lower rotor averaged), level with thrust
  let sp = 0;
  for (let i = 0; i < 4; i++) {
    const u = (s.spool[2 * i] + s.spool[2 * i + 1]) / 2;
    sp += u / 4;
    const L = na.lift[i];
    set(L.o.frequency, Math.max(20, 318 * u * L.det * dop));
    set(L.g.gain, 0.0496 * u * u + 0.0028 * u);
  }
  set(na.sub.frequency, Math.max(18, 66 * sp * dop));
  set(na.subG.gain, 0.0354 * sp * sp);
  for (let i = 0; i < 2; i++) {
    const u = s.spool[8 + i],
      Pp = na.push[i];
    set(Pp.o.frequency, Math.max(20, 560 * u * Pp.det * dop));
    set(Pp.g.gain, 0.0496 * u * u);
  }
  const P = clamp(s.P / 2000, 0, 1.1),
    ps = (s.spool[8] + s.spool[9]) / 2;
  set(na.fnF.frequency, (260 + 1150 * Math.max(sp, ps * 0.9)) * dop);
  set(na.fnG.gain, 0.07 + 0.3 * P);
  // generator: load is what the engine itself makes (fan power, less what the LTO pack is giving, plus what it is taking)
  const ld = clamp((s.P - (s.battKW || 0) * 1.341) / 1500, 0.04, 1.12),
    idle = clamp(1 - ld * 3.2, 0, 1);
  AU.jit = clamp((AU.jit || 0) + (Math.random() - 0.5) * 0.004, -0.006, 0.006);
  if (dt > 0) AU.tb = lerp(AU.tb || 0, ld, 1 - Math.exp(-dt / (ld > (AU.tb || 0) ? 0.32 : 0.7)));
  const tbs = AU.tb || 0; // the e-turbo spins up fast and coasts down slower
  const f0 = (88 + 12 * Math.min(ld, 1) + 3 * Math.max(0, ld - 1) * 8) * (1 + AU.jit * (1 + 2 * idle)) * dop;
  set(na.exO.frequency, f0, 0.03);
  set(na.exL.frequency, f0, 0.03);
  set(na.subO.frequency, f0 / 2, 0.03);
  set(na.sb.frequency, f0 / 2, 0.03);
  set(na.sbG.gain, 0.03 + 0.07 * ld, 0.08);
  set(na.altM.gain, 0.16 + 0.14 * ld, 0.1);
  set(na.exD.gain, 1.6 + 2.2 * ld, 0.1);
  set(na.th.frequency, f0, 0.03);
  set(na.fire.frequency, f0 * 3, 0.03);
  set(na.hum.frequency, f0 * 6, 0.03);
  set(na.exF.frequency, (480 + 2300 * ld * ld + 450 * tbs) * Math.min(dop, 1.2), 0.08);
  set(na.exA.gain, (0.05 + 0.17 * ld) * (1 - 0.6 * idle), 0.08);
  set(na.exB.gain, (0.03 + 0.05 * ld) * idle * 1.6, 0.08);
  set(na.thG.gain, 0.03 + 0.07 * ld, 0.08);
  set(na.raspG.gain, 0.012 + 0.11 * ld * ld, 0.08);
  set(na.inG.gain, 0.02 + 0.08 * ld, 0.08);
  set(na.humG.gain, 0.004 + 0.014 * ld, 0.08);
  set(na.tb.frequency, (2300 + 4700 * tbs) * dop, 0.05);
  set(na.tb2.frequency, (3450 + 7050 * tbs) * dop, 0.05);
  set(na.tbG.gain, 0.002 + 0.02 * tbs * tbs, 0.06);
  set(na.hsG.gain, 0.05 * tbs * tbs, 0.06);
  set(na.eng.gain, onb ? 1.25 : 1, 0.1);
  const bo = clamp((s.battKW || 0) / 375, 0, 1);
  set(na.wh.frequency, (1500 + 1400 * bo) * dop, 0.08);
  set(na.wh2.frequency, (2250 + 2100 * bo) * dop, 0.08);
  set(na.whG.gain, bo > 0.02 ? 0.004 + 0.022 * bo : 0, 0.08);
  const fold = G.foldTarget !== null;
  if (fold !== AU.fold) {
    if (AU.fold !== undefined) sfx(fold ? 'hydOn' : 'hydOff');
    AU.fold = fold;
    AU.foldT0 = t;
  }
  {
    const sp = fold ? Math.min((t - AU.foldT0) / 0.4, 1) : 0,
      ld = Math.sin(Math.PI * G.foldT); // pump spools up in 0.4 s; it labours mid-stroke
    set(
      na.hyP.frequency,
      fold ? (60 + 92 * sp) * (1 - 0.07 * ld) * (1 + 0.006 * Math.sin(t * 23)) : 38,
      fold ? 0.07 : 0.22,
    );
    set(na.hyG.gain, fold ? 0.05 * (0.5 + 0.5 * sp) : 0, fold ? 0.06 : 0.16);
    set(na.hyHG.gain, fold ? 0.018 + 0.014 * ld : 0, fold ? 0.08 : 0.12);
    set(na.hyLG.gain, fold ? 0.06 * (0.4 + 0.6 * ld) : 0, 0.1);
  }
  // wind is the listener's own airspeed; the sea is louder near the surface
  const w = clamp(AU.camV / 85, 0, 1.3),
    w2 = w * w;
  set(na.wdF.frequency, 260 + 2000 * w, 0.1);
  set(na.wdG.gain, w2 * (onb ? 0.3 : 0.17), 0.1);
  set(na.wd2F.frequency, 1500 + 2600 * w, 0.1);
  set(na.wd2G.gain, w2 * w * (onb ? 0.07 : 0.035), 0.1);
  set(na.seaG.gain, 0.02 + 0.03 * clamp(1 - cw.y / 40, 0, 1), 0.3);
  // events found by watching the state
  if (dt > 0) {
    if (s.onGround && !AU.gnd && G.raceT > 1.5) sfx('thud');
    AU.gnd = s.onGround;
    if (G.camV < 2 && s.V > 30) {
      let bd = 1e9,
        bi = -1;
      for (let i = 0; i < spireObjs.length; i++) {
        const o = spireObjs[i],
          q = Math.hypot(o.x - s.p[1], o.y - s.p[0]);
        if (q < bd) {
          bd = q;
          bi = i;
        }
      }
      if (bi !== AU.spI) {
        AU.spI = bi;
        AU.spW = false;
      } else if (bd > AU.spD + 0.001 && AU.spD < 42 && !AU.spW) {
        AU.spW = true;
        sfx('whoosh');
      }
      AU.spD = bd;
    }
    if (SHIP.objs) {
      AU.horn -= dt;
      if (AU.horn <= 0) {
        let sd = 1e9;
        for (const o of SHIP.objs) sd = Math.min(sd, o.position.distanceTo(cw));
        AU.hornG = clamp(1 / (1 + sd / 260), 0.05, 0.6);
        sfx('horn');
        AU.horn = 55 + Math.random() * 70;
      }
    }
  }
}
