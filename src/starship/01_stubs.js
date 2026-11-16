/* ---------- standalone page: the few sim names the environment files expect ----------
   The launch page reuses the sim's own sky, water, textures, spires, shore, ships and twilight files unchanged. These
   stand in for the race-only parts they touch (game state, VR, the ship screens, the Falcon 9 pad). */
const G = { foldWait: 0, foldTarget: null, mode: 'seq', intro: false, view: 0 };
const XR = () => false;
const SCR = { meshes: [] };
function shipScreen() {}
function f9Kick() {}
function f9Unload() {}
let bT = 0,
  camInit = false;
function banner(a, b, ms = 1600, color, cls) {
  const e = $('banner');
  e.textContent = a;
  if (b) {
    const s = document.createElement('small');
    s.textContent = b;
    e.append(s);
  }
  e.style.color = color || '';
  e.classList.toggle('big', cls === 'big');
  e.style.opacity = 1;
  bT = performance.now() + ms;
}
