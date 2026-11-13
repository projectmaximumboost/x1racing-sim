// The loading screen's boost needle, run with a fake clock at 60 fps: it must take at least 2.5 s to reach full boost
// however fast the load is, hold full boost 0.5 s, then open on the sim; on a slow load it follows the load.
//   node tests/loader_needle.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../src/shell.html'), 'utf8');
const src = html.match(/<script>\s*(\/\* ---------- loading screen[\s\S]*?)<\/script>/)[1];

function run(progressAt) {
  let now = 0;
  const cbs = [];
  const el = () => ({ style: {}, hidden: false, textContent: '' });
  const els = {
    ldGauge: Object.assign(el(), { width: 560, height: 330, getContext: () => new Proxy({}, { get: () => () => {} }) }),
    ldStage: el(),
    ldBg: el(),
    loading: el(),
    ldMsg: el(),
    ldWord: el(),
  };
  const win = {};
  const sandbox = {
    window: win,
    document: { getElementById: (id) => els[id] },
    performance: { now: () => now },
    requestAnimationFrame: (f) => cbs.push(f),
    console,
  };
  new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
  const L = win.X1L,
    out = [];
  let revealed = null;
  L.onReveal = () => (revealed = now / 1000);
  for (let f = 0; f < 60 * 15 && !els.loading.hidden; f++) {
    now += 1000 / 60;
    for (const [t, p] of progressAt) if (now / 1000 >= t) L.p(p);
    const q = cbs.splice(0);
    q.forEach((c) => c(now));
    out.push([now / 1000, L.x]);
  }
  return { L, out, revealed, hidden: els.loading.hidden ? now / 1000 : null };
}
let bad = 0;
const ok = (c, m, d) => {
  console.log((c ? '  ok    ' : '  FAIL  ') + m + (d ? '  [' + d + ']' : ''));
  if (!c) bad++;
};
const fast = run([
  [0.05, 0.4],
  [0.1, 0.6],
  [0.15, 0.9],
  [0.2, 1],
]);
const firstMax = fast.out.find(([, x]) => x > 0.97);
ok(
  firstMax && firstMax[0] >= 2.5,
  'instant load: full boost not before 2.5 s',
  'first at ' + (firstMax && firstMax[0].toFixed(2)) + ' s',
);
ok(
  fast.revealed && Math.abs(fast.revealed - fast.L.full - 0.5) < 0.05,
  'holds full boost 0.5 s, then opens',
  'full ' + fast.L.full.toFixed(2) + ' s, opens ' + fast.revealed.toFixed(2) + ' s',
);
ok(
  fast.hidden && fast.hidden - fast.revealed > 0.8 && fast.hidden - fast.revealed < 1.1,
  'the 3D reveal takes about 0.9 s',
  (fast.hidden - fast.revealed).toFixed(2) + ' s',
);
// smooth climb: no jumps, and it rises over the first 2.5 s
let maxJump = 0;
for (let i = 1; i < fast.out.length; i++) maxJump = Math.max(maxJump, Math.abs(fast.out[i][1] - fast.out[i - 1][1]));
ok(maxJump < 0.06, 'the needle moves smoothly', 'largest step ' + maxJump.toFixed(3) + ' a frame');
const at = (r, t) => r.out.find(([s]) => s >= t)[1];
ok(
  at(fast, 0.5) < at(fast, 1.5) && at(fast, 1.5) < at(fast, 2.4),
  'it climbs through the boost',
  [0.5, 1.5, 2.4].map((t) => at(fast, t).toFixed(2)).join(', '),
);
const slow = run([
  [0.5, 0.4],
  [1.5, 0.5],
  [2, 0.6],
  [5, 0.9],
  [7, 1],
]);
ok(
  at(slow, 4.5) < 0.65 && at(slow, 4.5) > 0.45,
  'slow load: the needle waits with the load',
  'at 4.5 s ' + at(slow, 4.5).toFixed(2),
);
ok(
  slow.L.full > 7 && slow.L.full < 8.5 && Math.abs(slow.revealed - slow.L.full - 0.5) < 0.05,
  'and goes to full boost once loaded',
  'full ' + slow.L.full.toFixed(2) + ' s',
);
console.log(bad ? bad + ' FAILED' : 'all passed');
process.exitCode = bad ? 1 : 0;
