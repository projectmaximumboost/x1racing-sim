// auto-thrust (right stick speed control): acceleration, top speed and height held through boost transients, hold and brake. Run with q for the summary only.
const X = require('../src/physics.js');
const env = { height: () => -1e3, solid: () => false };
function run(name, v0, stkf, bf, T = 25, quiet) {
  const s = X.newState({ alt: 30, hT: 30 });
  s.v = [v0, 0, 0];
  s.soc = 1;
  const at = X.makeAutoThrust();
  let mn = 1e9,
    mx = -1e9,
    t = 0,
    log = [],
    t150 = null;
  for (; t < T; t += 0.005) {
    const a = at.step(s, stkf(s, t), bf(s, t), 0.005, 30);
    const c = {
      altHold: true,
      roll: 0,
      pitch: 0,
      yaw: 0,
      climb: 0,
      throttle: a.throttle,
      thetaOff: a.thetaOff,
      boost: a.boost,
      noPushTilt: a.noPushTilt,
    };
    const u = X.fbw(s, c, 0.005, 0);
    X.step(s, u, 0.005, env);
    const h = -s.p[2];
    if (t > 0.5) {
      mn = Math.min(mn, h);
      mx = Math.max(mx, h);
    }
    if (t150 === null && s.V * 2.237 >= 150) t150 = t;
    if (Math.abs(t % 2.5) < 0.005)
      log.push(
        `${t.toFixed(1)}s ${(s.V * 2.237).toFixed(0)}mph h${h.toFixed(1)} th${(s.theta / X.D2R).toFixed(1)} allow${at.thN.toFixed(1)} P${s.P.toFixed(0)} push${(s.pushT[0] / X.C.pusherMax).toFixed(2)} ${at.mode}`,
      );
  }
  console.log(
    name.padEnd(34),
    'alt',
    mn.toFixed(1),
    '..',
    mx.toFixed(1),
    ' final',
    (s.V * 2.237).toFixed(0),
    'mph  t150',
    t150 ? t150.toFixed(1) : '-',
  );
  if (!quiet) console.log('  ' + log.join('\n  '));
}
const q = process.argv[2] === 'q';
run(
  'hover full fwd + boost',
  0,
  () => 1,
  () => 1,
  30,
  q,
);
run(
  'hover full fwd no boost',
  0,
  () => 1,
  () => 0,
  30,
  q,
);
run(
  '60 m/s full fwd + boost',
  60,
  () => 1,
  () => 1,
  20,
  q,
);
run(
  'boost toggles at speed',
  60,
  () => 1,
  (s, t) => t % 6 < 3,
  24,
  q,
);
run(
  'accel then release (hold)',
  0,
  (s, t) => (t < 12 ? 1 : 0),
  () => 0,
  30,
  q,
);
run(
  'accel then brake',
  0,
  (s, t) => (t < 12 ? 1 : -1),
  () => 1,
  30,
  q,
);
{
  const s = X.newState({ alt: 30, hT: 30 });
  s.v = [60, 0, 0];
  s.soc = 1;
  const at = X.makeAutoThrust();
  let mn = 1e9;
  for (let t = 0; t < 12; t += 0.005) {
    const a = at.step(s, 1, 1, 0.005, 30);
    const c = {
      altHold: true,
      roll: t > 2 ? 1 : 0,
      pitch: 0,
      yaw: 0,
      climb: 0,
      throttle: a.throttle,
      thetaOff: a.thetaOff,
      boost: a.boost,
      noPushTilt: true,
    };
    const u = X.fbw(s, c, 0.005, 0);
    X.step(s, u, 0.005, env);
    if (t > 0.5) mn = Math.min(mn, -s.p[2]);
  }
  console.log('full bank turn + fwd + boost      alt min', mn.toFixed(1), (s.V * 2.237).toFixed(0), 'mph');
}
