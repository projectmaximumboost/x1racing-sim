const X = require('../src/physics.js');
const env = { height: () => -1e3, solid: () => false };
for (const [boost, off] of [
  [false, 0],
  [false, -2],
  [true, -5],
  [true, -8],
]) {
  const s = X.newState({ alt: 30, hT: 30 });
  s.v = [60, 0, 0];
  for (let t = 0; t < 200; t += 0.005) {
    const u = X.fbw(
      s,
      { altHold: true, altTarget: 30, roll: 0, throttle: 1, thetaOff: off * X.D2R, phiC: 0, yaw: 0 },
      0.005,
      0,
    );
    u.boost = boost;
    s.soc = 1;
    X.step(s, u, 0.005, env);
  }
  console.log(boost, off, (s.V * 2.237).toFixed(1), 'mph', s.P.toFixed(0), 'hp th', (s.theta / X.D2R).toFixed(1));
}
