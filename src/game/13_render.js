/* ---------- render ---------- */
const v3 = new THREE.Vector3(),
  camPos = new THREE.Vector3(),
  camLook = new THREE.Vector3(),
  tmpM = new THREE.Matrix4();
const EYE = new THREE.Vector3(0.3, 1.16, 0.78);
/* The dash screen and the pool-deck screen each draw the scene a second time. PERF.k stretches the gap between those
   extra draws when the frame rate sags (1 at 45 fps and up, 2 below that, 3 below 28 fps), so a phone gives the main
   view the time instead. */
const PERF = { dt: 1 / 60, k: 1 };
function perfTick(dt) {
  PERF.dt += (Math.min(dt, 0.1) - PERF.dt) * 0.05;
  const k = PERF.dt > 1 / 28 ? 3 : PERF.dt > 1 / 45 ? 2 : 1;
  if (k > PERF.k || PERF.dt < (PERF.k === 3 ? 1 / 32 : 1 / 50)) PERF.k = k;
}
function render(dt, now) {
  motionTick(now);
  perfTick(dt);
  const s = G.s,
    t = now / 1000;
  const pos = ned(s.p);
  craft.position.copy(pos);
  const F = ned(X.rotV(s.q, [1, 0, 0])),
    R = ned(X.rotV(s.q, [0, 1, 0])),
    Dn = ned(X.rotV(s.q, [0, 0, 1]));
  tmpM.makeBasis(R.clone().negate(), Dn.clone().negate(), F);
  craft.quaternion.setFromRotationMatrix(tmpM);
  applyFold();
  for (const f of fans) {
    if (G.foldT > 0) {
      f.o.rotation.y = f.y0;
      continue;
    }
    const sp = s.spool[f.i];
    f.o.rotation[f.axis] += f.sg * Math.min(sp * 62, 1.3 + sp * 0.6) * (dt * 60) * 0.33;
  }
  // fx
  const h = -s.p[2],
    wash = clamp(1 - (h - 3) / 26, 0, 1) * clamp(s.P / 700, 0, 1);
  waterU.t.value = t;
  waterU.craft.value.copy(pos);
  waterU.wash.value = DEF.landH(s.p[1], s.p[0]) > 0.1 ? 0 : wash;
  waterU.cam.value.copy(XR() ? rig.position : cam.position);
  if (wash > 0.15 && DEF.landH(s.p[1], s.p[0]) < 0.1)
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 6.3,
        r = 8 + Math.random() * 7;
      emit(
        pos.x + Math.cos(a) * r,
        0.3,
        pos.z + Math.sin(a) * r,
        Math.cos(a) * 9 + ned(s.v).x * 0.3,
        2 + Math.random() * 4,
        Math.sin(a) * 9 + ned(s.v).z * 0.3,
      );
    }
  for (let i = 0; i < SPN; i++) {
    if (spL[i] > 0) {
      spL[i] -= dt * 0.8;
      spPos[i * 3] += spV[i * 3] * dt;
      spPos[i * 3 + 1] += spV[i * 3 + 1] * dt;
      spPos[i * 3 + 2] += spV[i * 3 + 2] * dt;
      spV[i * 3 + 1] -= dt * 5;
    }
  }
  spG.attributes.position.needsUpdate = true;
  spG.attributes.life.needsUpdate = true;
  shadow.position.set(pos.x + SUN.x * -h * 0.4, DEF.landH(s.p[1], s.p[0]) + 0.1, pos.z + SUN.z * -h * 0.4);
  shadow.material.opacity = clamp(1 - h / 60, 0, 1);
  for (const o of spireObjs) {
    o.wob = Math.max(0, o.wob - dt * 0.5);
    const w = Math.sin(t * 5 + o.ph) * o.wob * 0.06 + Math.sin(t * 0.7 + o.ph) * 0.004;
    o.inner.rotation.z = w;
    o.inner.rotation.x = Math.cos(t * 0.6 + o.ph) * 0.003;
    o.G.position.y = Math.sin(t * 0.8 + o.ph) * 0.12;
    const nx = G.next < SP.length && o.idx === G.next;
    o.lamp.scale.setScalar(nx ? 1.2 + 0.9 * (0.5 + 0.5 * Math.sin(t * 8)) : 1);
  }
  if (SHIP.radars) for (const r of SHIP.radars) r.rotation.y = r.userData.y0 - t * 2.0944;
  ribU.t.value = t;
  ribU.craftS.value = G.idx * course.S;
  skyMat.uniforms.t.value = t;
  sky.position.copy(XR() ? rig.position : cam.position);
  // camera
  const hdg =
    Math.hypot(s.v[0], s.v[1]) > 6 ? ned([s.v[0], s.v[1], 0]).normalize() : new THREE.Vector3(F.x, 0, F.z).normalize();
  const intro = G.intro && !XR();
  let V = intro ? (SHOTS[INTRO.i].fly && CLIP.ready ? 1 : 0) : G.view; // the race clip in the opening is a cockpit shot
  if (V === 4 && !XR()) {
    V = TV.shot(dt, pos, hdg);
  }
  camVis(V === 4 ? 0 : V);
  const k = 1 - Math.exp(-dt * (V === 2 ? 2.2 : 4.2));
  if (intro) introCam(dt, pos, hdg);
  else if (G.f9cam && !XR()) f9Cam(dt);
  else if (XR()) {
    vrCam(pos, hdg, F, k);
    vrPointer();
  } else if (vMark.visible) {
    vMark.visible = vArrow.visible = vRange.visible = false;
  } else if (V >= 5) {
    rig.position.set(0, 0, 0);
    rig.quaternion.identity();
    TV.cam(dt, pos, hdg, R);
  } else if (V === 3) {
    rig.position.set(0, 0, 0);
    rig.quaternion.identity();
    deckCam(dt, pos);
  } else if (V === 1) {
    rig.position.set(0, 0, 0);
    rig.quaternion.identity();
    craft.updateMatrixWorld(true);
    const e = EYE.clone().add(inner.position);
    cam.position.copy(e.applyMatrix4(craft.matrixWorld));
    cam.up.copy(Dn).negate();
    cam.lookAt(cam.position.clone().add(F).sub(Dn.clone().multiplyScalar(-0.02)));
    cam.fov = lerp(cam.fov, 74, 0.1);
  } else {
    rig.position.set(0, 0, 0);
    rig.quaternion.identity();
    const ch = V !== 2,
      back = ch ? 13.5 : 62,
      up = ch ? 4.6 : 30;
    const wantP = pos
        .clone()
        .addScaledVector(hdg, -back)
        .add(new THREE.Vector3(0, up, 0)),
      wantL = pos
        .clone()
        .addScaledVector(hdg, ch ? 9 : 70)
        .add(new THREE.Vector3(0, ch ? 1 : -6, 0));
    if (!camInit || camPos.distanceTo(wantP) > back * 4) {
      camPos.copy(wantP);
      camLook.copy(wantL);
      camInit = true;
    }
    camPos.lerp(wantP, k);
    camLook.lerp(wantL, k * 1.3);
    cam.position.copy(camPos);
    if (cam.position.y < 1.2) cam.position.y = 1.2;
    cam.up.set(0, 1, 0);
    cam.up.set(0, 1, 0);
    cam.lookAt(camLook);
    if (ch) cam.rotateZ(-s.phi * 0.22);
    cam.fov = lerp(cam.fov, (ch ? 60 : 52) + clamp(s.V / 85, 0, 1) * 12, 0.08);
  }
  if (!XR() && V !== 1) {
    const nr = clamp(cam.position.y / 55, 0.7, 12);
    if (Math.abs(cam.near - nr) > 0.05) cam.near = nr;
  } /* near plane follows height: depth precision where it is needed, no shoreline shimmer from high up */
  cam.updateProjectionMatrix();
  if (FLAGS.length) flagTick(t);
  f9Tick(dt);
  starlinkTick(dt, cam.position);
  screenFeed(dt, pos, hdg);
  dashTick(dt, pos, hdg);
  renderer.render(scene, cam);
  audio(dt);
  hud(now);
  fanMeter(Math.max(dt, 0.016));
}
