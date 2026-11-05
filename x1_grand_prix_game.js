(()=>{ 'use strict';
const X=X1P, DEF=X1COURSE, C=X.C, D2R=X.D2R, clamp=X.clamp, lerp=X.lerp;
const course=X.buildCourse(DEF), P=course.P, N=course.n, SP=course.spires, PAD=DEF.pad;
const SPIRE_H=61, PROF=[[0,9.74],[15.24,7.5],[30.48,4.54],[45.72,2.12],[54.9,1.1],[60.3,.76]];  // Inflatable_Spire report, 200 ft
const spireR=h=>{if(h<0||h>SPIRE_H)return 0;for(let i=1;i<PROF.length;i++)if(h<=PROF[i][0]){const a=PROF[i-1],b=PROF[i];return lerp(a[1],b[1],(h-a[0])/(b[0]-a[0]));}return .7;};
const $=id=>document.getElementById(id);
const env={height:(n,e)=>DEF.landH(e,n),solid:(n,e)=>DEF.landH(e,n)>.2,brake:true};
const toW=(x,y,z)=>new THREE.Vector3(x,z,-y);      // course (E,N,up) -> three
const ned=v=>new THREE.Vector3(v[1],-v[2],-v[0]);  // NED -> three

/* ---------- renderer + sky ---------- */
const canvas=$('gl'), renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.95;
let pr=Math.min(devicePixelRatio||1,1.75); renderer.setPixelRatio(pr);
const scene=new THREE.Scene(), HAZE=new THREE.Color(0xc9d6e0); scene.fog=new THREE.Fog(HAZE,900,6200);
const cam=new THREE.PerspectiveCamera(62,1,.7,16000); const SUN=new THREE.Vector3(-.42,.5,-.62).normalize();
scene.add(new THREE.HemisphereLight(0xdcecff,0x47606e,.85)); const sunL=new THREE.DirectionalLight(0xfff0dc,2.3); sunL.position.copy(SUN).multiplyScalar(100); scene.add(sunL);
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{sun:{value:SUN},t:{value:0}},
 vertexShader:`varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec3 d;uniform vec3 sun;uniform float t;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
 void main(){vec3 v=normalize(d);float y=max(v.y,0.);vec3 c=mix(vec3(.80,.86,.90),vec3(.27,.50,.74),pow(y,.62));
 float s=max(dot(v,sun),0.);c+=vec3(1.,.9,.72)*(pow(s,600.)*6.+pow(s,14.)*.22);
 if(v.y>.01){vec2 p=v.xz/(v.y+.14)*1.5+t*.004;float f=fbm(p);float cl=smoothstep(.47,.74,f)*smoothstep(.01,.2,v.y);c=mix(c,vec3(.97,.96,.94)-.05*smoothstep(.62,.85,f),cl*.86);}
 c=mix(c,vec3(.79,.84,.88),smoothstep(.09,.0,abs(v.y))*.85);gl_FragColor=vec4(pow(c,vec3(2.2)),1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(9000,32,18),skyMat); sky.frustumCulled=false; scene.add(sky);
{ const ps=new THREE.Scene(); ps.add(new THREE.Mesh(new THREE.SphereGeometry(100,24,12),skyMat)); const g=new THREE.PMREMGenerator(renderer); scene.environment=g.fromScene(ps,.02).texture; }

/* ---------- water ---------- */
const waterU={t:{value:0},sun:{value:SUN},cam:{value:new THREE.Vector3()},craft:{value:new THREE.Vector3()},wash:{value:0}};
const water=new THREE.Mesh(new THREE.PlaneGeometry(26000,26000,1,1).rotateX(-Math.PI/2),new THREE.ShaderMaterial({uniforms:waterU,
 vertexShader:`varying vec3 w;void main(){vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
 fragmentShader:`varying vec3 w;uniform float t,wash;uniform vec3 sun,cam,craft;
 float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 float H(vec2 p){return n(p*.11+t*.09)*1.+n(p*.27-t*.13)*.55+n(p*.73+t*.25)*.28+n(p*1.9-t*.42)*.13;}
 void main(){vec3 v=cam-w;float dist=length(v);v/=dist;float e=mix(.28,5.,smoothstep(40.,1500.,dist));vec2 q=w.xz;
 float d0=H(q),dx=H(q+vec2(e,0))-d0,dz=H(q+vec2(0,e))-d0;float amp=mix(.9,.1,smoothstep(60.,1100.,dist));
 vec3 N=normalize(vec3(-dx/e*amp,1.,-dz/e*amp));
 float dc=length(q-craft.xz);float ring=wash*exp(-pow((dc-13.)/9.,2.));N.xz+=normalize(q-craft.xz+.001)*ring*.12*sin(dc*1.6-t*11.);N=normalize(N);
 float F=.03+.97*pow(1.-max(dot(v,N),0.),5.);vec3 R=reflect(-v,N);R.y=abs(R.y);
 vec3 sk=mix(vec3(.62,.70,.76),vec3(.20,.40,.60),pow(R.y,.55));vec3 deep=vec3(.012,.085,.125),shal=vec3(.02,.19,.21);
 vec3 c=mix(mix(shal,deep,clamp(d0*.75,0.,1.)),sk,F);c+=vec3(1.,.93,.8)*pow(max(dot(R,sun),0.),320.)*7.*mix(1.,.12,smoothstep(150.,1400.,dist));
 c+=vec3(.5)*ring*ring*smoothstep(.35,.9,n(q*3.1+t*5.)*.6+n(q*7.+t*7.)*.4);
 float f=1.-exp(-pow(dist/5200.,2.));c=mix(c,pow(vec3(.79,.84,.88),vec3(2.2)),f);
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <encodings_fragment>
 }`}));
water.frustumCulled=false; scene.add(water);

/* ---------- canvas textures ---------- */
function tex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=8;return t;}
const COL={L:'#d81f26',R:'#0fa958',G:'#111'};
function spireTex(kind,label){return tex(1536,1024,(g,w,h)=>{
  const hy=ft=>h-(ft/200)*h, col=COL[kind];
  g.fillStyle='#f4f2ee';g.fillRect(0,0,w,h);
  if(kind==='G'){const nx=28;for(let r=0;r<72;r++){const ft=r*200/72,y0=hy(ft+200/72),hh=h/72;const cells=Math.max(6,Math.round(nx*spireR(ft*.3048)/9.74));const cw=w/cells;for(let i=0;i<cells;i++){g.fillStyle=(i+r)%2?'#f4f2ee':'#0d0d0f';g.fillRect(i*cw,y0,cw+1,hh+1);}}}
  else{g.fillStyle=col;g.fillRect(0,hy(100),w,hy(50)-hy(100));g.fillRect(0,hy(200),w,hy(150)-hy(200));
    // tier 1: white with turn number and direction chevrons round the circumference
    g.textAlign='center';g.textBaseline='middle';
    for(let i=0;i<4;i++){const x=(i+.5)*w/4;
      g.fillStyle=col;g.font='800 118px "Barlow Condensed",Arial';g.fillText(label,x,hy(32));
      g.save();g.translate(x,hy(75));g.fillStyle='#fff';const dir=kind==='L'?-1:1;
      for(let k=-1;k<=1;k++){g.save();g.translate(k*74,0);g.scale(dir,1);g.beginPath();g.moveTo(-34,-46);g.lineTo(20,0);g.lineTo(-34,46);g.lineTo(-58,46);g.lineTo(-4,0);g.lineTo(-58,-46);g.closePath();g.fill();g.restore();}
      g.restore();}}
  for(const ft of [50,100,150]){g.fillStyle='rgba(0,0,0,.38)';g.fillRect(0,hy(ft)-3,w,6);}
  g.fillStyle='rgba(0,0,0,.08)';for(let i=0;i<24;i++)g.fillRect(i*w/24,0,2,h);
});}
const bargeTex=tex(1024,96,(g,w,h)=>{g.fillStyle='#1b222a';g.fillRect(0,0,w,h);g.fillStyle='#e8690f';g.fillRect(0,0,w,9);g.fillStyle='#f4f1ec';g.font='italic 700 62px "Barlow Condensed",Arial';g.textBaseline='middle';for(let i=0;i<3;i++)g.fillText('X1 RACING',30+i*340,56);});

/* ---------- spires on barges ---------- */
function spireGeo(){const pts=[];const add=(r,y)=>pts.push(new THREE.Vector2(r,y));
  add(9.9,0);for(let i=0;i<PROF.length;i++){const[y,r]=PROF[i];if(i&&i<4){add(r*1.02,y-.2);add(r+.28,y);add(r*.97,y+.25);}else add(r,y);
    if(i<PROF.length-1){const[yb,rb]=PROF[i+1];for(let t=.25;t<1;t+=.25)add(lerp(r,rb,t)+Math.sin(t*Math.PI)*.1,lerp(y,yb,t));}}
  for(let a=10;a<=90;a+=16)add(.76*Math.cos(a*D2R),60.3+.76*Math.sin(a*D2R));
  const g=new THREE.LatheGeometry(pts,56),p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setY(i,p.getY(i)/SPIRE_H);g.computeVertexNormals();return g;}
