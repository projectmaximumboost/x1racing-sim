/* X1 SkyRacer flight model. Numbers trace to X1_SkyRacer_PteroSim manifest + X1_SkyRacer_FanTilt branch.
   Frames: world NED-style (x north, y east, z down; metres). Body FRD. Model frame: +X left, +Y aft, +Z up. */
const X1P = (() => {
const LBF=4.44822, HP=745.7, RHO=1.225, G=9.80665, D2R=Math.PI/180;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const C={
  mass0:1587.6, fuelKg:90.7, Ixx:1193.3, Iyy:2264, Izz:3298.3, Ixz:223.4,
  cg:[0,0.168,0.661],                       // race CG, fan-tilt report
  S:3.623, b:2.167, c:1.670, CD0:1.80/3.623, INC:4.5, // 39 ft2, CdA 1.80 m2, mean wing incidence
  rotorMax:1000*LBF, pusherMax:600*LBF, pusherMinFrac:.10, tau:0.15,
  FM:0.75, DUCT_GAIN:1.13, COAX_LOSS:1.12, UPPER:0.55, KU:0.40*0.3048, KL:0.40*0.3048*0.55/0.45,
  Al:Math.PI*(44*.0254/2)**2, Ap:Math.PI*(26*.0254/2)**2,
  Jr:1.2, Omax:419, Pcont:1500, Pburst:2000, etaB:.97, Pcharge:375e3, battJ:7.5*3.6e6, BTE:0.60, LHV:46.35e6,
};
const body=(x,y,z)=>[-(y-C.cg[1]), -x, -(z-C.cg[2])];    // model -> FRD from CG
const c10=Math.cos(10*D2R), s10=Math.sin(10*D2R);
const DUCTS=[ // FL FR RL RR; sign = reaction sense of the upper fan (+ yaws nose right)
 {r:body( 1.7219,-1.5,0.48), n:[0,0,-1],  sgn: 1},
 {r:body(-1.7219,-1.5,0.48), n:[0,0,-1],  sgn:-1},
 {r:body( 1.7219, 1.2,0.995),n:[s10,0,-c10],sgn:-1},
 {r:body(-1.7219, 1.2,0.995),n:[s10,0,-c10],sgn: 1}];
const PUSH=[{r:body(0.45,2.2712,0.80),n:[c10,0,-s10]},{r:body(-0.45,2.2712,0.80),n:[c10,0,-s10]}];
const AERO_R=body(0,0.0315,0.85);
const WHEELS=[[.86,-.68,0],[-.86,-.68,0],[.86,.38,0],[-.86,.38,0]].map(p=>body(...p));
const HARD=[[0,-2.74,.45],[1.72,-1.5,.35],[-1.72,-1.5,.35],[1.72,1.2,.85],[-1.72,1.2,.85],[.45,2.45,.5],[-.45,2.45,.5]].map(p=>body(...p));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/* mixer: minimum-norm map (T,L,M) -> 4 duct thrusts */
const MIX=(()=>{ const A=[[],[],[]];
  for(const d of DUCTS){const m=cross(d.r,d.n);A[0].push(-d.n[2]);A[1].push(m[0]);A[2].push(m[1]);}
  const AAT=[0,1,2].map(i=>[0,1,2].map(j=>A[i].reduce((s,v,k)=>s+v*A[j][k],0)));
  const [a,b,c]=AAT[0],[d,e,f]=AAT[1],[g,h,i]=AAT[2];
  const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  const inv=[[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a*i-c*g,c*d-a*f],[d*h-e*g,b*g-a*h,a*e-b*d]].map(r=>r.map(v=>v/det));
  return [0,1,2,3].map(k=>[0,1,2].map(col=>[0,1,2].reduce((s,r)=>s+A[r][k]*inv[r][col],0)));
})();

function CL(a){const r=a*D2R,ab=Math.abs(a); if(ab<=14)return .25+3.5*r;
  if(ab>=30)return .95*Math.sin(2*r);
  return (.25+3.5*14*D2R*Math.sign(a))*(30-ab)/16+.95*Math.sin(2*r)*(ab-14)/16;}
const CD=a=>C.CD0+2.5*Math.sin(a*D2R)**2;
function ductP(T,Vn,Vt,st){ if(T<=1)return 0; const g=C.DUCT_GAIN; let v=st.vi||Math.sqrt(T/g/(2*RHO*C.Al));
  for(let i=0;i<4;i++){const vn=T/g/(2*RHO*C.Al*Math.sqrt(Vt*Vt+(Vn+v)**2)); v=.5*v+.5*vn;}
  st.vi=v; return Math.max(0,C.COAX_LOSS/C.FM*((T/g)*v+T*Vn)); }
function pushP(T,u){ if(T<=1)return 0; u=Math.max(u,0); return T/C.FM*(.5*u+Math.sqrt(.25*u*u+T/(2*C.Ap*C.DUCT_GAIN*RHO))); }

function newState(o={}){ const yaw=o.yaw||0; return {
  p:[o.n||0,o.e||0,-(o.alt||0)], v:[0,0,0], q:[Math.cos(yaw/2),0,0,Math.sin(yaw/2)], w:[0,0,0],
  spool:new Float64Array(10), inflow:[{},{},{},{}], fuel:C.fuelKg, ductP:[0,0,0,0], pushW:[0,0], soc:1, battKW:0, P:0, Pdemand:0, boostOn:false,
  ductT:[0,0,0,0], pushT:[0,0], Fa:[0,0,0], onGround:false, wow:0, nz:1, Ib:[0,0,0], colI:0, t:0,
  hT:o.hT??0, crash:null, alpha:0, beta:0, V:0, phi:0, theta:0, psi:yaw, ax:0, Lw:0 }; }
const rotV=(q,v)=>{const [w,x,y,z]=q,t=[2*(y*v[2]-z*v[1]),2*(z*v[0]-x*v[2]),2*(x*v[1]-y*v[0])];
  return [v[0]+w*t[0]+y*t[2]-z*t[1],v[1]+w*t[1]+z*t[0]-x*t[2],v[2]+w*t[2]+x*t[1]-y*t[0]];};
const rotI=(q,v)=>rotV([q[0],-q[1],-q[2],-q[3]],v);
function euler(s){const [w,x,y,z]=s.q; s.phi=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)); s.theta=Math.asin(clamp(2*(w*y-z*x),-1,1)); s.psi=Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z));}
const thetaTrim=V=>V<60?lerp(6.2,-1.0,V/60):lerp(-1,-3.2,Math.min(1,(V-60)/25));   // hover 6.2 up -> -3.2 at 150 mph (fan-tilt trim)

