const X = require('../src/physics.js');
const env = { height: () => -1e3, solid: () => false };
const dt = 0.005;
for (const b of [0, 0.25, 0.5, 1]) {
  const s = X.newState({ alt: 30, hT: 30 });
  s.v = [60, 0, 0];
  for (let k = 0; k < 8; k++) s.spool[k] = 0.6;
  let mx = 0;
  for (let t = 0; t < 14; t += dt) {
    const u = X.fbw(
      s,
      { altHold: true, altTarget: 300, roll: 0, throttle: 1, thetaOff: -4 * X.D2R, phiC: 0, yaw: 0, boost: b },
      dt,
      0,
    );
    X.step(s, u, dt, env);
    if (t > 3) mx = Math.max(mx, s.P);
  }
  console.log('LT', b, 'peak hp', mx | 0, 'soc', s.soc.toFixed(2));
}