const SG=spireGeo(), spireObjs=[], spireTexs=[];
function makeBarge(sz){const G=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0x2a313a,roughness:.75,metalness:.35});
  const d=new THREE.Mesh(new THREE.BoxGeometry(sz,1.7,sz),[0,1,2,3,4,5].map(i=>i===2?new THREE.MeshStandardMaterial({color:0x444c55,roughness:.9}):i===3?m:new THREE.MeshStandardMaterial({map:bargeTex,roughness:.6})));d.position.y=.75;G.add(d);
  const rail=new THREE.MeshStandardMaterial({color:0xd8dde2,metalness:.5,roughness:.4});const rg=new THREE.BoxGeometry(.12,1.2,.12);const n=Math.round(sz/4);const im=new THREE.InstancedMesh(rg,rail,n*4);const M=new THREE.Matrix4();
  for(let k=0;k<4;k++)for(let i=0;i<n;i++){const a=-sz/2+(i+.5)*sz/n,s=sz/2-.2,xy=[[a,s],[a,-s],[s,a],[-s,a]][k];M.makeTranslation(xy[0],2.1,xy[1]);im.setMatrixAt(k*n+i,M);}G.add(im);
  for(const[w,l,x,z]of[[sz,.1,0,sz/2-.2],[sz,.1,0,-sz/2+.2],[.1,sz,sz/2-.2,0],[.1,sz,-sz/2+.2,0]]){const b=new THREE.Mesh(new THREE.BoxGeometry(w,.09,l),rail);b.position.set(x,2.7,z);G.add(b);}
  return G;}
function addSpire(x,y,kind,label,idx){const G=new THREE.Group();G.position.copy(toW(x,y,0));
  const b=makeBarge(25);G.add(b);
  const inner=new THREE.Group();inner.position.y=1.6;G.add(inner);
  const map=spireTex(kind,label);spireTexs.push(map);const s=new THREE.Mesh(SG,new THREE.MeshStandardMaterial({map,roughness:.5,metalness:0,envMapIntensity:.7}));inner.add(s);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.85,14,10),new THREE.MeshBasicMaterial({color:kind==='R'?0x1dff8a:kind==='L'?0xff3030:0xffffff,toneMapped:false}));lamp.position.y=61.5;inner.add(lamp);
  scene.add(G);const o={G,inner,lamp,x,y,kind,wob:0,ph:Math.random()*6,idx};spireObjs.push(o);return o;}
SP.forEach((s,i)=>{s.obj=addSpire(s.x,s.y,s.side,String(i+1),i);});
const gateA=addSpire(DEF.gate.a[0],DEF.gate.a[1],'G','',-1), gateB=addSpire(DEF.gate.b[0],DEF.gate.b[1],'G','',-2);
{ // start line buoys
  const b=new THREE.InstancedMesh(new THREE.SphereGeometry(.8,12,8),new THREE.MeshStandardMaterial({color:0xff5a1f,roughness:.4}),60),M=new THREE.Matrix4();let i=0;
  for(let k=1;k<10;k++){M.makeTranslation(0,.3,-lerp(DEF.gate.a[1],DEF.gate.b[1],k/10));b.setMatrixAt(i++,M);}
  SP.forEach((s,j)=>{for(let k=0;k<2&&i<60;k++){const a=j*2.1+k*2.4,r=24;M.makeTranslation(s.x+Math.cos(a)*r,.3,-(s.y+Math.sin(a)*r));b.setMatrixAt(i++,M);}});b.count=i;scene.add(b);}

{ // round X1 logo on every spire, mid-height white tier only
  const im=new Image();im.onload=()=>{for(const t of spireTexs){const c=t.image.getContext('2d'),w=t.image.width,h=t.image.height,put=(x,ft,d)=>{const pw=d*w/(2*Math.PI*spireR(ft*.3048)),ph=d*h/SPIRE_H;for(const wrap of [-w,0,w])c.drawImage(im,x+wrap-pw/2,h-(ft/200)*h-ph/2,pw,ph);};
      for(let i=0;i<3;i++)put((i+.5)*w/3,125,5.6);t.needsUpdate=true;}};im.src=$('logo').src;}

/* ---------- land, pits, skyline ---------- */
{ const W=7000,D=1700,nx=280,ny=80,g=new THREE.PlaneGeometry(W,D,nx,ny).rotateX(-Math.PI/2);const p=g.attributes.position,col=new Float32Array(p.count*3),c=new THREE.Color();
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=-(p.getZ(i)+0)-D/2+160+0-0;const yy=y-140+0;const ny2=yy;const sy=DEF.shoreY(x);let h=DEF.landH(x,ny2);if(ny2>sy)h=-1.2-(ny2-sy)*.05;
    const d=sy-ny2;p.setXYZ(i,x,h,-ny2);const rock=Math.sin(x*.02)*.5+Math.cos(x*.05+d*.03)*.5;
    if(d<34)c.setRGB(.52,.46,.33);else if(d<120)c.setRGB(.36,.34,.23);else c.setRGB(.19+.04*rock,.27+.05*rock,.14);col.set([c.r,c.g,c.b],i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,envMapIntensity:.25}));scene.add(m);
  // launch pad
  const padT=tex(1024,1024,(g,w)=>{g.fillStyle='#3c4247';g.fillRect(0,0,w,w);for(let i=0;i<6000;i++){g.fillStyle=`rgba(${Math.random()<.5?'255,255,255':'0,0,0'},.03)`;g.fillRect(Math.random()*w,Math.random()*w,4,4);}
    g.strokeStyle='#f4f1ec';g.lineWidth=18;g.beginPath();g.arc(512,512,410,0,7);g.stroke();g.strokeStyle='#e8690f';g.lineWidth=10;g.beginPath();g.arc(512,512,470,0,7);g.stroke();g.translate(512,512);g.fillStyle='#f4f1ec';g.textAlign='center';g.textBaseline='middle';g.font='italic 700 300px "Barlow Condensed",Arial';g.fillText('X1',-200,0);g.fillText('X1',200,0);});
  const pad=new THREE.Mesh(new THREE.CircleGeometry(24,48).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:padT,roughness:.9,envMapIntensity:.3}));pad.position.copy(toW(PAD.x,PAD.y,PAD.h+.03));pad.material.polygonOffset=true;pad.material.polygonOffsetFactor=-4;pad.material.polygonOffsetUnits=-4;pad.rotation.y=PAD.yaw*-1+Math.PI/2*0+1.57-1.57;scene.add(pad);
  // pit row: two haulers and a timing tower
  const body=new THREE.MeshStandardMaterial({color:0xe9ecef,roughness:.5}),dark=new THREE.MeshStandardMaterial({color:0x20262d,roughness:.5}),orange=new THREE.MeshStandardMaterial({color:0xe8690f,roughness:.5});
  for(let i=0;i<4;i++){const h=new THREE.Group(),t=new THREE.Mesh(new THREE.BoxGeometry(16,4,2.6),body),cab=new THREE.Mesh(new THREE.BoxGeometry(3.4,3.5,2.6),dark),st=new THREE.Mesh(new THREE.BoxGeometry(16,.5,2.62),orange);t.position.y=2.6;st.position.y=1.5;cab.position.set(10,2.1,0);h.add(t,cab,st);h.position.copy(toW(PAD.x-110+i*42,PAD.y-58,PAD.h));scene.add(h);}
  const tw=new THREE.Mesh(new THREE.BoxGeometry(7,20,7),dark);tw.position.copy(toW(PAD.x+90,PAD.y-46,PAD.h+10));scene.add(tw);const tc=new THREE.Mesh(new THREE.BoxGeometry(11,3,11),orange);tc.position.copy(toW(PAD.x+90,PAD.y-46,PAD.h+20));scene.add(tc);
  const stand=new THREE.Mesh(new THREE.BoxGeometry(130,7,14),new THREE.MeshStandardMaterial({color:0x55606b,roughness:.8}));stand.position.copy(toW(PAD.x+190,-178,6));stand.rotation.x=.0;scene.add(stand);
  // trees + town on the shore, harbour hills across the water
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const tr=new THREE.InstancedMesh(new THREE.ConeGeometry(4,13,6),new THREE.MeshStandardMaterial({color:0x2c4a2d,roughness:1,envMapIntensity:.2}),900),M=new THREE.Matrix4();
  for(let i=0;i<900;i++){const x=rnd(-3300,3300),y=DEF.shoreY(x)-rnd(130,620);M.makeScale(1,rnd(.7,1.5),1);M.setPosition(x,DEF.landH(x,y)+6,-y);tr.setMatrixAt(i,M);}scene.add(tr);
  const bl=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xe4e0d8,roughness:.8,envMapIntensity:.4}),170);const c2=new THREE.Color();
  for(let i=0;i<170;i++){const north=i%2===0;const x=rnd(-3600,3600),y=north?rnd(2600,2900):-rnd(760,1000),h=north?rnd(10,55):rnd(8,40),w=rnd(20,70);M.makeScale(w,h,rnd(20,60));M.setPosition(x,h/2+(north?1:DEF.landH(x,y)),-y);bl.setMatrixAt(i,M);c2.setHSL(.09,rnd(.02,.15),rnd(.72,.92));bl.setColorAt(i,c2);}scene.add(bl);
  const hg=new THREE.PlaneGeometry(13000,1500,180,16).rotateX(-Math.PI/2),hp=hg.attributes.position;for(let i=0;i<hp.count;i++){const x=hp.getX(i),z=hp.getZ(i),t=(z+750)/1500;const nz=Math.sin(x*.0023)*40+Math.sin(x*.0061+1)*22+Math.sin(x*.013+2)*11;hp.setY(i,Math.max(-2,(95+nz)*(1-t)**.7*Math.min(1,(1-t)*6)*(z<660?1:0)*1+(z>600?-3:0)));}
  hg.computeVertexNormals();const hills=new THREE.Mesh(hg,new THREE.MeshStandardMaterial({color:0x3f5a48,roughness:1,envMapIntensity:.15}));hills.position.z=-3600;scene.add(hills);
}

