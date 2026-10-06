/* =========================================================================
   OVERSEER (v3) — the collective layer.
   1. Blackboard: a shared, cheap-to-read picture of the colony (stigmergy):
      threats, alarms, build tickets, scouting grid, hunting party, assault.
   2. Domains: supply / eco / alloc / army / tech / trade / labor.  Each is
      off | advise | act.  In 'advise' the Overseer only proposes (and you can
      approve); in 'act' it executes the very same closures itself.
   3. Allocation by price signal: workers are shifted between crystals and
      ether until demand/supply scarcity is equalised (with hysteresis).
   4. A rule-based command parser ("keep 14 miners", "guard the natural
      with 4 riflemen", "hire 3 miners by the hour").
   ========================================================================= */
function ovInit(){
  const S=G.sw;
  S.ov={t:0,t3:0,saveUntil:0,saveStart:0,wave:0,eraAt:[0,0,300,600],lastAct:'',eco:{eth:0,hold:0},inc:{c:0,e:0,lc:0,le:0,t:0},demand:{c:0,e:0},scarcity:1,shadow:{c:1,e:1}};
}
/* ------------------------------ blackboard ----------------------------- */
function bbCells(S){
  const bb=S.bb;if(bb.cells)return bb.cells;
  const cs=[],n=Math.ceil(MW/8),eh=G.buildings.find(b=>b.team===1&&b.type==='hub'),mh=G.buildings.find(b=>b.team===0&&b.type==='hub');
  for(let gy=0;gy<n;gy++)for(let gx=0;gx<n;gx++){
    const f=nearestFree(gx*8+4,gy*8+4,4);if(!f)continue;
    const x=(f[0]+.5)*TILE,y=(f[1]+.5)*TILE,i=f[1]*MW+f[0];
    const nearEnemy=eh?hyp(eh.x-x,eh.y-y)<hyp(mh.x-x,mh.y-y):false;
    cs.push({gx,gy,x,y,i,seen:-90,reach:!G.refComp[0]||G.comp[i]===G.refComp[0],w:nearEnemy?1.5:1,base:eh?hyp(eh.x-x,eh.y-y)<520:false});}
  bb.cells=cs;return cs;
}
function lanchCamp(c){const us=[];for(const id of c.units){const z=byId(id);if(z&&!z.dead)us.push(z);}return{us,p:lanch(us)};}
function bbUpdate(){
  const S=G.sw,bb=S.bb;if(G.tick%15!==0)return;
  const T=G.teams[0];
  // build tickets: drop finished / stale ones, free the claim of a builder that gave up
  bb.tickets=bb.tickets.filter(k=>!k.dead&&G.time-k.t<240&&!G.buildings.some(b=>!b.dead&&b.team===0&&b.tx===k.tx&&b.ty===k.ty&&b.type===k.type));
  for(const k of bb.tickets)if(k.by){const w=byId(k.by);if(!w||w.dead||w.order.t!=='build')k.by=0;}
  // alarm: the most recently hit friendly thing
  let al=null;
  for(const b of G.buildings)if(!b.dead&&b.team===0&&G.time-(b.lastHit||-99)<6&&(!al||b.lastHit>al.t))al={x:b.x,y:b.y,t:b.lastHit};
  for(const u of G.units)if(!u.dead&&u.team===0&&G.time-u.lastHit<6&&(!al||u.lastHit>al.t))al={x:u.x,y:u.y,t:u.lastHit};
  bb.alarm=al;
  // threat near our structures (same definition the v2 AI uses)
  let thr=null,thrN=0;
  for(const u of G.units){if(u.dead||u.team!==1||u.hidden)continue;let near=false;
    for(const b of G.buildings){if(b.dead||b.team!==0)continue;if(hyp(u.x-b.x,u.y-b.y)<400){near=true;break;}}
    if(near&&seen(0,u)){thrN+=u.def.supply;if(!thr)thr=u;}}
  bb.threat=thr;bb.threatN=thrN;
  // income (EMA of mined resources per second)
  const I=S.ov.inc;I.t+=0.5;
  if(I.t>=3){const dc=(T.minedC-I.lc)/I.t,de=(T.minedE-I.le)/I.t;I.c=I.c?I.c*0.6+dc*0.4:dc;I.e=I.e?I.e*0.6+de*0.4:de;I.lc=T.minedC;I.le=T.minedE;I.t=0;}
  // census
  let workers=0,army=0,armySup=0,fr=0,enrolled=0;
  for(const u of G.units){if(u.dead||u.team!==0)continue;
    if(u.ag&&u.ag.auto)enrolled++;
    if(u.def.worker)workers++;else if(u.def.trade)fr++;else if(!u.def.noWeapon&&!u.def.hero){army++;armySup+=u.def.supply;}}
  bb.summary={workers,army,armySup,freighters:fr,enrolled,free:S.agents.filter(u=>u.ag.free).length};
  // crystals left near our drop-offs
  let cl=0,cn=0;const drops=G.buildings.filter(b=>!b.dead&&b.done&&b.team===0&&b.def.dropoff);
  for(const r of G.res){if(r.dead||r.type!=='crystal'||r.amount<=0)continue;for(const d of drops){if(hyp(d.x-r.x,d.y-r.y)<650){cl+=r.amount;cn++;break;}}}
  bb.crystalLeft=cl;bb.crystalN=cn;
  // scouting grid
  const cells=bbCells(S),vis=G.vis[0];
  for(const c of cells)if(vis[c.i]===2)c.seen=G.time;
  for(const cp of G.camps)cp._alive=campAlive(cp);
  bbIntel(S);bbDefense(S);bbHunt(S);bbAssault(S);
}
function bbHunt(S){
  const bb=S.bb,hs=S.agents.filter(u=>u.ag.auto&&u.ag.role==='hunt'&&!u.dead&&!u.hidden&&!u.ag.st&&!u.ag.cid);
  if(!hs.length){bb.hunt=null;return;}
  let cx=0,cy=0;for(const u of hs){cx+=u.x;cy+=u.y;}cx/=hs.length;cy/=hs.length;
  const hub=nearestOwn(0,'hub',cx,cy);const stage=hub?stagePt(hub):{x:cx,y:cy};
  const h=bb.hunt||{go:false,camp:null,ids:new Set(),stage,note:''};h.stage=stage;
  if(bb.threat&&bb.threatN>=3){h.go=false;h.ids=new Set();h.note='Home is threatened — holding';bb.hunt=h;return;}
  // a party may only leave if the rest of the army at home still matches what the enemy is believed to field
  let homeSup=0;for(const u of S.agents)if(u.ag.auto&&u.def.dmg&&!u.def.worker&&!u.def.trade&&!u.dead&&!h.ids.has(u.id)&&u.ag.role!=='scout'&&!u.ag.cid&&!(u.ag.role==='hunt'&&!h.go))homeSup+=u.def.supply;
  const need=0.9*(S.ov.eEst||0);
  if(h.go&&homeSup<need*0.7){h.go=false;h.camp=null;h.ids=new Set();h.note='Home needs the party — recalled';bb.hunt=h;return;}
  if(h.go&&h.camp){
    const mem=hs.filter(u=>h.ids.has(u.id)),L=lanchCamp(h.camp);
    if(!L.us.length){h.go=false;h.camp=null;h.ids=new Set();h.note='Camp cleared';}
    else if(!mem.length||lanch(mem)<L.p*0.85){h.go=false;h.camp=null;h.ids=new Set();h.note='Pulling back to regroup';}
    else{let slow=1e9;for(const u of mem)if(u.def.speed<slow)slow=u.def.speed;h.slow=slow<1e9?slow*1.1:0;
      const hh=h.hero?byId(h.hero):null;
      if(hh&&!hh.dead&&S.dom.army==='act'){
        if(hh.hp<hh.maxhp*0.35){h.hero=0;agDo(()=>setOrder(hh,{t:'move',x:stage.x,y:stage.y}));}
        else if(!(hh.order.t==='attackmove'&&hyp(hh.order.x-h.camp.x,hh.order.y-h.camp.y)<60))agDo(()=>setOrder(hh,{t:'attackmove',x:h.camp.x,y:h.camp.y,gs:h.slow||0}));}}
  }
  if(!h.go){
    const asmAll=hs.filter(u=>hyp(u.x-stage.x,u.y-stage.y)<320&&u.hp>u.maxhp*0.7);
    // only the surplus above the home guard may leave
    const room=homeSup+asmSup(asmAll)-need;let ps=0;const asm=[];
    for(const u of asmAll.slice().sort((a,b)=>b.hp-a.hp)){if(ps+u.def.supply>room)continue;asm.push(u);ps+=u.def.supply;}
    const hero0=heroUnit(0),heroIn=hero0&&!hero0.hidden&&hero0.hp>hero0.maxhp*0.7&&hyp(hero0.x-stage.x,hero0.y-stage.y)<420&&S.dom.army==='act';
    const mine=lanch(heroIn?asm.concat([hero0]):asm);   // the hero goes along: it is the strongest unit and its level decides the first big fight
    let best=null,bv=0;
    for(const c of G.camps){if(!c._alive)continue;const L=lanchCamp(c);if(!L.us.length)continue;
      if(hyp(c.x-stage.x,c.y-stage.y)>1700)continue;
      if(campOnPath(stage,c))continue;   // an attack-move fights everything it meets: never route through another camp
      if(mine/Math.max(1,L.p)<3.6)continue;   // Lanchester: a 1.9 edge still costs ~30% of the party; 3.6 costs ~15%, which the bounty can repay
      const v=c.lvl*100/(1+hyp(c.x-stage.x,c.y-stage.y)/600);if(v>bv){bv=v;best=c;}}
    if(best){h.go=true;h.camp=best;h.ids=new Set(asm.map(u=>u.id));h.hero=heroIn?hero0.id:0;h.note='';let slow=1e9;for(const u of asm)if(u.def.speed<slow)slow=u.def.speed;h.slow=slow<1e9?slow*1.1:0;}
    else if(asmAll.length&&room<=0&&G.time>200)h.note='Holding at home — the enemy is believed to field more than the home guard';
    else if(!h.note||h.note==='Camp cleared'||h.note==='Pulling back to regroup'||/^Holding at home|^Home needs/.test(h.note))h.note=h.note==='Pulling back to regroup'?h.note:'Assembling the hunting party';
  }
  bb.hunt=h;
}
/* is another living creep camp within ~430 px of the straight line from a to camp c? (the marching party would be drawn into it) */
function asmSup(list){let n=0;for(const u of list)n+=u.def.supply;return n;}
function campOnPath(a,c){
  const dx=c.x-a.x,dy=c.y-a.y,l2=dx*dx+dy*dy||1;
  for(const o of G.camps){if(o===c||!o._alive)continue;
    let t=((o.x-a.x)*dx+(o.y-a.y)*dy)/l2;t=Math.max(0,Math.min(1,t));
    if(hyp(o.x-(a.x+dx*t),o.y-(a.y+dy*t))<430)return true;}
  return false;
}
function bbAssault(S){
  const bb=S.bb,as=S.agents.filter(u=>u.ag.auto&&u.ag.role==='assault'&&!u.dead&&!u.hidden&&!u.ag.cid);
  if(!as.length){bb.assault=null;return;}
  let cx=0,cy=0;for(const u of as){cx+=u.x;cy+=u.y;}cx/=as.length;cy/=as.length;
  const hub=nearestOwn(0,'hub',cx,cy);const stage=hub?stagePt(hub):{x:cx,y:cy};
  const A=bb.assault||{go:false,tgt:null,stage,t0:G.time,init:as.length,need:6+2*S.ov.wave,ids:new Set(),wave:S.ov.wave};
  A.stage=stage;
  const asm=as.filter(u=>hyp(u.x-stage.x,u.y-stage.y)<380);A.have=asm.length;
  if(!A.go){
    if(asm.length>=A.need||(G.time-A.t0>80&&asm.length>=Math.ceil(A.need*0.6))){
      A.go=true;A.ids=new Set(asm.map(u=>u.id));A.init=asm.length;A.tgt=nearestEnemyBuilding(stage.x,stage.y,0);A.goT=G.time;
      ovLog('army','Assault wave '+(A.wave+1)+' marches with '+asm.length+' units');if(SET.swarmHints)toast('Assault wave '+(A.wave+1)+' is on the march ('+asm.length+' units).','good');}
  }else{
    const mem=as.filter(u=>A.ids.has(u.id));
    for(const u of asm)if(!A.ids.has(u.id)&&G.time-A.goT>20&&asm.filter(x=>!A.ids.has(x.id)).length>=3){A.ids.add(u.id);}   // a fresh group of three or more reinforces
    if(!A.tgt||A.tgt.dead){A.tgt=nearestEnemyBuilding(cx,cy,0);}
    let slow=1e9;for(const u of mem)if(u.def.speed<slow)slow=u.def.speed;A.slow=slow<1e9?slow*1.12:0;
    if(mem.length<A.init*0.35){S.ov.assaultOver=G.time;ovDisband(S,'The assault force was broken — falling back');return;}
  }
  bb.assault=A;
}
/* ---------------------------- enemy intelligence ----------------------------
   The Overseer keeps a running estimate of the enemy's field army, the way a
   player tallies what they have seen: remembered sightings, +0.17 supply/s of
   unobserved production (after t=180), minus the supply we have killed, and a
   hard reset to the observed count whenever our scouts have eyes on the base. */