const nAvail=V=>clamp(1.32+(V-30)*.03,1.25,2.5);
/* flight computer: same path for the human stick and the SI pilot.
   cmd: roll,pitch,yaw,climb [-1,1]; throttle [0,1]; boost; altHold; optional phiC, thetaOff (rad), altTarget */
function fbw(s,cmd,dt,grd){
  const V=s.V, sf=clamp((V-10)/25,0,1), {phi,theta}=s, m=C.mass0-C.fuelKg+s.fuel;
  const vUp=-s.v[2], h=-s.p[2];
  const phiMax=Math.min(lerp(22,72,sf)*D2R,Math.acos(1/nAvail(V)));
  const altErr=(cmd.altHold!==false)?(cmd.altTarget!==undefined?cmd.altTarget:s.hT)-h:0, sag=clamp(1-(altErr-1.5)/7,.5,1);
  let phiC=cmd.phiC!==undefined?cmd.phiC:cmd.roll*phiMax; phiC=clamp(phiC,-phiMax*sag,phiMax*sag);
  // hover: rock back until the lift fans' rearward lean cancels the rear-duct cant and the 10 % cooling thrust
  let fw=0,upT=0;for(let k=0;k<4;k++){fw+=s.ductT[k]*DUCTS[k].n[0];upT-=s.ductT[k]*DUCTS[k].n[2];}
  const pc=s.pushT[0]+s.pushT[1];fw+=pc*c10;upT+=pc*s10;
  const dem0=clamp(cmd.throttle||0,0,1)*C.pusherMax,pmin=C.pusherMinFrac*C.pusherMax,pcTgt=2*Math.max(dem0,pmin);
  const hvTilt=upT>3000?Math.atan2(fw-pc*c10+pcTgt*c10,upT):8.2*D2R; s.hvTilt=(s.hvTilt===undefined?hvTilt:s.hvTilt+(hvTilt-s.hvTilt)*Math.min(1,dt*.6));
  const Vb=rotI(s.q,s.v),hands=cmd.thetaOff===undefined&&(cmd.throttle||0)<.03&&Math.abs(cmd.pitch||0)<.05&&V<15?clamp(Vb[0]*.04,-.1,.16):0;
  const thB=lerp(s.hvTilt,thetaTrim(V)*D2R,clamp(V/20,0,1));
  const thC=thB+hands+(cmd.thetaOff!==undefined?cmd.thetaOff:-cmd.pitch*lerp(16,26,sf)*D2R+(1-clamp(cmd.throttle/.25,0,1))*clamp((V-6)/12,0,1)*7*D2R);
  const psiRate=clamp(sf*G*Math.tan(clamp(phi,-1.2,1.2))/Math.max(V,14),-.75,.75)+(cmd.yaw||0)*lerp(1.0,.6,sf)+1.4*sf*s.beta*(1-Math.min(1,Math.abs(cmd.yaw||0)*2.5));
  const phiD=clamp(3.0*(phiC-phi),-1.7,1.7), thD=clamp(2.4*(thC-theta),-1.1,1.1);
  const sp=Math.sin(phi),cp=Math.cos(phi),st=Math.sin(theta),ct=Math.cos(theta);
  const wc=[phiD-psiRate*st, thD*cp+psiRate*ct*sp, -thD*sp+psiRate*ct*cp];
  const kr=[4.6,4.6,2.6], ki=[.8,.9,.3], I=[C.Ixx,C.Iyy,C.Izz], tau=[0,0,0];
  for(let i=0;i<3;i++){const e=wc[i]-s.w[i]; if(!s.onGround)s.Ib[i]=clamp(s.Ib[i]+e*ki[i]*dt,-1.2,1.2); else s.Ib[i]=0; tau[i]=I[i]*(kr[i]*e+s.Ib[i]);}
  // collective
  const c=Math.max(cp*ct,.3); let T;
  const aeroUp=-rotV(s.q,s.Fa)[2];
  const throttle=clamp(cmd.throttle||0,0,1);
  if(cmd.altHold!==false){
    if(cmd.altTarget!==undefined) s.hT=cmd.altTarget; else s.hT=Math.max(s.hT+(cmd.climb||0)*14*dt,grd);
    const hdc=clamp(1.3*(s.hT-h),-14,14), e=hdc-vUp;
    if(!s.onGround) s.colI=clamp(s.colI+e*.8*dt,-5,5); else s.colI=0;
    const up=m*(G+clamp(2.2*e+s.colI,-7,14));
    T=(up-aeroUp-(s.pushT[0]+s.pushT[1])*(-rotV(s.q,PUSH[0].n)[2]))/c;
    if(s.hT<grd+.25&&s.onGround) T=m*G*.25;
  } else T=(m*G*(1+(cmd.climb||0)*.7)-aeroUp)/c;
  T=clamp(T,0,8*C.rotorMax);
  if(s.onGround&&T<m*G*.3){tau[0]=tau[1]=tau[2]=0;}   // settled on the wheels: let them level the machine
  const pushDem=throttle*C.pusherMax;
  let Mp=0; for(const q of PUSH) Mp+=cross(q.r,q.n)[1]*pushDem;
  const d=[0,0,0,0];
  for(let k=0;k<4;k++) d[k]=MIX[k][0]*T+MIX[k][1]*tau[0]+MIX[k][2]*(tau[1]-Mp*.7);
  // keep attitude authority: trade collective, never the differential
  {const cap=2*C.rotorMax,hi=Math.max(...d),lo=Math.min(...d); if(hi>cap){const o=hi-cap;for(let k=0;k<4;k++)d[k]-=o;} else if(lo<0){const o=Math.min(-lo,cap-hi);for(let k=0;k<4;k++)d[k]+=o;}}
  for(let k=0;k<4;k++) d[k]=clamp(d[k],0,2*C.rotorMax);
  // yaw: upper/lower split in each duct, plus differential pushers
  // yaw, drone style: speed up the fans spinning one way and slow the opposite set, in each duct, so net lift stays put
  const yawSplit=clamp(tau[2]*.72/(Math.max(T,2000)*.271),-.25,.25);
  // twist mode: rear pair differential acts through the 10 deg cant; front pair cancels the roll
  const room=Math.min(d[0],d[1],d[2],d[3],2*C.rotorMax-Math.max(...d)),tw=clamp(tau[2]*.28/(2*1.7219*s10),-Math.min(room,1800),Math.min(room,1800));
  d[0]-=tw;d[1]+=tw;d[2]+=tw;d[3]-=tw; for(let k=0;k<4;k++)d[k]=clamp(d[k],0,2*C.rotorMax);
  // extreme stick only: mix in pusher thrust vectoring from 70 % to full yaw input
  const yawEx=clamp((Math.abs(cmd.yaw||0)-.7)/.3,0,1), dp=clamp(tau[2]*.5/(2*.45),-1800,1800)*yawEx, base=Math.max(pushDem,Math.abs(dp));
  const pd=[clamp(base+dp,pmin,C.pusherMax),clamp(base-dp,pmin,C.pusherMax)];
  return {d,pd,yawSplit,boost:+cmd.boost||0};
}

