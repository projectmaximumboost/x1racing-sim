/* ---------- twilight ----------
   O, the Twilight button or d-pad left. The sun drops to 6 degrees above the horizon on the same bearing, the sky and
   water take the dusk palette, the lights go warm and low, and the ships put their lights on. Remembered on this device. */
const TWI = {
  on: false,
  KEY: 'x1-skyracer-twilight-v1',
  sunDay: SUN.clone(),
  haze: HAZE.clone(),
  sunTw: new THREE.Vector3(SUN.x, 0, SUN.z)
    .normalize()
    .multiplyScalar(Math.cos(6 * D2R))
    .setY(Math.sin(6 * D2R)),
};
function twiApply() {
  const on = TWI.on;
  SUN.copy(on ? TWI.sunTw : TWI.sunDay);
  sunL.position.copy(SUN).multiplyScalar(100);
  sunL.color.set(on ? 0xff8f50 : 0xfff0dc);
  sunL.intensity = on ? 2 : 2.3;
  hemi.color.set(on ? 0x6c7ab4 : 0xdcecff);
  hemi.groundColor.set(on ? 0x2c2536 : 0x47606e);
  hemi.intensity = on ? 0.45 : 0.85;
  renderer.toneMappingExposure = on ? 1 : 0.95;
  scene.fog.color.copy(on ? new THREE.Color(0.17, 0.14, 0.21) : TWI.haze);
  scene.fog.near = on ? 700 : 900;
  scene.fog.far = on ? 5200 : 6200;
  skyMat.uniforms.tw.value = on ? 1 : 0;
  waterU.tw.value = on ? 1 : 0;
  rebuildEnv();
  shipsLight();
  $('bTw').classList.toggle('on', on);
  try {
    localStorage.setItem(TWI.KEY, on ? '1' : '0');
  } catch (e) {}
}
function twiT(v) {
  TWI.on = v === undefined ? !TWI.on : !!v;
  twiApply();
  banner(TWI.on ? 'TWILIGHT' : 'DAYLIGHT', 'Press O to switch', 1200);
}
$('bTw').onclick = (e) => {
  twiT();
  e.target.blur();
};
addEventListener('keydown', (e) => {
  if (
    e.code === 'KeyO' &&
    !e.repeat &&
    $('help').hidden &&
    $('lb').hidden &&
    $('share').hidden &&
    !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')
  )
    twiT();
});
try {
  if (localStorage.getItem(TWI.KEY) === '1') {
    TWI.on = true;
    twiApply();
  }
} catch (e) {}