/* ---------- recommended path ribbon ---------- */
const ribU={t:{value:0},craftS:{value:0},L:{value:course.L},on:{value:1}};
{ const pos=[],vs=[],sc=[],dv=[],idx=[],W=3.2;
  for(let i=0;i<=N;i++){const a=P[i%N],b=P[(i+1)%N],l=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/l*W,ny=(b.x-a.x)/l*W;const d=P[(i+10)%N].v-a.v;
    pos.push(a.x+nx,a.z-1.1,-(a.y+ny),a.x-nx,a.z-1.1,-(a.y-ny));sc.push(i*course.S,i*course.S);vs.push(-1,1);dv.push(d,d);
    if(i<N)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('sc',new THREE.Float32BufferAttribute(sc,1));g.setAttribute('vs',new THREE.Float32BufferAttribute(vs,1));g.setAttribute('dv',new THREE.Float32BufferAttribute(dv,1));g.setIndex(idx);
  const rib=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:ribU,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending,fog:false,
   vertexShader:`attribute float sc,vs,dv;varying float s,x,d;void main(){s=sc;x=vs;d=dv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying float s,x,d;uniform float t,craftS,L,on;void main(){float a=mod(s-craftS+L,L);float f=(1.-smoothstep(360.,620.,a))*smoothstep(3.,22.,a)*on;if(f<.01)discard;
    float ch=fract((s-abs(x)*7.)/16.-t*1.0);float c=smoothstep(.0,.05,ch)*(1.-smoothstep(.46,.52,ch));float edge=smoothstep(.8,.92,abs(x));
    vec3 col=d<-1.2?vec3(1.,.28,.12):d>.8?vec3(.15,1.,.55):vec3(1.,.86,.3);gl_FragColor=vec4(col*1.25,f*(.16+c*.62+edge*.6));}`}));
  rib.frustumCulled=false;rib.renderOrder=5;scene.add(rib);}

/* ---------- craft ---------- */
const craft=new THREE.Group(), inner=new THREE.Group(); craft.add(inner); inner.position.set(-C.cg[0],-C.cg[2],C.cg[1]); scene.add(craft);
const fans=[]; let canopy=null, shadow;
{const c=tex(128,128,(g,w)=>{const r=g.createRadialGradient(64,64,6,64,64,62);r.addColorStop(0,'rgba(0,0,0,.5)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,w);});
 shadow=new THREE.Mesh(new THREE.PlaneGeometry(9,9).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:c,transparent:true,depthWrite:false,fog:false}));scene.add(shadow);}
let mixer=null,foldA=null;const FOLD_S=3;
function foldAct(g){const c=g.animations.find(a=>a.name==='Fold');if(!c)return;c.tracks=c.tracks.filter(t=>!/Rotor_/.test(t.name));mixer=new THREE.AnimationMixer(g.scene);foldA=mixer.clipAction(c);foldA.setLoop(THREE.LoopRepeat);foldA.play();foldA.paused=true;}
function applyFold(){if(!mixer)return;foldA.time=Math.min(G.foldT*FOLD_S,FOLD_S-.001);mixer.update(0);}
function loadCraft(){return new Promise((res,rej)=>{const bin=atob($('glb').textContent.trim()),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
 new THREE.GLTFLoader().parse(u.buffer,'',g=>{inner.add(g.scene);g.scene.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;
   const m=/^Rotor_(FL|FR|RL|RR)_(Upper|Lower)/.exec(o.name);if(m)fans.push({o,y0:o.rotation.y+(/^R/.test(m[1])&&m[2]==='Lower'?2*D2R:0),i:['FL','FR','RL','RR'].indexOf(m[1])*2+(m[2]==='Lower'?1:0),axis:'y',sg:/FL_Upper|FR_Lower|RR_Upper|RL_Lower/.test(o.name)?1:-1});
   const t=/^Thruster_Fan_(L|R)/.exec(o.name);if(t)fans.push({o,y0:o.rotation.y,i:t[1]==='L'?8:9,axis:'y',sg:t[1]==='L'?1:-1});
   if(/^Canopy$/.test(o.name)){canopy=o;o.material=o.material.clone();o.material.opacity=.3;o.material.transparent=true;o.material.depthWrite=false;}
   if(/^(Tank_|Engine_|Firewall)/.test(o.name))o.visible=false;if(/^(Seat_|Footrest_|Cockpit_Floor|Canopy_Frame)/.test(o.name))G.cockpitParts.push(o);
   if(o.material&&o.material.map)o.material.map.anisotropy=8;});foldAct(g);res();},rej);});}

/* spray */
const SPN=420, spPos=new Float32Array(SPN*3), spV=new Float32Array(SPN*3), spL=new Float32Array(SPN); spL.fill(0);
const spG=new THREE.BufferGeometry();spG.setAttribute('position',new THREE.BufferAttribute(spPos,3));spG.setAttribute('life',new THREE.BufferAttribute(spL,1));
const spray=new THREE.Points(spG,new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,vertexShader:`attribute float life;varying float l;void main(){l=life;vec4 m=modelViewMatrix*vec4(position,1.);gl_PointSize=(2.+(1.-life)*9.)*260./-m.z;gl_Position=projectionMatrix*m;}`,
 fragmentShader:`varying float l;void main(){float d=length(gl_PointCoord-.5);if(l<=0.||d>.5)discard;gl_FragColor=vec4(.95,.97,1.,l*.2*(1.-d*2.));}`}));spray.frustumCulled=false;scene.add(spray);let spI=0;
function emit(x,y,z,vx,vy,vz){const i=spI=(spI+1)%SPN;spPos.set([x,y,z],i*3);spV.set([vx,vy,vz],i*3);spL[i]=1;}

/* ---------- game state ---------- */
const STORE='x1-skyracer-laps-v1';
const G={foldT:1,foldTarget:null,foldWait:0,cockpitParts:[],mode:'demo',si:null,s:null,view:0,paused:false,next:0,lap:0,lapT:0,pen:0,running:false,bestYou:null,bestSI:null,last:null,laps:[],void:false,took:false,altHold:true,showPath:true,raceT:0,idx:0,assist:false,th:0,lastHit:0,recovering:0,lastSafe:null,prevE:0,liftReq:false,prevSide:0,maxV:0,demoLaps:0,lastSplit:[]};
function loadLaps(){try{const j=JSON.parse(localStorage.getItem(STORE)||'[]');if(Array.isArray(j))G.laps=j;}catch(e){}recalc();}
function saveLocal(){try{localStorage.setItem(STORE,JSON.stringify(G.laps.slice(-300)));}catch(e){}}
function recalc(){const v=G.laps.filter(l=>l.valid);const y=v.filter(l=>l.who==='you'),s=v.filter(l=>l.who==='si');G.bestYou=y.length?Math.min(...y.map(l=>l.t)):null;G.bestSI=s.length?Math.min(...s.map(l=>l.t)):null;}
let cloud=null;
(async()=>{try{if(!window.claude||!claude.use)return;const db=await claude.use('db'),user=await claude.use('user');if(!db||!user)return;const id=await user.id();const c=db.collection('data/users/'+id);cloud=c;
  const q=await c.orderBy('at','desc').limit(120).get();const docs=(q.docs||[]).map(d=>d.data());const seen=new Set(G.laps.map(l=>l.at));let ch=false;docs.forEach(l=>{if(l&&l.at&&!seen.has(l.at)){G.laps.push(l);ch=true;}});if(ch){G.laps.sort((a,b)=>a.at-b.at);saveLocal();recalc();drawHist();}}catch(e){}})();
function recordLap(t,raw,valid){const rec={t:+t.toFixed(3),raw:+raw.toFixed(3),pen:+G.pen.toFixed(1),valid,who:(G.mode==='demo'&&!G.assist)?'si':'you',assist:G.assist,at:Date.now(),mph:Math.round(G.maxV*2.23694)};
  G.laps.push(rec);saveLocal();recalc();drawHist();if(cloud&&rec.who==='you'){cloud.doc('lap'+rec.at).set(rec).catch(()=>{});}}
