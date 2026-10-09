/* =========================================================================
   AI v3 (legacy) — personality-driven wave opponent. Drives campaign missions and is the league anchor;
   skirmish uses the T2 opponent (41_ai_*.js, 42_ai_agent.js). makeAI / aiThink dispatch in 42_ai_agent.js.
   ========================================================================= */
function makeAIV3(team,P){
  const T=G.teams[team];T.mult=P.mult;
  const style=FACTIONS[T.faction].style;
  const ai={team,P:Object.assign({},P),style,next:3,wave:0,attacking:false,group:new Set(),initN:0,stage:null,stageHub:0,saving:false,saveSince:0,
    creep:null,lastCreepEnd:0,callArms:false,eraAt:[0,0,280,560]};
  const diffKey=P===DIFF.easy?'easy':P===DIFF.hard?'hard':'normal';
  const era={easy:[0,0,430,900],normal:[0,0,290,580],hard:[0,0,210,430]}[diffKey];ai.eraAt=era.slice();
  if(style==='rush'){ai.P.first*=0.9;ai.P.base*=0.92;ai.eraAt[2]+=70;ai.eraAt[3]+=90;}
  if(style==='turtle'){ai.P.first*=1.15;ai.P.base*=1.1;}
  if(style==='trader'){ai.eraAt[2]-=30;}
  return ai;
}
function nearestEnemyBuilding(x,y,team){
  let best=null,bd=1e12;
  for(const b of G.buildings){if(b.dead||b.team===team)continue;const d=(b.x-x)*(b.x-x)+(b.y-y)*(b.y-y);if(d<bd){bd=d;best=b;}}
  return best;
}
function spotOK(team,type,tx,ty,d,reserved,cx,cy){
  if(!canPlace(team,type,tx,ty,true))return false;
  for(let y=ty-1;y<=ty+d.h;y++)for(let x=tx-1;x<=tx+d.w;x++)if(!freeT(x,y))return false;
  for(const r of G.res){if(r.dead)continue;if(hyp(r.x-cx,r.y-cy)-(d.w*TILE/2)-(r.w*TILE/2)<2.7*TILE)return false;}
  for(const q of reserved){if(tx-1<q.tx+q.w&&tx+d.w+1>q.tx&&ty-1<q.ty+q.h&&ty+d.h+1>q.ty)return false;}
  return true;
}
function pendingRects(workers){
  const out=[];for(const w of workers){if(w.order.t==='build'&&!w.order.bld){const d=BDEF[w.order.type];out.push({tx:w.order.tx,ty:w.order.ty,w:d.w,h:d.h});}}return out;}
