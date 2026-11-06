const X=require('../src/physics.js'),DEF=require('../src/course.js');const c=X.buildCourse(DEF),pad=DEF.pad;const env={height:(n,e)=>DEF.landH(e,n),solid:(n,e)=>DEF.landH(e,n)>.2,brake:true};
const s=X.newState({n:pad.y,e:pad.x,yaw:pad.yaw,hT:pad.h});s.p[2]=-(pad.h+.66);const si=X.makeSI(c);const dt=.005;let px=null,mn=c.spires.map(()=>1e9),gate=0;
for(let t=0;t<70;t+=dt){const g=DEF.landH(s.p[1],s.p[0]);const u=X.fbw(s,si.step(s,dt,pad.h),dt,g);X.step(s,u,dt,env);if(s.crash){console.log('crash',s.crash,t);break;}const x=s.p[1],y=s.p[0];if(!gate)c.spires.forEach((o,i)=>{mn[i]=Math.min(mn[i],Math.hypot(o.x-x,o.y-y));});
 if(Math.floor(t)!=Math.floor(t-dt)&&!gate&&t>3)console.log(t|0,'x',x|0,'y',y|0,'V',s.V.toFixed(0),'h',(-s.p[2]).toFixed(0),'phi',(s.phi/X.D2R|0),'hdg',(s.psi/X.D2R|0));
 if(px!==null&&px<0&&x>=0&&!gate){gate=1;console.log('GATE t',t.toFixed(1),'y',y.toFixed(0),'V',s.V.toFixed(1),'hdg',(s.psi/X.D2R|0),'spire mins',mn.map(v=>v|0).join(' '));}px=x;}