const fmt=t=>{if(t==null)return '--';const m=Math.floor(t/60),s=t-m*60;return m+':'+s.toFixed(2).padStart(5,'0');};
function drawHist(){const h=$('hist');const r=G.laps.slice(-7).reverse();h.innerHTML='';r.forEach(l=>{const d=document.createElement('div');if(l.valid&&(l.t===G.bestYou||l.t===G.bestSI))d.className='best';const a=document.createElement('i');a.textContent=l.who==='si'?'SI':'YOU';const b=document.createElement('span');b.textContent=l.valid?fmt(l.t):'void';const c=document.createElement('span');c.textContent=l.pen?'+'+l.pen+'s':'';d.append(a,b,c);h.append(d);});
  $('tBest').textContent=fmt(G.bestYou);$('tSI').textContent=fmt(G.bestSI);}

function reset(mode){G.mode=mode;G.s=X.newState({n:PAD.y,e:PAD.x,yaw:PAD.yaw,hT:PAD.h});G.s.p[2]=-(PAD.h+C.cg[2]-.02);X.euler(G.s);
  G.si=X.makeSI(course);G.next=0;G.lap=0;G.lapT=0;G.pen=0;G.running=false;G.void=false;G.raceT=0;G.liftReq=false;G.th=0;G.assist=false;G.recovering=0;G.maxV=0;G.lastSafe=null;G.land=null;G.foldT=1;G.foldTarget=null;G.foldWait=.7;G.idx=nearestAll();G.prevE=G.s.p[1];G.demoLaps=0;
  $('menu').hidden=false;$('pilotChip').textContent=mode==='demo'?'SI PILOT':'YOU';$('pilotChip').className=mode==='demo'?'':'you';
  syncMode();syncFold();
  banner(mode==='demo'?'SI PILOT':'YOUR MACHINE',mode==='demo'?'Autonomous demo. Press Fly it to take over.':'Press A or Enter to take off',2200);}
function syncMode(){$('bFly').classList.toggle('pri',G.mode!=='demo');$('bDemo').classList.toggle('pri',G.mode==='demo');}
function nearestAll(){let b=1e12,bi=0;const x=G.s.p[1],y=G.s.p[0];for(let i=0;i<N;i++){const d=(P[i].x-x)**2+(P[i].y-y)**2;if(d<b){b=d;bi=i;}}return bi;}
function nearestFwd(){const x=G.s.p[1],y=G.s.p[0];let b=1e12,bi=G.idx;for(let k=-8;k<60;k++){const i=(G.idx+k+N)%N,d=(P[i].x-x)**2+(P[i].y-y)**2;if(d<b){b=d;bi=i;}}if(b>400*400)return nearestAll();return bi;}
let bT=0;function banner(a,b,ms=1600,color){const e=$('banner');e.textContent=a;if(b){const s=document.createElement('small');s.textContent=b;e.append(s);}e.style.color=color||'';e.style.opacity=1;bT=performance.now()+ms;}

/* ---------- input ---------- */
const keys={}; const K=c=>keys[c]?1:0; let gp=null, gpBlocked=false; const prevBtn=[]; let inp={roll:0,pitch:0,yaw:0,climb:0,thr:0,boost:0};
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.repeat)return;keys[e.code]=1;initAudio();
  const k=e.code;if(!$('help').hidden){if(k==='KeyH'||k==='Escape'||k==='Enter')helpT(false);return;}if(k==='KeyV')setView((G.view+1)%3);if(k==='KeyH')helpT(true);if(k==='KeyR')reset(G.mode==='demo'?'demo':'player');if(k==='KeyG')toggleAlt();if(k==='KeyP')togglePath();if(k==='KeyL')land();if(k==='KeyF')toggleFold();if(k==='KeyN')toggleFans();if(k==='KeyT')handover();if(k==='Enter')takeoff();if(k==='Escape')$('menu').hidden=!$('menu').hidden;if(k==='KeyM')mute();});
addEventListener('keyup',e=>{keys[e.code]=0;}); addEventListener('blur',()=>{for(const k in keys)keys[k]=0;});
const dz=v=>{const a=Math.abs(v);return a<.09?0:Math.sign(v)*((a-.09)/.91)**1.5;};
function pollPad(){let pads=[];try{pads=navigator.getGamepads?navigator.getGamepads():[];}catch(e){gpBlocked=true;}
  gp=null;for(const p of pads)if(p&&p.connected){gp=p;break;}
  const el=$('gp');if(gp){el.textContent='Controller: '+gp.id.replace(/\s*\(.*\)/,'').slice(0,38);el.className='ok';}else if(gpBlocked){el.textContent='This view blocks controllers. Open the standalone file to use one.';el.className='';}else if(el.className==='ok'){el.textContent='Controller disconnected. Press any controller button to reconnect.';el.className='';}
  const a=(i)=>gp?dz(gp.axes[i]||0):0, b=i=>gp&&gp.buttons[i]?gp.buttons[i].value:0;
  const kbR=K('ArrowRight')-K('ArrowLeft'),kbP=K('ArrowUp')-K('ArrowDown');
  inp.roll=clamp(a(2)+kbR,-1,1);inp.pitch=clamp(-a(3)+kbP,-1,1);inp.yaw=clamp(a(0)+K('KeyD')-K('KeyA'),-1,1);inp.climb=clamp(-a(1)+K('KeyW')-K('KeyS'),-1,1);
  const kbT=K('ShiftLeft')||K('ShiftRight');
  if(kbT){inp.thr=clamp(inp.thr+.04,0,1);G._kbThr=true;}else if(G._kbThr){inp.thr=clamp(inp.thr-.02,0,1);if(inp.thr<=0)G._kbThr=false;}
  if(gp&&b(7)>.02){inp.thr=b(7);G._kbThr=false;}else if(!G._kbThr)inp.thr=0;
  inp.boost=K('Space')?1:(b(6)>.03?b(6):0);
  if(gp){const ed=(i,f)=>{const v=b(i)>.5;if(v&&!prevBtn[i])f();prevBtn[i]=v;};
    if(!$('help').hidden){ed(0,()=>helpT(false));ed(1,()=>helpT(false));ed(9,()=>helpT(false));for(const i of [2,3,4,8,12,13,15])prevBtn[i]=b(i)>.5;return;}
    ed(0,()=>{initAudio();if(G.mode==='demo')reset('player');else takeoff();});ed(1,()=>reset(G.mode==='demo'?'demo':'player'));ed(2,toggleAlt);ed(3,()=>setView((G.view+1)%3));ed(4,togglePath);ed(13,land);ed(12,toggleFold);ed(15,toggleFans);ed(8,handover);ed(9,()=>helpT(true));}}
function takeoff(){if(G.land)return;if(G.mode==='demo'){reset('player');return;}if(G.foldT>0||G.foldTarget===1){G.foldWait=0;if(G.foldTarget!==0)banner('UNFOLDING','Lift off follows',1400);G.foldTarget=0;}$('menu').hidden=true;const s=G.s;if(s.onGround||(-s.p[2])<PAD.h+3){G.liftReq=true;s.hT=PAD.h+13;banner('LIFT OFF','Hold RT or Shift for pushers',1400);}}
function land(){if(G.land){G.land=null;if(G.s)G.s.hT=-G.s.p[2];banner('LANDING CANCELLED','You have control',1100);if(G.mode==='demo')G.si=X.makeSI(course);return;}
  if(G.s.onGround&&DEF.landH(G.s.p[1],G.s.p[0])>.2)return;G.land=X.makeLander(PAD);G.running=false;G.next=0;G.prevAlong=undefined;G.pen=0;$('menu').hidden=true;banner('AUTOLAND','Flying back to the pad. Press L to cancel.',1800);}
function foldAtRest(){const s=G.s;return s.onGround&&s.V<1&&DEF.landH(s.p[1],s.p[0])>.2&&!G.land&&!G.liftReq;}
function syncFold(){const out=G.foldTarget===null?G.foldT>0:G.foldTarget===1;$('bFold').textContent=out?'Unfold':'Fold';$('bFold').classList.toggle('lock',!foldAtRest()||G.mode==='demo');}
function toggleFold(){if(G.mode==='demo'){banner('SI IS FLYING','Press Fly it to use the fold',1200);return;}if(!foldAtRest()){banner('FOLD LOCKED','Land and stop on the pad first',1300,'#ffc53d');return;}
  const out=G.foldTarget===null?G.foldT>0:G.foldTarget===1;G.foldWait=0;G.foldTarget=out?0:1;banner(out?'UNFOLDING':'FOLDING',out?'Wings and ducts opening':'Stowing for the hauler',1400);syncFold();}