function bbIntel(S){
  const bb=S.bb,O=S.ov,T=G.teams[0],I=bb.intel||(bb.intel=new Map()),dt=0.5;
  for(const u of G.units){if(u.dead||u.team!==1||u.hidden||!u.def.dmg||u.def.worker||u.def.trade)continue;
    if(seen(0,u))I.set(u.id,{t:G.time,sup:u.def.supply,dps:dpsOf(u),hp:u.hp+u.def.armor*12});}
  let obs=0,fresh=0,dps=0,hp=0;
  for(const[id,e]of I){const z=byId(id);if(!z||z.dead||G.time-e.t>150){I.delete(id);continue;}obs+=e.sup;dps+=e.dps;hp+=e.hp;if(G.time-e.t<12)fresh+=e.sup;}
  const killed=T.rk-(O.rk0===undefined?T.rk:O.rk0);O.rk0=T.rk;
  let est=O.eEst||0;
  if(G.time>180)est+=0.17*dt;
  est=Math.max(0,est-0.85*killed);
  est=Math.min(est,88);
  est=Math.max(est,obs);
  // eyes on the enemy base: trust what we see
  let bs=-999;for(const c of bbCells(S))if(c.base&&c.seen>bs)bs=c.seen;
  bb.baseSeen=bs;
  if(G.time-bs<12)est=Math.min(est,fresh+8);
  O.eEst=est;bb.eObs=obs;bb.eLan=dps*hp;
}
/* ---------------------------- coordinated defence ----------------------------
   When armed raiders close on our structures, every free armed agent rallies at
   one point between the nearest Hub and the raiders, then they strike together.
   (Ten guards answering ten alarms one at a time feed the enemy a trickle.) */
function bbDefense(S){
  const bb=S.bb,old=bb.def;
  const en=[];let cx=0,cy=0,sup=0;
  for(const u of G.units){
    if(u.dead||u.team!==1||u.hidden||!u.def.dmg||u.def.worker||!seen(0,u))continue;
    let nd=1e9;for(const b of G.buildings){if(b.dead||b.team!==0)continue;const d=hyp(u.x-b.x,u.y-b.y);if(d<nd)nd=d;}
    if(nd<(old&&old.on?1000:760)){en.push(u);cx+=u.x;cy+=u.y;sup+=u.def.supply;}}
  if(sup<3){
    if(old&&old.on&&G.time-old.seen>8){old.on=false;ovLog('army','Raid repelled — the defenders return to their posts');}
    return;}
  cx/=en.length;cy/=en.length;
  const hub=nearestOwn(0,'hub',cx,cy);if(!hub)return;
  let D=old;
  if(!D||!D.on){D=bb.def={on:true,t0:G.time,seen:G.time,go:false,goT:0,ids:new Set(),n:0,have:0,ratio:0,hub:0,rally:null,enemy:{x:cx,y:cy},slow:0,eSup:sup};
    ovLog('army','Raiders at the gates ('+sup+' enemy supply) — rallying the defenders');
    if(SET.swarmHints&&sup>=8)toast('Raiders at the gates — the defenders are rallying.','bad');}
  // the fall-back rally point is fixed per Hub (a moving rally point is never reached)
  if(D.hub!==hub.id||!D.rally){
    const dx=cx-hub.x,dy=cy-hub.y,L=hyp(dx,dy)||1,k=Math.min(L*0.5,170)/L;
    let rx=hub.x+dx*k,ry=hub.y+dy*k;
    const f=nearestFree(clamp(rx/TILE|0,2,MW-3),clamp(ry/TILE|0,2,MH-3),6);if(f){rx=(f[0]+.5)*TILE;ry=(f[1]+.5)*TILE;}
    D.rally={x:rx,y:ry};D.hub=hub.id;}
  D.seen=G.time;D.enemy={x:cx,y:cy};D.eSup=sup;
  // who defends: free armed auto agents (not on a client job, not hand-directed)
  const ds=[];
  for(const u of S.agents){
    const g=u.ag;if(!g.auto||g.dm!=='auto'||g.cid||g.manual||u.dead||u.hidden||!u.def.dmg||u.def.worker||u.def.trade||u.def.noWeapon)continue;
    if(g.st==='flee'||g.st==='clinic'||g.role==='scout'||g.role==='medic')continue;
    if(S.pol.clinic&&u.hp<u.maxhp*0.3)continue;
    if(g.role==='assault'&&bb.assault&&bb.assault.go&&bb.assault.ids.has(u.id)&&sup<14)continue;   // an assault under way carries on unless the raid is serious
    ds.push(u);}
  D.ids=new Set(ds.map(u=>u.id));D.n=ds.length;
  const eL=lanch(en),loc=ds.filter(u=>hyp(u.x-cx,u.y-cy)<950);
  D.ratio=lanch(loc)/Math.max(1,eL);                       // strength of those who can reach the fight within ~10 s
  const near=ds.filter(u=>hyp(u.x-D.rally.x,u.y-D.rally.y)<300);D.have=near.length;
  let slow=1e9;for(const u of ds)if(!u.def.siege&&u.def.speed<slow)slow=u.def.speed;D.slow=slow<1e9?slow*1.1:0;
  // strike at once with a fair or better edge (a front line left alone is destroyed); otherwise fall back and mass under the turrets first
  let door=false;for(const e of en){for(const b of G.buildings){if(!b.dead&&b.team===0&&hyp(e.x-b.x,e.y-b.y)<260){door=true;break;}}if(door)break;}
  const assembled=D.n>0&&near.length>=D.n*0.65;
  if(!D.go){if(D.ratio>=0.9||assembled||door||G.time-D.t0>14){D.go=true;D.goT=G.time;}}
  else if(D.ratio<0.45&&!door&&G.time-D.goT>6){
    // fall back only before contact: running from a ranged fight just means being shot in the back
    let contact=false;for(const u of ds){for(const e of en){if(hyp(u.x-e.x,u.y-e.y)<320){contact=true;break;}}if(contact)break;}
    if(!contact){D.go=false;D.t0=G.time;}}
}
/* a defender's orders while the defence is on */
function runDefend(u,ag,S,D){
  const o=u.order;
  if(u.def.siege){
    let near=1e9;forNear(u.x,u.y,420,e=>{if(e.team!==u.team&&!e.dead&&!e.hidden&&!e.flying){const d=hyp(e.x-u.x,e.y-u.y);if(d<near)near=d;}});
    if(u.sieged){if(near>380&&u.siegeT<=0)toggleSiege(u,true);ag.why='Shelling the raiders';return true;}
    if(near>195&&near<=335&&u.siegeT<=0){toggleSiege(u);return true;}}
  if(D.go){agStim(u);if(agFocus(u,ag))return true;}
  const tp=D.go?D.enemy:D.rally;
  ag.why=D.go?'Defending the colony — striking together':'Rallying to defend ('+D.have+'/'+D.n+' assembled)';
  if(o.t==='attackmove'&&hyp(o.x-tp.x,o.y-tp.y)<(D.go?170:110))return true;
  const sp=D.go?tp:spreadPt(u,tp,110);
  agSet(u,{t:'attackmove',x:sp.x,y:sp.y,gs:D.go?D.slow:0});
  return true;
}
function ovDisband(S,why){
  S.bb.assault=null;
  for(const u of S.agents)if(u.ag.role==='assault'&&u.ag.dm==='auto'){u.ag.role='guard';u.ag.roleT=G.time;agSet(u,{t:'idle'});}
  ovLog('army',why);
}
function ovLog(dom,text){const S=G.sw;S.log.push({t:G.time,dom,text});if(S.log.length>80)S.log.shift();S.ov.lastAct=text;}

/* =========================================================================
   DOMAIN LOGIC.  Every rule decides *whether* and *what*, then hands a
   closure to ovAct(): in 'act' mode it runs at once, in 'advise' mode it
   becomes a proposal the player can approve with one click.
   ========================================================================= */
const DOMAINS=[
  {id:'supply',name:'Supply',d:'Generators, so production never stalls.'},
  {id:'eco',name:'Economy',d:'Haulers, siphons, expansions, habitats, taxes.'},
  {id:'alloc',name:'Allocation',d:'Moves agents between crystals, ether and construction by price signal.'},
  {id:'army',name:'Army',d:'Military buildings, unit production, defence, hunts, assaults, hero.'},
  {id:'tech',name:'Technology',d:'Eras and research.'},
  {id:'trade',name:'Trade',d:'Exchange, freighters and the market.'},
  {id:'labor',name:'Labour',d:'Hires freelancers and takes jobs from the board when the margin is good.'}];
function ovMode(dom){return G.sw.dom[dom];}
function ovSave(){const O=G.sw.ov;if(G.time>O.saveUntil||!O.saveUntil)O.saveStart=O.saveStart&&G.time-O.saveUntil<6?O.saveStart:G.time;O.saveUntil=G.time+4;}
function ovSaving(){const O=G.sw.ov;return O.saveUntil>G.time&&G.time-O.saveStart<25;}
function ovAct(dom,key,text,fn,extra){
  const S=G.sw,mode=S.dom[dom];if(mode==='off')return false;
  if(mode==='act'){
    const ok=fn();if(ok){ovLog(dom,text);S.ov.nAct=(S.ov.nAct||0)+1;}return ok;}
  let p=S.props.find(x=>x.key===key);
  if(p){p.fn=fn;p.text=text;p.seen=G.time;}
  else{p={id:S.propSeq++,dom,key,text,fn,seen:G.time,t:G.time,extra:extra||''};S.props.push(p);
    if(!S.toldProps&&SET.swarmHints&&G.time>30){S.toldProps=1;toast('The Overseer has a suggestion — press K to review it.','good');}}
  return false;
}
function ovPurge(){const S=G.sw;S.props=S.props.filter(p=>G.time-p.seen<3.2&&S.dom[p.dom]==='advise');if(S.props.length>14)S.props.length=14;}
function ovApprove(id){
  const S=G.sw,p=S.props.find(x=>x.id===id);if(!p)return false;
  const ok=p.fn();
  if(ok){ovLog(p.dom,p.text+' (approved)');S.props=S.props.filter(x=>x!==p);sfx('click');}
  else msg(0,'The Overseer cannot do that right now');
  uiDirty();return ok;
}
function ovDismiss(id){const S=G.sw;S.props=S.props.filter(x=>x.id!==id);uiDirty();}
function ovCtx(){
  const S=G.sw,T=G.teams[0],B=[],U=[],enemyU=[];
  for(const b of G.buildings)if(!b.dead&&b.team===0)B.push(b);
  for(const u of G.units)if(!u.dead){if(u.team===0)U.push(u);else if(u.team===1&&seen(0,u))enemyU.push(u);}
  if(!B.length)return null;
  const hubs=B.filter(b=>b.type==='hub'&&b.done),workers=U.filter(u=>u.def.worker),
    army=U.filter(u=>!u.def.worker&&!u.def.trade&&!u.def.noWeapon&&!u.def.hero);
  const pend=t=>workers.filter(w=>w.order.t==='build'&&!w.order.bld&&w.order.type===t).length+S.bb.tickets.filter(k=>k.type===t).length;
  return{S,O:S.ov,P:S.pol,bb:S.bb,T,time:G.time,B,U,enemyU,hubs,workers,army,pend,
    cnt:t=>B.filter(b=>b.type===t).length+pend(t),doneN:t=>B.filter(b=>b.type===t&&b.done).length,anchor:hubs[0]||B[0]};
}
/* a construction order: reuse the v2 AI's placement helpers, but prefer Builder-role agents as the worker */
function ovBuild(type){
  const c=ovCtx();if(!c)return false;
  const ws=c.workers.filter(w=>!(w.ag&&(w.ag.cid||w.ag.free&&w.ag.role==='gig')));
  return agDo(()=>aiBuild({team:0,pathCheck:true},type,c.B,ws));
}
function ovBuildCount(c,type){return c.cnt(type);}
/* ------------------------------- supply -------------------------------- */
function ovSupply(c){
  const{T,B}=c,prodN=B.filter(b=>prodList(b).length&&b.type!=='hub').length;
  const genPend=B.filter(b=>b.type==='generator'&&!b.done).length+c.pend('generator');
  if(T.cap-T.used<=3+prodN*2+(T.c>=300?3:0)&&T.cap<MAXSUP&&genPend<(prodN>=3&&T.cap-T.used<=2&&T.c>=260?2:T.cap>60?2:1)){
    if(T.c>=100)ovAct('supply','gen','Build a Generator (supply headroom '+(T.cap-T.used)+')',()=>ovBuild('generator'));
    else ovSave();}
}
/* --------------------------------- eco --------------------------------- */
function wantWorkers(c){return c.P.keepWorkers||Math.min(c.hubs.length*13+c.doneN('siphon')*3,c.T.used>=75?30:38);}
function ovEco(c){
  const{T,hubs,workers,P,O,time}=c;
  const own=workers.filter(w=>!(w.ag&&w.ag.free)).length,hq=hubs.reduce((n,h)=>n+h.queue.filter(q=>q.id==='hauler').length,0),want=wantWorkers(c);
  const h=hubs.find(x=>x.queue.length<1);
  if(h&&own+hq<want){
    if(reqUnit(0,'hauler').ok)ovAct('eco','hauler','Train a Hauler ('+(own+hq)+'/'+want+')',()=>queueUnit(h,'hauler'));}
  // tax policy (Caesar II): keep morale healthy, harvest when it is high
  const ntax=T.morale<36&&T.tax>0?T.tax-1:T.morale>74&&T.tax<2?T.tax+1:T.tax;
  if(ntax!==T.tax)ovAct('eco','tax','Set taxes to '+TAX[ntax].n+' (morale '+Math.round(T.morale)+'%)',()=>{setTax(0,ntax);return true;});
}
/* ------------------------------ tech / era ----------------------------- */
function ovTech(c){
  const{T,B,hubs,time,O,bb,P}=c;
  const hub0=hubs.find(h=>h.queue.length===0)||hubs[0];
  if(hub0&&T.era<3&&time>=O.eraAt[T.era+1]&&(!bb.threat||bb.threatN<=5||time>=O.eraAt[T.era+1]+60)){
    const E=ERAS[T.era+1],gate=(T.era===1?c.doneN('garrison')>0:c.doneN('armory')>0)&&!B.some(x=>x.queue.some(q=>q.k==='era'));
    if(gate){if(afford(T,E.cost))ovAct('tech','era','Advance to Era '+E.rom+' — '+E.name,()=>queueEra(hub0));else if(T.c<E.cost.c)ovSave();}}
  for(const b of B){
    if(!b.done||b.queue.length)continue;
    if(b.type==='armory'){
      // Plating first: armor is a flat cut per hit, and a Rifleman does only 7 — every point is -14% of the damage the enemy's mass infantry deals
      const order=T.era>=2&&!T.stims?['armor','stims','weapons']:['armor','weapons','stims'];
      for(const id of order){const nx=techNext(T,id);if(!nx||T.era<nx.era)continue;
        if(afford(T,nx)){ovAct('tech','r:'+id,'Research '+TECH[id].name,()=>queueResearch(b,id));break;}
        if(T.e>=nx.e&&time>90){ovSave();break;}}}
    else if(b.type==='depot'){for(const id of['mining','compress','cargo'])if(T.c>=220&&techNext(T,id)&&T.era>=techNext(T,id).era&&afford(T,techNext(T,id))){ovAct('tech','r:'+id,'Research '+TECH[id].name,()=>queueResearch(b,id));break;}}}
  // hero: train / revive, learn skills
  const hero=heroUnit(0),H=T.hero;
  if(hub0&&!H.alive&&!H.reviving&&(c.doneN('garrison')>0||H.deaths>0)&&T.c>=heroCost(0).c+60&&afford(T,heroCost(0))&&T.used+UDEF[FACTIONS[T.faction].hero].supply<=T.cap&&!B.some(x=>x.queue.some(q=>q.k==='hero')))
    ovAct('tech','hero',H.deaths>0?'Revive the hero':'Train the hero',()=>queueHero(hub0));
  if(hero&&skillPoints(0)>0)ovAct('tech','skill','Learn a hero skill',()=>{for(const i of[2,1,0])if(learnSkill(0,i))return true;return false;});
}
/* ---------------------------- stranded construction --------------------------
   A foundation nobody is building (its builder fled, died or was re-tasked) is
   finished by the nearest free worker — an unfinished Generator supply-blocks
   the whole colony, so it is rescued within 3 s and anything else within 8 s. */