function step(s,u,dt,env){
  const Vb=rotI(s.q,s.v); const V=Math.hypot(...Vb); s.V=V;
  // power governor: lift first, pushers take what is left
  const bLvl=clamp(+u.boost||0,0,1); s.boostCmd=bLvl; s.boostOn=bLvl>0&&s.soc>0.002; s.boostLvl=s.boostOn?bLvl:0;
  const Peng=s.fuel>0?C.Pcont*HP:0, Pav=Peng+s.boostLvl*(C.Pburst-C.Pcont)*HP; // no propane, no engine
  const dem=[...u.d]; const pd=[...u.pd];
  const P4=d=>{let p=0;for(let k=0;k<4;k++){const n=DUCTS[k].n,Vn=Vb[0]*n[0]+Vb[1]*n[1]+Vb[2]*n[2],Vt=Math.sqrt(Math.max(V*V-Vn*Vn,0)),q=ductP(d[k],Vn,Vt,s.inflow[k]);s.ductP[k]=q;p+=q;}return p;};
  const un=Vb[0]*c10-Vb[2]*s10, PavL=Math.max(Pav-2*pushP(Math.min(pd[0],pd[1],C.pusherMinFrac*C.pusherMax),un),0);
  let Pl=P4(dem); for(let it=0;it<3&&Pl>PavL&&Pl>0;it++){const f=Math.pow(PavL/Pl,.75);for(let k=0;k<4;k++)dem[k]*=f;Pl=P4(dem);}
  let Pp=pushP(pd[0],un)+pushP(pd[1],un);
  const rem=Math.max(Pav-Pl,0); if(Pp>rem&&Pp>0){const f=rem/Pp;pd[0]*=f;pd[1]*=f;}
  s.Pdemand=(Pl+Pp)/HP;
  // spools: thrust = max * cmd^2, 0.15 s first-order lag on cmd
  const k=1-Math.exp(-dt/C.tau), sh=[]; 
  let Mkick=0;   // spool = rotor speed / max speed; changing speed reacts on the airframe through rotor inertia
  for(let i=0;i<4;i++){const sg=DUCTS[i].sgn, sp=sg*u.yawSplit, up=clamp(C.UPPER+sp,.05,.95);
    const a=Math.sqrt(clamp(dem[i]*up/C.rotorMax,0,1)), b=Math.sqrt(clamp(dem[i]*(1-up)/C.rotorMax,0,1));
    const du=(a-s.spool[2*i])*k, dl=(b-s.spool[2*i+1])*k; s.spool[2*i]+=du; s.spool[2*i+1]+=dl;
    Mkick+=sg*(du-dl)*C.Jr*C.Omax/dt;}
  for(let i=0;i<2;i++){s.spool[8+i]+=(Math.sqrt(clamp(pd[i]/C.pusherMax,0,1))-s.spool[8+i])*k;}
  const F=[0,0,0], M=[0,0,0], add=(r,f)=>{F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];const m=cross(r,f);M[0]+=m[0];M[1]+=m[1];M[2]+=m[2];};
  for(let i=0;i<4;i++){const d=DUCTS[i],Tu=C.rotorMax*s.spool[2*i]**2,Tl=C.rotorMax*s.spool[2*i+1]**2,T=Tu+Tl; s.ductT[i]=T;
    add(d.r,[d.n[0]*T,d.n[1]*T,d.n[2]*T]); M[2]+=d.sgn*(Tu*C.KU-Tl*C.KL);}
  for(let i=0;i<2;i++){const d=PUSH[i],T=C.pusherMax*s.spool[8+i]**2;s.pushT[i]=T;add(d.r,[d.n[0]*T,d.n[1]*T,d.n[2]*T]);}
  M[2]+=Mkick;
  // actual shaft power, energy
  s.pushW=[pushP(s.pushT[0],un),pushP(s.pushT[1],un)]; let P=P4(s.ductT)+s.pushW[0]+s.pushW[1]; s.P=P/HP;
  const over=P-Peng;
  // LTO: discharge above 1,500 hp (boost on), otherwise float full on engine surplus. 97 % each way.
  let chg=0, batt=0;
  if(over>0){batt=over/C.etaB; s.soc=Math.max(0,s.soc-batt*dt/C.battJ);}
  else if(over<0&&s.soc<1){chg=Math.min(Peng-P,C.Pcharge); batt=-chg*C.etaB; s.soc=Math.min(1,s.soc+chg*C.etaB*dt/C.battJ);}
  s.battKW=batt/1000;
  s.fuel=Math.max(0,s.fuel-(Math.min(P,Peng)+chg)/(C.BTE*C.LHV)*dt);
  // aero (kit tables)
  const q=.5*RHO*V*V, Vs=Math.max(V,1), al=Math.atan2(Vb[2],Vb[0]), be=Math.asin(clamp(Vb[1]/Vs,-1,1)); s.alpha=al; s.beta=V>3?be:0;
  const aDeg=((al/D2R+s_inc()+180)%360+360)%360-180, Lw=q*C.S*CL(aDeg), Dw=q*C.S*CD(aDeg), Y=-q*C.S*1.38*Math.sin(be);
  const ca=Math.cos(al),sa=Math.sin(al), Fa=[Lw*sa-Dw*ca, Y, -Lw*ca-Dw*sa]; s.Lw=Lw;
  add(AERO_R,Fa);
  M[0]+=q*C.S*C.b*(-.05*Math.sin(be))+q*C.S*C.b*(C.b/(2*Vs))*(-.5)*s.w[0];
  M[1]+=q*C.S*C.c*(-.3*Math.sin(al))+q*C.S*C.c*(C.c/(2*Vs))*(-8)*s.w[1];
  M[2]+=q*C.S*C.b*(.04*Math.sin(be))+q*C.S*C.b*(C.b/(2*Vs))*(-.2)*s.w[2];
  s.Fa=rotV(s.q,Fa);
  // gravity + contacts
  const m=C.mass0-C.fuelKg+s.fuel; const gb=rotI(s.q,[0,0,m*G]); F[0]+=gb[0];F[1]+=gb[1];F[2]+=gb[2];
  s.onGround=false; let nzC=0;
  const gh=env.height(s.p[0],s.p[1]); const hit=(r,wheel)=>{const pw=rotV(s.q,r); const z=s.p[2]+pw[2]; const pen=z+gh; if(pen<=0)return;
    if(!env.solid(s.p[0],s.p[1])){s.crash=s.crash||'water';return;}
    const vw=cross(s.w,r),vi=rotV(s.q,vw),vp=[s.v[0]+vi[0],s.v[1]+vi[1],s.v[2]+vi[2]];
    const N=Math.max(0,800000*pen+6000*vp[2]); const tk=wheel?(env.brake?12000:1500):20000; let fx=-tk*vp[0],fy=-tk*vp[1]; const lim=.8*N,fm=Math.hypot(fx,fy); if(fm>lim){fx*=lim/fm;fy*=lim/fm;}
    const f=rotI(s.q,[fx,fy,-N]); add(r,f); s.onGround=s.onGround||wheel; if(!wheel&&Math.hypot(...vp)>14)s.crash=s.crash||'ground'; };
  for(const r of WHEELS)hit(r,true); for(const r of HARD)hit(r,false);
  // integrate
  const Fw=rotV(s.q,F), acc=[Fw[0]/m,Fw[1]/m,Fw[2]/m];
  s.nz=-(F[2]-gb[2])/(m*G); s.ax=acc[0]*Vb0(s,0)+acc[1]*Vb0(s,1)+acc[2]*Vb0(s,2);
  for(let i=0;i<3;i++){s.v[i]+=acc[i]*dt;s.p[i]+=s.v[i]*dt;}
  const [p,qq,r]=s.w, h=[C.Ixx*p-C.Ixz*r,C.Iyy*qq,C.Izz*r-C.Ixz*p], wxh=cross(s.w,h), R=[M[0]-wxh[0],M[1]-wxh[1],M[2]-wxh[2]];
  const det=C.Ixx*C.Izz-C.Ixz**2;
  s.w[0]+=(C.Izz*R[0]+C.Ixz*R[2])/det*dt; s.w[1]+=R[1]/C.Iyy*dt; s.w[2]+=(C.Ixz*R[0]+C.Ixx*R[2])/det*dt;
  const [w,x,y,z]=s.q, wx=s.w[0]*.5*dt, wy=s.w[1]*.5*dt, wz=s.w[2]*.5*dt;
  s.q=[w-x*wx-y*wy-z*wz, x+w*wx+y*wz-z*wy, y+w*wy+z*wx-x*wz, z+w*wz+x*wy-y*wx];
  const n=Math.hypot(...s.q); s.q=s.q.map(v=>v/n);
  euler(s); s.t+=dt;
  // hard floor: no wheel or structure point may pass below the ground plane
  if(env.solid(s.p[0],s.p[1])){const g=env.height(s.p[0],s.p[1]);let mx=-1e9;for(const r of WHEELS)mx=Math.max(mx,rotV(s.q,r)[2]);for(const r of HARD)mx=Math.max(mx,rotV(s.q,r)[2]);
    const low=s.p[2]+mx+g; s.floorPen=low; if(low>-.012)s.onGround=true; if(low>.008){s.p[2]-=low-.008; if(s.v[2]>0)s.v[2]=0;}}
}
const s_inc=()=>C.INC, Vb0=(s,i)=>{const v=Math.hypot(...s.v)||1;return s.v[i]/v;};

