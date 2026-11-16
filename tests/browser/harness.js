// Shared set-up for the browser checks: a headless Chromium with WebGL, and the built pages from dist/ served at
// http://x1.test/. Three.js comes from the CDN as it does for players; to run offline, point X1_VENDOR at a folder
// holding three.min.js and GLTFLoader.js (r147).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.resolve(__dirname, '../../dist');
const OUT = path.resolve(__dirname, 'out');
const VENDOR = process.env.X1_VENDOR || '';

async function launch() {
  return chromium.launch({
    args: [
      '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader',
      // lets the page reach a helper on 127.0.0.1 without the permission prompt (motion check)
      '--disable-features=LocalNetworkAccessChecks',
    ],
  });
}

// Open one of the built pages. opts: viewport, query ('?motion'), mobile (true for a touch phone)
async function open(browser, file, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 960, height: 540 },
    deviceScaleFactor: opts.scale || 1,
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'x1.test') {
      const f = path.join(DIST, decodeURIComponent(u.pathname.slice(1)));
      // the Claude artifact host serves the packs as .wasm; from dist they are .bin and .glb
      const alt = f.replace(/Ships\.wasm$/, 'Ships.bin').replace(/F9\.wasm$/, 'F9.glb');
      if (fs.existsSync(f)) return route.fulfill({ path: f });
      if (fs.existsSync(alt)) return route.fulfill({ path: alt });
      return route.fulfill({ status: 404, body: '' });
    }
    if (VENDOR) {
      for (const lib of ['three.min.js', 'GLTFLoader.js']) {
        if (u.pathname.endsWith('/' + lib)) return route.fulfill({ path: path.join(VENDOR, lib), contentType: 'text/javascript' });
      }
      return route.abort(); // offline: fonts and the leaderboard are not needed
    }
    return route.continue();
  });
  await page.goto('http://x1.test/' + file + (opts.query || ''));
  await page.waitForFunction('window.__x1', null, { timeout: 120000 });
  return { page, errors, ctx };
}

// Leave the opening sequence and let the sim settle with the SI flying
async function startSI(page) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (__x1.G.mode !== 'demo') __x1.reset('demo'); });
}

async function hideUI(page) {
  await page.evaluate(() => {
    for (const e of document.body.children) if (e.id !== 'view3d' && e.tagName !== 'SCRIPT') e.style.visibility = 'hidden';
  });
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
}

const haveShips = fs.existsSync(path.join(DIST, 'X1_SkyRacer_Ships.bin'));

module.exports = { launch, open, startSI, hideUI, shot, haveShips, DIST, OUT };