function ovRescue(c){
  const{T,B,workers,time}=c;
  for(const b of B){
    if(b.done){b._idleSince=0;continue;}
    if(b.nb>0||workers.some(w=>w.order.t==='build'&&w.order.bld===b)){b._idleSince=0;continue;}
    if(!b._idleSince){b._idleSince=time;continue;}
    const urgent=b.type==='generator'&&T.cap-T.used<=4;
    if(time-b._idleSince<(urgent?3:8))continue;
    if(G.time-(b.lastHit||-99)<8)continue;
    let best=null,bs=1e9;
    for(const w of workers){
      if(w.dead||w.hidden||w.garr||w.carry>0&&!urgent)continue;
      const g=w.ag;if(g&&(g.cid||g.st==='flee'||g.st==='clinic'||g.free&&g.role==='gig'))continue;
      if(w.order.t==='build'||w.order.t==='repair'||w.order.t==='trade')continue;
      const d=hyp(w.x-b.x,w.y-b.y)+(g&&g.role==='build'?-250:0)+(w.order.t==='gather'&&w.order.st==='work'?80:0);
      if(d<bs&&d<1900){bs=d;best=w;}}
    if(!best)continue;
    const dom=b.type==='generator'?'supply':'eco';
    if(ovAct(dom,'rescue'+b.id,'Finish the abandoned '+b.def.name+' ('+Math.round(b.prog*100)+'% built)',()=>{
        if(best.dead||b.dead||b.done)return false;
        agSet(best,{t:'build',type:b.type,tx:b.tx,ty:b.ty,paid:false,st:'go',bld:b,after:null});return true;})){b._idleSince=time;return;}
  }
}
/* ------------------------------ reconnaissance -------------------------------
   Now and then a fast unit peeks at the enemy base from the side facing us, so the
   estimate of the enemy army rests on a sighting rather than on a guess.  (The map is a
   two-player layout: the enemy's start corner is known, as it is to a human.) */
