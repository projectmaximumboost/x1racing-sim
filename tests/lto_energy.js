const X=require('../src/physics.js'),DEF=require('../src/course.js');const c=X.buildCourse(DEF),pad=DEF.pad;
const env={height:(n,e)=>DEF.landH(e,n),solid:(n,e)=>DEF.landH(e,n)>.2,brake:true};const s=X.newState({n:pad.y,e:pad.x,yaw:pad.yaw,hT:pad.h});s.p[2]=-(pad.h+.66);const si=X.makeSI(c);const dt=.005;
let px=null,n=0,a={d:0,c:0,i:0,ed:0,ec:0,pk:0,pc:0},soc0=1;
for(let t=0;t<800&&n<12;t+=dt){const u=X.fbw(s,si.step(s,dt,pad.h),dt,pad.h);X.step(s,u,dt,env);const k=s.battKW;if(k>0){a.d+=dt;a.ed+=k*dt/3600;a.pk=Math.max(a.pk,k);}else if(k<0){a.c+=dt;a.ec-=k*dt/3600;a.pc=Math.max(a.pc,-k);}else a.i+=dt;
 const x=s.p[1];if(px<0&&x>=0&&s.p[0]>40&&s.p[0]<220){console.log('lap',n,'dis',a.d.toFixed(0)+'s',a.ed.toFixed(2)+'kWh pk',a.pk|0,'| chg',a.c.toFixed(0)+'s',a.ec.toFixed(2)+'kWh pk',a.pc|0,'| idle',a.i.toFixed(0)+'s soc',s.soc.toFixed(2));n++;a={d:0,c:0,i:0,ed:0,ec:0,pk:0,pc:0};}px=x;}
