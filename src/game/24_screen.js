/* ---------- pool deck screen ----------
   Each ship has a big outdoor screen over the pool (the black panel, 7.3 m x 4 m to scale, facing forward from the aft superstructure,
   model x -2.9..2.9, y 32.3..35.5, z 0.39). It shows the race feed: a chase camera on the SkyRacer, rendered into a
   512x280 texture about 24 times a second (12 beyond 350 m, and less again when the frame rate sags), and only while
   a screen is in view and within 900 m, so it costs nothing the rest of the time. Both ships share the one feed. */
const SCR = {
  meshes: [],
  rt: null,
  cam: new THREE.PerspectiveCamera(56, 5.84 / 3.2, 0.7, 9000),
  acc: 0,
  far: false,
  p: new THREE.Vector3(),
  l: new THREE.Vector3(),
  init: false,
  fr: new THREE.Frustum(),
  m: new THREE.Matrix4(),
};
function shipScreen(o) {
  if (!SCR.rt) {
    SCR.rt = new THREE.WebGLRenderTarget(512, 280, { samples: 0 });
    SCR.rt.texture.anisotropy = 4;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(5.84, 3.2),
    new THREE.MeshBasicMaterial({ map: SCR.rt.texture, fog: false, toneMapped: false }),
  );
  m.position.set(0, 33.9, 0.43);
  m.userData.flag = true;
  m.userData.screen = true;
  o.add(m);
  SCR.meshes.push(m);
  return m;
}
function screenFeed(dt, pos, hdg) {
  if (!SCR.meshes.length) return;
  SCR.acc += dt;
  if (SCR.acc < (PERF.k * (SCR.far ? 2 : 1)) / 24) return;
  // in view? (in VR the headset's pose is not the page camera, so there only the distance counts)
  let vis = false;
  const xr = XR();
  if (!xr) {
    SCR.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    SCR.fr.setFromProjectionMatrix(SCR.m);
  }
  const eye = xr ? rig.position : cam.position;
  let near = 1e9;
  for (const m of SCR.meshes) {
    m.getWorldPosition(SCR.p);
    const d = SCR.p.distanceTo(eye);
    if (d < 900 && (xr || SCR.fr.intersectsObject(m))) {
      vis = true;
      near = Math.min(near, d);
    }
  }
  SCR.far = near > 350; // a screen that far off is a few pixels: half the rate
  const k = 1 - Math.exp(-SCR.acc * 3.5);
  SCR.acc = 0;
  // chase camera, smoothed the same way as the chase view
  const wantP = pos
      .clone()
      .addScaledVector(hdg, -14)
      .add(new THREE.Vector3(0, 4.4, 0)),
    wantL = pos
      .clone()
      .addScaledVector(hdg, 9)
      .add(new THREE.Vector3(0, 1, 0));
  if (!SCR.init || SCR.p.copy(SCR.cam.position).distanceTo(wantP) > 60) {
    SCR.cam.position.copy(wantP);
    SCR.l.copy(wantL);
    SCR.init = true;
  }
  SCR.cam.position.lerp(wantP, k);
  SCR.l.lerp(wantL, k * 1.3);
  if (SCR.cam.position.y < 1.2) SCR.cam.position.y = 1.2;
  SCR.cam.lookAt(SCR.l);
  SCR.cam.updateMatrixWorld();
  if (!vis) return;
  const xe = renderer.xr.enabled;
  renderer.xr.enabled = false;
  const skyP = sky.position.clone();
  sky.position.copy(SCR.cam.position);
  renderer.setRenderTarget(SCR.rt);
  renderer.render(scene, SCR.cam);
  renderer.setRenderTarget(null);
  renderer.xr.enabled = xe;
  sky.position.copy(skyP);
}
