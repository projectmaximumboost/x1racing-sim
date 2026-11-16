/* ---------- recommended path ribbon ---------- */
const ribU = {
  t: { value: 0 },
  craftS: { value: 0 },
  L: { value: course.L },
  on: { value: 1 },
  full: { value: 0 },
  wide: { value: 1 },
}; // full: the whole lap at once (course flyover); wide: width multiplier so it reads from the air
{
  const pos = [],
    vs = [],
    sc = [],
    dv = [],
    off = [],
    idx = [],
    W = 3.2;
  for (let i = 0; i <= N; i++) {
    const a = P[i % N],
      b = P[(i + 1) % N],
      l = Math.hypot(b.x - a.x, b.y - a.y),
      nx = (-(b.y - a.y) / l) * W,
      ny = ((b.x - a.x) / l) * W;
    const d = P[(i + 10) % N].v - a.v;
    pos.push(a.x + nx, a.z - 1.1, -(a.y + ny), a.x - nx, a.z - 1.1, -(a.y - ny));
    off.push(nx, 0, -ny, -nx, 0, ny);
    sc.push(i * course.S, i * course.S);
    vs.push(-1, 1);
    dv.push(d, d);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('sc', new THREE.Float32BufferAttribute(sc, 1));
  g.setAttribute('vs', new THREE.Float32BufferAttribute(vs, 1));
  g.setAttribute('dv', new THREE.Float32BufferAttribute(dv, 1));
  g.setAttribute('off', new THREE.Float32BufferAttribute(off, 3));
  g.setIndex(idx);
  const rib = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: ribU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      fog: false,
      vertexShader: `attribute float sc,vs,dv;attribute vec3 off;uniform float wide;varying float s,x,d;void main(){s=sc;x=vs;d=dv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position+off*(wide-1.),1.);}`,
      fragmentShader: `varying float s,x,d;uniform float t,craftS,L,on,full;void main(){float a=mod(s-craftS+L,L);float f=mix((1.-smoothstep(360.,620.,a))*smoothstep(3.,22.,a)*on,1.,full);if(f<.01)discard;
    float ch=fract((s+abs(x)*7.)/16.-t*1.0);float c=smoothstep(.0,.05,ch)*(1.-smoothstep(.46,.52,ch));float edge=smoothstep(.8,.92,abs(x));
    vec3 col=d<-1.2?vec3(1.,.28,.12):d>.8?vec3(.15,1.,.55):vec3(1.,.86,.3);gl_FragColor=vec4(col*1.25,f*(.16+c*.62+edge*.6));}`,
    }),
  );
  rib.frustumCulled = false;
  rib.renderOrder = 5;
  scene.add(rib);
}