function toggleAlt(){G.altHold=!G.altHold;if(G.altHold&&G.s)G.s.hT=-G.s.p[2];banner(G.altHold?'ALTITUDE HOLD ON':'ALTITUDE HOLD OFF',G.altHold?'Left stick sets climb rate':'Left stick is direct collective',1000);}
function togglePath(){G.showPath=!G.showPath;ribU.on.value=G.showPath?1:0;}
function handover(){if(G.mode==='demo'){$('menu').hidden=true;G.mode='player';G.assist=true;G.th=Math.max(G.s.pushT[0]/C.pusherMax,.8);inp.thr=G.th;G._kbThr=true;G.s.hT=-G.s.p[2];banner('YOU HAVE CONTROL','This lap counts as yours',1200);}else{G.mode='demo';G.si=X.makeSI(course);G.si.t=5;G.assist=true;banner('SI HAS CONTROL','',1000);}
  $('pilotChip').textContent=G.mode==='demo'?'SI PILOT':'YOU';$('pilotChip').className=G.mode==='demo'?'':'you';syncMode();}
let wasPaused=false;function helpT(open){const el=$('help');if(open===!el.hidden)return;if(open){wasPaused=G.paused;G.paused=true;}else G.paused=wasPaused;el.hidden=!open;}
function setView(v){G.view=v;cam.near=v===1?.12:.7;G.cockpitParts.forEach(o=>{o.visible=v!==1;});[0,1,2].forEach(i=>$('v'+i).classList.toggle('on',i===v));camInit=false;if(canopy)canopy.material.opacity=v===1?.1:.3;}
$('bFans').onclick=e=>{toggleFans();e.target.blur();};$('bFold').onclick=e=>{toggleFold();e.target.blur();};$('bHelp').onclick=e=>{helpT(true);e.target.blur();};$('bHelpX').onclick=e=>{helpT(false);e.target.blur();};$('menuPill').onclick=e=>{$('menu').hidden=!$('menu').hidden;e.target.blur();};
$('bFly').onclick=()=>{initAudio();reset('player');$('bFly').blur();};$('bDemo').onclick=()=>{initAudio();reset('demo');$('bDemo').blur();};[0,1,2].forEach(i=>{$('v'+i).onclick=e=>{setView(i);e.target.blur();};});
addEventListener('gamepadconnected',()=>{$('gp').className='ok';});

/* ---------- audio ---------- */
let ac=null,na={},muted=false;
function initAudio(){if(ac)return;try{ac=new (window.AudioContext||window.webkitAudioContext)();const len=ac.sampleRate*2,b=ac.createBuffer(1,len,ac.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<len;i++){l=l*.97+(Math.random()*2-1)*.03;d[i]=l*12;}
  const n=ac.createBufferSource();n.buffer=b;n.loop=true;const f=ac.createBiquadFilter();f.type='bandpass';f.Q.value=1.1;const g=ac.createGain();g.gain.value=0;n.connect(f).connect(g).connect(ac.destination);n.start();
  const o=ac.createOscillator();o.type='sawtooth';const of=ac.createBiquadFilter();of.type='lowpass';of.frequency.value=900;const og=ac.createGain();og.gain.value=0;o.connect(of).connect(og).connect(ac.destination);o.start();na={f,g,o,og};}catch(e){ac=null;}}
function mute(){muted=!muted;}
function audio(){if(!ac)return;const s=G.s,sp=(s.spool[0]+s.spool[2]+s.spool[4]+s.spool[6])/4,P=s.P/1900,t=ac.currentTime;na.f.frequency.setTargetAtTime(220+900*sp,t,.05);na.g.gain.setTargetAtTime(muted?0:.05+.2*P,t,.05);na.o.frequency.setTargetAtTime(70+260*sp,t,.05);na.og.gain.setTargetAtTime(muted?0:.012+.03*P,t,.05);}

/* ---------- race logic ---------- */
function lateralCheck(){const s=G.s,x=s.p[1],y=s.p[0],h=-s.p[2];
  // spire contact: X1 inflatable profile, plus 2.4 m half-span allowance
  const t=performance.now();for(const o of spireObjs){const d=Math.hypot(o.x-x,o.y-y);if(d<14&&h<SPIRE_H+1&&d<spireR(h-1.6)+2.5&&t-G.lastHit>1800){G.lastHit=t;o.wob=1;G.pen+=3;s.v=s.v.map(v=>v*.72);banner('SPIRE HIT','+3 s',1100,'#ffc53d');}}
  if(G.next<SP.length){const sp=SP[G.next],dx=x-sp.x,dy=y-sp.y,along=dx*sp.tan[0]+dy*sp.tan[1],off=dx*sp.out[0]+dy*sp.out[1];
    if(G.prevAlong!==undefined&&G.prevAlong<0&&along>=0&&Math.abs(off)<420){if(off<0){G.pen+=5;banner('WRONG SIDE','Turn '+(G.next+1)+': +5 s',1500,'#ff3b3b');}G.next++;G.lastSafe=G.idx;}
    G.prevAlong=G.next<SP.length?(x-SP[G.next].x)*SP[G.next].tan[0]+(y-SP[G.next].y)*SP[G.next].tan[1]:0;}
  // start / finish: eastbound across x=0 between the checkered spires
  const ga=DEF.gate.a[1],gb=DEF.gate.b[1];if(G.prevE<0&&x>=0&&y>ga&&y<gb){if(!G.running){G.running=true;G.lap=1;G.lapT=0;G.pen=0;G.next=0;G.void=false;G.maxV=0;G.prevAlong=undefined;banner('LAP 1','Timing started',1100);}
    else{const raw=G.lapT,t2=raw+G.pen,ok=G.next>=SP.length&&!G.void;recordLap(t2,raw,ok);G.last=t2;$('tLast').textContent=ok?fmt(t2):'void';
      const best=G.mode==='demo'&&!G.assist?G.bestSI:G.bestYou;if(ok)banner(fmt(t2),(t2<=best+1e-6?'Best lap':'Lap '+G.lap)+(G.pen?'  incl. +'+G.pen+' s':''),1900,t2<=best+1e-6?'#21d97e':'');else banner('LAP VOID',G.void?'Recovered by the marine crew':'Missed a spire',1600,'#ff3b3b');
      G.lap++;G.lapT=0;G.pen=0;G.next=0;G.void=false;G.maxV=0;G.prevAlong=undefined;G.demoLaps++;if(G.mode==='demo'&&G.demoLaps>=4&&!G.assist){reset('demo');}}}
  G.prevE=x;}
function recover(){if(G.s.fuel<=0){reset(G.mode==='demo'?'demo':'player');banner('OUT OF PROPANE','Refueled on the pad',2200,'#ffc53d');return;}const s=G.s,i=G.lastSafe??G.idx,p=P[i],q=P[(i+3)%N],yaw=Math.atan2(q.x-p.x,q.y-p.y);const n=X.newState({n:p.y,e:p.x,alt:Math.max(p.z,14)+3,yaw,hT:Math.max(p.z,14)+3});n.soc=s.soc;n.fuel=s.fuel;const v=38;n.v=[Math.cos(yaw)*v,Math.sin(yaw)*v,0];n.p[2]=-(Math.max(p.z,14)+3);for(let k=0;k<8;k++)n.spool[k]=.72;G.s=n;G.void=true;G.si=X.makeSI(course);G.si.t=5;G.idx=i;G.prevE=p.x;banner('RECOVERED','Marine crew reset. Lap void.',1500,'#ffc53d');}

/* ---------- sim loop ---------- */
const FOLDED_U={d:[0,0,0,0],pd:[0,0],yawSplit:0,boost:false};const DT=1/200;let acc=0,lastT=0,camInit=false;
function simStep(){const s=G.s;let cmd;const grd=DEF.landH(s.p[1],s.p[0]);const parked=G.foldT>0;
  if(G.land){cmd=G.land.step(s,DT,grd);if(G.land.done){G.land=null;G.mode='player';G.assist=false;G.liftReq=false;s.hT=grd;inp.thr=0;G._kbThr=false;$('pilotChip').textContent='YOU';$('pilotChip').className='you';syncMode();syncFold();$('menu').hidden=false;banner('LANDED','Press F to fold, or A or Enter to lift off',2200);}}
  else if(parked)cmd={};else if(G.mode==='demo')cmd=G.si.step(s,DT,PAD.h);
  else{cmd={roll:inp.roll,pitch:inp.pitch,yaw:inp.yaw,climb:inp.climb,throttle:inp.thr,boost:inp.boost,altHold:G.altHold};
    if(G.liftReq&&(-s.p[2])>PAD.h+9)G.liftReq=false;if(inp.climb>.2&&s.onGround)G.liftReq=true;
    if(s.onGround&&!G.liftReq)s.hT=grd; if(G.liftReq&&s.hT<PAD.h+13)s.hT=PAD.h+13;}
  if(G.foldWait>0){G.foldWait-=DT;if(G.foldWait<=0){G.foldTarget=0;banner('UNFOLDING','Wings and ducts opening',1800);syncFold();}}
  if(G.foldTarget!==null){const d=G.foldTarget-G.foldT,st=DT/FOLD_S;G.foldT=Math.abs(d)<=st?G.foldTarget:G.foldT+Math.sign(d)*st;if(G.foldT===G.foldTarget){G.foldTarget=null;syncFold();}}
  const u=parked?FOLDED_U:X.fbw(s,cmd,DT,grd);X.step(s,u,DT,env);G.lastCmd=cmd;}