function ovRecon(c){
  const{S,O,bb,time}=c;if(S.dom.army!=='act'||time<200)return;
  const sc=S.agents.find(u=>u.ag.recon&&!u.dead);
  if(sc){
    const a=sc.ag;
    if(G.time-a.reconT>55||(G.time-bb.baseSeen<3&&G.time-a.reconT>8)||sc.hp<sc.maxhp*0.4||bb.threat){
      a.recon=false;a.role=agDefaultRole(sc);a.roleT=G.time;agSet(sc,{t:'idle'});O.lastRecon=G.time;}
    return;}
  if(bb.threat||G.time-bb.baseSeen<40||G.time-(O.lastRecon||0)<45)return;
  const eh=G.buildings.find(b=>!b.dead&&b.team===1&&b.type==='hub');if(!eh)return;
  let best=null,bs=-1;
  for(const u of S.agents){const g=u.ag;
    if(!g.auto||g.dm!=='auto'||g.cid||g.free||u.dead||u.hidden||!u.def.dmg||u.def.worker||u.def.hero||u.hp<u.maxhp*0.7||!(u.def.speed>=120||u.flying))continue;
    if(g.role==='assault'||g.st)continue;
    if(u.def.speed>bs){bs=u.def.speed;best=u;}}
  if(!best)return;
  const dx=WW/2-eh.x,dy=WH/2-eh.y,l=hyp(dx,dy)||1;
  let tx=eh.x+dx/l*520,ty=eh.y+dy/l*520;
  if(!best.flying&&!canStand(tx,ty)){const f=nearestFree(clamp(tx/TILE|0,2,MW-3),clamp(ty/TILE|0,2,MH-3),8);if(f){tx=(f[0]+.5)*TILE;ty=(f[1]+.5)*TILE;}}
  ovAct('army','recon','Send '+agName(best)+' to look at the enemy base',()=>{
    const g=best.ag;g.recon=true;g.reconT=G.time;g.role='scout';g.roleT=G.time;g.why='Reconnaissance of the enemy base';g.sc=null;
    agSet(best,{t:'move',x:tx,y:ty});O.lastRecon=G.time;return true;});
}
/* ------------------------------ buildings + army ----------------------- */
function ovBuildings(c){
  const{T,B,hubs,workers,time,bb,P,O}=c,cnt=c.cnt,doneN=c.doneN;
  if(workers.filter(w=>w.order.t==='build'&&!w.order.bld).length>=2)return;
  if(time<12)return;
  const own=workers.filter(w=>!(w.ag&&w.ag.free)).length;
  const armyN=c.army.length,expand=!bb.threat&&hubs.length<3&&cnt('hub')<hubs.length+1&&cnt('hub')<3&&own>=12&&cnt('garrison')>=1&&(bb.crystalLeft<2600||own>=hubs.length*15)
    &&armyN>=(hubs.length<2?6:18)&&time>=(hubs.length<2?150:420);   // never expand into a vacuum: a Hub costs eight Riflemen and the first raid comes before t=400
  const bankX=T.c>1800?3:T.c>1000?2:T.c>550?1:0,gwant=Math.min(5+bankX,1+hubs.length*2+bankX);
  const wantSiph=doneN('armory')>0?Math.min(4,2*hubs.length):1;
  const seq=[
    ['garrison','army',doneN('hub')>0&&cnt('garrison')<1&&own>=7],
    ['siphon','eco',cnt('garrison')>=1&&cnt('siphon')<1],
    ['hub','eco',expand],
    ['armory','army',doneN('garrison')>0&&cnt('armory')<1&&cnt('siphon')>=1],
    ['garrison','army',cnt('armory')>=1&&cnt('garrison')<gwant],
    ['garrison','army',cnt('armory')<1&&doneN('garrison')>=1&&cnt('garrison')<2&&T.c>=400&&time>45],   // cash is floating while ether gates the Armory: more production
    ['siphon','eco',cnt('armory')>=1&&cnt('siphon')<wantSiph],
    ['exchange','trade',T.era>=2&&time>420&&cnt('exchange')<1&&P.trade!==false],
    ['depot','eco',cnt('armory')>=1&&cnt('depot')<1&&time>260],
    ['habitat','eco',cnt('armory')>=1&&cnt('habitat')<Math.min(6,1+2*T.era)&&time>300&&T.morale>=40],
    ['forum','eco',T.era>=2&&doneN('hub')>0&&cnt('forum')<(T.morale<50?2:1)],
    ['foundry','army',T.era>=2&&doneN('armory')>0&&cnt('foundry')<Math.min(2,hubs.length)],
    ['airfield','army',T.era>=2&&doneN('armory')>0&&cnt('airfield')<(time>650?2:1)&&time>320&&P.air!==false],
    ['turret','army',doneN('garrison')>0&&cnt('turret')<hubs.length*(P.turrets===undefined?1:P.turrets)&&time>200]];
  for(const[type,dom,cond]of seq){
    if(!cond)continue;const d=BDEF[type];
    if(d.era>T.era)continue;if(d.req&&!doneN(d.req))continue;
    if(S_off(dom))continue;
    const bc=bCost(0,type);
    if(!afford(T,bc)){if(T.c>=bc.c)continue;   // only ether is short: crystals saved up now would sit idle, so keep spending them elsewhere
      ovSave();break;}
    const label='Build '+(type==='hub'?'an expansion Hub':'a '+d.name);
    if(ovAct(dom,'b:'+type,label+' — '+bCost(0,type).c+'◆'+(bCost(0,type).e?' '+bCost(0,type).e+'e':''),()=>ovBuild(type)))break;
    if(G.sw.dom[dom]==='advise')break;}
}
function S_off(dom){return G.sw.dom[dom]==='off';}
const ARMY_W={rifleman:3,raptor:1.4,rocketeer:2.4,mender:0.1,howitzer:1.1,juggernaut:2,skiff:1.7,titan:1.6,bulwark:2.2,reaver:2.2,specter:1.6};
function ovProduction(c){
  const{T,B,army,enemyU,P,O,time}=c;
  if(S_off('army'))return;
  if(ovSaving())return;
  const E={light:0,armored:0,air:0};
  for(const u of enemyU){if(u.def.worker)continue;if(u.flying)E.air++;else if(u.def.tags.armored)E.armored++;else E.light++;}
  const menders=c.U.filter(u=>u.type==='mender').length+B.reduce((n,x)=>n+x.queue.filter(q=>q.id==='mender').length,0),armySup=army.reduce((n,u)=>n+u.def.supply,0);
  const reserve=c.bb.threat?0:(c.doneN('armory')<1&&time>200?140:60);
  for(const b of B){
    const list=prodList(b);
    if(!b.done||b.type==='hub'||b.type==='exchange'||!list.length||b.queue.length>=2)continue;
    const W=Object.assign({},ARMY_W);W.mender=armySup>20&&menders<armySup/9?1.8:0.1;
    if(E.armored>E.light){W.rocketeer*=2;W.skiff*=1.3;}else if(E.light>E.armored){W.raptor*=1.7;W.juggernaut*=1.5;W.howitzer*=1.3;W.reaver*=1.3;}
    if(E.air>3){W.rifleman*=2;W.rocketeer*=1.5;}
    if(P.keepUnits)for(const t in P.keepUnits){const have=c.U.filter(u=>u.type===t&&!(u.ag&&u.ag.free)).length+B.reduce((n,x)=>n+x.queue.filter(q=>q.id===t).length,0);
      if(have<P.keepUnits[t]&&W[t]!==undefined)W[t]*=12;else if(have>=P.keepUnits[t]&&W[t])W[t]*=0.35;}
    const opts=[];
    for(const id of list){if(!W[id])continue;const r=reqUnit(0,id);if(r.ok&&T.c-uCost(0,id).c>=reserve)opts.push([id,W[id]]);}
    if(!opts.length)continue;
    let tot=0;for(const o of opts)tot+=o[1];let x=Math.random()*tot,pick=opts[0][0];
    for(const o of opts){x-=o[1];if(x<=0){pick=o[0];break;}}
    ovAct('army','u:'+b.id,'Train a '+UDEF[pick].name+' at the '+b.def.name,()=>{
      const ok=queueUnit(b,pick);
      if(ok){const hub=nearestOwn(0,'hub',b.x,b.y);if(hub){const st=stagePt(hub);if(!b.rally||hyp(b.rally.x-st.x,b.rally.y-st.y)>5)b.rally={x:st.x+(Math.random()-.5)*110,y:st.y+(Math.random()-.5)*110};}}
      return ok;});
  }
}
function ovDefense(c){
  const{T,hubs,army,bb,P}=c,thr=bb.threat;
  for(const h of hubs){
    if(thr&&bb.threatN>=6&&army.length<bb.threatN*0.8&&h.garr.length===0&&hyp(thr.x-h.x,thr.y-h.y)<520&&!P.flee)ovAct('army','cta'+h.id,'Call to Arms: shelter the Haulers ('+bb.threatN+' enemy supply nearby)',()=>{callToArms(0,h);return true;});
    else if(h.garr.length&&(!thr||hyp(thr.x-h.x,thr.y-h.y)>760)&&!P.flee)ovAct('army','cta'+h.id,'Release the garrisoned Haulers',()=>{callToArms(0,h);return true;});}
  const hero=heroUnit(0);
  if(hero&&G.sw.dom.army==='act'){
    aiHeroCast({team:0},hero);
    // the hero fights with the army: strikes with the defence, otherwise waits at the stage point
    const D=bb.def,o=hero.order;
    if(D&&D.on&&D.go&&hero.hp>hero.maxhp*0.4&&!hero.hidden){
      if(!(o.t==='attackmove'&&hyp(o.x-D.enemy.x,o.y-D.enemy.y)<200))agDo(()=>setOrder(hero,{t:'attackmove',x:D.enemy.x,y:D.enemy.y,gs:0}));}
    else if(o.t==='idle'&&!hero.hidden&&!hero.garr&&hero.casting===undefined){
      const hub=nearestOwn(0,'hub',hero.x,hero.y);
      if(hub){const st=stagePt(hub);if(hyp(hero.x-st.x,hero.y-st.y)>280)agDo(()=>setOrder(hero,{t:'move',x:st.x+(Math.random()-.5)*90,y:st.y+(Math.random()-.5)*90}));}}}
}
/* hunting / assault enablement for auto-directed armed agents */
function ovWar(c){
  const{S,P,bb,O,time,army}=c;
  if(S.dom.army==='off')return;
  const autoArmed=S.agents.filter(u=>u.ag.auto&&u.ag.dm==='auto'&&!u.ag.cid&&!u.ag.free&&canRole(u,'guard')&&u.def.dmg);
  // assault wave: launch when the force is big enough and no emergency at home
  const armySup=autoArmed.reduce((n,u)=>n+u.def.supply,0);
  if(P.assault&&!bb.assault&&!bb.threat&&time>340){
    const need=Math.max(24,P.assaultMin*2.4)+O.wave*12;
    if(armySup>=need&&armySup>=2.2*(O.eEst||0)+8&&G.time>(O.assaultOver||0)+40){
      ovAct('army','assault','Launch assault wave '+(O.wave+1)+' with '+armySup+' supply',()=>{
        const sorted=autoArmed.slice().sort((a,b)=>dpsOf(b)*b.hp-dpsOf(a)*a.hp),keep=Math.max(2,Math.floor(sorted.length*0.2));
        sorted.forEach((u,i)=>{if(i>=sorted.length-keep){u.ag.role='guard';u.ag.keep=G.time+120;return;}if(u.ag.role!=='assault'){u.ag.role='assault';u.ag.roleT=time;agSet(u,{t:'idle'});}});
        O.wave++;bb.assault=null;return true;});}}
  if(bb.assault&&bb.assault.go&&bb.assault.tgt===null&&!G.buildings.some(b=>!b.dead&&b.team===1))ovDisband(S,'Enemy eliminated');
}
/* ------------------------------- trade --------------------------------- */
function ovTrade(c){
  const{T,B,U,P,bb,time}=c;
  if(S_off('trade'))return;
  const ex=B.find(b=>b.type==='exchange'&&b.done);
  if(ex){
    const fr=U.filter(u=>u.def.trade),frQ=ex.queue.filter(q=>q.id==='freighter').length,want=P.keepFreighters!==undefined?P.keepFreighters:(T.faction==='aurora'?4:2);
    if(fr.length+frQ<want&&ex.queue.length<2&&!bb.threat&&afford(T,uCost(0,'freighter'))&&reqUnit(0,'freighter').ok)ovAct('trade','fr','Train a Freighter ('+(fr.length+frQ)+'/'+want+')',()=>queueUnit(ex,'freighter'));
    for(const f of fr)if(!f.ag){ovAct('trade','en'+f.id,'Put '+agName(f)+' on a trade route',()=>{agEnroll(f,true);return true;});break;}
    if(T.c>1000&&T.e<160&&G.mkt.p<1.6)ovAct('trade','mkt','Buy 100 ether on the market (crystals idle, ether short)',()=>mktTrade(0,'buyE'));
    else if(T.e>1400&&T.c<250)ovAct('trade','mkt','Sell 100 ether on the market',()=>mktTrade(0,'sellE'));
    else if(T.c>2600&&G.mkt.p>1.25)ovAct('trade','mkt','Buy ether while it is cheap',()=>mktTrade(0,'buyE'));}
}
/* ------------------------------ allocation ----------------------------- */
function ovDemand(c){
  const{T,B,hubs,workers}=c;let dC=2.5,dE=0;
  const typ={garrison:[80,20,19],foundry:[200,140,36],airfield:[125,100,26]};
  for(const b of B){if(!b.done)continue;const t=typ[b.type];if(t){dC+=t[0]/t[2];dE+=t[1]/t[2];}}
  if(c.doneN('armory'))dC+=1.2,dE+=1.2;if(c.doneN('depot'))dC+=0.5,dE+=0.3;
  if(T.era<3){dC+=ERAS[T.era+1].cost.c/110;dE+=ERAS[T.era+1].cost.e/110;}
  return{dC,dE};
}
function ovAlloc(c){
  const{S,T,O,P,bb}=c;if(S.dom.alloc==='off')return;
  const auto=S.agents.filter(u=>u.ag.auto&&u.ag.dm==='auto'&&!u.ag.cid&&!u.ag.free&&!u.dead);
  // ---------- workers: equalise scarcity between crystals and ether
  const wk=auto.filter(u=>u.def.worker);
  if(wk.length){
    const{dC,dE}=ovDemand(c),I=O.inc,sCe=Math.max(0.05,I.c)+T.c/120,sEe=Math.max(0.05,I.e)+T.e/120;
    O.demand={c:dC,e:dE};O.scarcity=(dE/sEe)/(dC/sCe);O.shadow={c:dC/sCe,e:dE/sEe};
    const slots=G.buildings.filter(b=>!b.dead&&b.done&&b.team===0&&b.type==='siphon'&&b.res&&!b.res.dead).length*3;
    const cnt={};for(const r of ROLE_ORDER)cnt[r]=0;for(const u of wk)cnt[u.ag.role]=(cnt[u.ag.role]||0)+1;
    const q=P.quota||{};
    const nB=q.build!==undefined?q.build:(wk.length>=6?1:0)+(wk.length>=22?1:0);
    const nR=q.repair!==undefined?q.repair:0;
    let nE;
    if(q.ether!==undefined)nE=q.ether;
    else{
      const cur=cnt.ether;let tgt=cur*clamp(Math.sqrt(O.scarcity),0.7,1.4);
      if(cur===0&&O.scarcity>1.05&&slots>0)tgt=Math.min(slots,3);
      if(T.e<350&&cur<2&&slots>0&&wk.length>=8)tgt=Math.max(tgt,2);
      tgt=Math.round(tgt);
      // hysteresis: move one step at a time and only after the signal persisted for two passes
      if(tgt!==cur){O.eco.hold=(Math.sign(tgt-cur)===O.eco.dir)?O.eco.hold+1:1;O.eco.dir=Math.sign(tgt-cur);}else O.eco.hold=0;
      nE=O.eco.hold>=2?cur+Math.sign(tgt-cur):cur;}
    nE=clamp(nE,0,slots);
    const nM=Math.max(0,wk.length-nB-nR-nE);
    const want={mine:nM,ether:nE,build:nB,repair:nR},moves=[];
    for(const r in want){let d=want[r]-(cnt[r]||0);
      while(d>0){ // find an agent from a role in surplus
        let best=null,bs=1e9;
        for(const u of wk){const cr=u.ag.role;if(cr===r||!(cr in want))continue;if((cnt[cr]||0)<=want[cr])continue;
          if(G.time-u.ag.roleT<20||u.carry>0&&u.ag.role!=='build')continue;
          const tgt=r==='ether'?G.buildings.find(b=>b.type==='siphon'&&b.done&&!b.dead&&b.team===0):null;
          const dd=tgt?hyp(u.x-tgt.x,u.y-tgt.y):0;if(dd<bs){bs=dd;best=u;}}
        if(!best)break;moves.push([best,r]);cnt[best.ag.role]--;cnt[r]=(cnt[r]||0)+1;d--;if(moves.length>=2)break;}
      if(moves.length>=2)break;}
    if(moves.length){
      const txt='Shift '+moves.map(m=>'1 '+ROLES[m[0].ag.role].n.toLowerCase()+' → '+ROLES[m[1]].n.toLowerCase()).join(', ')+' (ether scarcity ×'+O.scarcity.toFixed(2)+')';
      ovAct('alloc','shift',txt,()=>{for(const[u,r]of moves){if(u.dead)continue;u.ag.role=r;u.ag.roleT=G.time;u.ag.sc=null;if(u.order.t==='gather'&&u.carry===0)agSet(u,{t:'idle'});}return true;});}
  }
  // ---------- army: auto agents without a post follow the default (guard / hunt)
  const armed=auto.filter(u=>!u.def.worker&&!u.def.trade&&!u.def.heal&&u.ag.role!=='assault'&&u.ag.role!=='scout');
  for(const u of armed){
    const want=(P.hunt&&u.def.dmg&&canRole(u,'hunt'))?'hunt':'guard';
    if(u.ag.keep>G.time)continue;
    if(u.ag.role!==want&&(u.ag.role==='guard'||u.ag.role==='hunt'||u.ag.role==='free')&&G.time-u.ag.roleT>5){
      if(S.dom.alloc==='act'||true){u.ag.role=want;u.ag.roleT=G.time;}}}
  for(const u of auto){if(u.def.heal&&u.ag.role!=='medic'&&canRole(u,'medic')){u.ag.role='medic';}if(u.def.trade&&u.ag.role!=='trade'){u.ag.role='trade';}}
  // ---------- a standing scout request
  if(P.scouts){
    const have=auto.filter(u=>u.ag.role==='scout').length;
    if(have<P.scouts){const cand=auto.filter(u=>u.ag.role!=='scout'&&!u.def.hero&&(u.def.speed>=120||u.flying)&&!u.def.worker&&!u.def.trade).sort((a,b)=>b.def.speed-a.def.speed)[0]||auto.filter(u=>u.def.worker&&u.carry===0)[0];
      if(cand)ovAct('alloc','scout','Send '+agName(cand)+' to scout',()=>{cand.ag.role='scout';cand.ag.roleT=G.time;agSet(cand,{t:'idle'});return true;});}}
}
/* ------------------------------- labour -------------------------------- */
function listingValue(l,H){ // expected revenue vs outlay for a worker listing
  const best=bestCadence(l.type,l.lvl,l.ask,H);
  const rev=0.42*(1+0.05*(l.lvl-1));   // crystals/s a hired hauler adds when there are free fields
  return{best,rev,margin:rev-best.perSec,ratio:rev/Math.max(0.01,best.perSec)};
}
function ovLabor(c){
  const{S,T,P,bb,time}=c,E=S.eco;if(S_off('labor'))return;
  const O=S.ov;
  // ---- hire a miner when fields have room and money is idle
  const free=nFreelancers(),cap=maxFree();
  if(free<cap&&time>60&&G.time>(O.lastHire||0)+25){
    const own=c.workers.length,slotsFree=bb.crystalN*2-c.workers.filter(w=>w.order.t==='gather').length;
    if(slotsFree>=3&&bb.crystalLeft>900&&T.c>260&&(T.used>=T.cap-1||own>=wantWorkers(c)||T.cap-T.used<=1)){
      let best=null,bv=-1e9;
      for(const l of E.free){if(l.type!=='hauler'||UDEF[l.type].era>T.era)continue;const v=listingValue(l,600);if(v.ratio>=1.6&&v.margin>bv&&v.best.total<=T.c*0.4){bv=v.margin;best=[l,v];}}
      if(best){const[l,v]=best,cadn=CADI[v.best.cad].name;
        ovAct('labor','hire'+l.id,'Hire '+l.name+' (Hauler, lvl '+l.lvl+') on a '+cadn.toLowerCase()+' contract — '+Math.round(v.best.period)+'◆ per '+CADI[v.best.cad].per,()=>{O.lastHire=G.time;return!!econHire(l.id,v.best.cad,{role:'mine'});},'margin +'+v.margin.toFixed(2)+'◆/s');}}
    // emergency mercenary
    if(bb.threat&&bb.threatN>=4&&T.c>300&&c.army.length<bb.threatN){
      let best=null,bv=1e9;for(const l of E.free){if(!['rifleman','raptor','rocketeer','juggernaut'].includes(l.type)||UDEF[l.type].era>T.era)continue;const p=periodPrice(l.type,l.lvl,'hour',wageNow(),l.ask);if(p<bv){bv=p;best=l;}}
      if(best&&bv<T.c*0.3)ovAct('labor','merc'+best.id,'Hire mercenary '+best.name+' ('+UDEF[best.type].name+') by the hour — raiders at the gates',()=>{O.lastHire=G.time;return!!econHire(best.id,'hour',{role:'guard'});});}}
  // ---- release: unprofitable or surplus contracts (spot cadences only)
  for(const ct of E.ctr){
    if(ct.kind!=='hire'||ct.state!=='active'||ct.cad==='task'||ct.notice)continue;
    const u=byId(ct.uid);if(!u||u.dead)continue;
    const age=G.time-ct.start,ag=u.ag;
    const poor=T.c<60&&(ct.cad==='min'||ct.cad==='hour');
    const idle=ag&&ag.role==='mine'&&ag.why==='No free resources in range'&&age>40;
    const roi=ag&&ag.cost>0?ag.earned/ag.cost:9;
    if(poor||idle||(age>PAY.hour*3&&roi<0.7&&ct.role!=='guard'&&ct.role!=='medic'&&ct.role!=='patrol'&&ct.role!=='escort'))
      ovAct('labor','fire'+ct.id,'Do not renew '+ct.name+(idle?' (no work left)':poor?' (treasury is empty)':' (return on wages '+roi.toFixed(2)+')'),()=>econFire(ct.id,false));}
  // ---- jobs
  if(G.tick%2===0)ovJobs(c);
}
function ovJobs(c){
  const{S,T,bb}=c,E=S.eco,O=S.ov;
  if(G.time<100||bb.threat)return;
  const idle=S.agents.filter(u=>u.ag.auto&&u.ag.dm==='auto'&&!u.ag.cid&&!u.dead&&!u.hidden&&u.ag.st===''&&u.hp>u.maxhp*0.7&&u.order.t!=='build'&&u.order.t!=='repair'&&!bb.tickets.some(k=>k.by===u.id));
  if(!idle.length)return;
  for(const j of E.jobs){
    if(j.state!=='open'||j.client==='me')continue;
    if(S.props.some(p=>p.key==='job'+j.id))continue;
    // candidates: suited, not essential to the colony right now
    let cands=idle.filter(u=>jobEligible(u,j));
    if(j.type==='quota')cands=cands.filter(u=>u.def.worker&&u.ag.role==='mine');
    else if(j.type==='clear')cands=cands.filter(u=>u.def.dmg&&!u.def.worker);
    else if(j.need==='armed')cands=cands.filter(u=>(u.ag.role==='guard'||u.ag.role==='hunt'||u.ag.role==='patrol')&&!u.def.heal);
    else if(j.retainer)cands=cands.filter(u=>u.def.worker?u.ag.role==='mine'&&c.workers.length>14:u.ag.role!=='assault');
    else cands=cands.filter(u=>!u.def.worker&&!u.def.heal&&!u.def.trade&&(u.flying||u.def.speed>=110)&&u.ag.role!=='assault'&&u.hp>=u.maxhp*0.9);
    if(j.risk>0.8&&j.type!=='clear')continue;
    if(!cands.length)continue;
    const w=j.where||{x:0,y:0};
    cands.sort((a,b)=>hyp(a.x-w.x,a.y-w.y)-hyp(b.x-w.x,b.y-w.y));
    if(j.type!=='clear'&&j.where&&(j.risk>0.25||campOnPath(cands[0],w)))continue;   // the Overseer does not send people through creep country for a courier fee
    let take=[cands[0]],cad=null;
    const opp=0.45;   // crystals per second a worker earns at home
    if(j.type==='clear'){
      const L=lanchCamp(j.spec.camp);
      take=[];let mine=0;
      for(const u of cands.slice(0,12)){take.push(u);mine=lanch(take);if(mine>=L.p*3.2)break;}
      if(mine<L.p*3.2||take.length>9)continue;
      const fl=1-Math.sqrt(Math.max(0,1-L.p/mine)),loss=fl*take.reduce((n,u)=>n+u.def.cost.c+u.def.cost.e,0);   // expected casualties (Lanchester square law), priced
      if(j.pay<take.length*35||j.pay-loss<j.pay*0.45)continue;
    }else if(j.type==='quota'){
      take=cands.slice(0,3);if(take.length<2)continue;
      if(j.pay<n_(j.spec.n)*0.12)continue;
    }else if(j.retainer){
      const transit=hyp(take[0].x-w.x,take[0].y-w.y)/Math.max(60,take[0].def.speed)+10;
      const t=jobRates(j);let bestC=null,bv=-1;
      for(const id in t){const r=t[id],ten=r.hazard>0?r.secs/r.hazard:600,T_=Math.min(600,ten),net=(r.period/r.secs)*T_-transit*opp,per=net/(T_+transit);if(per>bv){bv=per;bestC=id;}}
      if(bv<opp*(take[0].def.worker?1.15:0.35))continue;cad=bestC;
    }else{
      const sp=take[0].def.speed,len=(j.spec.len||600)*TILE/TILE;const secs=(j.spec.len||40)*TILE/sp*1.4+8;
      if(j.pay<secs*opp*(take[0].def.worker?1.8:1.2))continue;
    }
    const text='Take job: '+j.title+' — '+(j.retainer?CADI[cad].name+' billing':'+'+j.pay+'◆')+' ('+take.map(agName).join(', ')+')';
    ovAct('labor','job'+j.id,text,()=>econAccept(j.id,take,cad));
    if(S.dom.labor==='act')return;   // one acceptance per pass
  }
}
/* ------------------------------ main loop ------------------------------ */
function ovStep(dt){
  const S=G.sw,O=S.ov;if(!S.on)return;
  O.t+=dt;if(O.t<1.5)return;O.t=0;O.t3++;
  ovPurge();
  const c=ovCtx();if(!c)return;
  const m=S.dom;
  if(m.supply!=='off'||m.eco!=='off')ovRescue(c);
  if(m.supply!=='off')ovSupply(c);
  if(m.eco!=='off')ovEco(c);
  if(m.tech!=='off')ovTech(c);
  if(m.eco!=='off'||m.army!=='off'||m.trade!=='off')ovBuildings(c);
  if(m.army!=='off'){ovDefense(c);ovWar(c);ovRecon(c);ovProduction(c);}
  if(m.trade!=='off')ovTrade(c);
  if(m.labor!=='off')ovLabor(c);
  if(O.t3%2===0)ovAlloc(c);
  if(S.stand.length&&O.t3%4===0)ovStanding(c);
}
function ovStanding(c){}
/* ------------------------------- presets ------------------------------- */
function enrollAll(filter){
  let n=0;for(const u of G.units){if(u.dead||u.team!==0||u.def.hero||u.def.creep)continue;if(filter&&!filter(u))continue;if(agEnroll(u,true))n++;}return n;}