/* ---------- course ---------- */
function buildCourse(def){
  const sc=def.scale||1, spires=def.spires.map((s,i)=>({...s,x:s.x*sc,y:s.y*sc,R:s.R*sc,idx:i})), gate=def.gate;
  const gm=[(gate.a[0]+gate.b[0])/2,(gate.a[1]+gate.b[1])/2], hd=[Math.cos(gate.hdg),Math.sin(gate.hdg)];
  // belt-and-pulley line: every spire sits inside a turning circle; straights are the common tangents
  const nodes=[{c:[...gm],R:1,s:1,alt:gate.alt,fixed:true},...spires.map(p=>({sp:p,R:p.R||def.R,s:p.side==='L'?1:-1,alt:p.alt,c:[p.x,p.y]}))];
  const K=nodes.length, left=u=>[-u[1],u[0]];
  const tang=(a,b)=>{const D=[b.c[0]-a.c[0],b.c[1]-a.c[1]],d=Math.hypot(D[0],D[1]),w=b.s*b.R-a.s*a.R,th=-Math.asin(clamp(w/d,-1,1)),c=Math.cos(th),s=Math.sin(th);
    return [(D[0]*c-D[1]*s)/d,(D[0]*s+D[1]*c)/d];};
  for(let it=0;it<60;it++){ const us=nodes.map((n,i)=>tang(n,nodes[(i+1)%K]));
    for(let i=1;i<K;i++){const n=nodes[i],a=us[(i+K-1)%K],b=us[i];const pv=nodes[(i+K-1)%K].c,nx=nodes[(i+1)%K].c;let t=[nx[0]-pv[0],nx[1]-pv[1]],l=Math.hypot(t[0],t[1])||1;t=[t[0]/l,t[1]/l];
      const L=left(t),o=n.R-(n.sp.clear||def.clear),tx=n.sp.x+L[0]*n.s*o,ty=n.sp.y+L[1]*n.s*o; n.c=[lerp(n.c[0],tx,.5),lerp(n.c[1],ty,.5)];}}
  const us=nodes.map((n,i)=>tang(n,nodes[(i+1)%K])), raw=[], altKey=[];
  for(let i=0;i<K;i++){const n=nodes[i],uin=us[(i+K-1)%K],uout=us[i],a0=Math.atan2(-n.s*left(uin)[1],-n.s*left(uin)[0]),a1=Math.atan2(-n.s*left(uout)[1],-n.s*left(uout)[0]);
    let sw=(a1-a0)*n.s; while(sw<0)sw+=2*Math.PI; while(sw>=2*Math.PI)sw-=2*Math.PI; if(sw>5)sw-=2*Math.PI; const N=Math.max(1,Math.ceil(Math.abs(sw)*n.R/1.5));
    altKey.push(raw.length+Math.floor(N/2));
    if(!n.fixed)for(let j=0;j<=N;j++){const a=a0+n.s*sw*j/N;raw.push([n.c[0]+n.R*Math.cos(a),n.c[1]+n.R*Math.sin(a)]);} else raw.push([...n.c]);
    const A=[n.c[0]-n.s*n.R*left(uout)[0],n.c[1]-n.s*n.R*left(uout)[1]],m=nodes[(i+1)%K],B=[m.c[0]-m.s*m.R*left(uout)[0],m.c[1]-m.s*m.R*left(uout)[1]],len=Math.hypot(B[0]-A[0],B[1]-A[1]),M=Math.ceil(len/1.5);
    for(let j=1;j<M;j++)raw.push([lerp(A[0],B[0],j/M),lerp(A[1],B[1],j/M)]);}
  // resample evenly, then smooth curvature so turns ease in like a real line
  let L0=0; const cu=[0]; for(let i=1;i<=raw.length;i++){const a=raw[i-1],b=raw[i%raw.length];L0+=Math.hypot(b[0]-a[0],b[1]-a[1]);cu.push(L0);}
  const dsr=2,Nr=Math.round(L0/dsr); let pts=[],jj=0;
  for(let i=0;i<Nr;i++){const d=i/Nr*L0;while(cu[jj+1]<d)jj++;const a=raw[jj],b=raw[(jj+1)%raw.length],t=(d-cu[jj])/((cu[jj+1]-cu[jj])||1);pts.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);}
  const W=Math.round((def.smooth||24)/dsr);
  for(let pass=0;pass<3;pass++){const px=[0],py=[0];const ext=[...pts,...pts];ext.forEach((p,i)=>{px.push(px[i]+p[0]);py.push(py[i]+p[1]);});
    pts=pts.map((_,i)=>{const a=i+Nr-W>=Nr?i:i+Nr;const lo=(i-W+Nr)%Nr,hi=lo+2*W+1;return [(px[hi]-px[lo])/(2*W+1),(py[hi]-py[lo])/(2*W+1)];});}
  let L=0;const cum=[0];pts.forEach((p,i)=>{const b=pts[(i+1)%Nr];L+=Math.hypot(b[0]-p[0],b[1]-p[1]);cum.push(L);});
  const ds=4,Np=Math.round(L/ds),path=[];let j=0;
  for(let i=0;i<Np;i++){const d=i/Np*L;while(cum[j+1]<d)j++;const a=pts[j],b=pts[(j+1)%Nr],t=(d-cum[j])/((cum[j+1]-cum[j])||1);path.push({x:lerp(a[0],b[0],t),y:lerp(a[1],b[1],t),z:0});}
  let gi=0,bd=1e9;path.forEach((p,i)=>{const d=Math.hypot(p.x-gm[0],p.y-gm[1]);if(d<bd){bd=d;gi=i;}});
  const P=path.slice(gi).concat(path.slice(0,gi)),n=P.length,S=L/n;
  // altitude: cosine blend between each node's height
  const ki=[{i:0,z:gate.alt}];spires.forEach(sp=>{let b=1e12,bi=0;P.forEach((p,i)=>{const d=(p.x-sp.x)**2+(p.y-sp.y)**2;if(d<b){b=d;bi=i;}});sp.pi=bi;sp.minD=Math.sqrt(b);ki.push({i:bi,z:sp.alt});});
  ki.push({i:n,z:gate.alt});
  for(let k=0;k+1<ki.length;k++){const a=ki[k],b=ki[k+1];for(let i=a.i;i<b.i;i++){const t=(i-a.i)/(b.i-a.i);P[i].z=lerp(a.z,b.z,.5-.5*Math.cos(Math.PI*t));}}
  for(let i=0;i<n;i++){const a=P[(i+n-4)%n],b=P[i],c=P[(i+4)%n];const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
    P[i].k=(ux*vy-uy*vx)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)*Math.hypot(c.x-a.x,c.y-a.y)/2||1);P[i].s=i*S;}
  for(let pass=0;pass<8;pass++){const q=P.map(p=>p.k);for(let i=0;i<n;i++)P[i].k=(q[(i+n-1)%n]+2*q[i]+q[(i+1)%n])/4;}
  spires.forEach(sp=>{const p=P[sp.pi],q=P[(sp.pi+2)%n],o=P[(sp.pi+n-2)%n],l=Math.hypot(q.x-o.x,q.y-o.y);sp.tan=[(q.x-o.x)/l,(q.y-o.y)/l];const d=Math.hypot(p.x-sp.x,p.y-sp.y);sp.out=[(p.x-sp.x)/d,(p.y-sp.y)/d];
    sp.sideOK=((sp.tan[0]*(-sp.out[1])+sp.tan[1]*sp.out[0]))*(sp.side==='L'?1:-1);}); // >0 when the spire is on the named side
  // speed plan
  const vmax=def.vmax||84, fac=def.alatFac||.92; const vc=P.map(p=>{const k=Math.max(Math.abs(p.k),1e-4);let v=vmax;for(let it=0;it<30;it++){const n=nAvail(v),a=G*Math.sqrt(n*n-1)*fac;v=lerp(v,Math.min(vmax,Math.sqrt(a/k)),.5);}return v;});
  const acc=v=>Math.max(.8,(def.acc||5)*(1-(v/86)**2)), brk=def.brk||7;
  for(let pass=0;pass<3;pass++){ for(let i=0;i<2*n;i++){const a=i%n,b=(a+1)%n; vc[b]=Math.min(vc[b],Math.sqrt(vc[a]**2+2*acc(vc[a])*S));}
    for(let i=2*n;i>0;i--){const b=i%n,a=(b+n-1)%n; vc[a]=Math.min(vc[a],Math.sqrt(vc[b]**2+2*brk*S));}}
  let lapPlan=0; for(let i=0;i<n;i++){P[i].v=vc[i];lapPlan+=S/vc[i];}
  // nearest path index per spire
  spires.forEach(s=>{let b=1e12,bi=0;P.forEach((p,i)=>{const d=(p.x-s.x)**2+(p.y-s.y)**2;if(d<b){b=d;bi=i;}});s.pi=bi;s.minD=Math.sqrt(b);});
  return {spires,gate,P,L,S,n,lapPlan,gm,hd,def};
}
/* ---------- SI pilot ---------- */
function makeSI(course){ return {i:-1,boost:false,t:0,step(s,dt,grd){
  const P=course.P,n=course.n,S=course.S; this.t+=dt; const px=s.p[1],py=s.p[0];
  if(this.i<0){let b=1e12;P.forEach((p,i)=>{const d=(p.x-px)**2+(p.y-py)**2;if(d<b){b=d;this.i=i;}});
     // prefer a point ahead on the line
     this.i=(this.i+Math.round(70/S))%n;}
  else {let b=1e12,bi=this.i;for(let k=-6;k<50;k++){const i=(this.i+k+n)%n,p=P[i],d=(p.x-px)**2+(p.y-py)**2;if(d<b){b=d;bi=i;}}this.i=bi;}
  const V=Math.hypot(s.v[0],s.v[1]); const cmd={altHold:true,roll:0,pitch:0,yaw:0,climb:0,throttle:0,boost:false,phiC:0,thetaOff:0};
  if(this.t<1.2){cmd.altTarget=grd;return cmd;}
  const h=-s.p[2];
  if(h<grd+6&&V<8){this.lift=Math.min((this.lift??h)+4.5*dt,grd+12);cmd.altTarget=this.lift;cmd.throttle=.08;return cmd;}
  // launch: stay clear of spire 7, swing wide to the south, then join the line for the gate
  const wps=course.def.outlap||[],pd0=course.def.pad; if(this.out===undefined)this.out=Math.hypot(px-pd0.x,py-pd0.y)<150?0:wps.length;
  let wp=null; if(this.out<wps.length){wp={x:wps[this.out][0],y:wps[this.out][1]}; if(Math.hypot(wp.x-px,wp.y-py)<60){this.out++; if(this.out>=wps.length){let b=1e12;for(let i=0;i<n;i++){const d=(P[i].x-px)**2+(P[i].y-py)**2;if(d<b){b=d;this.i=i;}}wp=null;} else wp={x:wps[this.out][0],y:wps[this.out][1]};}}
  const L=clamp(2*V,80,190), T=wp||P[(this.i+Math.round(L/S))%n];
  if(V<24){const br=Math.atan2(T.x-px,T.y-py);let e=br-s.psi;e=Math.atan2(Math.sin(e),Math.cos(e));cmd.yaw=clamp(e*1.6,-1,1);cmd.phiC=clamp(e*.35,-.14,.14);cmd.throttle=Math.abs(e)<.4?1:.3;cmd.thetaOff=(Math.abs(e)<.4?-7:0)*D2R;cmd.altTarget=Math.max(P[this.i].z,grd+11);cmd.boost=false;return cmd;}
  const hv=Math.atan2(s.v[1],s.v[0]);
  const look=Math.round(V*.55/S), A=P[(this.i+look)%n], B=P[(this.i+look+3)%n], tl=Math.hypot(B.x-A.x,B.y-A.y), tx=(B.x-A.x)/tl, ty=(B.y-A.y)/tl;
  const Q=P[this.i], Q2=P[(this.i+2)%n], ql=Math.hypot(Q2.x-Q.x,Q2.y-Q.y), ex=(px-Q.x)*(Q2.y-Q.y)/ql-(py-Q.y)*(Q2.x-Q.x)/ql;
  let he=Math.atan2(tx,ty)-hv; he=Math.atan2(Math.sin(he),Math.cos(he));
  const ff=P[(this.i+Math.round(V*.68/S))%n].k;
  const al=-ff*V*V+.85*V*Math.sin(he)-clamp(.22*ex,-7,7);
  let alc=al; if(wp){let e=Math.atan2(wp.x-px,wp.y-py)-hv;e=Math.atan2(Math.sin(e),Math.cos(e));alc=.9*V*Math.sin(e);}
  this.dbg={ex,he,al,ff};{const pc=Math.atan(clamp(alc,-19,19)/G);this.pc=(this.pc||0)+clamp(pc-(this.pc||0),-1.05*dt,1.05*dt);cmd.phiC=this.pc;}
  const vr=wp?52:P[(this.i+Math.round(Math.max(V,10)*.75/S))%n].v, e=vr-Math.hypot(...s.v);
  cmd.throttle=e>0?1:clamp(1+e/5,0,1);
  cmd.thetaOff=e<-1?clamp(-(e+1)*3,0,18)*D2R:(e>1?-clamp((e-1)*1.0,0,7)*D2R:0);
  cmd.thetaOff*=Math.cos(s.phi)**2; cmd.altTarget=wp?14:Math.max(P[(this.i+Math.round(V*.8/S))%n].z,grd+8);
  
  if(s.soc<.1)this.boost=false; else if(s.soc>.22)this.boost=true;
  cmd.boost=this.boost&&s.Pdemand>1500;
  return cmd;}};}
