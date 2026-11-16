/* ---------- renderer + sky ---------- */
const canvas = $('view3d'),
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.xr.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
let pr = Math.min(devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pr);
const scene = new THREE.Scene(),
  HAZE = new THREE.Color(0xc9d6e0);
scene.fog = new THREE.Fog(HAZE, 900, 6200);
const cam = new THREE.PerspectiveCamera(62, 1, 0.7, 16000);
const rig = new THREE.Group();
rig.add(cam);
const SUN = new THREE.Vector3(-0.42, 0.5, -0.62).normalize();
const hemi = new THREE.HemisphereLight(0xdcecff, 0x47606e, 0.85);
scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xfff0dc, 2.3);
sunL.position.copy(SUN).multiplyScalar(100);
scene.add(sunL);
// tw blends the clear day sky (0) into twilight (1): the sun just above the horizon, a warm glow round it, deep blue overhead
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { sun: { value: SUN }, t: { value: 0 }, tw: { value: 0 } },
  vertexShader: `varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec3 d;uniform vec3 sun;uniform float t,tw;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
 void main(){vec3 v=normalize(d);float y=max(v.y,0.);float s=max(dot(v,sun),0.);
 vec2 sh=normalize(sun.xz+1e-5),vh=v.xz/max(length(v.xz),1e-4);float az=dot(vh,sh)*.5+.5;
 vec3 cd=mix(vec3(.80,.86,.90),vec3(.27,.50,.74),pow(y,.62))+vec3(1.,.9,.72)*(pow(s,600.)*6.+pow(s,14.)*.22);
 vec3 hz=mix(vec3(.40,.36,.52),vec3(1.,.50,.22),pow(az,3.));
 vec3 ct=mix(hz,mix(vec3(.55,.36,.50),vec3(.12,.17,.36),smoothstep(.02,.35,y)),smoothstep(.0,.16,y));ct=mix(ct,vec3(.05,.08,.21),smoothstep(.3,.95,y));
 ct+=vec3(1.,.55,.22)*(pow(s,900.)*5.+pow(s,10.)*.45);
 vec3 c=mix(cd,ct,tw);
 if(v.y>.01){vec2 p=v.xz/(v.y+.14)*1.5+t*.004;float f=fbm(p);float cl=smoothstep(.47,.74,f)*smoothstep(.01,.2,v.y);
   vec3 kd=vec3(.97,.96,.94)-.05*smoothstep(.62,.85,f);vec3 kt=mix(mix(vec3(.30,.26,.40),vec3(.92,.50,.40),pow(az,2.)),vec3(.18,.17,.28),smoothstep(.15,.6,y))-.06*smoothstep(.62,.85,f);
   c=mix(c,mix(kd,kt,tw),cl*.86);
   float st=step(.9975,h(floor(v.xz/(v.y+.25)*260.)))*smoothstep(.25,.75,y)*(1.-cl);c+=vec3(.8,.85,1.)*st*tw*.7;}
 c=mix(c,mix(vec3(.79,.84,.88),mix(vec3(.34,.29,.40),vec3(.80,.46,.28),pow(az,4.)),tw),smoothstep(.09,.0,abs(v.y))*.85);gl_FragColor=vec4(pow(c,vec3(2.2)),1.);}`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 18), skyMat);
sky.frustumCulled = false;
scene.add(sky);
scene.add(rig);
const envPS = new THREE.Scene();
envPS.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat));
const envGen = new THREE.PMREMGenerator(renderer);
function rebuildEnv() {
  const old = scene.environment;
  scene.environment = envGen.fromScene(envPS, 0.02).texture;
  if (old) old.dispose();
}
rebuildEnv();
