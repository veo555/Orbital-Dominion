/* =========================================================================
   MAP GENERATION — point-symmetric 1v1 map with 3 height levels, ramps,
   cliffs, rocks, resource fields, watchtowers, trading posts, creep camps
   TT: 0 floor, 1 rock, 2 cliff, 3 void
   ========================================================================= */
const SITE_DEFS=[ // half-map (player 0 side); mirrored for player 1
  {x:13,y:74,h:2,ang:2.36,n:8,amt:1500,main:true},
  {x:30,y:72,h:1,ang:1.45,n:8,amt:1500},
  {x:14,y:50,h:0,ang:3.14,n:8,amt:1500},
  {x:40,y:52,h:0,ang:1.57,n:6,amt:2200}];
const RAMP_DEFS=[ // x0,y0,x1,y1,axis,a,b,hA,hB  (tile coords)
  [19,73,26,76,'x',20,25,2,1],   // main -> natural
  [36,67,42,70,'x',36,41,1,0],   // natural -> east lowland
  [28,60,31,65,'y',65,60,1,0]];  // natural -> north lowland
const CORRIDORS=[ // polylines, half-map, carved through rocks on the low ground
  [[44,69],[47,64],[44,56],[40,52],[43,44]],
  [[44,69],[62,72]],
  [[62,72],[73,52]],
  [[29,58],[22,52],[14,50]],
  [[22,52],[40,52]],
  [[14,50],[14,36],[30,38],[43,44]],
  [[47,64],[62,72]]];
const NEUTRAL_DEFS={towers:[[30,38]],posts:[[62,71],[72,51]],camps:[[22,43,1],[47,58,2],[58,66,2]],centerCamp:[43.5,43.5,3]};