function findSpot(ai,type,B,workers){
  const d=BDEF[type],hubs=B.filter(b=>b.type==='hub'&&b.done);if(!hubs.length)hubs.push(B[0]);
  const anchor=hubs[(Math.random()*hubs.length)|0],res=pendingRects(workers);
  const ax=anchor.x/TILE|0,ay=anchor.y/TILE|0,dx0=WW/2-anchor.x,dy0=WH/2-anchor.y,l=hyp(dx0,dy0)||1,ux=dx0/l,uy=dy0/l;
  let best=null,bs=1e9;const cands=[];
  for(let dy=-15;dy<=15;dy++)for(let dx=-15;dx<=15;dx++){
    const tx=ax+dx-(d.w>>1),ty=ay+dy-(d.h>>1),cx=(tx+d.w/2)*TILE,cy=(ty+d.h/2)*TILE;
    if(!spotOK(ai.team,type,tx,ty,d,res,cx,cy))continue;
    let s=hyp(dx,dy)+Math.random()*3;if(type==='turret')s-=(dx*ux+dy*uy)*0.9;
    if(hyp(dx,dy)<5)s+=8;
    if(ai.pathCheck)cands.push({s,tx,ty,cx,cy});
    if(s<bs){bs=s;best={tx,ty};}}
  // the swarm's Overseer also checks the walk: a spot just across a cliff costs the builder a 15-second detour
  if(ai.pathCheck&&cands.length>1){
    cands.sort((a,b)=>a.s-b.s);
    for(let i=0;i<Math.min(14,cands.length);i++){const c=cands[i],st=hyp(c.cx-anchor.x,c.cy-anchor.y),L=pathLength(anchor.x,anchor.y,c.cx,c.cy)*TILE;
      if(L<=st*1.5+140){best={tx:c.tx,ty:c.ty};break;}}}
  return best;
}
function findExpansion(ai,B,workers){
  const team=ai.team,res=pendingRects(workers),hubs=G.buildings.filter(b=>!b.dead&&b.type==='hub');
  const own=B.find(b=>b.type==='hub')||B[0],enemyHub=G.buildings.find(b=>!b.dead&&b.type==='hub'&&b.team!==team);
  let best=null,bd=1e12;
  for(const s of G.sites){
    if(s.main)continue;
    if(hubs.some(h=>hyp(h.x-s.cx*TILE,h.y-s.cy*TILE)<12*TILE))continue;
    if(enemyHub&&hyp(enemyHub.x-s.cx*TILE,enemyHub.y-s.cy*TILE)<hyp(own.x-s.cx*TILE,own.y-s.cy*TILE)*0.9)continue;
    if(!canPlace(team,'hub',s.tx,s.ty,true))continue;
    if(!G.res.some(r=>!r.dead&&r.type==='crystal'&&hyp(r.x-s.cx*TILE,r.y-s.cy*TILE)<9*TILE))continue;
    if(res.some(q=>Math.abs(q.tx-s.tx)<6&&Math.abs(q.ty-s.ty)<6))continue;
    const d=hyp(own.x-s.cx*TILE,own.y-s.cy*TILE);if(d<bd){bd=d;best={tx:s.tx,ty:s.ty};}}
  return best;
}
function freeGeyser(B,workers){
  const hubs=B.filter(b=>b.type==='hub'&&b.done);let best=null,bd=1e9;
  for(const r of G.res){if(r.dead||r.type!=='geyser'||r.siphon)continue;
    if(workers.some(w=>w.order.t==='build'&&w.order.type==='siphon'&&w.order.tx===r.tx&&w.order.ty===r.ty))continue;
    for(const h of hubs){const d=hyp(h.x-r.x,h.y-r.y);if(d<bd&&d<520){bd=d;best=r;}}}
  return best;
}
function aiBuild(ai,type,B,workers){
  const d=BDEF[type];let spot=null;
  if(type==='siphon'){const g=freeGeyser(B,workers);if(g)spot={tx:g.tx,ty:g.ty};}
  else if(type==='hub')spot=findExpansion(ai,B,workers);
  else spot=findSpot(ai,type,B,workers);
  if(!spot)return false;
  const cx=(spot.tx+d.w/2)*TILE,cy=(spot.ty+d.h/2)*TILE;let w=null,bd=1e9;
  for(const u of workers){if(u.order.t==='build'||u.order.t==='repair'||u.garr)continue;
    const dd=hyp(u.x-cx,u.y-cy)+(u.carry>0?150:0)+(u.order.t==='gather'&&u.order.st==='work'?60:0)-(u.ag&&u.ag.auto&&u.ag.role==='build'?140:0);if(dd<bd){bd=dd;w=u;}}
  if(!w)return false;return orderBuild(w,type,spot.tx,spot.ty);
}
function aiHeroCast(ai,h){
  const team=ai.team,H=G.teams[team].hero;if(h.stunned>0)return;
  const en=[];forNear(h.x,h.y,520,e=>{if(e.team!==team&&!e.dead&&!e.hidden&&seen(team,e))en.push(e);});
  const bld=[];for(const b of G.buildings)if(!b.dead&&b.team!==team&&hyp(b.x-h.x,b.y-h.y)<540&&seen(team,b))bld.push(b);
  const cluster=(list,rad)=>{let best=null,bn=0;for(const c of list){let n=0;for(const e of list)if(hyp(e.x-c.x,e.y-c.y)<=rad)n++;if(n>bn){bn=n;best=c;}}return{c:best,n:bn};};
  for(let i=2;i>=1;i--){
    if(!canCast(h,i))continue;const s=skillOf(h,i);
    if(s.target==='point'){
      const pool=en.length?en:bld,cl=cluster(pool,s.radius*0.8);
      const need=i===2?(en.length?4:3):2;
      if(cl.c&&cl.n>=need&&hyp(cl.c.x-h.x,cl.c.y-h.y)<=s.range){castSkill(h,i,cl.c.x,cl.c.y);return;}}
    else{ // self-centred
      let allies=0;forNear(h.x,h.y,s.radius,a=>{if(a.team===team&&!a.dead&&!a.def.worker)allies++;});
      if(allies>=5&&en.length>=3){castSkill(h,i,h.x,h.y);return;}}}
}
function aiThinkV3(ai){
  const team=ai.team,T=G.teams[team],P=ai.P,time=G.time,style=ai.style;
  const B=[],U=[],enemyU=[];
  for(const b of G.buildings)if(!b.dead&&b.team===team)B.push(b);
  for(const u of G.units)if(!u.dead){if(u.team===team)U.push(u);else if(u.team<2)enemyU.push(u);}
  if(!B.length)return;
  const hubs=B.filter(b=>b.type==='hub'&&b.done),workers=U.filter(u=>u.def.worker),army=U.filter(u=>!u.def.worker&&!u.def.trade);
  const pend=t=>workers.filter(w=>w.order.t==='build'&&!w.order.bld&&w.order.type===t).length;
  const cnt=t=>B.filter(b=>b.type===t).length+pend(t);
  const doneN=t=>B.filter(b=>b.type===t&&b.done).length;
  const anchor=hubs[0]||B[0];
  if(!ai.stage||ai.stageHub!==anchor.id){
    const dx=WW/2-anchor.x,dy=WH/2-anchor.y,l=hyp(dx,dy)||1;
    const f=nearestFree(clamp((anchor.x+dx/l*340)/TILE|0,3,MW-4),clamp((anchor.y+dy/l*340)/TILE|0,3,MH-4),10);
    ai.stage=f?{x:(f[0]+.5)*TILE,y:(f[1]+.5)*TILE}:{x:anchor.x,y:anchor.y};ai.stageHub=anchor.id;}
  // ---- threat assessment
  let threat=null,threatN=0;
  for(const u of enemyU){let near=false;for(const b of B)if(hyp(u.x-b.x,u.y-b.y)<400){near=true;break;}if(near){threatN+=u.def.supply;if(!threat)threat=u;}}
  // ---- workers
  for(const w of workers){if(w.order.t==='idle'&&!w.garr){
    const hub=nearestDrop(w)||anchor,r=nearestRes(hub.x,hub.y,'crystal',true,900)||nearestRes(hub.x,hub.y,'crystal');
    if(r)setOrder(w,{t:'gather',res:r,st:w.carry>0?'ret':'go',hx:r.x,hy:r.y});}}
  for(const s of B){
    if(s.type!=='siphon'||!s.done||!s.res)continue;
    const onW=workers.filter(w=>w.order.t==='gather'&&w.order.res===s.res);const on=onW.length;
    // hysteresis: ether piles up in the early eras (few sinks), so pull haulers back onto crystals
    if(T.e>(T.era>=2?1100:700)&&on>0){
      for(const w of onW){if(w.carry!==0)continue;
        const hub=nearestDrop(w)||anchor,r=nearestRes(hub.x,hub.y,'crystal',true,900)||nearestRes(hub.x,hub.y,'crystal');
        if(r)setOrder(w,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});}
    }
    else if(on<3&&T.e<(T.era>=2?900:450)){
      const cands=workers.filter(w=>w.order.t==='gather'&&w.order.res&&w.order.res.type==='crystal'&&w.carry===0&&w.order.st==='go')
        .sort((a,b)=>hyp(a.x-s.x,a.y-s.y)-hyp(b.x-s.x,b.y-s.y));
      for(let i=0;i<3-on&&i<cands.length;i++)setOrder(cands[i],{t:'gather',res:s.res,st:'go',hx:s.res.x,hy:s.res.y});}}
  if(hubs.length>1&&(G.tick%5===0)){
    const per=hubs.map(h=>({h,n:workers.filter(w=>w.order.t==='gather'&&w.order.res&&w.order.res.type==='crystal'&&nearestDrop(w)===h).length}));
    per.sort((a,b)=>b.n-a.n);const hi=per[0],lo=per[per.length-1];
    if(hi.n>17&&lo.n<12){const r=nearestRes(lo.h.x,lo.h.y,'crystal',true,600);
      if(r){const cs=workers.filter(w=>w.order.t==='gather'&&w.order.res&&w.order.res.type==='crystal'&&nearestDrop(w)===hi.h&&w.carry===0).slice(0,3);
        for(const w of cs)setOrder(w,{t:'gather',res:r,st:'go',hx:r.x,hy:r.y});}}}
  let wq=workers.length+B.reduce((n,b)=>n+b.queue.filter(q=>q.id==='hauler').length,0);
  const des=Math.min(hubs.length*13+doneN('siphon')*3,T.used>=75?30:38);
  for(const h of hubs){if(h.queue.length<1&&wq<des&&queueUnit(h,'hauler'))wq++;}
  // ---- tax policy (Caesar II style): keep morale healthy but harvest when safe
  if(T.morale<36&&T.tax>0)T.tax--;else if(T.morale>74&&T.tax<2)T.tax++;
  // ---- era advancement
  const hub0=hubs.find(h=>h.queue.length===0)||hubs[0];
  let eraSave=false;
  // advance unless a real attack is under way; once 60 s overdue, go regardless (a constant trickle of harassers must not stall the tech tree)
  if(hub0&&T.era<3&&time>=ai.eraAt[T.era+1]&&(!threat||threatN<=5||time>=ai.eraAt[T.era+1]+60)){
    const E=ERAS[T.era+1];const gate=(T.era===1?doneN('garrison')>0:doneN('armory')>0)&&!B.some(x=>x.queue.some(q=>q.k==='era'));
    if(gate){if(afford(T,E.cost)){queueEra(hub0);}else eraSave=true;}}
  // ---- hero
  if(P.hero&&hub0&&!T.hero.alive&&!T.hero.reviving&&(doneN('garrison')>0||T.hero.deaths>0)&&T.c>=heroCost(team).c+60)queueHero(hub0);
  const hero=heroUnit(team);
  if(hero){
    while(skillPoints(team)>0){let ok=false;for(const i of[2,1,0])if(learnSkill(team,i)){ok=true;break;}if(!ok)break;}
    aiHeroCast(ai,hero);}
  // ---- buildings
  ai.saving=eraSave;
  if(workers.filter(w=>w.order.t==='build'&&!w.order.bld).length<2){
    const prodN=B.filter(b=>prodList(b).length&&b.type!=='hub').length;
    const genPend=B.filter(b=>b.type==='generator'&&!b.done).length+pend('generator');
    const hubWant=1+P.hubs.filter(t=>time>t).length;
    const bankX=T.c>1800?3:T.c>1000?2:T.c>550?1:0;  // a fat treasury means production capacity, not a bigger bank
    const gwant=Math.min((style==='rush'?6:5)+bankX,1+hubs.length*2+(style==='rush'?1:0)+bankX);
    const tmax=style==='turtle'?hubs.length*3:(style==='rush'?0:hubs.length*(style==='trader'?2:1));
    if(T.cap-T.used<=3+prodN*2&&T.cap<MAXSUP&&genPend<(T.cap>60?2:1)){
      if(T.c>=100){aiBuild(ai,'generator',B,workers);}else ai.saving=true;
    }else{
      const seq=[
        ['garrison',doneN('hub')>0&&cnt('garrison')<1&&workers.length>=9],
        ['siphon',cnt('garrison')>=1&&cnt('siphon')<1],
        ['hub',cnt('hub')<hubWant&&workers.length>=12&&cnt('garrison')>=1],
        ['armory',doneN('garrison')>0&&cnt('armory')<1&&cnt('siphon')>=1],
        ['garrison',cnt('armory')>=1&&cnt('garrison')<gwant],
        ['siphon',cnt('armory')>=1&&cnt('siphon')<Math.min(4,2*hubs.length)],
        ['exchange',style==='trader'&&T.era>=2&&cnt('exchange')<1],
        ['depot',T.era>=1&&cnt('armory')>=1&&cnt('depot')<1&&time>260],
        ['habitat',style!=='rush'&&cnt('armory')>=1&&cnt('habitat')<(style==='trader'?6:3)&&time>300],
        ['forum',T.era>=2&&doneN('hub')>0&&cnt('forum')<(style==='turtle'?2:1)],
        ['foundry',T.era>=2&&doneN('armory')>0&&cnt('foundry')<Math.min(2,hubs.length)],
        ['airfield',P.air&&T.era>=2&&doneN('armory')>0&&cnt('airfield')<(time>650?2:1)&&time>320],
        ['exchange',(style==='trader'||time>480)&&T.era>=2&&cnt('exchange')<1],
        ['turret',doneN('garrison')>0&&cnt('turret')<tmax&&time>200]];
      for(const[type,cond]of seq){
        if(!cond)continue;const d=BDEF[type];
        if(d.era>T.era)continue;
        if(d.req&&!doneN(d.req))continue;
        if(!afford(T,bCost(team,type))){ai.saving=true;break;}
        if(aiBuild(ai,type,B,workers))break;}}}
  // ---- research
  for(const b of B){
    if(!b.done||b.queue.length)continue;
    if(b.type==='armory'){const order=Math.random()<0.5?['weapons','armor','stims']:['armor','weapons','stims'];
      for(const id of order)if(T.c>=250&&techNext(T,id)&&queueResearch(b,id))break;}
    else if(b.type==='depot'){for(const id of['mining','compress','cargo'])if(T.c>=220&&techNext(T,id)&&queueResearch(b,id))break;}}
  // ---- trade first: queue Freighters (and reserve the money for them) before soldiers can drain the treasury
  {const exT=B.find(b=>b.type==='exchange'&&b.done);
   if(exT){const frN=U.filter(u=>u.def.trade).length+exT.queue.filter(q=>q.id==='freighter').length,wantF=style==='trader'?5:2;
     if(frN<wantF&&exT.queue.length<2&&!threat){if(afford(T,uCost(team,'freighter')))queueUnit(exT,'freighter');else ai.saving=true;}}}
  // ---- unit production
  if(ai.saving){if(!ai.saveSince)ai.saveSince=time;}else ai.saveSince=0;
  if(!ai.saving||time-ai.saveSince>25){
    if(ai.saving)ai.saveSince=time;
    const E={light:0,armored:0,air:0};
    for(const u of enemyU){if(u.def.worker)continue;if(u.flying)E.air++;else if(u.def.tags.armored)E.armored++;else E.light++;}
    const smart=P.smart,menders=army.filter(u=>u.type==='mender').length,armySup=army.reduce((n,u)=>n+u.def.supply,0);
    for(const b of B){
      const list=prodList(b);
      if(!b.done||b.type==='hub'||b.type==='exchange'||!list.length||b.queue.length>=2)continue;
      const W={rifleman:3,raptor:1.4,rocketeer:2.4,mender:armySup>20&&menders<armySup/9?1.8:0.1,howitzer:1.1,juggernaut:2,skiff:1.7,titan:1.6,bulwark:2.2,reaver:2.2,specter:1.6};
      if(Math.random()<smart){
        if(E.armored>E.light){W.rocketeer*=2;W.skiff*=1.3;}else if(E.light>E.armored){W.raptor*=1.7;W.juggernaut*=1.5;W.howitzer*=1.3;W.reaver*=1.3;}
        if(E.air>3){W.rifleman*=2;W.rocketeer*=1.5;}}
      const opts=[];
      for(const id of list){if(!W[id])continue;const r=reqUnit(team,id);if(r.ok)opts.push([id,W[id]]);}
      if(!opts.length)continue;
      let tot=0;for(const o of opts)tot+=o[1];let x=Math.random()*tot,pick=opts[0][0];
      for(const o of opts){x-=o[1];if(x<=0){pick=o[0];break;}}
      queueUnit(b,pick);
      if(!b.rally||hyp(b.rally.x-ai.stage.x,b.rally.y-ai.stage.y)>5)b.rally={x:ai.stage.x+(Math.random()-.5)*110,y:ai.stage.y+(Math.random()-.5)*110};}}
  // ---- trade: freighters + market
  const ex=B.find(b=>b.type==='exchange'&&b.done);
  if(ex){
    const fr=U.filter(u=>u.def.trade),frQ=ex.queue.filter(q=>q.id==='freighter').length;
    const want=style==='trader'?5:2;
    if(fr.length+frQ<want&&ex.queue.length<2&&T.c>350)queueUnit(ex,'freighter');
    const posts=G.neutrals.filter(n=>n.type==='post');
    for(const f of fr){if(f.order.t!=='idle')continue;
      let best=null,bs=-1;for(const p of posts){const on=fr.filter(x=>x.order.t==='trade'&&x.order.post===p).length;if(on>=3)continue;
        const s=hyp(p.x-ex.x,p.y-ex.y)*p.demand/(1+on);if(s>bs){bs=s;best=p;}}
      if(best)setOrder(f,{t:'trade',post:best,st:'toPost'});}
    if(T.c>1800&&T.e<150)mktTrade(team,'buyE');else if(T.e>1400&&T.c<250)mktTrade(team,'sellE');
    else if(T.c>2600&&G.mkt.p>1.25)mktTrade(team,'buyE');}
  // ---- garrison (Call to Arms) when raided
  for(const h of hubs){
    if(threat&&threatN>=6&&army.length<threatN*0.8&&h.garr.length===0&&hyp(threat.x-h.x,threat.y-h.y)<520)callToArms(team,h);
    else if(h.garr.length&&(!threat||hyp(threat.x-h.x,threat.y-h.y)>760))callToArms(team,h);}
  // ---- repair
  if(!threat&&T.c>200&&G.tick%3===0){
    const dmg=B.find(b=>b.done&&b.hp<b.maxhp*0.7);
    if(dmg&&!workers.some(w=>w.order.t==='repair')){
      const cand=workers.filter(w=>w.order.t==='gather'&&w.carry===0&&w.order.st==='go').sort((a,b)=>hyp(a.x-dmg.x,a.y-dmg.y)-hyp(b.x-dmg.x,b.y-dmg.y)).slice(0,2);
      for(const w of cand)setOrder(w,{t:'repair',target:dmg});}}
  // ---- siege management
  for(const u of army){
    if(u.type!=='howitzer')continue;
    let near=null,nd=1e9;
    for(const e of enemyU){if(e.flying)continue;const d=hyp(e.x-u.x,e.y-u.y);if(d<nd&&seen(team,e)){nd=d;near=e;}}
    for(const b of G.buildings){if(b.dead||b.team===team)continue;const d=rectDist(u.x,u.y,b);if(d<nd&&seen(team,b)){nd=d;near=b;}}
    if(!u.sieged&&near&&nd>195&&nd<=335&&u.siegeT<=0&&(u.order.t==='idle'||!u.target))toggleSiege(u);
    else if(u.sieged&&(!near||nd>380)&&u.siegeT<=0)toggleSiege(u,true);}
  // ---- army control
  const free=u=>!u.sieged&&u.siegeT<=0&&!u.garr;
  if(threat){
    for(const u of army){if(!free(u))continue;if(hyp(u.x-threat.x,u.y-threat.y)>1100)continue;
      if(u.order.t==='attackmove'&&hyp(u.order.x-threat.x,u.order.y-threat.y)<160)continue;
      setOrder(u,{t:'attackmove',x:threat.x,y:threat.y,gs:0});}
    ai.creep=null;}
  const sup=army.reduce((n,u)=>n+u.def.supply,0);
  // creeping with hero (Warcraft III)
  if(P.creep&&!ai.attacking&&!threat&&hero&&time>120){
    if(!ai.creep&&time-ai.lastCreepEnd>40&&hero.hp>hero.maxhp*0.8){
      const H=G.teams[team].hero;let best=null,bd=1e9;
      for(const c of G.camps){const alive=c.units.some(id=>{const z=G.units.find(q=>q.id===id);return z&&!z.dead;});if(!alive)continue;
        const need=c.lvl===1?1:(c.lvl===2?3:5),armyNeed=c.lvl===1?3:(c.lvl===2?8:16);
        if(H.level<need||sup<armyNeed)continue;
        const d=hyp(c.x-anchor.x,c.y-anchor.y);if(d<bd&&d<1500){bd=d;best=c;}}
      if(best){ai.creep={camp:best,until:time+90,ids:new Set()};
        const crew=army.filter(u=>free(u)&&u.type!=='howitzer'&&u.type!=='titan').slice(0,10);crew.push(hero);
        for(const u of crew){ai.creep.ids.add(u.id);setOrder(u,{t:'attackmove',x:best.x,y:best.y,gs:0});}}}
    else if(ai.creep){
      const c=ai.creep.camp,alive=c.units.some(id=>{const z=G.units.find(q=>q.id===id);return z&&!z.dead;});
      if(!alive||time>ai.creep.until||hero.hp<hero.maxhp*0.35){
        for(const id of ai.creep.ids){const u=G.units.find(q=>q.id===id);if(u&&!u.dead)setOrder(u,{t:'move',x:ai.stage.x+(Math.random()-.5)*120,y:ai.stage.y+(Math.random()-.5)*120,gs:0});}
        ai.creep=null;ai.lastCreepEnd=time;}}}
  if(!ai.attacking){
    if(!threat&&!ai.creep&&time>P.first&&sup>=P.base+ai.wave*P.step){
      const tg=ai.wave<1?nearestEnemyBuilding(WW/2,WH/2,team):nearestEnemyBuilding(ai.stage.x,ai.stage.y,team);
      if(tg){ai.attacking=true;ai.wave++;ai.group=new Set(army.filter(free).map(u=>u.id));ai.initN=ai.group.size;
        let slow=1e9;for(const u of army)if(ai.group.has(u.id)&&u.def.speed<slow)slow=u.def.speed;
        for(const u of army)if(ai.group.has(u.id))setOrder(u,{t:'attackmove',x:tg.x,y:tg.y,gs:slow<1e9?slow*1.12:0});}
    }else if(!threat&&!ai.creep){
      for(const u of army)if(free(u)&&u.order.t==='idle'&&hyp(u.x-ai.stage.x,u.y-ai.stage.y)>260)
        setOrder(u,{t:'attackmove',x:ai.stage.x+(Math.random()-.5)*140,y:ai.stage.y+(Math.random()-.5)*140,gs:0});}
  }else{
    const alive=army.filter(u=>ai.group.has(u.id));
    if(!alive.length||alive.length<ai.initN*0.35){ai.attacking=false;for(const u of alive)if(free(u))setOrder(u,{t:'move',x:ai.stage.x,y:ai.stage.y,gs:0});}
    else for(const u of alive)if(free(u)&&u.order.t==='idle'){const tg=nearestEnemyBuilding(u.x,u.y,team);if(tg)setOrder(u,{t:'attackmove',x:tg.x,y:tg.y,gs:0});}}
}