/* ---------- autoland: over the spires, back to the pad, straight down ---------- */
function makeLander(pad){const CR=75;return {hT:null,t:0,done:false,step(s,dt,grd){this.t+=dt;
  const px=s.p[1],py=s.p[0],dx=pad.x-px,dy=pad.y-py,d=Math.hypot(dx,dy),h=-s.p[2],V=Math.hypot(s.v[0],s.v[1]),gp=pad.h;
  const cmd={altHold:true,roll:0,pitch:0,yaw:0,climb:0,throttle:0,boost:false,phiC:0,thetaOff:0};
  const brg=Math.atan2(dx,dy),vd=Math.min(58,Math.sqrt(3.2*Math.max(d-1,0))),vN=dy/(d||1)*vd,vE=dx/(d||1)*vd;
  const ca=Math.cos(s.psi),sa=Math.sin(s.psi);
  if(V>22){let he=brg-Math.atan2(s.v[1],s.v[0]);he=Math.atan2(Math.sin(he),Math.cos(he));cmd.phiC=Math.atan(clamp(1.2*V*Math.sin(he),-12,12)/G);
    const e=vd-Math.hypot(...s.v);cmd.throttle=e>1?1:0;cmd.thetaOff=(e<-1?clamp(-(e+1)*2.2,0,16):e>1?-3:0)*D2R;let ye=he;cmd.yaw=0;}
  else{const eN=vN-s.v[0],eE=vE-s.v[1],fw=clamp(.5*(eN*ca+eE*sa),-3.2,3.2),rt=clamp(.5*(-eN*sa+eE*ca),-2.6,2.6);
    cmd.thetaOff=-fw/G;cmd.phiC=rt/G;let ye=d>18?brg-s.psi:0;ye=Math.atan2(Math.sin(ye),Math.cos(ye));cmd.yaw=clamp(ye*.8,-.6,.6);}
  const rawAlt=d>330?Math.max(CR,Math.min(h+30,CR)):gp+9+Math.min(1,Math.max(0,(d-40)/290))*(CR-gp-9);
  if(this.hT===null)this.hT=h; const tgt=(d<4&&V<1.6)||this.down?-1:rawAlt;
  if(tgt<0){this.down=true;this.hT=Math.max(grd-.3,this.hT-1.5*dt);}else this.hT+=clamp(tgt-this.hT,-5*dt,9*dt);
  if(this.down)cmd.thetaOff-=4*D2R;
  cmd.altTarget=this.hT; if(this.down&&s.onGround){this.gt=(this.gt||0)+dt;if(this.gt>.6)this.done=true;}
  return cmd;}};}
return {massOf:s=>C.mass0-C.fuelKg+s.fuel,makeLander,nAvail,C,LBF,HP,G,RHO,D2R,clamp,lerp,newState,fbw,step,buildCourse,makeSI,rotV,rotI,euler,DUCTS,PUSH,thetaTrim,CL,CD};
})();
if(typeof module!=='undefined')module.exports=X1P;