function ovPreset(name){
  const S=G.sw,P=S.pol;
  if(name==='autopilot'){S.on=true;for(const d in S.dom)S.dom[d]='act';P.autoEnroll=true;P.hunt=true;P.assault=true;enrollAll(u=>!u.ag||!u.ag.auto);ovLog('ov','Autopilot engaged: every domain is on act');}
  else if(name==='advisor'){S.on=true;for(const d in S.dom)S.dom[d]='advise';P.autoEnroll=false;ovLog('ov','Advisor mode: the Overseer only suggests');}
  else if(name==='manual'){S.on=false;ovLog('ov','Swarm AI switched off — all units follow plain orders');}
  uiDirty();
}

/* =========================================================================
   THE MASTER — a rule-based natural-language command layer.
   It is a deterministic grammar (keywords, numbers, places, cadences), not a
   language model: it understands a few dozen phrasings, tells you what it
   did, and says so plainly when it does not understand.
   ========================================================================= */
const NL_VERBS='mine|harvest|gather|extract|build|construct|guard|defend|protect|patrol|scout|explore|hunt|clear|attack|assault|raid|escort|follow|heal|repair|trade|stop|hold|retreat|return|keep|hire|fire|dismiss|release|train|make|produce|research|upgrade|advance|set|turn|enable|disable|toggle|accept|take|status|report|free|enroll|auto|manual|pay|buy|sell|send|move|go|assign|put|switch|autopilot|advisor|stand|call|help|recruit|queue|why|list|show|allow|forbid';
const NL_UNITS=[
  ['hauler',/\b(haulers?|peons?|harvesters?)\b/],['rifleman',/\b(riflem[ae]n|rifles?|marines?|infantry)\b/],['raptor',/\braptors?\b/],['rocketeer',/\brocketeers?\b/],
  ['mender',/\b(menders?|medics?|healers?)\b/],['howitzer',/\b(howitzers?|artillery)\b/],['juggernaut',/\bjuggernauts?\b/],['skiff',/\b(skiffs?|fighters? craft|air units?|flyers?)\b/],
  ['titan',/\btitans?\b/],['freighter',/\b(freighters?|traders?|merchants?)\b/],['bulwark',/\bbulwarks?\b/],['reaver',/\breavers?\b/],['specter',/\bspecters?\b/]];
const NL_BUILDINGS=[
  ['generator',/\b(generators?|power plants?|supply depots?)\b/],['depot',/\bdepots?\b/],['siphon',/\b(siphons?|ether siphons?|extractors?)\b/],['habitat',/\b(habitats?|houses?|homes|housing)\b/],
  ['garrison',/\b(garrisons?|barracks)\b/],['armory',/\b(armou?ry|armou?ries)\b/],['forum',/\bforums?\b/],['exchange',/\b(exchanges?|market ?place)\b/],['foundry',/\b(foundry|foundries)\b/],
  ['airfield',/\b(airfields?|air ?ports?)\b/],['turret',/\b(turrets?|defen[cs]e towers?|towers? defen[cs]e)\b/],['hub',/\b(hubs?|expansions?|command (?:hub|center|centre)|new base)\b/]];
const NL_ROLEWORDS=[
  ['ether',/\b(ether ?workers?|ether|siphon(?:ing)?|geysers?)\b/],['mine',/\b(mine|mining|miners?|crystals?|harvest(?:ing)?|gather(?:ing)?)\b/],['build',/\b(builders?|constructors?)\b/],['repair',/\b(mechanics?|repairers?|repair(?:ing)?)\b/],
  ['scout',/\b(scouts?|scouting|explor\w+|recon)\b/],['guard',/\b(guards?|guarding|defend\w*|protect\w*|sentr(?:y|ies))\b/],['patrol',/\bpatrol\w*\b/],['hunt',/\b(hunters?|hunting|creeping|creeps?|camps?)\b/],
  ['assault',/\b(raiders?|assault\w*|attack\w*|raid\w*)\b/],['escort',/\b(escort\w*|follow\w*)\b/],['medic',/\b(medics?|healing|heal)\b/],['trade',/\b(trad(?:e|ing|ers?)|trade routes?)\b/]];
