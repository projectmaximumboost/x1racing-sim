/* ---------- craft ---------- */
const craft = new THREE.Group(),
  inner = new THREE.Group();
craft.add(inner);
inner.position.set(-C.cg[0], -C.cg[2], C.cg[1]);
scene.add(craft);
const fans = [];
let canopy = null,
  shadow;
{
  const c = tex(128, 128, (g, w) => {
    const r = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    r.addColorStop(0, 'rgba(0,0,0,.5)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
  shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: c, transparent: true, depthWrite: false, fog: false }),
  );
  scene.add(shadow);
}
let mixer = null,
  foldA = null;
const FOLD_S = 3;
function foldAct(g) {
  const c = g.animations.find((a) => a.name === 'Fold');
  if (!c) return;
  c.tracks = c.tracks.filter((t) => !/Rotor_/.test(t.name));
  mixer = new THREE.AnimationMixer(g.scene);
  foldA = mixer.clipAction(c);
  foldA.setLoop(THREE.LoopRepeat);
  foldA.play();
  foldA.paused = true;
}
function applyFold() {
  if (!mixer) return;
  foldA.time = Math.min(G.foldT * FOLD_S, FOLD_S - 0.001);
  mixer.update(0);
}
function loadCraft() {
  return new Promise((res, rej) => {
    const bin = atob($('glb').textContent.trim()),
      u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(
      u.buffer,
      '',
      (g) => {
        inner.add(g.scene);
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          // the GLB has mirrored parts with inside-out faces (right pusher, tail skin): draw both sides so nothing goes see-through
          if (o.material && !o.material.transparent) o.material.side = THREE.DoubleSide;
          const m = /^Rotor_(FL|FR|RL|RR)_(Upper|Lower)/.exec(o.name);
          if (m)
            fans.push({
              o,
              y0: o.rotation.y + (/^R/.test(m[1]) && m[2] === 'Lower' ? 2 * D2R : 0),
              i: ['FL', 'FR', 'RL', 'RR'].indexOf(m[1]) * 2 + (m[2] === 'Lower' ? 1 : 0),
              axis: 'y',
              sg: /FL_Upper|FR_Lower|RR_Upper|RL_Lower/.test(o.name) ? 1 : -1,
            });
          const t = /^Thruster_Fan_(L|R)/.exec(o.name);
          if (t) fans.push({ o, y0: o.rotation.y, i: t[1] === 'L' ? 8 : 9, axis: 'y', sg: t[1] === 'L' ? 1 : -1 });
          if (/^Canopy$/.test(o.name)) {
            canopy = o;
            o.material = o.material.clone();
            o.material.color.set(0x9fb6c8);
            o.material.roughness = 0.05;
            o.material.metalness = 0;
            o.material.opacity = 0.3;
            o.material.transparent = true;
            o.material.depthWrite = false;
          } /* clear, faintly blue glass (the GLB's is near black), so the cabin shows through */
          if (/^(Tank_|Engine_|Firewall)/.test(o.name)) o.visible = false;
          if (/^(Seat_|Footrest_|Cockpit_Floor|Canopy_Frame)/.test(o.name)) {
            G.cockpitParts.push(o);
            if (typeof camVisV !== 'undefined') camVisV = -1;
          }
          if (o.material && o.material.map) o.material.map.anisotropy = 8;
        });
        foldAct(g);
        liveryInit(g.scene);
        res();
      },
      rej,
    );
  });
}

/* spray */
const SPN = 420,
  spPos = new Float32Array(SPN * 3),
  spV = new Float32Array(SPN * 3),
  spL = new Float32Array(SPN);
spL.fill(0);
const spG = new THREE.BufferGeometry();
spG.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
spG.setAttribute('life', new THREE.BufferAttribute(spL, 1));
const spray = new THREE.Points(
  spG,
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `attribute float life;varying float l;void main(){l=life;vec4 m=modelViewMatrix*vec4(position,1.);gl_PointSize=(2.+(1.-life)*9.)*260./-m.z;gl_Position=projectionMatrix*m;}`,
    fragmentShader: `varying float l;void main(){float d=length(gl_PointCoord-.5);if(l<=0.||d>.5)discard;gl_FragColor=vec4(.95,.97,1.,l*.2*(1.-d*2.));}`,
  }),
);
spray.frustumCulled = false;
scene.add(spray);
let spI = 0;
function emit(x, y, z, vx, vy, vz) {
  const i = (spI = (spI + 1) % SPN);
  spPos.set([x, y, z], i * 3);
  spV.set([vx, vy, vz], i * 3);
  spL[i] = 1;
}
