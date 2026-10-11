/* =========================================================================
   SCENERY (v5) — deterministic doodads painted into the terrain bake: grass/scrub tufts, pebbles, boulders,
   crystal clusters, dead trees, wrecks and ether pools. Placement is a pure function of (map seed, terrain),
   so every replay (1x base map, sharp 2-3x tiles) paints exactly the same objects. Rendering only; units walk over
   it (everything is below one tile). Pools also register for a live shimmer pass (drawPools).
   ========================================================================= */
function sceneryPlan(T){
  const{TT,H,RAMP,nA,nB}=T,R=mulberry32(G.seed*17+3),ex=new Uint8Array(NN),out=[],pools=[];
  const mark=(tx,ty,r)=>{for(let y=Math.max(0,Math.floor(ty-r));y<=Math.min(MH-1,ty+r);y++)for(let x=Math.max(0,Math.floor(tx-r));x<=Math.min(MW-1,tx+r);x++)if((x-tx)*(x-tx)+(y-ty)*(y-ty)<=r*r)ex[y*MW+x]=1;};
  for(const s of G.sites)mark(s.cx,s.cy,s.main?7:6);
  for(const r of G.res)mark(r.tx,r.ty,2.2);
  for(const c of G.camps)mark(c.x/TILE,c.y/TILE,4.5);
  for(const n of G.neutrals)mark(n.tx,n.ty,3.2);
  for(const pl of CORRIDORS)for(const pts of[pl,pl.map(p=>[MW-1-p[0],MH-1-p[1]])])for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let k=0;k<=n;k++)mark(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,2);}
  const ok=(x,y)=>{const tx=x/TILE|0,ty=y/TILE|0,i=ty*MW+tx;if(tx<1||ty<1||tx>=MW-1||ty>=MH-1)return false;
    if(TT[i]!==0||RAMP[i]||ex[i])return false;for(const d of[-1,1,-MW,MW])if(TT[i+d]!==0)return false;return true;};
  for(let i=0;i<5200&&out.length<1500;i++){const x=R()*WW,y=R()*WH;if(!ok(x,y))continue;
    const fx=x/TILE,fy=y/TILE,bio=nA(fx*.035+3,fy*.035+8),dry=nB(fx*.05+40,fy*.05+2),hi=H[(y/TILE|0)*MW+(x/TILE|0)]>=1,u=R();let k;
    if(bio>.52&&!hi)k=u<.78?0:u<.9?4:1;           // scrub: tufts + dead trees
    else if(bio<.4)k=u<.45?2:u<.8?1:u<.93?3:5;    // rocky: boulders, pebbles, crystals, wrecks
    else k=u<.5?0:u<.75?1:u<.9?2:3;
    if(dry>.62&&k===0)k=1;
    out.push({k,x,y,s:.7+R()*.7,sd:(R()*4e9)>>>0,hi});}
  for(let i=0;i<900&&pools.length<10;i++){const x=R()*WW,y=R()*WH,tx=x/TILE|0,ty=y/TILE|0;if(!ok(x,y)||H[ty*MW+tx]>0)continue;
    let near=0;for(const p of pools)if(Math.hypot(p.x-x,p.y-y)<420)near=1;if(near)continue;
    let free=1;for(let dy=-2;dy<=2&&free;dy++)for(let dx=-2;dx<=2;dx++){const j=(ty+dy)*MW+tx+dx;if(j<0||j>=NN||TT[j]!==0||ex[j]){free=0;break;}}
    if(free)pools.push({x,y,rx:44+R()*40,ry:26+R()*20,a:R()*.8-.4,lava:nA(tx*.05,ty*.05)>.55});}
  T.scn=out;T.pools=pools;
}
function sceneryDraw(g,T){
  for(const p of T.pools)poolBase(g,p);
  const hi=[];
  for(const o of T.scn){const R=mulberry32(o.sd),{x,y,s}=o;g.save();g.translate(x,y);
    switch(o.k){
    case 0:{const c=o.hi?'#7f9a6a':'#8a9c4e';g.lineCap='round';for(let i=0,n=4+(R()*5|0);i<n;i++){const a=-1.57+(R()-.5)*1.7,L=(5+R()*7)*s,bx=(R()-.5)*7;
        g.strokeStyle=i&1?c:'#5d7436';g.lineWidth=1.3;g.beginPath();g.moveTo(bx,0);g.quadraticCurveTo(bx+Math.cos(a)*L*.5,Math.sin(a)*L*.7,bx+Math.cos(a)*L+(R()-.5)*3,Math.sin(a)*L);g.stroke();}
      g.fillStyle='rgba(0,0,0,.18)';g.beginPath();g.ellipse(2,1,6*s,2.2*s,0,0,TAU);g.fill();break;}
    case 1:for(let i=0,n=2+(R()*4|0);i<n;i++){const px=(R()-.5)*16,py=(R()-.5)*10,r=(1.4+R()*2.6)*s;
        g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(px+1.4,py+1.3,r*1.1,r*.8,0,0,TAU);g.fill();
        g.fillStyle=R()<.5?'#8d8378':'#a49a8c';g.beginPath();g.ellipse(px,py,r,r*.8,R()*3,0,TAU);g.fill();g.fillStyle='rgba(255,255,255,.28)';g.beginPath();g.ellipse(px-r*.3,py-r*.3,r*.5,r*.3,0,0,TAU);g.fill();}break;
    case 2:{const n=1+(R()*2.4|0);for(let j=0;j<n;j++){const ox=j?(R()-.5)*22:0,oy=j?(R()-.5)*12:0,r=(7+R()*7)*s*(j?.6:1),m=6+(R()*3|0),p=[];
        for(let i=0;i<m;i++){const a=i/m*TAU+R()*.5;p.push([Math.cos(a)*r*(.75+R()*.35),Math.sin(a)*r*.8*(.75+R()*.35)-r*.2]);}
        g.fillStyle='rgba(0,0,0,.34)';g.beginPath();g.ellipse(ox+r*.45,oy+r*.35,r*1.15,r*.7,.25,0,TAU);g.fill();
        rockShape(g,ox,oy,r,p,o.hi);}break;}
    case 3:{const n=3+(R()*3|0);g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.ellipse(3,3,12*s,5*s,0,0,TAU);g.fill();const cc=R()<.5?[120,255,214]:[190,150,255];
      for(let i=0;i<n;i++){const px=(i-n/2)*4.5+(R()-.5)*3,h=(8+R()*12)*s,w=(2.6+R()*2)*s,lean=(R()-.5)*.5;
        const q=g.createLinearGradient(px-w,0,px+w,0);q.addColorStop(0,'rgb('+cc.map(v=>v*.45|0)+')');q.addColorStop(.45,'rgb('+cc+')');q.addColorStop(1,'rgb('+cc.map(v=>v*.3|0)+')');
        g.fillStyle=q;g.beginPath();g.moveTo(px-w,0);g.lineTo(px-w*.7+lean*h,-h*.78);g.lineTo(px+lean*h*1.1,-h);g.lineTo(px+w*.7+lean*h,-h*.78);g.lineTo(px+w,0);g.closePath();g.fill();
        g.fillStyle='rgba(255,255,255,.5)';g.beginPath();g.moveTo(px-w*.6,-h*.1);g.lineTo(px-w*.5+lean*h,-h*.76);g.lineTo(px+lean*h*1.1,-h);g.lineTo(px-w*.1,-h*.2);g.closePath();g.fill();}
      hi.push([x,y-6*s,cc,s]);break;}
    case 4:{g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.ellipse(9,2,16*s,4*s,0,0,TAU);g.fill();g.strokeStyle='#3a3029';g.lineCap='round';
      const br=(x0,y0,a,L,w,d)=>{const x1=x0+Math.cos(a)*L,y1=y0+Math.sin(a)*L;g.lineWidth=w;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
        if(d>0){br(x1,y1,a-.5-R()*.4,L*.68,w*.7,d-1);br(x1,y1,a+.5+R()*.4,L*.62,w*.7,d-1);}};
      br(0,0,-1.57+(R()-.5)*.3,13*s,3*s,3);g.strokeStyle='rgba(255,230,200,.18)';g.lineWidth=1;g.beginPath();g.moveTo(-1,0);g.lineTo(-1,-12*s);g.stroke();break;}
    default:{g.rotate(R()*TAU);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-9*s+3,-6*s+3,18*s,12*s);
      g.fillStyle='#5b6676';g.fillRect(-9*s,-6*s,18*s,12*s);g.fillStyle='#7a8798';g.fillRect(-9*s,-6*s,18*s,2.5);g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;g.strokeRect(-9*s,-6*s,18*s,12*s);
      g.fillStyle='#3a2f2a';g.beginPath();g.moveTo(2,-6*s);g.lineTo(9*s,-1);g.lineTo(4,6*s);g.lineTo(-2,2);g.closePath();g.fill();
      g.strokeStyle='rgba(255,140,60,.5)';g.lineWidth=1;g.beginPath();g.moveTo(2,-5*s);g.lineTo(-1,2);g.stroke();
      g.fillStyle='rgba(10,8,8,.25)';g.beginPath();g.ellipse(0,0,16*s,11*s,0,0,TAU);g.fill();}}
    g.restore();}
  g.globalCompositeOperation='lighter';for(const[x,y,cc,s]of hi){g.globalAlpha=.55;g.drawImage(glowSprite(cc.join(',')),x-26*s,y-26*s,52*s,52*s);}g.globalAlpha=1;g.globalCompositeOperation='source-over';
}
function rockShape(g,ox,oy,r,p,high){
  g.save();g.translate(ox,oy);
  const q=g.createLinearGradient(-r,-r,r,r*.8),b=high?['#b8c4d6','#6c7b92','#2c3447']:['#c0b6a8','#7d7266','#2f2a2c'];
  q.addColorStop(0,b[0]);q.addColorStop(.45,b[1]);q.addColorStop(1,b[2]);
  g.beginPath();g.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)g.lineTo(p[i][0],p[i][1]);g.closePath();g.fillStyle=q;g.fill();g.strokeStyle='rgba(8,8,16,.55)';g.lineWidth=1;g.stroke();
  g.strokeStyle='rgba(255,255,255,.3)';g.lineWidth=1.2;g.beginPath();g.moveTo(p[p.length-1][0],p[p.length-1][1]);g.lineTo(p[0][0],p[0][1]);g.lineTo(p[1][0],p[1][1]);g.stroke();
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.beginPath();g.moveTo(p[1][0]*.3,p[1][1]*.3);g.lineTo(p[3][0]*.6,p[3][1]*.6);g.stroke();
  g.restore();
}
function poolBase(g,p){
  g.save();g.translate(p.x,p.y);g.rotate(p.a);
  const lava=p.lava,blob=(k)=>{g.beginPath();for(let i=0;i<=24;i++){const a=i/24*TAU,w=1+.12*Math.sin(a*3+p.x)+.08*Math.sin(a*5+p.y);const X=Math.cos(a)*p.rx*k*w,Y=Math.sin(a)*p.ry*k*w;i?g.lineTo(X,Y):g.moveTo(X,Y);}g.closePath();};
  blob(1.14);g.fillStyle='rgba(8,8,16,.5)';g.fill();                       // wet rim / crevice AO
  blob(1.04);g.fillStyle=lava?'#ff9d3a':'#8fe8ff';g.fill();                // bright shoreline
  blob(.96);const q=g.createRadialGradient(-p.rx*.2,-p.ry*.2,2,0,0,p.rx);
  if(lava){q.addColorStop(0,'#ffcf5a');q.addColorStop(.5,'#e8531c');q.addColorStop(1,'#611208');}else{q.addColorStop(0,'#2d9fbc');q.addColorStop(.55,'#164f78');q.addColorStop(1,'#0a2342');}
  g.fillStyle=q;g.fill();g.restore();
}
/* live pass: moving specular glints on the pools (and a glow at night); a handful of strokes per visible pool */
function drawPools(t){
  const T=G.tInfo;if(!T||!T.pools)return;
  for(const p of T.pools){if(!onScreen(p.x,p.y,110))continue;
    if(!ui.demo&&G.vis[0][clamp(p.y/TILE|0,0,MH-1)*MW+clamp(p.x/TILE|0,0,MW-1)]===0)continue;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    const ph=SET.rm?0:t;
    for(let i=0;i<7;i++){const a=i*2.4+p.x,u=(Math.sin(ph*.7+i*1.7)+1)/2,X=Math.cos(a)*p.rx*.6*(.3+.7*((i*.37)%1)),Y=Math.sin(a)*p.ry*.6*(.3+.7*((i*.61)%1)),L=5+6*u;
      ctx.strokeStyle=(p.lava?'rgba(255,200,90,':'rgba(210,250,255,')+(.12+.5*u*u)+')';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(X-L,Y);ctx.lineTo(X+L,Y+(i&1?1:-1));ctx.stroke();}
    if(p.lava||G.daylight<.6){ctx.globalAlpha=(p.lava?.35:.18)*(1-G.daylight*.5)*(.8+.2*Math.sin(ph*2+p.x));const gl=glowSprite(p.lava?'255,130,40':'70,200,255');ctx.drawImage(gl,-p.rx*1.7,-p.ry*2.4,p.rx*3.4,p.ry*4.8);}
    ctx.restore();}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
}