function plu(name){return /man$/.test(name)?name.slice(0,-3)+'men':name+'s';}
function nlNorm(s){return' '+String(s).toLowerCase().replace(/[“”"'`]/g,'').replace(/[^a-z0-9%.:+\- ]/g,' ').replace(/(\d)\.(?!\d)/g,'$1 ').replace(/\s+/g,' ').trim()+' ';}
function nlSplit(text){
  const t=String(text).toLowerCase().replace(/\s+/g,' ').trim();
  const re=new RegExp('\\s*(?:;|\\.\\s+|\\bthen\\b|\\band then\\b)\\s*|\\s+and\\s+(?=(?:'+NL_VERBS+')\\b)','g');
  return t.split(re).map(x=>x&&x.trim()).filter(Boolean);
}
function nlNum(s){const m=s.match(/\b(\d+(?:\.\d+)?)\b/);return m?parseFloat(m[1]):null;}
const NL_WORDNUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15,twenty:20,a:1,an:1,couple:2,few:3,several:4,half:0};
function nlCount(s,afterRe){ // "4 riflemen", "four riflemen", "a few raptors"
  const m=s.match(new RegExp('\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|a couple of|a few|several)\\s+(?:more\\s+)?'+afterRe.source,'i'));
  if(!m)return null;const w=m[1];if(/^\d+$/.test(w))return parseInt(w);if(w==='a couple of')return 2;if(w==='a few')return 3;return NL_WORDNUM[w]||null;
}
function nlCad(s){
  if(/\b(per|by|on|at|every|each|with)?\s*(?:the\s+)?(minute|minutely|min)\b/.test(s)&&!/\b\d+\s*min\b/.test(s))return'min';
  if(/\b(hour|hourly|hr)\b/.test(s))return'hour';
  if(/\b(day|daily)\b/.test(s))return'day';
  if(/\b(month|monthly)\b/.test(s))return'month';
  if(/\b(task|per job|per task|on completion|bounty|piece ?work)\b/.test(s))return'task';
  return null;
}
function nlPlace(s,env,u0){
  const hubs=ownHubs(0),main=hubs[0]||{x:WW*0.2,y:WH*0.8};
  let m;
  if((m=s.match(/\bsector ([a-k])\s?(\d{1,2})\b/))){const gy=m[1].charCodeAt(0)-97,gx=parseInt(m[2])-1;const c=bbCells(G.sw).find(c=>c.gx===gx&&c.gy===gy);if(c)return{x:c.x,y:c.y,label:'sector '+m[1].toUpperCase()+m[2]};}
  if(/\b(here|camera|screen|my view|where i(?: am|m) looking|this spot)\b/.test(s)&&env.cam)return{x:env.cam.x,y:env.cam.y,label:'your view'};
  if(/\b(enemy|their|opponent)\b/.test(s)){const eh=G.buildings.find(b=>!b.dead&&b.team===1&&b.type==='hub')||{x:G.sites[1].cx*TILE,y:G.sites[1].cy*TILE};return{x:eh.x,y:eh.y,label:'the enemy base',enemy:true};}
  if(/\b(natural|expansion|second base|nat|new base)\b/.test(s)&&!/\bbuild\b.*\b(expansion|new base)\b/.test(s)){const st=G.sites[2];return{x:st.cx*TILE,y:st.cy*TILE,label:'the natural'};}
  if(/\b(front|stage|staging|rally|choke|gate|entrance|ramp|perimeter)\b/.test(s)){const st=stagePt(main);return{x:st.x,y:st.y,label:'the front line'};}
  if(/\b(center|centre|middle|centre of the map)\b/.test(s))return{x:WW/2,y:WH/2,label:'the map centre'};
  if(/\b(watch ?tower|tower)\b/.test(s)&&!/\bdefen[cs]e tower\b/.test(s)){let b=null,bd=1e9;for(const n of G.neutrals)if(n.type==='tower'){const d=hyp(n.x-main.x,n.y-main.y);if(d<bd){bd=d;b=n;}}if(b)return{x:b.x,y:b.y,label:'the watchtower'};}
  if(/\b(trading post|post)\b/.test(s)){let b=null,bd=1e9;for(const n of G.neutrals)if(n.type==='post'){const d=hyp(n.x-main.x,n.y-main.y);if(d<bd){bd=d;b=n;}}if(b)return{x:b.x,y:b.y,label:'the trading post'};}
  if(/\b(creep camp|camp|creeps|monsters)\b/.test(s)){let b=null,bd=1e9;for(const c of G.camps)if(c._alive){const d=hyp(c.x-main.x,c.y-main.y);if(d<bd){bd=d;b=c;}}if(b)return{x:b.x,y:b.y,label:'the nearest creep camp',camp:b};}
  if((m=s.match(/\bfield (\d)\b/))){const f=G.sites.filter(x=>x.owner!==1)[parseInt(m[1])-1];if(f)return{x:f.cx*TILE,y:f.cy*TILE,label:'mining field '+m[1]};}
  if((m=s.match(/\b(north|south|east|west)\b/))){const v={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]}[m[1]];return{x:clamp(main.x+v[0]*700,100,WW-100),y:clamp(main.y+v[1]*700,100,WH-100),label:'the '+m[1]};}
  if(/\b(base|home|hub|main|town|colony)\b/.test(s))return{x:main.x,y:main.y+TILE*3,label:'the base',home:true};
  return null;
}
function nlSubject(s,env,opts){
  opts=opts||{};
  const mine=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.hero);
  let pool=null,label='';
  const n=nlCount(s,/(?:[a-z]+s\b|[a-z]+n\b|units?)/);
  let m;
  if(/\b(selected|selection|these|them|those|this one|it|my selection)\b/.test(s)&&env.sel&&env.sel.length){pool=env.sel.filter(u=>!u.dead&&u.team===0&&!u.def.hero);label='the selection';}
  else if((m=s.match(/\bgroup (\d)\b/))&&env.group){pool=env.group(parseInt(m[1])).filter(u=>!u.dead&&!u.def.hero);label='group '+m[1];}
  else if(/\b(freelancers?|contractors?|mercenaries|mercs?|hired|hires)\b/.test(s)){pool=mine.filter(u=>u.ag&&u.ag.free);label='freelancers';}
  else{
    for(const[t,re]of NL_UNITS)if(re.test(s)&&!(opts.noUnit&&opts.noUnit===t)){
      // "hauler" etc. names a unit type when it is the grammatical subject
      pool=mine.filter(u=>u.type===t);label=UDEF[t].name.toLowerCase()+'s';break;}
    if(!pool){
      if(/\b(workers?|workforce|labou?r|everyone who works|workmen)\b/.test(s)){pool=mine.filter(u=>u.def.worker);label='workers';}
      else if(/\b(army|soldiers?|troops?|military|warriors?|fighters?|combat units?|forces?|squads?|units?|everyone|everybody|all)\b/.test(s)&&!/\ball (?:jobs|gigs|contracts)\b/.test(s)){
        if(/\b(army|soldiers?|troops?|military|warriors?|fighters?|combat|forces?)\b/.test(s)){pool=mine.filter(u=>!u.def.worker&&!u.def.trade&&!u.def.noWeapon);label='the army';}
        else{pool=mine.filter(u=>true);label='all units';}}
      else{for(const[r,re]of NL_ROLEWORDS)if(/\b(ether ?workers|miners|builders|scouts|guards|hunters|raiders|medics|traders|mechanics)\b/.test(s)&&re.test(s)){pool=mine.filter(u=>u.ag&&u.ag.role===r);label=ROLES[r].n.toLowerCase()+'s';break;}}
    }
  }
  if(pool&&/\bidle\b/.test(s))pool=pool.filter(u=>u.order.t==='idle');
  if(pool&&n&&n>0&&!/\ball\b/.test(s)&&!opts.noCount){
    const near=opts.near;if(near)pool=pool.slice().sort((a,b)=>hyp(a.x-near.x,a.y-near.y)-hyp(b.x-near.x,b.y-near.y));
    else pool=pool.slice().sort((a,b)=>(a.ag&&a.ag.auto?1:0)-(b.ag&&b.ag.auto?1:0));   // prefer units nobody has claimed yet
    pool=pool.slice(0,n);}
  return{pool,label,n};
}
function nlRole(s){
  for(const[r,re]of NL_ROLEWORDS)if(re.test(s))return r;return null;}
