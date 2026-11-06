const X=require('../src/physics.js'),DEF=require('../src/course.js');
const {C,HP,G,RHO}=X;
// trim validation: steady level flight at full throttle with SI-free hold
function vmaxTest(boost){const s=X.newState({alt:30,hT:30});s.v=[40,0,0];const env={height:()=>-1e3,solid:()=>false};
 let t=0;for(;t<160;t+=.005){const u=X.fbw(s,{altHold:true,altTarget:30,roll:0,pitch:0,yaw:0,climb:0,throttle:1,boost:false,thetaOff:undefined,},.005,0);u.boost=boost;s.soc=1;X.step(s,u,.005,env);}
 return {mph:s.V*2.23694,P:s.P,th:s.theta/X.D2R,h:-s.p[2],Lw:s.Lw/X.LBF,duct:s.ductT.map(v=>Math.round(v/X.LBF)),push:s.pushT.map(v=>Math.round(v/X.LBF))};}
console.log('Vmax cont',vmaxTest(false));console.log('Vmax burst',vmaxTest(true));
const course=X.buildCourse(DEF);
console.log('side',course.spires.map(s=>s.sideOK.toFixed(1)).join(' '));console.log('L',course.L|0,'plan',course.lapPlan.toFixed(1),'spires',course.spires.map(s=>s.side+s.minD.toFixed(0)).join(' '),'minV',Math.min(...course.P.map(p=>p.v)).toFixed(0),'maxk',Math.max(...course.P.map(p=>Math.abs(p.k))).toFixed(4));
const pad=DEF.pad;const env={height:(n,e)=>DEF.landH(e,n),solid:(n,e)=>DEF.landH(e,n)>.2,brake:true};
const s=X.newState({n:pad.y,e:pad.x,alt:pad.h+.0,yaw:pad.yaw,hT:pad.h});s.p[2]=-(pad.h+.661);
const si=X.makeSI(course);let dt=.005,last=0,prevx=null,laps=[],t0=null,maxN=0,maxP=0,minC=1e9;let log=[];
for(let t=0;t<600;t+=dt){const cmd=si.step(s,dt,pad.h);const u=X.fbw(s,cmd,dt,pad.h);X.step(s,u,dt,env);
 if(0&&Math.floor(t*2)!=Math.floor((t-dt)*2))console.log(t.toFixed(1),'i',si.i,'V',s.V.toFixed(0),'ref',course.P[si.i].v.toFixed(0),'R',(1/course.P[si.i].k).toFixed(0),'ex',si.dbg.ex.toFixed(0),'he',(si.dbg.he/X.D2R).toFixed(0),'al',si.dbg.al.toFixed(1),'pc',(cmd.phiC/X.D2R).toFixed(0),'phi',(s.phi/X.D2R).toFixed(0),'n',s.nz.toFixed(1),'h',(-s.p[2]).toFixed(0),'beta',(s.beta/X.D2R).toFixed(0));if(s.crash){console.log('CRASH',s.crash,t.toFixed(1),s.p,s.V);break;}
 const x=s.p[1],y=s.p[0];if(prevx!==null&&prevx<0&&x>=0&&y>40&&y<220){if(t0!==null)laps.push((t-t0).toFixed(2));else console.log('first gate at',t.toFixed(1),'V',s.V.toFixed(1));t0=t;}prevx=x;
 maxN=Math.max(maxN,s.nz);maxP=Math.max(maxP,s.P);for(const c of course.spires){const d=Math.hypot(c.x-x,c.y-y);if(d<14&&!c.fl){c.fl=1;console.log('CLOSE',c.idx+1,'lap',laps.length,'d',d.toFixed(1),'V',s.V.toFixed(0),'phi',(s.phi/X.D2R|0),'soc',s.soc.toFixed(2),'h',(-s.p[2]).toFixed(0));}c.mn=Math.min(c.mn||1e9,d);if(laps.length>=1)c.mn2=Math.min(c.mn2||1e9,d);minC=Math.min(minC,d);}
 if(Math.floor(t)!=Math.floor(t-dt)&&t>135&&t<215)log.push(`${t.toFixed(0)} V${s.V.toFixed(0)} h${(-s.p[2]).toFixed(0)} phi${(s.phi/X.D2R).toFixed(0)} th${(s.theta/X.D2R).toFixed(0)} P${s.P.toFixed(0)} n${s.nz.toFixed(1)} i${si.i} ref${course.P[si.i].v.toFixed(0)} soc${s.soc.toFixed(2)} beta${(s.beta/X.D2R).toFixed(0)}`);
 if(laps.length>=8)break;}
console.log('mins',course.spires.map(c=>c.mn2|0).join(' '));console.log('laps',laps,'maxN',maxN.toFixed(2),'maxP',maxP|0,'minClear',minC.toFixed(0),'soc',s.soc.toFixed(2));
