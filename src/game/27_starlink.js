/* ---------- Starlink train (twilight only) ----------
   A line of 48 evenly spaced points of light crossing the sky, the way a freshly launched Starlink batch looks at dusk:
   sunlit satellites against a darkening sky. One draw call, 48 points, fixed pixel size; it rides with the camera like the
   sky dome so it is always at "infinity". It crosses from low in the south-west to high in the north-east in about three
   minutes, fades in and out near the horizon, then goes round again. */
const SL = {
  n: 48,
  sp: 0.75 * D2R,
  spd: 0.32 * D2R,
  t: 0,
  R: 7000,
  arc: 150 * D2R,
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  v: new THREE.Vector3(),
};
{
  // the great circle: from azimuth 215 deg, 6 deg up, through a point 58 deg up toward azimuth 40 deg
  const dir = (az, el) =>
    new THREE.Vector3(
      Math.sin(az * D2R) * Math.cos(el * D2R),
      Math.sin(el * D2R),
      -Math.cos(az * D2R) * Math.cos(el * D2R),
    );
  SL.a.copy(dir(215, 6));
  const p = dir(40, 58);
  SL.b.copy(p).addScaledVector(SL.a, -p.dot(SL.a)).normalize(); // b is 90 deg along the arc from a
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL.n * 3), 3));
  g.setAttribute('al', new THREE.BufferAttribute(new Float32Array(SL.n), 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { px: { value: 2.6 } },
    vertexShader: `attribute float al;varying float a;uniform float px;void main(){a=al;gl_PointSize=px;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float a;void main(){vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;gl_FragColor=vec4(vec3(1.,.97,.9),a*(1.-r*.6));}`,
  });
  SL.pts = new THREE.Points(g, m);
  SL.pts.frustumCulled = false;
  SL.pts.visible = false;
  SL.pts.renderOrder = -1;
  scene.add(SL.pts);
}
function starlinkTick(dt, eye) {
  const on = F9_ON && typeof TWI !== 'undefined' && TWI.on && !XR();
  SL.pts.visible = on;
  if (!on) return;
  SL.t += dt;
  const head = (SL.t * SL.spd) % (SL.arc + SL.n * SL.sp),
    P = SL.pts.geometry.attributes.position,
    A = SL.pts.geometry.attributes.al;
  for (let i = 0; i < SL.n; i++) {
    const th = head - i * SL.sp,
      vis = th > 0 && th < SL.arc;
    const v = SL.v.copy(SL.a).multiplyScalar(Math.cos(th)).addScaledVector(SL.b, Math.sin(th));
    P.setXYZ(i, eye.x + v.x * SL.R, eye.y + v.y * SL.R, eye.z + v.z * SL.R);
    // fade at both ends of the arc (low in the haze) and a faint twinkle
    A.setX(
      i,
      vis
        ? Math.min(1, th / (12 * D2R), (SL.arc - th) / (18 * D2R)) * (0.75 + 0.25 * Math.sin(SL.t * 3.1 + i * 1.7))
        : 0,
    );
  }
  P.needsUpdate = A.needsUpdate = true;
  SL.pts.material.uniforms.px.value = Math.max(2, 2.6 * renderer.getPixelRatio());
}