let fpsT=0,fpsN=0;function tick(now){requestAnimationFrame(tick);let dt=Math.min((now-lastT)/1000,.05);fpsN++;if(now-fpsT>2500){const f=fpsN*1000/(now-fpsT);fpsT=now;fpsN=0;if(f<32&&pr>.8){pr=Math.max(.8,pr-.25);renderer.setPixelRatio(pr);resize();}}lastT=now;pollPad();if(G.paused){render(0,now);return;}
  acc+=dt;let n=0;while(acc>=DT&&n<16){simStep();acc-=DT;n++;if(G.s.crash)break;if(G.running)G.lapT+=DT;G.raceT+=DT;lateralCheck();}if(n>=16)acc=0;
  if(G.s.crash){G.s.crash=null;splash();recover();}
  G.maxV=Math.max(G.maxV,G.s.V);G.idx=nearestFwd();render(dt,now);}
function splash(){const s=G.s,p=ned(s.p);for(let i=0;i<160;i++){const a=Math.random()*6.3,r=Math.random()*9;emit(p.x,.5,p.z,Math.cos(a)*r,6+Math.random()*12,Math.sin(a)*r);}}

/* ---------- render ---------- */
const v3=new THREE.Vector3(),camPos=new THREE.Vector3(),camLook=new THREE.Vector3(),tmpM=new THREE.Matrix4();
const EYE=new THREE.Vector3(.30,1.16,.78);
function render(dt,now){const s=G.s,t=now/1000;const pos=ned(s.p);craft.position.copy(pos);
  const F=ned(X.rotV(s.q,[1,0,0])),R=ned(X.rotV(s.q,[0,1,0])),Dn=ned(X.rotV(s.q,[0,0,1]));
  tmpM.makeBasis(R.clone().negate(),Dn.clone().negate(),F);craft.quaternion.setFromRotationMatrix(tmpM);
  applyFold();for(const f of fans){if(G.foldT>0){f.o.rotation.y=f.y0;continue;}const sp=s.spool[f.i];f.o.rotation[f.axis]+=f.sg*Math.min(sp*62,1.3+sp*.6)*(dt*60)*.33;}
  // fx
  const h=-s.p[2],wash=clamp(1-(h-3)/26,0,1)*clamp(s.P/700,0,1);waterU.t.value=t;waterU.craft.value.copy(pos);waterU.wash.value=DEF.landH(s.p[1],s.p[0])>.1?0:wash;waterU.cam.value.copy(cam.position);
  if(wash>.15&&DEF.landH(s.p[1],s.p[0])<.1)for(let i=0;i<4;i++){const a=Math.random()*6.3,r=8+Math.random()*7;emit(pos.x+Math.cos(a)*r,.3,pos.z+Math.sin(a)*r,Math.cos(a)*9+ned(s.v).x*.3,2+Math.random()*4,Math.sin(a)*9+ned(s.v).z*.3);}
  for(let i=0;i<SPN;i++){if(spL[i]>0){spL[i]-=dt*.8;spPos[i*3]+=spV[i*3]*dt;spPos[i*3+1]+=spV[i*3+1]*dt;spPos[i*3+2]+=spV[i*3+2]*dt;spV[i*3+1]-=dt*5;}}spG.attributes.position.needsUpdate=true;spG.attributes.life.needsUpdate=true;
  shadow.position.set(pos.x+SUN.x*-h*.4,DEF.landH(s.p[1],s.p[0])+.1,pos.z+SUN.z*-h*.4);shadow.material.opacity=clamp(1-h/60,0,1);
  for(const o of spireObjs){o.wob=Math.max(0,o.wob-dt*.5);const w=Math.sin(t*5+o.ph)*o.wob*.06+Math.sin(t*.7+o.ph)*.004;o.inner.rotation.z=w;o.inner.rotation.x=Math.cos(t*.6+o.ph)*.003;o.G.position.y=Math.sin(t*.8+o.ph)*.12;const nx=G.next<SP.length&&o.idx===G.next;o.lamp.scale.setScalar(nx?1.2+.9*(.5+.5*Math.sin(t*8)):1);}
  ribU.t.value=t;ribU.craftS.value=G.idx*course.S;skyMat.uniforms.t.value=t;sky.position.copy(cam.position);
  // camera
  const hdg=Math.hypot(s.v[0],s.v[1])>6?ned([s.v[0],s.v[1],0]).normalize():new THREE.Vector3(F.x,0,F.z).normalize();const k=1-Math.exp(-dt*(G.view===2?2.2:4.2));
  if(G.view===1){craft.updateMatrixWorld(true);const e=EYE.clone().add(inner.position);cam.position.copy(e.applyMatrix4(craft.matrixWorld));cam.up.copy(Dn).negate();cam.lookAt(cam.position.clone().add(F).sub(Dn.clone().multiplyScalar(-.02)));cam.fov=lerp(cam.fov,74,.1);}
  else{const back=G.view===0?13.5:62,up=G.view===0?4.6:30;const wantP=pos.clone().addScaledVector(hdg,-back).add(new THREE.Vector3(0,up,0)),wantL=pos.clone().addScaledVector(hdg,G.view===0?9:70).add(new THREE.Vector3(0,G.view===0?1:-6,0));
    if(!camInit||camPos.distanceTo(wantP)>back*4){camPos.copy(wantP);camLook.copy(wantL);camInit=true;}camPos.lerp(wantP,k);camLook.lerp(wantL,k*1.3);cam.position.copy(camPos);if(cam.position.y<1.2)cam.position.y=1.2;cam.up.set(0,1,0);cam.up.addScaledVector(R,G.view===0?-.0:0).normalize();cam.lookAt(camLook);
    if(G.view===0)cam.rotateZ(-s.phi*.22);cam.fov=lerp(cam.fov,(G.view===0?60:52)+clamp(s.V/85,0,1)*12,.08);}
  cam.updateProjectionMatrix();renderer.render(scene,cam);hud(now);fanMeter(Math.max(dt,.016));}

/* ---------- 2D overlay ---------- */
const o2=$('o2d'),g2=o2.getContext('2d');let W2=1,H2=1,dpr2=1;
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();dpr2=Math.min(devicePixelRatio||1,2);o2.width=w*dpr2;o2.height=h*dpr2;W2=w;H2=h;}
addEventListener('resize',resize);
function proj(v){const p=v.clone().project(cam),behind=v.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3()))<0;return {x:(p.x*.5+.5)*W2,y:(-p.y*.5+.5)*H2,behind};}
function marker(){g2.setTransform(dpr2,0,0,dpr2,0,0);g2.clearRect(0,0,W2,H2);const s=G.s;
  if(G.view===1)horizon();
  if(!G.s)return;if(G.land){const p=proj(toW(PAD.x,PAD.y,PAD.h));if(!p.behind){g2.strokeStyle='#e8690f';g2.lineWidth=3;g2.strokeRect(p.x-26,p.y-26,52,52);}return;}const onCourse=G.running&&G.next<SP.length;const tgtS=onCourse?SP[G.next]:null;const tx=onCourse?tgtS.x:0,ty=onCourse?tgtS.y:(DEF.gate.a[1]+DEF.gate.b[1])/2;
  const h=-s.p[2];const colr=!onCourse?'#fff':tgtS.side==='L'?'#ff3b3b':'#21d97e';const v=toW(tx,ty,Math.max(h,12));let p=proj(v);const m=46;
  const off=p.behind||p.x<m||p.x>W2-m||p.y<m||p.y>H2-m;const d=Math.hypot(tx-s.p[1],ty-s.p[0]);
  if(off){let dx=p.x-W2/2,dy=p.y-H2/2;if(p.behind){dx=-dx;dy=-dy;}const a=Math.atan2(dy,dx),r=Math.min((W2/2-70)/Math.abs(Math.cos(a)||.001),(H2/2-120)/Math.abs(Math.sin(a)||.001)),x=W2/2+Math.cos(a)*r,y=H2/2+Math.sin(a)*r;
    g2.save();g2.translate(x,y);g2.rotate(a);g2.fillStyle=colr;g2.beginPath();g2.moveTo(22,0);g2.lineTo(-12,-16);g2.lineTo(-5,0);g2.lineTo(-12,16);g2.closePath();g2.fill();g2.restore();
    g2.font='600 15px "IBM Plex Mono",monospace';g2.textAlign='center';g2.fillStyle='#fff';g2.fillText(Math.round(d*3.28)+' ft',x,y+32);return;}
  // brackets on the spire and a sweeping arrow on the side to pass
  const size=clamp(5200/Math.max(d,60),26,120),x=p.x,y=p.y;g2.lineWidth=3;g2.strokeStyle=colr;g2.shadowColor='rgba(0,0,0,.6)';g2.shadowBlur=6;
  for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){g2.beginPath();g2.moveTo(x+sx*size,y+sy*(size*.5));g2.lineTo(x+sx*size,y+sy*size);g2.lineTo(x+sx*(size*.5),y+sy*size);g2.stroke();}
  if(onCourse){const left=tgtS.side==='L';const sideX=left?1:-1; // spire stays on your left, so you pass to its right
    const ax=x+sideX*(size+26);g2.fillStyle=colr;g2.save();g2.translate(ax,y);g2.scale(left?-1:1,1);
    for(let i=0;i<3;i++){const o=i*20-(performance.now()/120%20);g2.globalAlpha=.45+.2*i;g2.beginPath();g2.moveTo(-14+o,-20);g2.lineTo(4+o,0);g2.lineTo(-14+o,20);g2.lineTo(-24+o,20);g2.lineTo(-6+o,0);g2.lineTo(-24+o,-20);g2.closePath();g2.fill();}g2.restore();g2.globalAlpha=1;}
  g2.shadowBlur=4;g2.font='700 17px "Barlow Condensed",sans-serif';g2.textAlign='center';g2.fillStyle='#fff';g2.fillText((onCourse?(tgtS.side==='L'?'LEFT TURN':'RIGHT TURN')+'  ':'START / FINISH  ')+Math.round(d*3.28)+' ft',x,y+size+20);g2.shadowBlur=0;}
