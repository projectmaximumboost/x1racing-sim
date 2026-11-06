/* Course: x=east, y=north, metres. side: L = turn left around it (spire on your left, red, port).
   R = turn right (green, starboard). Spire geometry: X1 200 ft inflatable. */
const X1COURSE={outlap:[[-175,-5],[-95,78]],scale:.905,alatFac:.94,
  gate:{a:[0,62],b:[0,142],alt:13,hdg:0}, clear:31, R:115, alat:17, vmax:84, acc:3.8, brk:2.6, smooth:46,
  pad:{x:-300,y:-62,yaw:1.2,h:2.2},
  spires:[
    {x:240,y:85,side:'R',R:420,alt:13},
    {x:600,y:285,side:'L',R:160,alt:14,clear:38},
    {x:300,y:478,side:'R',R:240,alt:18,clear:40},
    {x:20,y:560,side:'L',R:230,alt:15,clear:36},
    {x:-290,y:482,side:'R',R:240,alt:21,clear:40},
    {x:-640,y:300,side:'L',R:175,alt:15,clear:48},
    {x:-235,y:70,side:'R',R:420,alt:13,clear:40},
  ]};
/* shore: y below this line is land; a spit carries the launch pad */
const shoreY=x=>-150+150*Math.exp(-(((x+300)/190)**2));
const landH=(x,y)=>{const d=shoreY(x)-y; if(d<=0)return 0; const pd=Math.hypot(x+300,y+62); return pd<46?2.2:Math.min(2.2,d/14)*(1)+Math.max(0,(d-120)/60);};
if(typeof X1COURSE!=='undefined'){X1COURSE.shoreY=shoreY;X1COURSE.landH=landH;}
if(typeof module!=='undefined')module.exports=X1COURSE;
