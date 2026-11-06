const X=require('../src/physics.js'),DEF=require('../src/course.js');const pad=DEF.pad;const env={height:(n,e)=>DEF.landH(e,n),solid:(n,e)=>DEF.landH(e,n)>.2,brake:true};const dt=.005;
// player-style takeoff, stick free, no throttle
const s=X.newState({n:pad.y,e:pad.x,yaw:pad.yaw,hT:pad.h});s.p[2]=-(pad.h+.66);const x0=s.p.slice();let lifted=0;
for(let t=0;t<40;t+=dt){const g=DEF.landH(s.p[1],s.p[0]);const hT=t>1?pad.h+13:g;s.hT=hT;const c={altHold:true,roll:0,pitch:0,yaw:0,climb:0,throttle:0};const u=X.fbw(s,c,dt,g);X.step(s,u,dt,env);
 if(!lifted&&!s.onGround){lifted=1;console.log('liftoff t',t.toFixed(2),'pitch',(s.theta/X.D2R).toFixed(1));}
 if([.5,1,1.5,2,3,5,8,12,20,30,39.9].some(v=>Math.abs(t-v)<dt/2))console.log('t',t.toFixed(1),'h',(-s.p[2]).toFixed(1),'pitch',(s.theta/X.D2R).toFixed(1),'V',s.V.toFixed(2),'drift m',Math.hypot(s.p[0]-x0[0],s.p[1]-x0[1]).toFixed(1),'pushT%',(s.pushT[0]/X.C.pusherMax*100).toFixed(0),'P',s.P|0,'gnd',s.onGround);if(s.crash){console.log('CRASH',s.crash,t);break;}}
