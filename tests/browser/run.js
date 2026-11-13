// Browser checks for the built pages. Each check opens a page, does something and asserts on what the sim reports,
// and saves a screenshot to tests/browser/out/ for a look.
//
//   npm i playwright        (once; any recent version)
//   python3 tools/build.py
//   node tests/browser/run.js            all checks
//   node tests/browser/run.js dash intro only the named ones
//
// The ship checks are skipped when dist/X1_SkyRacer_Ships.bin is absent (it is licensed and not in git).
const dgram = require('dgram');
const path = require('path');
const { spawn } = require('child_process');
const H = require('./harness');

const GP = 'X1_SkyRacer_GrandPrix_standalone.html';
const F9 = 'X1_SkyRacer_Falcon9_standalone.html';
const results = [];
function ok(cond, what, detail) {
  results.push({ ok: !!cond, what, detail });
  console.log((cond ? '  ok    ' : '  FAIL  ') + what + (detail !== undefined ? '  [' + detail + ']' : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const checks = {
  // Both pages start, show the opening sequence, and differ only in the Falcon 9 switch
  async boot(b) {
    for (const [file, f9] of [
      [GP, false],
      [F9, true],
    ]) {
      const { page, errors, ctx } = await H.open(b, file);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        intro: !!__x1.G.intro,
        f9: document.body.classList.contains('f9'),
        title: document.title,
        credit: getComputedStyle(document.querySelector('.f9only')).display,
      }));
      ok(errors.length === 0, file + ' loads without errors', errors.join(' | ') || undefined);
      ok(r.intro, file + ' opens on the intro');
      ok(r.f9 === f9, file + (f9 ? ' has' : ' has no') + ' Falcon 9', r.title);
      ok((r.credit !== 'none') === f9, file + ' Falcon 9 help rows ' + (f9 ? 'shown' : 'hidden'));
      await ctx.close();
    }
  },

  // The SI flies clean laps at the usual pace
  async lap(b) {
    const { page, errors, ctx } = await H.open(b, GP);
    await H.startSI(page);
    const r = await page.evaluate(() => {
      const x = __x1;
      x.G.paused = true;
      x.reset('demo');
      let laps = [],
        t0 = null,
        prev = null,
        t = 0;
      const DT = 1 / 200;
      for (let i = 0; i < 200 * 260 && laps.length < 3; i++) {
        x.simStep();
        t += DT;
        const e = x.G.s.p[1],
          n = x.G.s.p[0];
        if (prev !== null && prev < 0 && e >= 0 && n > 40 && n < 220) {
          if (t0 !== null) laps.push(+(t - t0).toFixed(2));
          t0 = t;
        }
        prev = e;
        if (x.G.s.crash) return { crash: x.G.s.crash, laps };
      }
      return { laps };
    });
    ok(!r.crash, 'SI flies without a crash', r.crash);
    ok(r.laps.length === 3 && r.laps.every((l) => l > 58 && l < 63), 'SI laps are 58 to 63 s', r.laps.join(', '));
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Cockpit: the dash screen shows a live nose camera on the left and the map on the right, and stops drawing when unseen
  async dash(b) {
    const { page, errors, ctx } = await H.open(b, GP, { scale: 2 });
    await H.startSI(page);
    await page.evaluate(() => {
      __x1.ff(14);
      __x1.setView(1);
    });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const x = __x1,
        D = x.DASH,
        W = D.rt.width,
        Hh = D.rt.height,
        px = new Uint8Array(W * Hh * 4);
      x.renderer.readRenderTargetPixels(D.rt, 0, 0, W, Hh, px);
      let mn = 255,
        mx = 0;
      for (let i = 0; i < px.length; i += 4 * 97) {
        mn = Math.min(mn, px[i]);
        mx = Math.max(mx, px[i]);
      }
      const g = D.cv.getContext('2d').getImageData(0, 0, D.cv.width, D.cv.height).data;
      let arrow = 0,
        path = 0;
      for (let i = 0; i < g.length; i += 4) {
        if (g[i] < 90 && g[i + 1] > 200 && g[i + 2] > 230) arrow++; // cyan arrow
        if (g[i] > 240 && g[i + 1] > 160 && g[i + 1] < 200 && g[i + 2] < 100) path++; // orange course line
      }
      return { size: [W, Hh], spread: mx - mn, arrow, path, stick: !!D.stick, mat: D.scr.material.type };
    });
    ok(r.spread > 40, 'nose camera picture has content', 'red channel spread ' + r.spread);
    ok(r.arrow > 40, 'map shows the heading arrow', r.arrow + ' px');
    ok(r.path > 300, 'map shows the course line', r.path + ' px');
    ok(r.stick, 'side-stick found in the airframe');
    await H.hideUI(page);
    await H.shot(page, 'dash_cockpit');
    // from the chase view the dash is out of sight: its picture must stop updating
    const idle = await page.evaluate(async () => {
      const x = __x1;
      x.setView(0);
      await new Promise((r) => setTimeout(r, 600));
      const orig = x.renderer.render.bind(x.renderer);
      let n = 0;
      x.renderer.render = (s, c) => {
        if (c === x.DASH.cam) n++;
        return orig(s, c);
      };
      await new Promise((r) => setTimeout(r, 1200));
      x.renderer.render = orig;
      return n;
    });
    ok(idle === 0, 'dash camera is idle in the chase view', idle + ' draws');
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Intro: the turn 3 shot is a cockpit race clip starting as a cruise ship comes into view; the pad state is put back
  async clip(b) {
    if (!H.haveShips) {
      console.log('  skip  clip: dist/X1_SkyRacer_Ships.bin not present');
      return;
    }
    const { page, errors, ctx } = await H.open(b, GP);
    await page.waitForFunction('__x1.SHIP.objs && __x1.SHIP.objs.length === 2', null, { timeout: 120000 });
    await page.waitForFunction('__x1.CLIP.ready && __x1.CLIP.ships', null, { timeout: 120000 });
    const c = await page.evaluate(() => {
      const C = __x1.CLIP,
        sh = __x1.SHOTS.find((s) => s.fly),
        T2 = __x1.SP[1];
      let tc2 = 0,
        d2 = 1e9;
      for (const f of C.rec) {
        const d = Math.hypot(f.p[1] - T2.x, f.p[0] - T2.y);
        if (d < d2) [d2, tc2] = [d, f.t];
      }
      return { t0: C.t0, tc3: C.tc3, tc2, T: sh.T, crash: !!C.s.crash, i: __x1.SHOTS.indexOf(sh) };
    });
    ok(
      !c.crash && c.tc3 > 95 && c.tc3 < 110,
      "the clip is the SI's second lap through turn 3",
      'turn 3 at ' + c.tc3.toFixed(1) + ' s',
    );
    ok(
      c.t0 > c.tc2 - 6 && c.t0 < c.tc3 - 2 && c.T > 4 && c.T < 13.6,
      'it starts between turns 2 and 3, when a ship comes into view',
      'starts ' + (c.tc3 - c.t0).toFixed(1) + ' s before turn 3, runs ' + c.T.toFixed(1) + ' s',
    );
    const p = await page.evaluate(async (i) => {
      const x = __x1,
        I = x.INTRO,
        pad = x.G.s;
      I.i = i;
      I.went = i;
      I.cap = -1;
      I.t = 0.5 * x.SHOTS[i].T;
      await new Promise((r) => setTimeout(r, 900));
      const r = {
        swapped: x.G.s === x.CLIP.play,
        fold: x.G.foldT,
        camV: x.G.camV,
        near: x.cam.near,
        cap: document.querySelector('#introCap').firstChild.textContent,
        high: -x.G.s.p[2],
      };
      I.i = 0;
      I.t = 0;
      await new Promise((r) => setTimeout(r, 600));
      r.back = x.G.s === pad;
      return r;
    }, c.i);
    ok(
      p.swapped && p.fold === 0 && p.camV === 1 && p.near < 0.2 && p.high > 5,
      'the clip plays from the cockpit, wings out, in flight',
      JSON.stringify(p),
    );
    ok(p.back, 'the pad state comes back after the clip');
    await H.hideUI(page);
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Starting from the opening: the SI is flying, so a tap, a mouse click or a key all start in the TV view
  async start(b) {
    const views = [];
    for (const [how, mobile] of [
      ['tap', true],
      ['click', false],
      ['key', false],
    ]) {
      const { page, errors, ctx } = await H.open(
        b,
        GP,
        mobile ? { viewport: { width: 390, height: 844 }, mobile: true } : {},
      );
      await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 120000 });
      if (how === 'tap') await page.touchscreen.tap(195, 420);
      else if (how === 'click') await page.mouse.click(480, 270);
      else await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      views.push(await page.evaluate(() => [__x1.G.intro, __x1.G.view]));
      if (errors.length) views.push(errors.join(' | '));
      await ctx.close();
    }
    ok(views[0][0] === false && views[0][1] === 4, 'a tap starts in the TV view', JSON.stringify(views[0]));
    ok(views[1][0] === false && views[1][1] === 4, 'a mouse click starts in the TV view', JSON.stringify(views[1]));
    ok(views[2][0] === false && views[2][1] === 4, 'a key starts in the TV view', JSON.stringify(views[2]));
    ok(views.length === 3, 'no page errors', views.slice(3).join(' ') || undefined);
  },

  // Intro bars: flush on a desktop, no top band on a phone in either orientation
  async intro(b) {
    const bars = (page) =>
      page.evaluate(() => {
        const r = (q) => {
          const e = document.querySelector(q),
            s = getComputedStyle(e),
            b = e.getBoundingClientRect();
          return { shown: s.display !== 'none', top: b.top, bottom: b.bottom };
        };
        return {
          t: r('#intro .lbx.t'),
          b: r('#intro .lbx.b'),
          h: innerHeight,
          card: document.querySelector('#introCard').getBoundingClientRect().top,
        };
      });
    let o = await H.open(b, GP);
    await o.page.waitForTimeout(1500);
    let r = await bars(o.page);
    ok(r.t.shown && r.t.top === 0, 'desktop: top band flush with the top edge', 'top ' + r.t.top);
    ok(r.b.shown && near(r.b.bottom, r.h, 0.5), 'desktop: bottom band flush with the bottom edge');
    await o.ctx.close();
    o = await H.open(b, GP, { viewport: { width: 390, height: 844 }, mobile: true, scale: 2 });
    await o.page.waitForTimeout(3000);
    r = await bars(o.page);
    ok(!r.t.shown, 'phone portrait: no top band');
    ok(r.b.shown && near(r.b.bottom, r.h, 0.5), 'phone portrait: bottom band kept');
    await H.shot(o.page, 'intro_phone_portrait');
    await o.page.setViewportSize({ width: 844, height: 390 });
    await o.page.waitForTimeout(1500);
    r = await bars(o.page);
    ok(!r.t.shown, 'phone landscape: no top band');
    await H.shot(o.page, 'intro_phone_landscape');
    ok(o.errors.length === 0, 'no page errors', o.errors.join(' | ') || undefined);
    await o.ctx.close();
  },

  // Ships: flags sit on the measured mast and bow staff, and the dash map knows where the ships are
  async ships(b) {
    if (!H.haveShips) {
      console.log('  skip  ships: dist/X1_SkyRacer_Ships.bin not present');
      return;
    }
    const { page, errors, ctx } = await H.open(b, GP);
    await H.startSI(page);
    await page.waitForFunction('__x1.SHIP.objs && __x1.SHIP.objs.length === 2', null, { timeout: 120000 });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const x = __x1,
        p = x.SHIP.pts,
        g = x.SHIP.flagG[0];
      return {
        mast: p.mast.toArray(),
        jack: p.jack.toArray(),
        gaff: g.position.toArray(),
        flags: x.FLAGS.filter((f) => f.ship).length,
        kids: g.children.length,
      };
    });
    ok(
      near(r.mast[1], 52.05, 0.3) && near(r.mast[2], 66.02, 0.5),
      'forward mast top measured',
      r.mast.map((v) => v.toFixed(2)).join(', '),
    );
    ok(
      near(r.jack[1], 19.02, 0.2) && near(r.jack[2], 150.73, 0.3) && Math.abs(r.jack[0]) < 0.2,
      'bow jackstaff tip measured',
      r.jack.map((v) => v.toFixed(2)).join(', '),
    );
    ok(r.flags === 6, 'three flags per ship: US, X1 Racing, bow jack', r.flags + ' flags');
    await page.evaluate(() => {
      const x = __x1,
        T = x.THREE,
        o = x.SHIP.objs[0];
      o.updateMatrixWorld(true);
      const p = new T.Vector3(0, 18, 150.7).applyMatrix4(o.matrixWorld),
        c = new T.Vector3(16, 24, 160).applyMatrix4(o.matrixWorld);
      const orig = x.renderer.render.bind(x.renderer);
      x.renderer.render = (s, cm) => {
        if (cm === x.cam && !x.renderer.getRenderTarget()) {
          cm.position.copy(c);
          cm.lookAt(p);
          cm.fov = 40;
          cm.near = 0.5;
          cm.updateProjectionMatrix();
          cm.updateMatrixWorld();
        }
        return orig(s, cm);
      };
    });
    await page.waitForTimeout(1200);
    await H.hideUI(page);
    await H.shot(page, 'ship_bow_flag');
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Liveries: Y steps White -> XXONE 51 -> Yonder 01 -> White; paint, recolours and decals follow, and the choice sticks
  async livery(b) {
    const { page, errors, ctx } = await H.open(b, GP);
    await H.startSI(page);
    const state = () =>
      page.evaluate(() => {
        const x = __x1,
          L = x.LIV,
          r = L.root;
        let decals = 0,
          shown = 0;
        r.traverse((o) => {
          if (o.userData.decal) {
            decals++;
            if (o.visible) shown++;
          }
        });
        const col = (n) => {
          let c = null;
          r.traverse((o) => {
            if (
              !c &&
              o.isMesh &&
              o.name.indexOf(n) === 0 &&
              o.userData.paint0 &&
              o.userData.paint0.name === 'Paint_White'
            )
              c = '#' + o.material.color.clone().convertLinearToSRGB().getHexString();
          });
          return c;
        };
        return {
          screen: x.DASH.scr ? x.DASH.scr.material.type : 'none',
          canopy: r.getObjectByName('Canopy').material.opacity,
          id: L.list[L.i].id,
          names: L.list.map((l) => l.name),
          map: L.livMat.map === L.whiteMap ? 'white' : 'livery',
          decals,
          shown,
          duct: col('Duct_FL'),
          wing: col('Front_Wing_L'),
          swoosh: r.getObjectByName('Flank_Swoosh_L').material.name,
          btn: document.getElementById('bLiv').textContent,
          saved: localStorage.getItem(L.KEY),
        };
      });
    let r = await state();
    ok(r.names.join() === 'White,XXONE 51,Yonder 01', 'three liveries are loaded', r.names.join(', '));
    ok(r.id === 'white' && r.map === 'white' && r.shown === 0, 'starts all white with no decals shown');
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(600);
    r = await state();
    ok(r.id === 'xxone' && r.map === 'livery' && r.btn === 'Livery: XXONE 51', 'Y selects XXONE 51', r.btn);
    ok(r.shown >= 20 && r.shown === r.decals, 'XXONE decals are on the craft', r.shown + ' decal meshes');
    ok(
      r.duct === '#101012' && r.wing === '#101012' && r.swoosh === 'Livery',
      'XXONE: black ducts and wings, painted flank panels',
      r.duct + ' ' + r.wing,
    );
    await page.evaluate(() => {
      __x1.G.paused = true;
    });
    await H.hideUI(page);
    await H.shot(page, 'livery_xxone');
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(600);
    r = await state();
    ok(
      r.id === 'yonder' && r.duct === '#0b4898' && r.wing === '#d6121e',
      'Y again selects Yonder 01: blue ducts, red wings',
      r.duct + ' ' + r.wing,
    );
    ok(r.shown >= 20 && r.shown < r.decals, 'only the Yonder decals are shown', r.shown + ' of ' + r.decals);
    ok(r.saved === 'yonder', 'the choice is remembered');
    await H.shot(page, 'livery_yonder');
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(400);
    r = await state();
    ok(
      r.id === 'white' && r.map === 'white' && r.shown === 0 && r.swoosh === 'Paint_White' && r.duct !== '#0b4898',
      'a third Y returns to all white',
    );
    ok(
      r.screen === 'ShaderMaterial' && r.canopy < 0.5,
      'dash screen and clear canopy survive livery changes',
      r.screen + ', canopy ' + r.canopy,
    );
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Smooth drawing: at 60 to 144 fps the physics advances 1 to 4 steps a frame, unevenly; the drawn craft must not
  async smooth(b) {
    const { page, errors, ctx } = await H.open(b, GP);
    await H.startSI(page);
    await page.evaluate(() => __x1.ff(25));
    const r = await page.evaluate(() => {
      const x = __x1,
        out = {};
      x.renderer.setAnimationLoop(null);
      let now = performance.now() + 1000;
      // skip the GPU work: queued frames on the software renderer hold up the next pages. The craft is placed before drawing
      const draw = x.renderer.render;
      x.renderer.render = () => {};
      const st = (a) => {
        const m = a.reduce((p, c) => p + c) / a.length;
        return Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length) / m;
      };
      for (const fps of [60, 90, 144]) {
        const D = [],
          R = [];
        let pd = null,
          pr = null;
        for (let f = 0; f < 240; f++) {
          now += 1000 / fps;
          x.tick(now);
          const d = x.craft.position.clone(),
            q = x.G.s.p,
            rr = new x.THREE.Vector3(q[1], -q[2], -q[0]);
          if (pd) {
            D.push(d.distanceTo(pd));
            R.push(rr.distanceTo(pr));
          }
          pd = d;
          pr = rr;
        }
        out[fps] = [st(R), st(D)];
      }
      x.renderer.render = draw;
      return out; // the loop stays stopped: this page is closed next
    });
    for (const fps of [60, 90, 144])
      ok(
        r[fps][1] < 0.05 && r[fps][1] < r[fps][0] / 3,
        fps + ' fps: craft moves evenly frame to frame',
        'physics steps ' + (r[fps][0] * 100).toFixed(0) + '% uneven, drawn ' + (r[fps][1] * 100).toFixed(1) + '%',
      );
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Horn: a new best lap blasts the ships' horn; a slower lap does not
  async horn(b) {
    const { page, errors, ctx } = await H.open(b, GP);
    await H.startSI(page);
    const r = await page.evaluate(() => {
      // a blast pushes the ambient horn's timer back to at least 40 s, which is how the calls are seen here
      const x = __x1,
        n = [];
      x.G.mode = 'demo';
      x.G.assist = false;
      x.G.laps.length = 0;
      x.recalc();
      x.AU.horn = 0;
      x.recordLap(61.0, 61.0, true);
      n.push(x.AU.horn >= 40); // first lap: a best
      x.AU.horn = 0;
      x.recordLap(62.0, 62.0, true);
      n.push(x.AU.horn >= 40); // slower: no horn
      x.AU.horn = 0;
      x.recordLap(60.5, 60.5, true);
      n.push(x.AU.horn >= 40); // faster: horn
      x.AU.horn = 0;
      x.recordLap(59.0, 59.0, false);
      n.push(x.AU.horn >= 40); // invalid: no horn
      return n;
    });
    ok(r[0] && !r[1] && r[2] && !r[3], 'horn on a new best lap only', r.join(' '));
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Motion: packets are 10 ms of sim time apart, well formed, and the seat parks on a reset
  async motion(b) {
    const { page, errors, ctx } = await H.open(b, GP, { query: '?motion' });
    await H.startSI(page);
    const r = await page.evaluate(() => {
      const x = __x1,
        M = x.MOTION,
        out = [];
      x.G.paused = true;
      M.ws = {
        readyState: 1,
        bufferedAmount: 0,
        send(buf) {
          const v = new DataView(buf),
            f = (o) => v.getFloat32(o, true);
          out.push({
            magic: String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)),
            len: buf.byteLength,
            seq: v.getUint32(4, true),
            t: f(8),
            flags: v.getUint16(12, true),
            pc: f(16),
            rc: f(20),
            roll: f(28),
            heave: f(44),
          });
        },
      };
      M.ok = true;
      M.retry = 1e15;
      x.reset('demo');
      x.G.paused = false;
      let now = performance.now();
      for (let fr = 0; fr < 60 * 40; fr++) {
        for (let k = 0; k < 3; k++) {
          x.simStep();
          if (x.G.s.crash) {
            x.G.s.crash = null;
            M.crash = true;
            x.recover();
          }
        }
        now += 15;
        x.motionTick(now);
      }
      const fly = out.slice();
      out.length = 0;
      x.reset('demo');
      for (let fr = 0; fr < 100; fr++) {
        for (let k = 0; k < 3; k++) x.simStep();
        now += 15;
        x.motionTick(now);
      }
      const park = out.slice();
      out.length = 0;
      x.G.paused = true;
      for (let fr = 0; fr < 5; fr++) {
        now += 15;
        x.motionTick(now);
      }
      const dts = [];
      for (let i = 1; i < fly.length; i++) dts.push(fly[i].t - fly[i - 1].t);
      let maxStep = 0;
      for (let i = 1; i < fly.length; i++)
        maxStep = Math.max(maxStep, Math.abs(fly[i].pc - fly[i - 1].pc), Math.abs(fly[i].rc - fly[i - 1].rc));
      return {
        n: fly.length,
        first: fly[0],
        dtMin: Math.min(...dts),
        dtMax: Math.max(...dts),
        maxStep,
        maxRc: Math.max(...fly.map((p) => Math.abs(p.rc))),
        maxPc: Math.max(...fly.map((p) => Math.abs(p.pc))),
        seqOK: fly.every((p, i) => i === 0 || p.seq === fly[i - 1].seq + 1),
        parkFlag: park[0].flags,
        parkEnd: park[park.length - 1],
        pausedN: out.length,
        pausedFlags: out.length ? out[0].flags : 0,
      };
    });
    ok(r.n === 3600, '100 packets per second of flight', r.n + ' in 36 s');
    ok(r.first.magic === 'X1M2' && r.first.len === 64, 'packet is 64 bytes tagged X1M2');
    ok(
      near(r.dtMin, 0.01, 1e-3) && near(r.dtMax, 0.01, 1e-3),
      'packets are 10 ms of sim time apart',
      r.dtMin.toFixed(4) + ' .. ' + r.dtMax.toFixed(4),
    );
    ok(r.seqOK, 'sequence numbers run without gaps');
    ok(
      r.maxRc > 0.5 && r.maxRc <= 1 && r.maxPc > 0.3 && r.maxPc <= 1,
      'commands move and stay within -1..1',
      'pitch ' + r.maxPc.toFixed(2) + ', roll ' + r.maxRc.toFixed(2),
    );
    ok(r.maxStep <= 0.0251, 'rate limit holds: 2.5 full-scale per second', r.maxStep.toFixed(4) + ' per packet');
    ok(r.parkFlag & 2 && r.parkFlag & 32, 'a reset is flagged and parks the seat', 'flags ' + r.parkFlag);
    ok(Math.abs(r.parkEnd.pc) < 0.05 && Math.abs(r.parkEnd.rc) < 0.05, 'seat is level 1.5 s after a reset');
    ok(r.pausedN === 5 && r.pausedFlags & 4, 'paused: one parked packet per frame');
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },

  // Motion end to end: the real helper, a real WebSocket, UDP out at a steady rate
  async link(b) {
    const port = 4580 + Math.floor(Math.random() * 200),
      uport = 41230 + Math.floor(Math.random() * 200);
    const sock = dgram.createSocket('udp4');
    const got = [];
    sock.on('message', (m) => got.push({ t: process.hrtime.bigint(), m }));
    await new Promise((r) => sock.bind(uport, '127.0.0.1', r));
    const py = spawn('python3', [
      path.resolve(__dirname, '../../tools/motion/x1_motion_link.py'),
      '--port',
      String(port),
      '--udp',
      '127.0.0.1:' + uport,
      '--allow-origin',
      'http://x1.test',
      '--quiet',
    ]);
    await new Promise((r) => setTimeout(r, 700));
    const { page, errors, ctx } = await H.open(b, GP, { query: '?motion=' + port });
    await H.startSI(page);
    await page.waitForTimeout(6000);
    const chip = await page.evaluate(() => (document.getElementById('cMotion') || {}).textContent);
    const n1 = got.length;
    await ctx.close();
    await new Promise((r) => setTimeout(r, 1800));
    const tail = got.slice(n1),
      last = got[got.length - 1];
    py.kill();
    sock.close();
    ok(chip === 'MOTION', 'the sim links to the helper', chip);
    ok(n1 > 50, 'UDP packets arrive', n1 + ' in 6 s'); // 100 per second of sim time; a slow software renderer runs the sim slower than real time
    ok(
      got.every((g) => g.m.length === 64 && g.m.toString('latin1', 0, 4) === 'X1M2'),
      'every UDP packet is a 64-byte X1M2',
    );
    ok(
      tail.length > 5 &&
        last.m.readUInt16LE(12) & 2 &&
        Math.abs(last.m.readFloatLE(16)) < 0.02 &&
        Math.abs(last.m.readFloatLE(20)) < 0.02,
      'helper parks the seat when the sim goes away',
      tail.length + ' parked packets',
    );
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
  },

  // Falcon 9 page: the pad loads, flags top the tallest structure, the tower is solid, and the rocket leaves
  async falcon9(b) {
    const { page, errors, ctx } = await H.open(b, F9);
    await H.startSI(page);
    await page.waitForFunction('__x1.F9.ready', null, { timeout: 120000 });
    const r = await page.evaluate(() => {
      const x = __x1,
        F = x.F9,
        [cx, cy] = F.cxy;
      return {
        flagY: F.flags.getWorldPosition(new x.THREE.Vector3()).y,
        flagLocal: F.flags.position.toArray(),
        hitFar: x.f9Hit(cx + 400, cy, 30),
        grid: !!F.grid,
      };
    });
    ok(
      near(r.flagLocal[1], 39.42, 0.3) && near(r.flagLocal[0], 18.5, 0.6),
      'flags stand on the measured mast tip',
      r.flagLocal.map((v) => v.toFixed(2)).join(', '),
    );
    ok(r.flagY > 80, 'flags are high on the pad, over 80 m up', r.flagY.toFixed(1) + ' m');
    ok(r.grid && !r.hitFar, 'clear air away from the pad is not a hit');
    // the cockpit's pitch ladder is drawn on the overlay; during the launch shot the overlay must be empty
    const ink = () =>
      page.evaluate(() => {
        const c = document.getElementById('o2d'),
          g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < g.length; i += 16) if (g[i] > 20) n++;
        return n;
      });
    await page.evaluate(() => __x1.setView(1));
    await page.waitForTimeout(800);
    const inCockpit = await ink();
    await page.evaluate(() => __x1.f9Count()); // the T-minus countdown cuts to the launch cameras
    await page.waitForTimeout(800);
    const shotOn = await page.evaluate(() => !!__x1.G.f9cam);
    const inShot = await ink();
    await page.evaluate(() => {
      const x = __x1;
      x.F9.cd = null;
      x.f9Reset();
      x.f9CamEnd();
    });
    ok(
      shotOn && inCockpit > 50 && inShot === 0,
      'cockpit HUD is not drawn over the launch shot',
      'cockpit ' + inCockpit + ' px, launch shot ' + inShot + ' px',
    );
    await H.hideUI(page);
    await page.waitForTimeout(500);
    // stepped by hand, so a slow software renderer does not decide how far the rocket gets
    const h = await page.evaluate(() => {
      const x = __x1;
      x.f9Launch();
      for (let i = 0; i < 160; i++) x.f9Tick(0.05);
      return { tau: x.F9.tau, h: x.F9.h };
    });
    await page.waitForTimeout(800);
    ok(h.tau > 2 && h.h > 5, 'the rocket lifts off', 'T+' + h.tau.toFixed(1) + ' s, ' + h.h.toFixed(0) + ' m up');
    await H.shot(page, 'falcon9_liftoff');
    // the upper arm: still at T-10, swinging from T-10, fully clear (9 deg) by T-4, before liftoff
    const arm = await page.evaluate(() => {
      const x = __x1,
        F = x.F9,
        out = {};
      F.tau = 80; // the rocket from the liftoff check is long gone, so a new countdown may start
      x.f9Count();
      out.at10 = F.arm.k;
      for (let i = 0; i < 400 && F.cd != null; i++) {
        x.f9Tick(0.025);
        const t = Math.round(F.cd * 10) / 10;
        if (t === 7) out.at7 = F.arm.k;
        if (t === 4) out.at4 = F.arm.k;
        if (F.tau >= 0 && out.atIgn == null) out.atIgn = F.arm.k;
      }
      out.deg = (-F.arm.g.rotation.y * 180) / Math.PI;
      out.parts = F.arm.g.children.length;
      x.f9CamEnd();
      return out;
    });
    ok(
      arm.parts >= 4 && arm.at10 === 0 && arm.at7 > 0.2 && arm.at7 < 0.8,
      'the upper arm starts swinging at T-10',
      JSON.stringify(arm),
    );
    ok(
      arm.at4 > 0.99 && arm.atIgn === 1 && Math.abs(arm.deg - 9) < 0.01,
      'and is fully clear, 9 deg out, by T-4 and before ignition',
    );
    // Max detail off (K) takes the pad away with the ships; on again brings both back
    await page.evaluate(() => {
      document.getElementById('bDetail').click();
    });
    await page.waitForTimeout(500);
    const off = await page.evaluate(() => {
      const x = __x1;
      let inScene = false;
      x.scene.traverse((o) => {
        if (o.name === 'rocket') inScene = true;
      });
      return {
        ready: x.F9.ready,
        root: !!x.F9.root,
        inScene,
        flags: x.FLAGS.filter((f) => f.f9).length,
        ships: !!x.SHIP.objs,
      };
    });
    ok(
      !off.ready && !off.root && !off.inScene && off.flags === 0 && !off.ships,
      'Max detail off removes the ships, the Falcon 9 and its pad',
      JSON.stringify(off),
    );
    await page.evaluate(() => {
      document.getElementById('bDetail').click();
    });
    await page.waitForFunction('__x1.F9.ready && __x1.SHIP.objs', null, { timeout: 120000 }).catch(() => {});
    const on = await page.evaluate(() => ({ ready: __x1.F9.ready, ships: !!(__x1.SHIP.objs || __x1.SHIP.err) }));
    ok(on.ready, 'Max detail on brings the Falcon 9 back', JSON.stringify(on));
    ok(errors.length === 0, 'no page errors', errors.join(' | ') || undefined);
    await ctx.close();
  },
};

(async () => {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(checks);
  const b = await H.launch();
  for (const n of names) {
    if (!checks[n]) {
      console.log('no check called ' + n + '. There are: ' + Object.keys(checks).join(', '));
      process.exitCode = 2;
      continue;
    }
    console.log(n);
    try {
      await checks[n](b);
    } catch (e) {
      ok(false, n + ' ran to the end', String((e && e.message) || e).split('\n')[0]);
    }
  }
  await b.close();
  const bad = results.filter((r) => !r.ok);
  console.log(
    '\n' +
      (results.length - bad.length) +
      ' of ' +
      results.length +
      ' passed' +
      (bad.length ? ', ' + bad.length + ' FAILED' : ''),
  );
  if (bad.length) process.exitCode = 1;
})();