function horizon(){const s=G.s,cx=W2/2,cy=H2/2;g2.save();g2.translate(cx,cy);g2.rotate(-s.phi);const ppd=H2/74;g2.strokeStyle='rgba(120,255,190,.85)';g2.fillStyle='rgba(120,255,190,.9)';g2.lineWidth=1.6;g2.font='600 12px "IBM Plex Mono",monospace';const th=s.theta/D2R;
  g2.beginPath();g2.moveTo(-W2*.8,th*ppd);g2.lineTo(-140,th*ppd);g2.moveTo(140,th*ppd);g2.lineTo(W2*.8,th*ppd);g2.stroke();
  for(let a=-20;a<=20;a+=10){if(!a)continue;const y=(th-a)*ppd;g2.beginPath();g2.moveTo(-50,y);g2.lineTo(50,y);g2.stroke();g2.fillText(a,56,y+4);}g2.restore();
  g2.strokeStyle='rgba(120,255,190,.9)';g2.lineWidth=2;g2.beginPath();g2.moveTo(cx-34,cy);g2.lineTo(cx-12,cy);g2.lineTo(cx,cy+9);g2.lineTo(cx+12,cy);g2.lineTo(cx+34,cy);g2.stroke();}
const mp=$('map'),mg=mp.getContext('2d');let mapBG=null;const xs=P.map(p=>p.x),ys=P.map(p=>p.y),x0=Math.min(...xs,PAD.x)-60,x1=Math.max(...xs)+60,y0=Math.min(...ys,PAD.y)-40,y1=Math.max(...ys)+60;const ms=Math.min(530/(x1-x0),346/(y1-y0)),mx=x=>270+(x-(x0+x1)/2)*ms,my=y=>178-(y-(y0+y1)/2)*ms;
function map(){const c=mg;c.clearRect(0,0,540,356);c.lineJoin='round';c.strokeStyle='rgba(255,255,255,.2)';c.lineWidth=11;c.beginPath();P.forEach((p,i)=>i?c.lineTo(mx(p.x),my(p.y)):c.moveTo(mx(p.x),my(p.y)));c.closePath();c.stroke();
  c.strokeStyle='#f4f1ec';c.lineWidth=2.5;c.stroke();
  if(G.showPath){c.strokeStyle='#ffc53d';c.lineWidth=7;c.beginPath();for(let k=0;k<70;k++){const p=P[(G.idx+k)%N];k?c.lineTo(mx(p.x),my(p.y)):c.moveTo(mx(p.x),my(p.y));}c.stroke();}
  c.fillStyle='#f4f1ec';c.fillRect(mx(0)-2,my(DEF.gate.b[1]),5,my(DEF.gate.a[1])-my(DEF.gate.b[1]));
  c.textAlign='center';c.textBaseline='middle';c.font='700 21px "Barlow Condensed",sans-serif';
  SP.forEach((s,i)=>{c.fillStyle=s.side==='L'?'#ff3b3b':'#21d97e';c.beginPath();c.arc(mx(s.x),my(s.y),i===G.next?17:13,0,7);c.fill();if(i===G.next){c.strokeStyle='#fff';c.lineWidth=3;c.stroke();}c.fillStyle='#0b0e12';c.fillText(i+1,mx(s.x),my(s.y)+1);});
  c.fillStyle='#e8690f';c.fillRect(mx(PAD.x)-6,my(PAD.y)-6,12,12);
  const s=G.s,x=mx(s.p[1]),y=my(s.p[0]);c.save();c.translate(x,y);c.rotate(s.psi);c.fillStyle='#fff';c.strokeStyle='#0b0e12';c.lineWidth=2.5;c.beginPath();c.moveTo(0,-17);c.lineTo(11,13);c.lineTo(0,7);c.lineTo(-11,13);c.closePath();c.fill();c.stroke();c.restore();}
const ARROW={L:'M30 6 12 24l18 18 6-6-12-12 12-12z',R:'M18 6l18 18-18 18-6-6 12-12-12-12z',G:'M8 21h22L20 11l5-5 18 18-18 18-5-5 10-10H8z'};
let hudT=0;function hud(now){marker();if(now-hudT<70)return;hudT=now;const s=G.s;
  const onC=G.next<SP.length,sp=SP[G.next];const e=$('nextArrow');
  if(G.land){$('nextTitle').textContent=G.land.down?'LANDING':'RETURNING TO PAD';$('nextSub').textContent=Math.round(Math.hypot(s.p[1]-PAD.x,s.p[0]-PAD.y)*3.28)+' ft out. Press L to cancel';e.style.background='var(--x1)';$('arrowP').setAttribute('d','M24 42L8 24h10V6h12v18h10z');}
  else if(G.foldT>0){const op=G.foldTarget===0||G.foldWait>0,cl=G.foldTarget===1;$('nextTitle').textContent=cl?'FOLDING':op?'UNFOLDING':'FOLDED';$('nextSub').textContent=(op||cl)?Math.round((1-G.foldT)*100)+'% open':'Press F to unfold';e.style.background='var(--x1)';$('arrowP').setAttribute('d','M6 21h36v6H6z');}
  else if(G.mode==='player'&&s.onGround&&!G.liftReq){$('nextTitle').textContent='READY TO LIFT OFF';$('nextSub').textContent='Press A or Enter, then hold RT or Shift';e.style.background='var(--x1)';$('arrowP').setAttribute('d','M24 6l16 18h-10v18H18V24H8z');}
  else if(!G.running){$('nextTitle').textContent='START GATE';$('nextSub').textContent='Fly between the checkered spires';e.style.background='#f4f1ec';$('arrowP').setAttribute('d',ARROW.G);G._nx=-1;}
  else if(onC){$('nextTitle').textContent='TURN '+(G.next+1)+' '+(sp.side==='L'?'LEFT':'RIGHT');$('nextSub').textContent='Keep the '+(sp.side==='L'?'red':'green')+' spire on your '+(sp.side==='L'?'left':'right');e.style.background=sp.side==='L'?'var(--port)':'var(--stbd)';$('arrowP').setAttribute('d',ARROW[sp.side]);}
  else{$('nextTitle').textContent='FINISH';$('nextSub').textContent='Fly between the checkered spires';e.style.background='#f4f1ec';$('arrowP').setAttribute('d',ARROW.G);}
  const q=$('seq');q.innerHTML='';for(let k=G.running?1:0;k<=(G.running?3:2);k++){const j=G.next+k;if(j>SP.length)break;const c=document.createElement('span');if(j===SP.length){c.textContent='F';c.style.background='#f4f1ec';}else{c.textContent=j+1;c.style.background=SP[j].side==='L'?'var(--port)':'var(--stbd)';}q.append(c);}
  $('lapNo').textContent=G.running?'LAP '+G.lap:(s.onGround?'ON THE PAD':'OUT LAP');$('clock').textContent=fmt(G.running?G.lapT+G.pen:0);
  const refB=G.mode==='demo'?G.bestSI:G.bestYou,de=$('delta');if(G.running&&refB){const prog=G.idx/N;const dl=(G.lapT+G.pen)-refB*prog;de.textContent=(dl>=0?'+':'-')+Math.abs(dl).toFixed(2);de.style.color=dl<=0?'var(--stbd)':'var(--port)';}else{de.textContent=G.pen?'+'+G.pen+' s penalty':'';de.style.color='var(--warn)';}
  $('spd').textContent=Math.round(s.V*2.23694);$('alt').textContent=Math.round(-s.p[2]*3.28084);
  $('bP').style.width=clamp(s.P/2000*100,0,100)+'%';$('bP').style.background=s.P>1500?'var(--warn)':'var(--x1)';$('vP').textContent=Math.round(s.P);{const lbF=s.fuel*2.20462;$('bF').style.width=clamp(s.fuel/C.fuelKg,0,1)*100+'%';$('bF').style.background=lbF<30?'var(--port)':'var(--stbd)';$('vF').textContent=Math.min(200,lbF).toFixed(1)+' lb';}$('bS').style.width=s.soc*100+'%';{const kw=Math.round(s.battKW);$('cLto').textContent='LTO '+(kw>0?'-':kw<0?'+':'')+Math.abs(kw)+' KW';$('cLto').className='chip'+(kw>0?' dis':kw<0?' chg':'');$('bS').style.background=kw>0?'var(--warn)':kw<0?'var(--stbd)':'var(--cyan)';}$('vS').textContent=Math.round(s.soc*100)+'%';$('bG').style.width=clamp(s.nz/3,0,1)*100+'%';$('vG').textContent=s.nz.toFixed(1)+' g';
  $('cAlt').classList.toggle('on',G.mode==='demo'||G.altHold);$('vBoost').textContent=Math.round((s.boostCmd||0)*100)+'%';$('vHold').textContent=(G.mode==='demo'||G.land||G.altHold)?Math.round(s.hT*3.28084)+' FT':'OFF';$('cBoost').classList.toggle('on',s.boostOn);$('vTh').textContent=Math.round(s.spool[8]*s.spool[8]*100)+'%';{const bk=Math.abs(s.phi/D2R);$('cBank').textContent=Math.round(bk)+'°';$('bB').style.width=clamp(bk/72,0,1)*100+'%';}
  if(performance.now()>bT)$('banner').style.opacity=0;audio();map();syncFold();}

