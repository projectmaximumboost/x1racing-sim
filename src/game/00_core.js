if (window.X1L) X1L.p(0.6); // the sim's own script is running
const X = X1P,
  DEF = X1COURSE,
  C = X.C,
  D2R = X.D2R,
  clamp = X.clamp,
  lerp = X.lerp;
const course = X.buildCourse(DEF),
  P = course.P,
  N = course.n,
  SP = course.spires,
  PAD = DEF.pad;
const SPIRE_H = 61,
  PROF = [
    [0, 9.74],
    [15.24, 7.5],
    [30.48, 4.54],
    [45.72, 2.12],
    [54.9, 1.1],
    [60.3, 0.76],
  ]; // Inflatable_Spire report, 200 ft
const spireR = (h) => {
  if (h < 0 || h > SPIRE_H) return 0;
  for (let i = 1; i < PROF.length; i++)
    if (h <= PROF[i][0]) {
      const a = PROF[i - 1],
        b = PROF[i];
      return lerp(a[1], b[1], (h - a[0]) / (b[0] - a[0]));
    }
  return 0.7;
};
const $ = (id) => document.getElementById(id);
const F9_ON =
  '@@F9@@' ===
  'true'; /* set by tools/build.py: true in the Falcon 9 page, false in the Grand Prix page. The launch pad, countdown and Starlink train only exist when it is true */
document.body.classList.toggle('f9', F9_ON);
const gShip = (n, e) => (typeof shipGround === 'function' && G.s ? shipGround(e, n, -G.s.p[2]) : null);
const env = {
  height: (n, e) => {
    const s = gShip(n, e);
    return s != null ? Math.max(s, DEF.landH(e, n)) : DEF.landH(e, n);
  },
  solid: (n, e) => DEF.landH(e, n) > 0.2 || gShip(n, e) != null,
  brake: true,
};
const groundH = (s) => env.height(s.p[0], s.p[1]);
const toW = (x, y, z) => new THREE.Vector3(x, z, -y); // course (E,N,up) -> three
const ned = (v) => new THREE.Vector3(v[1], -v[2], -v[0]); // NED -> three
