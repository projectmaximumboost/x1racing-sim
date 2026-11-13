/* ---------- water ---------- */
const waterU = {
  t: { value: 0 },
  sun: { value: SUN },
  cam: { value: new THREE.Vector3() },
  craft: { value: new THREE.Vector3() },
  wash: { value: 0 },
  tw: { value: 0 },
};
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(26000, 26000, 1, 1).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: waterU,
    vertexShader: `varying vec3 w;void main(){vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 w;uniform float t,wash,tw;uniform vec3 sun,cam,craft;
 float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 float H(vec2 p){return n(p*.11+t*.09)*1.+n(p*.27-t*.13)*.55+n(p*.73+t*.25)*.28+n(p*1.9-t*.42)*.13;}
 void main(){vec3 v=cam-w;float dist=length(v);v/=dist;float e=mix(.28,5.,smoothstep(40.,1500.,dist));vec2 q=w.xz;
 float d0=H(q),dx=H(q+vec2(e,0))-d0,dz=H(q+vec2(0,e))-d0;float amp=mix(.9,.1,smoothstep(60.,1100.,dist));
 vec3 N=normalize(vec3(-dx/e*amp,1.,-dz/e*amp));
 float dc=length(q-craft.xz);float ring=wash*exp(-pow((dc-13.)/9.,2.));N.xz+=normalize(q-craft.xz+.001)*ring*.12*sin(dc*1.6-t*11.);N=normalize(N);
 float F=.03+.97*pow(1.-max(dot(v,N),0.),5.);vec3 R=reflect(-v,N);R.y=abs(R.y);
 vec2 sh=normalize(sun.xz+1e-5),rh=R.xz/max(length(R.xz),1e-4);float az=dot(rh,sh)*.5+.5;
 vec3 sk=mix(mix(vec3(.62,.70,.76),vec3(.20,.40,.60),pow(R.y,.55)),pow(mix(mix(vec3(.36,.35,.50),vec3(1.,.52,.24),pow(az,4.)),vec3(.12,.16,.34),pow(R.y,.5)),vec3(2.2))*1.15,tw);vec3 deep=vec3(.012,.085,.125)*(1.-.6*tw),shal=vec3(.02,.19,.21)*(1.-.6*tw);
 vec3 c=mix(mix(shal,deep,clamp(d0*.75,0.,1.)),sk,F);c+=mix(vec3(1.,.93,.8),vec3(1.,.5,.2),tw)*pow(max(dot(R,sun),0.),mix(320.,90.,tw))*mix(7.,4.,tw)*mix(1.,.12,smoothstep(150.,1400.,dist));
 c+=vec3(.5)*ring*ring*smoothstep(.35,.9,n(q*3.1+t*5.)*.6+n(q*7.+t*7.)*.4);
 float f=1.-exp(-pow(dist/5200.,2.));c=mix(c,pow(mix(vec3(.79,.84,.88),vec3(.34,.29,.40),tw),vec3(2.2)),f);
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <encodings_fragment>
 }`,
  }),
);
water.frustumCulled = false;
scene.add(water);