/* ---------- fan power meter: plan view of all 10 fans ---------- */
const fc=$('fans'),fx=fc.getContext('2d'),FAN={on:false,hp:new Float32Array(10),pk:new Float32Array(10),spin:new Float32Array(10)};
const FW=250,FH=292,RINGS=[{u:0,l:1,x:58,y:62,n:'FL'},{u:2,l:3,x:192,y:62,n:'FR'},{u:4,l:5,x:58,y:172,n:'RL'},{u:6,l:7,x:192,y:172,n:'RR'}],PUSH=[{i:8,x:96,y:254,n:'PL'},{i:9,x:154,y:254,n:'PR'}];
function toggleFans(){FAN.on=!FAN.on;fc.hidden=!FAN.on;$('bFans').classList.toggle('on',FAN.on);}
const fanCol=f=>f<.6?'#58d7ff':f<.85?'#7dffb0':f<.97?'#ffc53d':'#ff3b3b';
const A0=Math.PI*.75,AS=Math.PI*1.5;
function arc(x,y,r,w,f,pk){fx.lineCap='butt';fx.lineWidth=w;fx.strokeStyle='rgba(255,255,255,.14)';fx.beginPath();fx.arc(x,y,r,A0,A0+AS);fx.stroke();
  const c=fanCol(f);fx.strokeStyle=c;fx.shadowColor=c;fx.shadowBlur=9;fx.beginPath();fx.arc(x,y,r,A0,A0+AS*Math.max(.004,f));fx.stroke();fx.shadowBlur=0;
  const a=A0+AS*pk;fx.strokeStyle='#fff';fx.lineWidth=1.5;fx.beginPath();fx.moveTo(x+Math.cos(a)*(r-w/2-1),y+Math.sin(a)*(r-w/2-1));fx.lineTo(x+Math.cos(a)*(r+w/2+1),y+Math.sin(a)*(r+w/2+1));fx.stroke();}
function blades(x,y,r,a,sp){fx.strokeStyle=`rgba(88,215,255,${.18+.3*Math.min(1,sp)})`;fx.lineWidth=1.5;for(let i=0;i<3;i++){const b=a+i*2.094;fx.beginPath();fx.arc(x,y,r,b,b+.5);fx.stroke();}}
function fanMeter(dt){if(!FAN.on)return;const s=G.s,HP=X.HP,raw=new Float32Array(10);
  for(let d=0;d<4;d++){const u=s.spool[2*d]**2,l=s.spool[2*d+1]**2,a=Math.pow(u,1.5),b=Math.pow(l,1.5),t=(a+b)||1;raw[2*d]=s.ductP[d]/HP*a/t;raw[2*d+1]=s.ductP[d]/HP*b/t;}
  raw[8]=s.pushW[0]/HP;raw[9]=s.pushW[1]/HP;
  const FS=[...Array(8).fill(320),320,320],k=1-Math.exp(-dt*14);
  for(let i=0;i<10;i++){FAN.hp[i]+=(raw[i]-FAN.hp[i])*k;FAN.pk[i]=Math.max(FAN.hp[i],FAN.pk[i]-dt*40);FAN.spin[i]+=s.spool[i]*dt*7*(i%2?-1:1);}
  const dpr=Math.min(devicePixelRatio||1,2);if(fc.width!==FW*dpr){fc.width=FW*dpr;fc.height=FH*dpr;}fx.setTransform(dpr,0,0,dpr,0,0);fx.clearRect(0,0,FW,FH);
  // dark glass under each ring so the numbers read over bright sky and water
  fx.fillStyle='rgba(6,10,15,.58)';for(const r of RINGS){fx.beginPath();fx.arc(r.x,r.y,47,0,7);fx.fill();}for(const r of PUSH){fx.beginPath();fx.arc(r.x,r.y,31,0,7);fx.fill();}
  // airframe outline
  fx.strokeStyle='rgba(255,255,255,.3)';fx.lineWidth=1;fx.beginPath();fx.moveTo(125,8);fx.bezierCurveTo(150,30,150,110,142,190);fx.lineTo(136,232);fx.lineTo(114,232);fx.lineTo(108,190);fx.bezierCurveTo(100,110,100,30,125,8);fx.fillStyle='rgba(6,10,15,.5)';fx.fill();fx.stroke();
  fx.beginPath();fx.moveTo(101,62);fx.lineTo(98,62);fx.moveTo(149,62);fx.lineTo(152,62);fx.moveTo(105,172);fx.lineTo(98,172);fx.moveTo(145,172);fx.lineTo(152,172);fx.stroke();
  fx.textAlign='center';fx.textBaseline='middle';
  for(const r of RINGS){const fu=clamp(FAN.hp[r.u]/320,0,1),fl=clamp(FAN.hp[r.l]/320,0,1);
    arc(r.x,r.y,41,6,fu,clamp(FAN.pk[r.u]/320,0,1));arc(r.x,r.y,32,6,fl,clamp(FAN.pk[r.l]/320,0,1));blades(r.x,r.y,24,FAN.spin[r.u],s.spool[r.u]);
    fx.font='600 15px "IBM Plex Mono",monospace';fx.fillStyle='#f6f3ee';fx.fillText(Math.round(FAN.hp[r.u]),r.x,r.y-7);fx.fillStyle='#dfe2e6';fx.fillText(Math.round(FAN.hp[r.l]),r.x,r.y+8);
    fx.font='700 12px "Barlow Condensed",sans-serif';fx.fillStyle='#c3c6cc';fx.fillText(r.n,r.x,r.y+36);}
  for(const r of PUSH){const f=clamp(FAN.hp[r.i]/320,0,1);arc(r.x,r.y,25,6,f,clamp(FAN.pk[r.i]/320,0,1));blades(r.x,r.y,17,FAN.spin[r.i],s.spool[r.i]);fx.font='600 14px "IBM Plex Mono",monospace';fx.fillStyle='#f6f3ee';fx.fillText(Math.round(FAN.hp[r.i]),r.x,r.y);fx.font='700 11px "Barlow Condensed",sans-serif';fx.fillStyle='#c3c6cc';fx.fillText(r.n,r.x,r.y+21);}
  fx.font='600 20px "IBM Plex Mono",monospace';fx.fillStyle='#f6f3ee';fx.fillText(Math.round(s.P),125,112);fx.font='700 11px "Barlow Condensed",sans-serif';fx.fillStyle='#c3c6cc';fx.fillText('HP',125,128);}

/* ---------- boot ---------- */
loadLaps();reset('demo');resize();
window.__x1={toggleFans,spireTexs,toggleFold,land,G,X,course,inp,keys,setView,reset,handover,takeoff,ff(sec){const n=Math.round(sec/DT);for(let i=0;i<n;i++){simStep();if(G.running)G.lapT+=DT;G.raceT+=DT;lateralCheck();if(G.s.crash){G.s.crash=null;recover();}if(i%20===0)G.idx=nearestFwd();}}};
const start=()=>{$('loading').style.opacity=0;setTimeout(()=>$('loading').hidden=true,450);drawHist();lastT=performance.now();requestAnimationFrame(tick);};
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{SP.forEach(s=>{});});
loadCraft().then(start).catch(e=>{console.error(e);$('loading').textContent='Could not load the airframe: '+e.message;});
})();
