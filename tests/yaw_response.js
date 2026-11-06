const X=require('../src/physics.js');const env={height:()=>-1e3,solid:()=>false};const dt=.005;
function run(V,yaw,T){const s=X.newState({alt:30,hT:30});s.v=[V,0,0];for(let k=0;k<8;k++)s.spool[k]=.62;for(let t=0;t<8;t+=dt){const u=X.fbw(s,{altHold:true,altTarget:30,roll:0,pitch:0,yaw:0,climb:0,throttle:V?.9:0},dt,0);X.step(s,u,dt,env);}
 const o=[];const psi0=s.psi;let ps=s.psi,tot=0,maxR=0,mxPhi=0,mh=0;for(let t=0;t<T;t+=dt){const u=X.fbw(s,{altHold:true,altTarget:30,roll:0,pitch:0,yaw:t<4?yaw:0,climb:0,throttle:V?.9:0},dt,0);X.step(s,u,dt,env);let d=s.psi-ps;d=Math.atan2(Math.sin(d),Math.cos(d));tot+=d;ps=s.psi;
 mxPhi=Math.max(mxPhi,Math.abs(s.phi));mh=Math.max(mh,Math.abs(30+s.p[2]));if([.25,.5,1,2,3.9,4.5,5,6].some(x=>Math.abs(t-x)<dt/2))o.push(t+'s r='+(s.w[2]/X.D2R).toFixed(0)+'°/s');}
 console.log('V',V,'hdg change',(tot/X.D2R).toFixed(0),'peak bank',(mxPhi/X.D2R).toFixed(1),'alt dev',mh.toFixed(2),'beta',(s.beta/X.D2R).toFixed(1),o.join(' '),'split',s.spool.slice(0,2).map(v=>(v*4000|0)).join('/'));}
run(0,1,7);run(0,.6,7);run(0,-.85,7);run(60,1,7);