function nlDomain(s){
  const t=[['supply',/\bsupply\b/],['eco',/\b(economy|eco)\b/],['alloc',/\b(allocation|alloc|labou?r allocation|assignments?)\b/],['army',/\b(army|military|defen[cs]e)\b/],['tech',/\b(tech|technology|research|eras?)\b/],['trade',/\b(trade|trading|market)\b/],['labor',/\b(labou?r|hiring|marketplace|jobs)\b/]];
  for(const[d,re]of t)if(re.test(s))return d;return null;
}
function ovAssign(units,role,dir,R,label){
  const S=G.sw;let n=0;
  for(const u of units){if(u.dead)continue;if(!u.ag)agEnroll(u,true);if(!u.ag)continue;if(canRole(u,role)&&agDirect(u,role,dir))n++;}
  return n;
}
function ovLaunchAssault(units){
  const S=G.sw,bb=S.bb,us=units.filter(u=>u.ag&&u.ag.role==='assault');if(!us.length)return false;
  let cx=0,cy=0;for(const u of us){cx+=u.x;cy+=u.y;}cx/=us.length;cy/=us.length;
  const hub=nearestOwn(0,'hub',cx,cy),stage=hub?stagePt(hub):{x:cx,y:cy};
  const tgt=nearestEnemyBuilding(stage.x,stage.y,0);if(!tgt)return false;
  let slow=1e9;for(const u of us)if(u.def.speed<slow)slow=u.def.speed;
  bb.assault={go:true,tgt,stage,t0:G.time,goT:G.time,init:us.length,need:us.length,have:us.length,ids:new Set(us.map(u=>u.id)),wave:S.ov.wave,slow:slow<1e9?slow*1.12:0};
  S.ov.wave++;return true;
}
function findBuildingSpot(type,x,y){
  const d=BDEF[type],reserved=pendingRects(G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker));
  if(type==='siphon'){let best=null,bd=1e9;for(const r of G.res){if(r.dead||r.type!=='geyser'||r.siphon)continue;const dd=hyp(r.x-x,r.y-y);if(dd<bd&&dd<700&&canPlace(0,'siphon',r.tx,r.ty,true)){bd=dd;best={tx:r.tx,ty:r.ty};}}return best;}
  if(type==='hub'){return findExpansion({team:0},G.buildings.filter(b=>!b.dead&&b.team===0),[]);}
  let best=null,bs=1e9;const ax=x/TILE|0,ay=y/TILE|0;
  for(let dy=-14;dy<=14;dy++)for(let dx=-14;dx<=14;dx++){
    const tx=ax+dx-(d.w>>1),ty=ay+dy-(d.h>>1),cx=(tx+d.w/2)*TILE,cy=(ty+d.h/2)*TILE;
    if(!spotOK(0,type,tx,ty,d,reserved,cx,cy))continue;const s=hyp(dx,dy)+Math.random()*2;if(s<bs){bs=s;best={tx,ty};}}
  return best;
}
function ovBuildAt(type,x,y){
  const c=ovCtx();if(!c)return{ok:false,why:'no base'};
  const d=BDEF[type],r=reqBuild(0,type);if(!r.ok)return{ok:false,why:r.why};
  const spot=findBuildingSpot(type,x,y);if(!spot)return{ok:false,why:'no room for a '+d.name+' there'};
  const cx=(spot.tx+d.w/2)*TILE,cy=(spot.ty+d.h/2)*TILE;let w=null,bd=1e9;
  for(const u of c.workers){if(u.order.t==='build'||u.order.t==='repair'||u.garr||(u.ag&&u.ag.cid))continue;
    const dd=hyp(u.x-cx,u.y-cy)+(u.carry>0?150:0)+(u.ag&&u.ag.role==='build'?-200:0);if(dd<bd){bd=dd;w=u;}}
  if(!w)return{ok:false,why:'no free worker'};
  return{ok:agDo(()=>orderBuild(w,type,spot.tx,spot.ty)),why:'could not afford it'};
}
function ovTrain(type,n){
  const def=UDEF[type];let done=0,why='';
  for(let i=0;i<n;i++){
    let best=null;for(const b of G.buildings){if(b.dead||!b.done||b.team!==0)continue;if(!prodList(b).includes(type))continue;if(b.queue.length>=5)continue;if(!best||b.queue.length<best.queue.length)best=b;}
    if(!best){why=done?'':'You have no building that trains '+def.name+'s yet';break;}
    const r=reqUnit(0,type);if(!r.ok){why=r.why;break;}
    if(queueUnit(best,type)){done++;const hub=nearestOwn(0,'hub',best.x,best.y);if(hub&&!best.rally){const st=stagePt(hub);best.rally={x:st.x+(Math.random()-.5)*110,y:st.y+(Math.random()-.5)*110};}}else break;}
  return{done,why};
}
function ovFindHire(type,roles,cad,role){
  const E=G.sw.eco,T=G.teams[0];let best=null,bp=1e9;
  for(const l of E.free){
    if(type&&l.type!==type)continue;if(!type&&role&&!l.roles.includes(role))continue;
    if(UDEF[l.type].era>T.era)continue;
    const p=cad&&cad!=='task'?periodPrice(l.type,l.lvl,cad,wageNow(),l.ask)/CADI[cad].secs:baseWage(l.type,l.lvl)*l.ask;
    if(p<bp){bp=p;best=l;}}
  return best;
}
const NL_EXAMPLES=['status','mine crystals','keep 14 miners','guard the natural with 4 riflemen','scout the map','hunt creeps','hire 2 miners by the day','take jobs','autopilot'];
function ovCommand(text,env){
  env=env||{};const S=G.sw,R={say:[],ok:0,fail:0};
  if(!S){return{say:'The swarm is not running.',ok:0,fail:1};}
  const clauses=nlSplit(text);
  if(!clauses.length)return{say:'Say something like: "'+NL_EXAMPLES.slice(0,4).join('", "')+'".',ok:0,fail:1};
  for(const c of clauses){try{nlClause(c,env,R);}catch(e){R.say.push('Something went wrong with "'+c+'": '+e.message);R.fail++;}}
  uiDirty();
  const out={say:R.say.join(' '),ok:R.ok,fail:R.fail};S.cmdLog=S.cmdLog||[];S.cmdLog.push({t:G.time,q:text,a:out.say,ok:R.fail===0});if(S.cmdLog.length>30)S.cmdLog.shift();
  return out;
}
function nlClause(c,env,R){
  const S=G.sw,P=S.pol,T=G.teams[0],s=nlNorm(c),say=t=>R.say.push(t),ok=()=>{R.ok++;},bad=t=>{R.fail++;say(t);};
  const num=nlNum(s);
  let m;
  // ---------------------------------------------------------------- info
  if(/\b(help|commands|what can you do|how do i)\b/.test(s)&&!/\bhelp (build|mine|guard)/.test(s)){
    say('I take plain orders. Try: '+NL_EXAMPLES.map(x=>'"'+x+'"').join(', ')+'. I can assign roles (mine, ether, build, repair, scout, guard, patrol, hunt, attack, escort, heal, trade) to the selection or to a group of units, keep quotas ("keep 12 miners", "keep 8 riflemen"), build and train, set policy ("commission 8%", "taxes low", "workers flee on"), switch domains ("army act", "labor advise"), and hire or fire freelancers ("hire a rifleman by the hour", "fire all freelancers").');ok();return;}
  if(/\b(status|report|summary|overview|situation|how are we|how is it going)\b/.test(s)){say(ovReport());ok();return;}
  if(/^ why\b/.test(s)||/\bwhy did you\b/.test(s)){const l=S.log.slice(-3).map(x=>x.text);say(l.length?'My latest decisions: '+l.join('; ')+'.':'I have not decided anything yet.');ok();return;}
  if(/\b(list|show)\b.*\b(agents|roster|units)\b/.test(s)){const cnt={};for(const u of S.agents)cnt[u.ag.role]=(cnt[u.ag.role]||0)+1;say('Roster: '+(Object.keys(cnt).length?Object.entries(cnt).map(([r,n])=>n+' '+ROLES[r].n.toLowerCase()).join(', '):'no enrolled agents yet')+'.');ok();return;}
  if(/\b(wage|labou?r) (index|rate|price)|\bhow expensive\b/.test(s)){const W=S.eco.W;say('Wage index W = '+W.v.toFixed(2)+' against a mean of '+W.mu.toFixed(2)+(W.v>W.mu+0.08?' — wages are high; spot cadences (minute/hour) will mean-revert, so avoid locking now':W.v<W.mu-0.08?' — wages are low; locking a day or month rate is attractive':' — fair value')+'.');ok();return;}
  // ------------------------------------------------------------- presets
  if(/\b(autopilot|full auto|fully automatic|run everything|play for me)\b/.test(s)&&!/\b(off|disable|stop|cancel)\b/.test(s)){ovPreset('autopilot');say('Autopilot is on: every domain acts on its own, new units are enrolled automatically, hunting and assaults are allowed. Say "advisor mode" or "manual mode" to take the wheel back.');ok();return;}
  if(/\b(advisor|advise mode|advice mode|suggest only|only suggest)\b/.test(s)){ovPreset('advisor');say('Advisor mode: I will only propose actions in the Swarm panel for you to approve.');ok();return;}
  if(/\b(manual mode|take over|full control|manual control|i take control|autopilot off|stop autopilot|disable autopilot)\b/.test(s)){ovPreset('manual');say('The swarm AI is off. Every unit follows plain orders again.');ok();return;}
  // ------------------------------------------------------ domain / master
  if((m=s.match(/\b(act|advise|suggest|off|disable|enable|on|autonomous|automatic)\b/))&&nlDomain(s)&&!/\b(research|upgrade) (weapons?|armou?r|plating|stims?|mining|compress|cargo|ether)\b/.test(s)&&!/\b(buy|sell|hire|fire|train|build|keep)\b/.test(s)&&!/\bera\b.*\b(advance|next)\b/.test(s)){
    const d=nlDomain(s),w=m[1],mode=/^(act|on|enable|autonomous|automatic)$/.test(w)?'act':/^(advise|suggest)$/.test(w)?'advise':'off';
    S.dom[d]=mode;say('Domain "'+DOMAINS.find(x=>x.id===d).name+'" is now set to '+mode+'.');ok();return;}
  if(/\b(overseer|swarm|master|autonomy|agents?)\b/.test(s)&&/\b(on|off|enable|disable|start|stop|pause|resume)\b/.test(s)&&!/\b(hire|fire)\b/.test(s)&&!(()=>{const q=nlSubject(s.replace(/\bagents?\b/g,' '),env,{noCount:true});return q.pool&&q.pool.length;})()&&!(env.sel&&env.sel.length&&!/\b(overseer|swarm|master|all|everything|global\w*)\b/.test(s))){
    const on=/\b(on|enable|start|resume)\b/.test(s)&&!/\b(off|disable|stop|pause)\b/.test(s);S.on=on;say('The swarm AI is '+(on?'on':'off')+'.');ok();return;}
  // ------------------------------------------------------------- policies
  if((m=s.match(/\b(commission|bonus|cut|share)\b[^0-9]*(\d+(?:\.\d+)?)\s*(%|percent)?/))){const v=clamp(parseFloat(m[2])/100,0,0.15);P.comm=v;say('Agent commission is now '+(v*100).toFixed(1)+'% of delivered value (max 15%).');ok();return;}
  if(/\b(pay|payroll|wages?|wallets?|commissions?)\b/.test(s)&&/\b(off|disable|none|stop|no|cancel)\b/.test(s)&&!/\b(fire|hire|dismiss|index)\b/.test(s)&&!/\bcommission\b.*\d/.test(s)){S.pay=false;say('Agent pay is off: no commissions, bounties or gear purchases.');ok();return;}
  if(/\b(pay|payroll|wages?|wallets?|commissions?)\b/.test(s)&&/\b(on|enable|resume|restore)\b/.test(s)&&!/\b(hire|index)\b/.test(s)&&!/\bcommission\b.*\d/.test(s)){S.pay=true;say('Agent pay is on.');ok();return;}
  if(/\btax(es)?\b/.test(s)&&(m=s.match(/\b(low|normal|high|lower|raise|higher)\b/))){const w=m[1],lv=w==='low'?0:w==='normal'?1:w==='high'?2:w==='lower'?Math.max(0,T.tax-1):Math.min(2,T.tax+1);setTax(0,lv);say('Taxes set to '+TAX[lv].n+'.');ok();return;}
  if(/\b(flee|take cover|hide|shelter)\b/.test(s)&&/\b(on|off|enable|disable|should|never|always)\b/.test(s)&&!/\bcall to arms\b/.test(s)){const on=!/\b(off|disable|never|don t|dont)\b/.test(s);P.flee=on;say('Workers '+(on?'will':'will no longer')+' take cover in the Hub when armed enemies approach.');ok();return;}
  if(/\b(auto ?-?enrol\w*|enrol\w* (?:new|all)(?: units)? auto\w*|new units)\b/.test(s)&&/\b(on|off|enable|disable)\b/.test(s)){const on=!/\b(off|disable)\b/.test(s);P.autoEnroll=on;say('New units '+(on?'are now enrolled automatically':'stay under your direct control')+'.');ok();return;}
  if(/\b(allow|permit|enable|forbid|disable|no|stop)\b/.test(s)&&/\b(hunting|creeping|creep camps?)\b/.test(s)){const on=/\b(allow|permit|enable)\b/.test(s);P.hunt=on;say('Creep hunting is '+(on?'allowed':'forbidden')+'.');ok();return;}
  if(/\b(allow|permit|enable|forbid|disable|no|stop)\b/.test(s)&&/\b(assaults?|attacks?|offensives?|waves?)\b/.test(s)){const on=/\b(allow|permit|enable)\b/.test(s);P.assault=on;say('Assault waves are '+(on?'allowed':'forbidden')+'.');ok();return;}
  if(/\b(clinic|repair desk|field repairs?)\b/.test(s)&&/\b(on|off|enable|disable|free|subsid\w+)\b/.test(s)){const on=!/\b(off|disable)\b/.test(s);P.clinic=on;say('Wounded agents '+(on?'will':'will not')+' retreat to the Hub clinic.');ok();return;}
  // -------------------------------------------------------------- keep N
  if((m=s.match(/\b(?:keep|maintain|have|ensure|always (?:have|keep)|hold)\s+(?:at least\s+)?(\d+|one|two|three|four|five|six|eight|ten|twelve|fifteen|twenty)\s+(?:more\s+)?([a-z ]+?)(?: alive| at all times| available| working| ready)?\s*$/))){
    const k=/^\d+$/.test(m[1])?parseInt(m[1]):NL_WORDNUM[m[1]],noun=' '+m[2]+' ';
    for(const[t,re]of NL_UNITS)if(re.test(noun)&&t!=='hauler'){(P.keepUnits=P.keepUnits||{})[t]=k;S.stand.push({txt:'Keep '+k+' '+plu(UDEF[t].name)});say('Standing order: keep '+k+' '+plu(UDEF[t].name)+'. The army domain trains them first'+(S.dom.army==='off'?' — but it is switched off, so say "army act"':'')+'.');ok();return;}
    const r=nlRole(noun);
    if(/\b(workers?|haulers?|peons?)\b/.test(noun)||(r==='mine'&&/\bworkers\b/.test(noun))){P.keepWorkers=k;S.stand.push({txt:'Keep '+k+' workers'});say('Standing order: keep '+k+' workers.');ok();return;}
    if(r&&['mine','ether','build','repair'].includes(r)){P.quota[r]=k;S.stand.push({txt:'Keep '+k+' '+ROLES[r].n.toLowerCase()+'s'});say('Standing order: keep '+k+' '+ROLES[r].n.toLowerCase()+'s'+(S.dom.alloc!=='act'?' — the allocation domain must be on act ("allocation act") to move workers by itself':'')+'.');ok();return;}
    if(r==='scout'){P.scouts=k;say('Standing order: keep '+k+' scout'+(k>1?'s':'')+' on the map.');ok();return;}
    bad('I can keep a number of workers, role quotas (miners, etherworkers, builders), scouts or unit types. I did not understand "'+m[2]+'".');return;}
  // ---------------------------------------------------------- hire / fire
  if(/\b(hire|recruit|contract|engage|employ)\b/.test(s)&&!/\b(fire|dismiss)\b/.test(s)){
    const cad=nlCad(s),n=nlCount(s,/(?:[a-z]+\b)/)||num&&num<10&&num||1;
    let type=null;for(const[t,re]of NL_UNITS)if(re.test(s)){type=t;break;}
    let role=nlRole(s.replace(/\b(by|per|on|at)\s+(the\s+)?(minute|hour|day|month|task)\b/g,''));
    if(!type&&!role){if(/\b(merc\w*|soldiers?|fighters?)\b/.test(s)){role='guard';}else role='mine';}
    const k=Math.min(n,6);let hired=[],why='';
    for(let i=0;i<k;i++){
      const l=ovFindHire(type,null,cad&&cad!=='task'?cad:null,role);
      if(!l){why=why||'There is no matching freelancer on the market right now — listings refresh every ~20 s.';break;}
      let cc=cad;
      if(!cc){const b=bestCadence(l.type,l.lvl,l.ask,600);cc=b.cad;}
      let spec=null;
      if(cc==='task'){
        const t2=s.match(/\bmine (\d+)/)||s.match(/\b(\d+) crystals?\b/);const e2=s.match(/\bextract (\d+)|\b(\d+) ether\b/);
        if(/\b(clear|camp|creeps?)\b/.test(s)){const camp=nlPlace('camp',env).camp;if(camp){spec={t:'clear',camp,lvl:camp.lvl,dur:210};}}
        else if(/\bsurvey|scout|explore\b/.test(s)){const cells=bbCells(S).filter(q=>q.reach&&!q.base).slice(0,40);const pts=[];for(let j=0;j<3;j++){const q=spick(cells);pts.push({x:q.x,y:q.y,done:false});}spec={t:'survey',pts,len:routeLen(pts,ownHubs(0)[0]),dur:150};}
        else if(e2){spec={t:'ether',n:parseInt(e2[1]||e2[2]),res:'e',dur:240};}
        else{const nn=t2?parseInt(t2[1]):150;spec={t:'mine',n:nn,res:'c',dur:Math.round(nn/0.5)+60};}
      }
      const c0=econHire(l.id,cc,{role:role&&l.roles.includes(role)?role:undefined,spec});
      if(c0)hired.push({c:c0,l});else{why=why||'could not afford it or hit the freelancer cap ('+nFreelancers()+'/'+maxFree()+')';break;}}
    if(hired.length){say('Hired '+hired.map(h=>h.l.name+' ('+UDEF[h.l.type].name+' L'+h.l.lvl+', '+CADI[h.c.cad].name.toLowerCase()+')').join(', ')+'. Wage index '+wageNow().toFixed(2)+'.');ok();}
    else bad('Could not hire: '+why);
    return;}
  if(/\b(fire|dismiss|release|let go|terminate|end contracts?|don t renew|dont renew)\b/.test(s)&&/\b(freelancers?|contractors?|mercenaries|mercs?|hires?|all|everyone|contracts?|[a-z]+s)\b/.test(s)){
    const now=/\b(fire|dismiss|terminate)\b/.test(s)&&!/\b(not|don t|dont) renew\b/.test(s);
    let list=S.eco.ctr.filter(x=>x.kind==='hire'&&x.state==='active'&&x.cad!=='task');
    const sub=nlSubject(s,env,{noCount:true});
    if(sub.pool&&sub.pool.length&&sub.label!=='freelancers')list=list.filter(x=>sub.pool.some(u=>u.id===x.uid));
    const role=nlRole(s);if(role&&!/\b(all|everyone|freelancers?|contractors?)\b/.test(s))list=list.filter(x=>x.role===role);
    const n=nlCount(s,/(?:[a-z]+\b)/);if(n)list=list.slice(0,n);
    if(!list.length){bad('There is nobody under contract to '+(now?'dismiss':'release')+'.');return;}
    for(const x of list)econFire(x.id,now);say((now?'Dismissed ':'Gave notice to ')+list.map(x=>x.name).join(', ')+(now?'. Prepaid wages for the current period are forfeit.':'. They finish the period they are paid for.'));ok();return;}
  // ------------------------------------------------------------------ jobs
  if(/\b(accept|take|do|run|work|pick up|grab)\b/.test(s)&&/\b(jobs?|gigs?|contracts?|bounties|tasks?|retainers?)\b/.test(s)){
    if(/\b(stop|no|don t|dont|never)\b/.test(s)){S.dom.labor='advise';say('I will only suggest jobs from now on.');ok();return;}
    const sel=env.sel&&env.sel.filter(u=>u.ag&&u.ag.auto&&!u.ag.cid);
    if(sel&&sel.length){
      const want=/\bsurvey\b/.test(s)?'survey':/\bcourier\b/.test(s)?'courier':/\b(clear|camp)\b/.test(s)?'clear':/\b(mining|quota|bounty)\b/.test(s)?'quota':/\bguard|retainer|station\b/.test(s)?'station':/\brelay\b/.test(s)?'relay':null;
      const open=S.eco.jobs.filter(j=>j.state==='open'&&j.client!=='me'&&(!want||j.type===want)&&sel.some(u=>jobEligible(u,j))).sort((a,b)=>b.pay-a.pay);
      if(!open.length){bad('No open job fits the selection'+(want?' and the type "'+want+'"':'')+'.');return;}
      const j=open[0],cad=nlCad(s)||'hour';
      if(econAccept(j.id,sel,j.retainer?(cad==='task'?'hour':cad):null)){say('Accepted "'+j.title+'" with '+sel.slice(0,3).map(agName).join(', ')+'.');ok();}else bad('Could not accept it.');return;}
    S.dom.labor='act';say('The labour domain is on act: I will take jobs whose margin is good and hire help when it pays. Select agents and say "take the survey job" to pick one yourself.');ok();return;}
  // ------------------------------------------------------ build / train / research
  if(/\b(research|upgrade|develop)\b/.test(s)&&(m=s.match(/\b(weapons?|armou?r|plating|stims?|combat stims?|mining|lasers?|compress\w*|ether comp\w*|cargo|hooks?)\b/))){
    const w=m[1],id=/weapon/.test(w)?'weapons':/armou?r|plating/.test(w)?'armor':/stim/.test(w)?'stims':/mining|laser/.test(w)?'mining':/compress|ether/.test(w)?'compress':'cargo';
    const b=G.buildings.find(x=>!x.dead&&x.done&&x.team===0&&TECH[id].at===x.type&&x.queue.length<5);
    if(!b){bad('You need a '+BDEF[TECH[id].at].name+' to research '+TECH[id].name+'.');return;}
    if(queueResearch(b,id)){say('Researching '+TECH[id].name+'.');ok();}else bad('Cannot research '+TECH[id].name+' right now (cost, era or already running).');return;}
  if(/\b(advance|next|go to|move to|reach|upgrade to)\b/.test(s)&&/\bera\b/.test(s)){
    const hub=ownHubs(0).find(h=>h.queue.length<5);if(hub&&queueEra(hub)){say('Advancing to the next era.');ok();}else bad('Cannot advance the era right now (needs resources, a Garrison/Armory, and no era already in progress).');return;}
  if(/\bhero\b/.test(s)&&/\b(train|revive|summon|bring|get)\b/.test(s)){const hub=ownHubs(0).find(h=>h.queue.length<5);if(hub&&queueHero(hub)){say('The hero is on the way.');ok();}else bad('Cannot train the hero right now.');return;}
  if(/\b(buy|sell)\b/.test(s)&&(m=s.match(/\b(buy|sell)\s+(\d+)?\s*(ether|crystals?)/))){
    const amt=m[2]?parseInt(m[2]):100,act=(m[1]==='buy'?'buy':'sell')+(m[3]==='ether'?'E':'C');
    if(!hasDone(0,'exchange')){bad('You need an Exchange to use the market.');return;}
    if(mktTrade(0,act,amt)){say((m[1]==='buy'?'Bought ':'Sold ')+amt+' '+m[3]+' at '+G.mkt.p.toFixed(2)+'.');ok();}else bad('Not enough '+(act==='buyE'||act==='sellC'?'crystals':'ether')+' for that trade.');return;}
  if(/\b(call to arms|garrison the workers|shelter the workers|hide the workers)\b/.test(s)){const h=ownHubs(0)[0];if(h){callToArms(0,h);say('Call to Arms toggled at the main Hub.');ok();}return;}
  // build N <building> [at place]
  let bt=null;for(const[t,re]of NL_BUILDINGS)if(re.test(s)){bt=t;break;}
  let ut=null;for(const[t,re]of NL_UNITS)if(re.test(s)){ut=t;break;}
  if(/\b(build|construct|place|erect|put up|raise|add)\b/.test(s)&&bt&&!(ut&&!bt)){
    const n=Math.min(nlCount(s,/(?:[a-z]+\b)/)||1,6),pl=nlPlace(s.replace(/\b(natural|expansion)\b(?=.*\b(hub|build)\b)/,''),env)||{x:ownHubs(0)[0].x,y:ownHubs(0)[0].y,label:'the base'};
    let done=0,why='';
    for(let i=0;i<n;i++){const r=ovBuildAt(bt,pl.x,pl.y);if(r.ok)done++;else{why=r.why;break;}}
    if(done){say('Ordered '+done+' '+BDEF[bt].name+(done>1?'s':'')+' near '+pl.label+'.'+(done<n?' Stopped because '+why+'.':''));ok();}else bad('Cannot build the '+BDEF[bt].name+': '+why+'.');return;}
  if(/\b(train|make|produce|queue|recruit|build|get me|i want)\b/.test(s)&&ut&&!/\b(hire|guard|patrol|mine)\b/.test(s)){
    const n=Math.min(nlCount(s,/(?:[a-z]+\b)/)||1,10),r=ovTrain(ut,n);
    if(r.done){say('Queued '+r.done+' '+UDEF[ut].name+(r.done>1?'s':'')+'.'+(r.done<n?' Stopped: '+r.why+'.':''));ok();}else bad('Cannot train: '+r.why+'.');return;}
  // ------------------------------------------------- assigning roles to units
  const roleWord=(()=>{
    if(/\b(stand down|stand still|stop|halt|cease)\b/.test(s))return'stop';
    if(/\bhold( position)?\b/.test(s)&&!/\bhold (?:at least|\d)/.test(s))return'hold';
    if(/\b(retreat|fall back|pull back|come home|go home|return (?:to )?(?:base|home)|back to base)\b/.test(s))return'retreat';
    if(/\b(let the overseer|auto ?assign|you decide|automatic roles|free choice|back to auto)\b/.test(s))return'auto';
    if(/\b(manual|take control|take back|release (?:them|the selection)|stop autonomy|autonomy (?:off|disabled)|disable autonomy|no autonomy|autonomy for)\b/.test(s)&&/\b(off|disable|no|manual|take|stop|release)\b/.test(s))return'manual';
    if(/\b(enrol\w*|autonomy on|make (?:them )?autonomous|activate)\b/.test(s))return'enroll';
    if(/\b(ether|extract\w*|siphon\w*|geyser)\b/.test(s)&&/\b(mine|gather|harvest|extract|work|send|put|assign|go|collect|get|take)\b|^ ether/.test(s))return'ether';
    if(/\b(patrol)\b/.test(s))return'patrol';
    if(/\b(escort|follow|accompany|protect the hero)\b/.test(s))return'escort';
    if(/\b(scout|explore|recon|survey the map|map the)\b/.test(s))return'scout';
    if(/\b(hunt|clear|farm|kill)\b.*\b(creeps?|camps?|monsters?)\b|\bhunt\b|\bcreep(?:ing)?\b/.test(s))return'hunt';
    if(/\b(attack|assault|raid|push|charge|strike|invade|destroy the enemy|kill the enemy|go kill)\b/.test(s))return'assault';
    if(/\b(guard|defend|protect|secure|man|watch|garrison)\b/.test(s))return'guard';
    if(/\b(heal|medic|tend|support)\b/.test(s)&&!/\bmender\b.*\bhire\b/.test(s))return'medic';
    if(/\b(repair|fix|mechanic)\b/.test(s))return'repair';
    if(/\b(trade|trading|trade routes?)\b/.test(s))return'trade';
    if(/\bbuilders?\b|\bhelp (?:to )?build\b|\bconstruct\w*\b/.test(s))return'build';
    if(/\b(mine|mining|harvest|gather|crystals?|miners?|collect|work)\b/.test(s))return'mine';
    return null;})();
  if(roleWord){
    let near=null;const place=nlPlace(s,env);if(place)near=place;
    let sub=nlSubject(s,env,{near,noUnit:null});
    // default subjects
    if(!sub.pool||!sub.pool.length){
      if(env.sel&&env.sel.length&&!/\b(all|every)\b/.test(s)){sub.pool=env.sel.filter(u=>!u.dead&&u.team===0&&!u.def.hero);sub.label='the selection';}
      else{
        const mine=G.units.filter(u=>!u.dead&&u.team===0&&!u.def.hero);
        const eco=['mine','ether','build','repair'].includes(roleWord),trade=roleWord==='trade',med=roleWord==='medic';
        sub.pool=eco?mine.filter(u=>u.def.worker):trade?mine.filter(u=>u.def.trade):med?mine.filter(u=>u.def.heal):roleWord==='scout'?mine.filter(u=>!u.def.worker&&!u.def.trade&&!u.def.noWeapon&&u.def.speed>=110).slice(0,1).concat(mine.filter(u=>u.def.worker).slice(0,0)):mine.filter(u=>!u.def.worker&&!u.def.trade&&!u.def.noWeapon);
        sub.label=eco?'workers':trade?'freighters':med?'menders':roleWord==='scout'?'a scout':'the army';
        if(n_(num)&&!/\ball\b/.test(s)&&roleWord!=='scout')sub.pool=sub.pool.slice(0,Math.floor(num));
      }}
    let units=sub.pool||[];
    if(roleWord==='mine'&&sub.label==='workers'){/* all workers: fine */}
    if(!units.length){bad('There is nobody to give that order to — select some units, or name them ("4 riflemen", "all workers").');return;}
    if(roleWord==='stop'){for(const u of units){if(u.ag)u.ag.pause=G.time+30;agSet(u,{t:'idle'});u.home={x:u.x,y:u.y};}say(units.length+' units stand down for 30 s.');ok();return;}
    if(roleWord==='hold'){for(const u of units)setOrder(u,{t:'hold'});say(units.length+' units hold position.');ok();return;}
    if(roleWord==='manual'){let k=0;for(const u of units)if(u.ag&&!u.ag.free){agEnroll(u,false);k++;}say(k+' units are back under your direct control.');ok();return;}
    if(roleWord==='auto'){let k=0;for(const u of units){if(!u.ag)agEnroll(u,true);if(u.ag){agAutoMode(u);k++;}}say(k+' units follow the Overseer\'s allocation.');ok();return;}
    if(roleWord==='enroll'){let k=0;for(const u of units)if(agEnroll(u,true))k++;say(k+' units are now autonomous agents.');ok();return;}
    if(roleWord==='retreat'){
      const hub=ownHubs(0)[0];if(!hub){bad('No base to retreat to.');return;}
      const st=stagePt(hub);let k=0;for(const u of units){if(!u.ag)agEnroll(u,true);if(u.ag&&canRole(u,'guard')){agDirect(u,'guard',{x:hub.x,y:hub.y+TILE*4,r:200});k++;}else if(u.ag&&u.def.worker){agDirect(u,'mine',{});k++;}else setOrder(u,{t:'move',x:hub.x,y:hub.y+TILE*4});}
      if(S.bb.assault&&units.some(u=>u.ag&&S.bb.assault.ids&&S.bb.assault.ids.has(u.id)))ovDisband(S,'Assault recalled');
      say(units.length+' units fall back to the base.');ok();return;}
    if(!S.on){bad('The swarm AI is off — say "swarm on" first.');return;}
    // role-specific parameters
    let dir={},extra='';
    if(roleWord==='guard'||roleWord==='assault'||roleWord==='hunt'){
      if(roleWord==='guard'&&place){dir={x:place.x,y:place.y,r:200};extra=' at '+place.label;}
      if(roleWord==='assault'&&place&&place.enemy)extra=' against the enemy base';
    }
    if(roleWord==='patrol'){
      const parts=s.split(/\bbetween\b|\bto\b|\band\b/);let pts=[];
      for(const p of parts){const pl=nlPlace(' '+p+' ',env);if(pl&&!pts.some(q=>q.label===pl.label))pts.push(pl);}
      if(pts.length<2){const main=ownHubs(0)[0],st=stagePt(main),base={x:main.x,y:main.y+TILE*3,label:'the base'},front={x:st.x,y:st.y,label:'the front line'},o=pts[0];
        pts=(!o||o.label==='the base')?[base,front]:[base,o];}
      dir={pts:pts.map(p=>({x:p.x,y:p.y}))};extra=' between '+pts.map(p=>p.label).join(' and ');
    }
    if(roleWord==='escort'){const tgt=(env.sel&&env.sel.find(u=>u.def.hero))||heroUnit(0);if(tgt&&!units.includes(tgt))dir={tid:tgt.id};extra=tgt?' ('+tgt.def.name+')':'';}
    if(roleWord==='scout'&&sub.label==='a scout'&&units.length===0){bad('You have no fast unit to scout with (Raptor, Skiff).');return;}
    if(roleWord==='assault'){
      let k=0;for(const u of units){if(!u.ag)agEnroll(u,true);if(u.ag&&canRole(u,'assault')&&agDirect(u,'assault',dir)){k++;}}
      if(!k){bad('None of those units can fight.');return;}
      ovLaunchAssault(units.filter(u=>u.ag&&u.ag.role==='assault'));
      say(k+' units march on the enemy'+(S.bb.assault?' — target: '+S.bb.assault.tgt.def.name:'')+'.');ok();return;}
    const k=ovAssign(units,roleWord,dir,R,sub.label);
    if(!k){bad('Those units cannot take the role "'+ROLES[roleWord].n+'" ('+ROLES[roleWord].d+').');return;}
    const skipped=units.length-k;
    say(k+' '+(k===1?'agent is':'agents are')+' now '+ROLES[roleWord].ing+extra+'.'+(skipped?' '+skipped+' could not take that role.':''));ok();return;}
  bad('I did not understand "'+c+'". Try: '+NL_EXAMPLES.slice(0,5).map(x=>'"'+x+'"').join(', ')+' — or say "help".');
}
function ovReport(){
  const S=G.sw,T=G.teams[0],bb=S.bb,E=S.eco,cnt={};
  for(const u of S.agents)cnt[u.ag.role]=(cnt[u.ag.role]||0)+1;
  const sm=bb.summary||{},W=E.W;
  const roles=Object.keys(cnt).length?Object.entries(cnt).map(([r,n])=>n+' '+ROLES[r].n.toLowerCase()).join(', '):'no enrolled agents';
  const modes=DOMAINS.map(d=>d.name+' '+S.dom[d.id]).join(' · ');
  const inc=S.ov.inc;
  return 'Treasury '+Math.round(T.c)+'◆ / '+Math.round(T.e)+' ether; mining income '+inc.c.toFixed(1)+'◆/s and '+inc.e.toFixed(1)+' ether/s. '+(sm.workers||0)+' workers, '+(sm.army||0)+' soldiers, '+(sm.free||0)+' freelancers. Agents: '+roles+'. Wage index '+W.v.toFixed(2)+' (mean '+W.mu.toFixed(2)+'). Open jobs: '+E.jobs.filter(j=>j.state==='open').length+'. '+(bb.threat?'THREAT near the base ('+bb.threatN+' enemy supply). ':'')+'Overseer: '+(S.on?modes:'off')+'.';
}
function n_(x){return x;}