function genMap(){
  const seed=G.seed,noise=makeNoise(mulberry32(seed+7)),rnd=mulberry32(seed^0x51ed);
  const H=new Float32Array(NN),TT=new Uint8Array(NN),RAMP=new Uint8Array(NN);
  const disk=(cx,cy,r,fn)=>{const x0=Math.max(0,Math.floor(cx-r)),x1=Math.min(MW-1,Math.ceil(cx+r)),y0=Math.max(0,Math.floor(cy-r)),y1=Math.min(MH-1,Math.ceil(cy+r));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(hyp(x+.5-cx,y+.5-cy)<=r)fn(y*MW+x,x,y);};
  const both=(cx,cy,r,fn)=>{disk(cx,cy,r,fn);disk(MW-cx,MH-cy,r,fn);};
  for(const[cx,cy,r,h]of[[30,72,9,1],[13,74,9.5,2]])both(cx,cy,r,i=>{if(H[i]<h)H[i]=h;});
  const rockTh=0.60+rnd()*0.02;
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x,j=(MH-1-y)*MW+(MW-1-x);if(i>j)continue;
    const r=(H[i]===0&&noise(x*0.085,y*0.085)>rockTh)?1:0;TT[i]=r;TT[j]=r;}
  const clear=(cx,cy,r)=>both(cx,cy,r,i=>{if(TT[i]===1)TT[i]=0;});
  const carve=(pts,w)=>{for(let k=0;k<pts.length-1;k++){const[ax,ay]=pts[k],[bx,by]=pts[k+1],n=Math.ceil(hyp(bx-ax,by-ay)*1.5);
    for(let s=0;s<=n;s++)clear(lerp(ax,bx,s/n),lerp(ay,by,s/n),w);}};
  for(const c of CORRIDORS)carve(c,2.2);
  for(const s of SITE_DEFS)if(s.h===0)clear(s.x,s.y,9);
  for(const[x,y]of NEUTRAL_DEFS.towers)clear(x+1,y+1,3.4);
  for(const[x,y]of NEUTRAL_DEFS.posts)clear(x+1,y+1,3.6);
  for(const[x,y]of NEUTRAL_DEFS.camps)clear(x,y,4.2);
  { const[x,y]=NEUTRAL_DEFS.centerCamp;clear(x,y,6.5); }
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(x<2||y<2||x>=MW-2||y>=MH-2){TT[y*MW+x]=3;H[y*MW+x]=0;}
  // cliffs: tiles on the high side of a height step
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x;if(H[i]<1||TT[i]===3)continue;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;if(H[ny*MW+nx]<=H[i]-1){TT[i]=2;break;}}}
  // ramps
  const ramp=(x0,y0,x1,y1,axis,a,b,hA,hB)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*MW+x,pos=axis==='x'?x:y,t=clamp((pos-a)/(b-a),0,1);
    H[i]=lerp(hA,hB,t);TT[i]=0;RAMP[i]=1;}};
  for(const[x0,y0,x1,y1,ax,a,b,hA,hB]of RAMP_DEFS){
    ramp(x0,y0,x1,y1,ax,a,b,hA,hB);
    ramp(MW-1-x1,MH-1-y1,MW-1-x0,MH-1-y0,ax,ax==='x'?MW-1-a:MH-1-a,ax==='x'?MW-1-b:MH-1-b,hA,hB);}
  // vision height
  const vh=new Float32Array(NN);
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x;
    if(TT[i]===1)vh[i]=0;
    else if(TT[i]===2){let m=H[i];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;if(TT[ny*MW+nx]!==3)m=Math.min(m,H[ny*MW+nx]);}vh[i]=m;}
    else vh[i]=H[i];}
  G.H=H;G.TT=TT;G.RAMP=RAMP;G.vh=vh;
  G.terrain=TT; // legacy alias: nonzero = blocked
  G.sites=[];
  const mkSite=(d,mirror)=>{const cx=mirror?MW-d.x:d.x,cy=mirror?MH-d.y:d.y;
    return{id:G.sites.length,cx,cy,tx:cx-2,ty:cy-2,h:d.h,main:!!d.main,ang:d.ang+(mirror?Math.PI:0),n:d.n,amt:d.amt,owner:-1};};
  G.sites.push(mkSite(SITE_DEFS[0],false));G.sites.push(mkSite(SITE_DEFS[0],true));
  G.sites[0].owner=0;G.sites[1].owner=1;
  for(let k=1;k<SITE_DEFS.length;k++){G.sites.push(mkSite(SITE_DEFS[k],false));G.sites.push(mkSite(SITE_DEFS[k],true));}
  // resources
  const used=new Set();
  const okTile=(x,y,h)=>x>=2&&y>=2&&x<MW-2&&y<MH-2&&TT[y*MW+x]===0&&!RAMP[y*MW+x]&&H[y*MW+x]===h&&!used.has(x+','+y);
  const addCrystal=(x,y,h,amt)=>{if(!okTile(x,y,h))return;used.add(x+','+y);
    G.res.push({id:G.nextId++,kind:'res',type:'crystal',tx:x,ty:y,w:1,h:1,x:(x+.5)*TILE,y:(y+.5)*TILE,amount:amt,max:amt,users:[],cap:2,siphon:null,seed:rnd()*100,dead:false,hp:1});};
  const addGeyser=(x,y,h)=>{for(let a=0;a<2;a++)for(let b=0;b<2;b++)if(!okTile(x+a,y+b,h))return;
    for(let a=0;a<2;a++)for(let b=0;b<2;b++)used.add((x+a)+','+(y+b));
    G.res.push({id:G.nextId++,kind:'res',type:'geyser',tx:x,ty:y,w:2,h:2,x:(x+1)*TILE,y:(y+1)*TILE,amount:2500,max:2500,users:[],cap:3,siphon:null,seed:rnd()*100,dead:false,hp:1});};
  for(const d of SITE_DEFS){
    const rich=G.mapFx&&d===SITE_DEFS[3],dn=rich?4:d.n,amt=rich?2600:d.amt;   // map features (31_defense.js): the outer lowland field is a rich one, 4 patches of 2600 (+40 % per trip)
    for(let i=0;i<dn;i++){const a=d.ang+(i-(dn-1)/2)*0.37,rad=5.5+((i&1)?0.8:-0.1);
      const x=Math.round(d.x+Math.cos(a)*rad-0.5),y=Math.round(d.y+Math.sin(a)*rad-0.5);
      const n0=G.res.length;addCrystal(x,y,d.h,amt);addCrystal(MW-1-x,MH-1-y,d.h,amt);if(rich)for(let k=n0;k<G.res.length;k++)G.res[k].rich=true;}
    for(const k of[-1,1]){const a=d.ang+k*1.75,rad=6.4;
      const x=Math.round(d.x+Math.cos(a)*rad-1),y=Math.round(d.y+Math.sin(a)*rad-1);
      addGeyser(x,y,d.h);addGeyser(MW-2-x,MH-2-y,d.h);}}
  // neutral structures
  G.neutrals=[];
  const addNeutral=(type,tx,ty)=>{G.neutrals.push({id:G.nextId++,kind:'neutral',type,tx,ty,w:2,h:2,x:(tx+1)*TILE,y:(ty+1)*TILE,r:32,team:-1,hp:1,maxhp:1,demand:1,ctrl:-1,pulse:0,dead:false});};
  for(const[x,y]of NEUTRAL_DEFS.towers){addNeutral('tower',x,y);addNeutral('tower',MW-2-x,MH-2-y);}
  for(const[x,y]of NEUTRAL_DEFS.posts){addNeutral('post',x,y);addNeutral('post',MW-2-x,MH-2-y);}
  // creep camps
  G.camps=[];
  const addCamp=(cx,cy,lvl)=>{const camp={id:G.camps.length,x:cx*TILE,y:cy*TILE,lvl,units:[]};G.camps.push(camp);
    const list=CAMP_TYPES[lvl];
    list.forEach((t,i)=>{const a=i/list.length*TAU+0.4,rr=i===0?0:34+rnd()*14;
      const u=addUnit(t,2,camp.x+Math.cos(a)*rr,camp.y+Math.sin(a)*rr);u.camp=camp.id;u.home={x:u.x,y:u.y};camp.units.push(u.id);});};
  for(const[x,y,l]of NEUTRAL_DEFS.camps){addCamp(x,y,l);addCamp(MW-x,MH-y,l);}
  { const[x,y,l]=NEUTRAL_DEFS.centerCamp;addCamp(x,y,l); }
  if(G.mapFx)fortMapFeatures(rnd);   // neutral rock formations (31_defense.js); never on campaign maps
}
/* reachability check — every key location must be connected to both start bases */
function mapConnected(){
  const T=G.TT,seen=new Uint8Array(NN),q=[],s=G.sites[0],start=(s.cy)*MW+s.cx;
  q.push(start);seen[start]=1;
  while(q.length){const c=q.pop(),cx=c%MW,cy=(c/MW)|0;
    for(let k=0;k<8;k++){const dx=[1,-1,0,0,1,1,-1,-1][k],dy=[0,0,1,-1,1,-1,1,-1][k],nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;
      const ni=ny*MW+nx;if(seen[ni]||T[ni]!==0)continue;
      if(k>=4&&(T[cy*MW+nx]!==0||T[ny*MW+cx]!==0))continue;seen[ni]=1;q.push(ni);}}
  const reach=(x,y)=>{for(let r=0;r<4;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=Math.round(x)+dx,ny=Math.round(y)+dy;if(nx>=0&&ny>=0&&nx<MW&&ny<MH&&seen[ny*MW+nx])return true;}return false;};
  for(const st of G.sites)if(!reach(st.cx,st.cy))return false;
  for(const n of G.neutrals)if(!reach(n.tx+1,n.ty+1))return false;
  for(const c of G.camps)if(!reach(c.x/TILE,c.y/TILE))return false;
  return true;
}
