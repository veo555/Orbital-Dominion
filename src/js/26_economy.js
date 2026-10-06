/* =========================================================================
   SWARM ECONOMY (v3)
   - Colony calendar (base-6 ladder) and a stochastic wage index W(t)
     (Ornstein–Uhlenbeck around a mean that rises with labour demand, plus
     Poisson shocks).  Spot cadences (minute / hour) float with W, committed
     cadences (day / month) lock the rate at signing: a genuine hedging choice.
   - Labour market: freelancers are listed, hired on any cadence, billed in
     advance, can default or quit; they are outside supply but capped.
   - Job board: neutral clients with slowly replenishing budgets post escrowed
     jobs (survey, courier, clear, mining bounty) and standing retainers that
     pay by minute / hour / day / month.  Your agents — or freelancers you hire —
     take them; you keep the spread.
   ========================================================================= */
const KAPPA=0.012;                       // wage-index mean reversion speed (1/s): half-life ~58 s
function sgauss(){const r=G.sw.rng;return Math.sqrt(-2*Math.log(Math.max(1e-9,r())))*Math.cos(TAU*r());}
function spick(a){return a[Math.floor(G.sw.rng()*a.length)%a.length];}
function sectorName(x,y){const gx=clamp(Math.floor(x/TILE/8),0,10),gy=clamp(Math.floor(y/TILE/8),0,10);return String.fromCharCode(65+gy)+(gx+1);}
function colonyClock(t){
  t=t===undefined?G.time:t;
  const day=Math.floor(t/PAY.day)+1,h=Math.floor((t%PAY.day)/PAY.hour),m=Math.floor((t%PAY.hour)/PAY.min);
  return{day,h,m,s:Math.floor(t%PAY.min),month:Math.floor(t/PAY.month)+1,txt:'Day '+day+' · '+h+'h '+m+'m'};
}
function econInit(){
  const S=G.sw;S.rng=mulberry32((G.seed^0x77aa51)>>>0);
  S.eco={W:{v:1,mu:1,hist:[1],t:0,shock:0,ev:'',evT:-99},free:[],jobs:[],ctr:[],nid:1,
    clients:CLIENTS.map(c=>({id:c.id,name:c.name,col:c.col,types:c.types,budget:200,rep:50,done:0,failed:0})),
    nextFree:8,nextJob:20,hist:{},stats:{hired:0,quit:0,fired:0,dead:0,jobsDone:0,jobsFailed:0,wages:0,gigIn:0,escrow:0}};
  for(let i=0;i<4;i++)genListing();
}
/* ------------------------------ wage index ----------------------------- */
function wageNow(){return G.sw.eco.W.v;}
function nHired(){let n=0;for(const c of G.sw.eco.ctr)if(c.kind==='hire'&&c.state==='active')n++;return n;}
function wageStep(dt){
  const E=G.sw.eco,W=E.W;
  let open=0;for(const j of E.jobs)if(j.state==='open')open++;
  W.mu=1+0.035*nHired()+0.02*open;
  // Poisson shocks: a boom (+) or a glut (−) that decays with a ~80 s time constant
  if(G.sw.rng()<dt/330){const up=G.sw.rng()<0.5,m=0.16+0.16*G.sw.rng();W.shock+=up?m:-m;W.evT=G.time;W.ev=up?'Labour shortage: wages surge':'Labour glut: wages slump';
    if(SET.swarmHints&&G.time>60)toast(W.ev+' ('+(up?'+':'−')+Math.round(m*100)+'%)',up?'bad':'good');}
  W.shock*=Math.exp(-dt/80);
  W.v+=KAPPA*(W.mu+W.shock-W.v)*dt+0.02*Math.sqrt(dt)*sgauss();
  W.v=clamp(W.v,0.55,1.9);
  W.t+=dt;if(W.t>=3){W.t=0;W.hist.push(W.v);if(W.hist.length>120)W.hist.shift();}
}
/* wage maths ---------------------------------------------------------------*/
function baseWage(type,lvl){const d=UDEF[type];return WAGE_K*Math.sqrt(d.cost.c+1.3*d.cost.e)*(1+SKILL_WAGE*(lvl-1));}   // ◆/s at W=1
function periodPrice(type,lvl,cad,W,ask){const c=CADI[cad];return baseWage(type,lvl)*c.secs*c.mult*W*ask;}
/* expected average of W over a horizon h (seconds) under mean reversion */
function expW(h){const W=G.sw.eco.W,x=KAPPA*h;return W.mu+(W.v-W.mu)*(x<1e-6?1:(1-Math.exp(-x))/x);}
/* total outlay to keep one agent for horizon h on each cadence (billing in advance, whole periods) */
function cadenceTable(type,lvl,ask,h){
  const out=[];
  for(const c of CADS){if(c.id==='task')continue;
    const n=Math.max(1,Math.ceil(h/c.secs)),perP=c.float?periodPrice(type,lvl,c.id,expW(Math.max(c.secs,h)),ask):periodPrice(type,lvl,c.id,wageNow(),ask);
    out.push({cad:c.id,n,period:perP,total:n*perP,perSec:n*perP/h,waste:n*c.secs-h});}
  return out;
}
function bestCadence(type,lvl,ask,h){const t=cadenceTable(type,lvl,ask,h);t.sort((a,b)=>a.total-b.total);return t[0];}
function maxFree(){const T=G.teams[0],hubs=countB(0,'hub',true);return 3+3*(T.era-1)+2*Math.max(0,hubs-1);}
function nFreelancers(){let n=0;for(const u of G.units)if(!u.dead&&u.team===0&&u.ag&&u.ag.free)n++;return n;}
/* ----------------------------- labour market --------------------------- */
function genListing(){
  const E=G.sw.eco,S=G.sw;if(E.free.length>=9)return;
  const era=Math.max(G.teams[0].era,2),pool=FREE_TYPES.filter(f=>f.era<=era);
  let tot=0;for(const f of pool)tot+=f.w;let x=S.rng()*tot,ft=pool[0];for(const f of pool){x-=f.w;if(x<=0){ft=f;break;}}
  const r=S.rng(),lvl=r<0.45?1:r<0.75?2:r<0.92?3:4;
  const used=new Set(E.free.map(l=>l.name));let name;for(let i=0;i<20;i++){name=spick(FREE_NAMES);if(!used.has(name))break;}
  E.free.push({id:E.nid++,name,type:ft.t,lvl,roles:ft.roles,ask:0.86+0.34*S.rng(),rel:0.55+0.45*S.rng(),born:G.time,exp:G.time+150+120*S.rng()});
}
function hireCheck(l,cad){
  const T=G.teams[0];
  if(!l)return'That listing is gone';
  if(UDEF[l.type].era>T.era)return'Requires Era '+ERAS[UDEF[l.type].era].rom;
  if(nFreelancers()>=maxFree())return'Freelancer cap reached ('+maxFree()+')';
  if(!ownHubs(0).length)return'You need a Hub';
  return null;
}
function econHire(lid,cad,o){
  o=o||{};const S=G.sw,E=S.eco,T=G.teams[0],l=E.free.find(x=>x.id===lid);
  const bad=hireCheck(l,cad);if(bad){msg(0,bad);return null;}
  const role=o.role&&l.roles.includes(o.role)?o.role:l.roles[0];
  let price,spec=null;
  if(cad==='task'){
    spec=o.spec;if(!spec){msg(0,'Choose a task first');return null;}
    price=taskPrice(spec,l.lvl,l.ask);
  }else price=periodPrice(l.type,l.lvl,cad,wageNow(),l.ask);
  price=Math.ceil(price);
  if(T.c<price){msg(0,'Not enough crystals ('+price+' needed)');return null;}
  T.c-=price;
  const hub=ownHubs(0)[0],p=spawnPoint(hub,UDEF[l.type]),u=addUnit(l.type,0,p.x,p.y),cid=E.nid++;
  const ag=mkAgent(u,{free:cid,lvl:l.lvl,name:l.name+' ('+UDEF[l.type].name+')',role:cad==='task'?'gig':role});
  ag.dm='set';ag.dir=o.dir||{};ag.rel=l.rel;
  const c={id:cid,kind:'hire',cad,uid:u.id,name:l.name,type:l.type,lvl:l.lvl,ask:l.ask,role,start:G.time,paid:price,missed:0,arrears:0,state:'active',notice:false,
    rate:cad==='task'?price:(CADI[cad].float?0:price),nextDue:cad==='task'?0:G.time+CADI[cad].secs,wHire:wageNow(),jobId:0};
  E.ctr.push(c);E.stats.hired++;
  if(cad==='task'){led('escrow',price);E.stats.escrow+=price;}else{led('wage',price);E.stats.wages+=price;}
  if(cad==='task'){const j=mkJob('me',spec,price);j.state='active';j.t0=G.time;j.deadline=G.time+(spec.dur||240);j.agents=[u.id];j.cad='task';j.hireId=cid;j.title=taskTitle(spec);j.where=spec.camp?{x:spec.camp.x,y:spec.camp.y}:spec.pts?{x:spec.pts[0].x,y:spec.pts[0].y}:null;j.need='any';E.jobs.push(j);c.jobId=j.id;ag.cid=j.id;ag.prev={role,dm:'set',dir:{}};}
  E.free=E.free.filter(x=>x!==l);
  G.fx.push({x:u.x,y:u.y,t:0,max:1,kind:'ring',r:36,col:'#ffe27a'});if(SET.swarmHints||true)sfx('coin');
  uiDirty();return c;
}
function econLeave(u,why){
  if(!u||u.dead)return;
  releaseRes(u);if(u.garr)leaveGarrison(u);
  G.fx.push({x:u.x,y:u.y,t:0,max:0.9,kind:'ring',r:30,col:'#9aa6b8'});
  u.dead=true;u.hp=0;
  if(why&&G.sw.eco)ovLog('labor',why);
  uiDirty();
}
function econFire(cid,now){
  const E=G.sw.eco,c=E.ctr.find(x=>x.id===cid&&x.kind==='hire'&&x.state==='active');if(!c)return false;
  const u=byId(c.uid);
  if(!now){c.notice=true;uiDirty();return true;}
  c.state='fired';E.stats.fired++;
  if(c.jobId){const j=E.jobs.find(x=>x.id===c.jobId);if(j&&j.state==='active')jobFail(j,'Freelancer dismissed');}
  if(u&&!u.dead)econLeave(u,c.name+' was dismissed');
  uiDirty();return true;
}
function econUnitDied(u){
  const E=G.sw.eco;if(!E)return;
  const ag=u.ag;
  if(ag.free){const c=E.ctr.find(x=>x.id===ag.free&&x.state==='active');if(c){c.state='dead';E.stats.dead++;ovLog('labor',c.name+' fell in service');if(c.jobId){const j=E.jobs.find(x=>x.id===c.jobId);if(j&&j.state==='active')jobFail(j,'Contractor lost');}}}
  if(ag.cid)econDropAgent(u);
}
function payrollStep(){
  const S=G.sw,E=S.eco,T=G.teams[0];
  for(const c of E.ctr){
    if(c.kind!=='hire'||c.state!=='active'||c.cad==='task')continue;
    const u=byId(c.uid);if(!u||u.dead){if(c.state==='active')c.state='dead';continue;}
    if(G.time<c.nextDue)continue;
    const cd=CADI[c.cad];
    if(c.notice){c.state='expired';econLeave(u,c.name+' completed the contract and left');continue;}
    const due=(cd.float?periodPrice(c.type,c.lvl,c.cad,wageNow(),c.ask):periodPrice(c.type,c.lvl,c.cad,wageNow(),c.ask));  // locked contracts renew at the then-current index
    const owe=due+c.arrears;
    if(T.c>=owe){
      T.c-=owe;c.paid+=owe;c.arrears=0;c.missed=0;c.nextDue+=cd.secs;c.rate=due;
      led('wage',owe);E.stats.wages+=owe;if(u.ag)u.ag.cost+=owe;
      G.fx.push({x:u.x,y:u.y-16,t:0,max:1.2,kind:'text',txt:'-'+Math.round(owe),col:'#ff9a7a'});
    }else{
      c.arrears=owe;c.missed++;c.nextDue+=cd.secs;
      if(c.missed===1){if(SET.swarmHints)toast(c.name+' was not paid ('+Math.round(owe)+'◆ overdue). One more missed period and they walk.','bad');}
      if(c.missed>=2){c.state='quit';E.stats.quit++;econLeave(u,c.name+' quit over unpaid wages');if(c.jobId){const j=E.jobs.find(x=>x.id===c.jobId);if(j&&j.state==='active')jobFail(j,'Contractor quit');}}
    }
  }
  // housekeeping: drop old closed contracts
  if(E.ctr.length>60){E.ctr=E.ctr.filter(c=>c.state==='active'||G.time-(c.endT||c.start)<600);}
  for(const c of E.ctr)if(c.state!=='active'&&!c.endT)c.endT=G.time;
}
/* --------------------------------- jobs -------------------------------- */
function taskPrice(spec,lvl,ask){
  const W=wageNow(),k=ask*(1+0.1*(lvl-1))*W;
  switch(spec.t){
    case'mine':return spec.n*0.50*k;
    case'ether':return spec.n*0.62*k;
    case'build':return(18+BDEF[spec.b].time*1.1)*k;
    case'survey':return(30+spec.len*0.16)*k;
    case'clear':return(50+55*spec.lvl)*0.6*k;}
  return 50*k;
}
function taskTitle(sp){
  switch(sp.t){case'mine':return'Mine '+sp.n+' crystals';case'ether':return'Extract '+sp.n+' ether';case'build':return'Build a '+BDEF[sp.b].name;
    case'survey':return'Survey '+sp.pts.map(p=>sectorName(p.x,p.y)).join(' · ');case'clear':return'Clear the level-'+sp.lvl+' camp at '+sectorName(sp.camp.x,sp.camp.y);}
  return'Task';}
function mkJob(client,spec,pay){
  const E=G.sw.eco;
  return{id:E.nid++,client,type:spec.jt||spec.t,spec,pay:Math.round(pay),state:'open',created:G.time,expire:G.time+140+80*G.sw.rng(),agents:[],prog:0,cad:'task',t0:0,deadline:0,onT:0,tT:0,paidTotal:0,nextDue:0,rate:0,period:0,hist:0};
}
function routeDanger(pts,from){
  let dng=0,x=from.x,y=from.y;const camps=G.camps.filter(c=>c._alive);
  const seg=(ax,ay,bx,by)=>{const n=Math.max(1,Math.ceil(hyp(bx-ax,by-ay)/120));
    for(let i=0;i<=n;i++){const px=ax+(bx-ax)*i/n,py=ay+(by-ay)*i/n;for(const c of camps){const d=hyp(c.x-px,c.y-py);if(d<280)dng=Math.max(dng,c.lvl*(1-d/280));}}};
  for(const p of pts){seg(x,y,p.x,p.y);x=p.x;y=p.y;}
  return dng;
}
function riskLabel(r){return r<0.25?'low':r<0.8?'medium':'high';}
function routeLen(pts,from){let L=0,x=from.x,y=from.y;for(const p of pts){L+=hyp(p.x-x,p.y-y);x=p.x;y=p.y;}L+=hyp(from.x-x,from.y-y);return L/TILE;}
function genJob(){
  const S=G.sw,E=S.eco,T=G.teams[0],hub=ownHubs(0)[0];if(!hub)return;
  let open=0;for(const j of E.jobs)if(j.state==='open'&&j.client!=='me')open++;if(open>=7)return;
  const cl=spick(E.clients.filter(c=>c.budget>60));if(!cl)return;
  const jt=spick(cl.types),W=wageNow(),repM=1+0.004*(cl.rep-50);
  const cells=bbCells(S).filter(c=>c.reach&&!c.base&&hyp(c.x-hub.x,c.y-hub.y)>700&&hyp(c.x-hub.x,c.y-hub.y)<2300);
  let job=null;
  if(jt==='survey'&&cells.length>=3){
    let pts=null,bd=9;
    for(let tries=0;tries<8;tries++){const cand=[],used=[];
      for(let k=0;k<3;k++){const c=spick(cells);if(used.includes(c))continue;used.push(c);cand.push({x:c.x,y:c.y,done:false});}
      if(cand.length<2)continue;const d=routeDanger(cand,hub);if(d<bd){bd=d;pts=cand;}if(d<0.2)break;}
    if(!pts)return;
    const len=routeLen(pts,hub);
    job=mkJob(cl.id,{jt:'survey',t:'survey',pts,len},(40+len*0.5)*(1+0.35*bd)*W*repM);job.where={x:pts[0].x,y:pts[0].y};job.risk=bd;
    job.title='Survey '+pts.map(p=>sectorName(p.x,p.y)).join(' · ');job.dur=Math.max(90,len*TILE/110*1.5);job.need='any';
  }else if(jt==='courier'){
    const posts=G.neutrals.filter(n=>(n.type==='post'||n.type==='tower')&&hyp(n.x-hub.x,n.y-hub.y)>800&&hyp(n.x-hub.x,n.y-hub.y)<2500);
    if(!posts.length)return;let B=null,bd=9;const A={x:hub.x,y:hub.y+TILE*3.2};
    for(const p of posts){const d=routeDanger([{x:p.x,y:p.y}],A);if(d<bd){bd=d;B=p;}}
    if(!B)return;const len=pathLength(A.x,A.y,B.x,B.y);
    job=mkJob(cl.id,{jt:'courier',t:'courier',A,B:{x:B.x,y:B.y},ph:0,len},(30+len*0.62)*(1+0.35*bd)*W*repM);job.where={x:B.x,y:B.y};job.risk=bd;
    job.title='Courier: Hub → '+(B.type==='post'?'Trading Post ':'Watchtower ')+sectorName(B.x,B.y);job.dur=Math.max(80,len*TILE/90*1.6);job.need='any';
  }else if(jt==='clear'){
    const camps=G.camps.filter(c=>c._alive&&hyp(c.x-hub.x,c.y-hub.y)<2100&&!E.jobs.some(j=>j.state!=='done'&&j.spec.camp===c));
    if(!camps.length)return;const c=spick(camps);
    job=mkJob(cl.id,{jt:'clear',t:'clear',camp:c,lvl:c.lvl},(50+55*c.lvl)*W*repM);job.where={x:c.x,y:c.y};job.risk=c.lvl*0.8;
    job.title='Clear the level-'+c.lvl+' camp at '+sectorName(c.x,c.y);job.dur=210;job.need='armed';
  }else if(jt==='quota'){
    const n=Math.round((120+S.rng()*180)/10)*10;
    job=mkJob(cl.id,{jt:'quota',t:'mine',n,res:'c'},n*0.42*W*repM);job.title='Mining bounty: '+n+' crystals';job.dur=Math.round(n/1.2/10)*10+60;job.need='worker';
  }else if(jt==='station'||jt==='relay'){
    const posts=G.neutrals.filter(n=>(n.type==='post'||n.type==='tower')&&hyp(n.x-hub.x,n.y-hub.y)<2500);if(!posts.length)return;
    const B=spick(posts),isG=jt==='station',base=(isG?0.20:0.15)*W*repM;
    job=mkJob(cl.id,{jt,t:jt,x:B.x,y:B.y,r:190},0);job.base=base;job.where={x:B.x,y:B.y};job.cad='';job.retainer=true;
    job.title=(isG?'Guard retainer — ':'Relay retainer — ')+(B.type==='post'?'Post ':'Tower ')+sectorName(B.x,B.y);job.need=isG?'armed':'any';job.pay=0;job.dur=0;
    job.reserve=base*PAY.hour*1.5;
  }
  if(!job)return;
  const cost=job.retainer?job.reserve:job.pay;
  if(cl.budget<cost){return;}
  cl.budget-=cost;job.escrow=cost;job.clientObj=cl;
  E.jobs.push(job);
}
function jobRates(j){ // retainer rate table per cadence (what the client pays at the end of each period)
  const out={};for(const c of CADS){if(c.id==='task')continue;out[c.id]={period:j.base*c.secs*c.mult,secs:c.secs,hazard:c.id==='min'?0.04:c.id==='hour'?0.12:0};}
  return out;
}
function jobEligible(u,j){
  if(!u.ag||u.dead||u.def.hero)return false;
  if(j.need==='armed')return canRole(u,'guard');
  if(j.need==='worker')return !!u.def.worker;
  return true;
}
function econAccept(jid,units,cad){
  const S=G.sw,E=S.eco,j=E.jobs.find(x=>x.id===jid);
  if(!j||j.state!=='open'){msg(0,'That job is no longer open');return false;}
  const act=E.jobs.filter(x=>x.state==='active'&&x.client!=='me').length;if(act>=8){msg(0,'Too many active jobs');return false;}
  const us=(units||[]).filter(u=>jobEligible(u,j)&&!u.ag.cid);
  if(!us.length){msg(0,j.need==='armed'?'Needs an armed, enrolled agent':j.need==='worker'?'Needs an enrolled worker':'Select an enrolled agent first');return false;}
  if(j.retainer){
    if(!cad||cad==='task'||!CADI[cad]){msg(0,'Choose a billing cadence');return false;}
    const r=jobRates(j)[cad];j.cad=cad;j.period=r.secs;j.rate=r.period;j.hazard=r.hazard;j.nextDue=G.time+r.secs;
  }else{j.deadline=G.time+j.dur;}
  j.state='active';j.t0=G.time;
  const take=j.type==='clear'?us:us.slice(0,j.type==='quota'?4:j.retainer?2:1);
  for(const u of take){const ag=u.ag;if(ag.role!=='gig')ag.prev={role:ag.role,dm:ag.dm,dir:ag.dir};ag.role='gig';ag.cid=j.id;ag.manual=false;ag.st='';ag.sc=null;j.agents.push(u.id);if(u.order.t!=='idle')agSet(u,{t:'idle'});}
  ovLog('labor','Accepted: '+j.title+(j.retainer?' ('+CADI[cad].name+' billing)':''));
  uiDirty();return true;
}
function econDropAgent(u){
  const E=G.sw&&G.sw.eco;if(!E||!u.ag)return;const ag=u.ag,jid=ag.cid;ag.cid=0;
  const j=E.jobs.find(x=>x.id===jid);
  if(j){const i=j.agents.indexOf(u.id);if(i>=0)j.agents.splice(i,1);
    if(!j.agents.length&&j.state==='active'){
      if(j.client==='me')jobFail(j,'No contractor left');
      else if(j.retainer)jobEnd(j,'Retainer ended: no agent on station');
      else{j.state='open';j.expire=Math.max(j.expire,G.time+60);}}}
  if(ag.role==='gig'){const p=ag.prev;ag.role=p&&canRole(u,p.role)?p.role:agDefaultRole(u);ag.dm=p?p.dm:'auto';ag.dir=p?p.dir:{};ag.prev=null;ag.roleT=G.time;}
}
function econDelivered(u,n,type){
  const E=G.sw.eco,j=E.jobs.find(x=>x.id===u.ag.cid);if(!j||j.state!=='active')return;
  if(j.spec.t==='mine'&&type==='c'&&j.spec.res==='c')j.prog+=n;
  else if(j.spec.t==='ether'&&type==='e')j.prog+=n;
}
function jobDone(j){
  const S=G.sw,E=S.eco,T=G.teams[0];if(j.state!=='active')return;
  j.state='done';E.stats.jobsDone++;
  if(j.client==='me'){
    // paid out of escrow to the contractor, who then leaves
    ovLog('labor','Task complete: '+j.title+' — contractor paid '+j.pay+'◆');
    const c=E.ctr.find(x=>x.id===j.hireId);if(c){c.state='done';c.paid=j.pay;}
    for(const id of j.agents){const u=byId(id);if(u&&!u.dead){u.ag.tasks++;agXP(u,30);u.ag.cid=0;econLeave(u);}}
  }else{
    const cl=j.clientObj||E.clients.find(c=>c.id===j.client);
    T.c+=j.pay;led('gig',j.pay);E.stats.gigIn+=j.pay;cl.rep=Math.min(100,cl.rep+4);cl.done++;
    G.fx.push({x:j.where?j.where.x:0,y:j.where?j.where.y-20:0,t:0,max:1.8,kind:'text',txt:'+'+j.pay,col:'#ffd45a'});
    ovLog('labor','Job complete: '+j.title+' (+'+j.pay+'◆)');if(SET.swarmHints)toast('Job complete: '+j.title+'  +'+j.pay+'◆','good');sfx('coin');
    const share=j.pay/Math.max(1,j.agents.length);
    for(const id of j.agents){const u=byId(id);if(!u||u.dead)continue;u.ag.tasks++;u.ag.earned+=share;agXP(u,40);agCommission(u,share);econReleaseFromJob(u,j);}
  }
  j.agents=[];
}
function econReleaseFromJob(u,j){
  const ag=u.ag;ag.cid=0;const p=ag.prev;
  ag.role=p&&canRole(u,p.role)?p.role:agDefaultRole(u);ag.dm=p?p.dm:'auto';ag.dir=p?p.dir:{};ag.prev=null;ag.roleT=G.time;ag.sc=null;ag.why='';
  if(u.order.t!=='idle')agSet(u,{t:'idle'});
}
function jobFail(j,why){
  const S=G.sw,E=S.eco,T=G.teams[0];if(j.state==='done'||j.state==='failed')return;
  j.state='failed';E.stats.jobsFailed++;
  if(j.client==='me'){T.c+=j.pay;led('escrow',-j.pay);ovLog('labor','Task failed ('+why+'): '+j.title+' — escrow refunded');}
  else{const cl=j.clientObj||E.clients.find(c=>c.id===j.client);if(cl){cl.budget+=j.escrow||0;cl.rep=Math.max(0,cl.rep-8);cl.failed++;}
    ovLog('labor','Job failed ('+why+'): '+j.title);if(SET.swarmHints)toast('Job failed: '+j.title+' — '+why,'bad');}
  for(const id of j.agents){const u=byId(id);if(u&&!u.dead&&u.ag.cid===j.id&&!(u.ag.free&&j.client==='me'))econReleaseFromJob(u,j);}
  j.agents=[];
}
function jobEnd(j,why){ // graceful end of a retainer
  const E=G.sw.eco;if(j.state!=='active')return;j.state='ended';
  const cl=j.clientObj;if(cl)cl.budget+=Math.max(0,(j.escrow||0)-j.paidTotal);
  ovLog('labor',why+': '+j.title+' (earned '+Math.round(j.paidTotal)+'◆)');
  for(const id of j.agents){const u=byId(id);if(u&&!u.dead&&u.ag.cid===j.id)econReleaseFromJob(u,j);}
  j.agents=[];
}
function jobCancel(jid){ // the player abandons a job
  const E=G.sw.eco,j=E.jobs.find(x=>x.id===jid);if(!j||j.state!=='active')return false;
  if(j.retainer){jobEnd(j,'Retainer cancelled');return true;}
  jobFail(j,'cancelled');return true;
}
function jobsStep(dt){
  const S=G.sw,E=S.eco,T=G.teams[0];
  for(const j of E.jobs){
    if(j.state==='open'){if(G.time>j.expire){j.state='expired';const cl=j.clientObj;if(cl)cl.budget+=j.escrow||0;}continue;}
    if(j.state!=='active')continue;
    // drop dead / missing agents
    for(let i=j.agents.length-1;i>=0;i--){const u=byId(j.agents[i]);if(!u||u.dead||(u.ag&&u.ag.cid!==j.id))j.agents.splice(i,1);}
    if(!j.agents.length){
      if(j.client==='me')jobFail(j,'contractor lost');
      else if(j.retainer)jobEnd(j,'Retainer ended: no agent on station');
      else{j.state='open';j.expire=Math.max(j.expire,G.time+60);}
      continue;}
    const us=j.agents.map(byId).filter(Boolean),sp=j.spec;
    if(j.retainer){
      j.tT+=dt;let on=false;for(const u of us)if(hyp(u.x-sp.x,u.y-sp.y)<sp.r){on=true;break;}if(on)j.onT+=dt;
      if(G.time>=j.nextDue){
        const frac=j.tT>0?j.onT/j.tT:0,cl=j.clientObj,full=j.rate;
        let pay=frac>=0.7?full:frac>=0.4?full*frac:0;pay=Math.min(pay,cl.budget+Math.max(0,(j.escrow||0)-j.paidTotal));
        if(pay>0.01){
          const fromEsc=Math.min(pay,Math.max(0,j.escrow-j.paidTotal));const rest=pay-fromEsc;if(rest>0)cl.budget-=rest;
          j.paidTotal+=pay;T.c+=pay;led('gig',pay);E.stats.gigIn+=pay;
          const share=pay/Math.max(1,us.length);for(const u of us){u.ag.earned+=share;agCommission(u,share);}
          G.fx.push({x:sp.x,y:sp.y-20,t:0,max:1.4,kind:'text',txt:'+'+Math.round(pay),col:'#ffd45a'});if(CADI[j.cad].secs>=60)sfx('coin');
        }
        if(frac<0.4){cl.rep=Math.max(0,cl.rep-3);}
        j.tT=0;j.onT=0;j.nextDue+=j.period;
        if(cl.budget<j.rate&&j.escrow-j.paidTotal<j.rate){jobEnd(j,'Client ran out of budget');continue;}
        if(j.hazard&&G.sw.rng()<j.hazard){jobEnd(j,'Client terminated the retainer');continue;}
      }
      continue;}
    if(j.deadline&&G.time>j.deadline){jobFail(j,'deadline missed');continue;}
    switch(sp.t){
      case'survey':{for(const p of sp.pts){if(p.done)continue;for(const u of us)if(hyp(u.x-p.x,u.y-p.y)<90){p.done=true;j.prog++;G.fx.push({x:p.x,y:p.y,t:0,max:1,kind:'ring',r:40,col:'#a8e6ff'});break;}}
        if(sp.pts.every(p=>p.done))jobDone(j);break;}
      case'courier':{const u=us[0];
        if(sp.ph===0&&hyp(u.x-sp.A.x,u.y-sp.A.y)<80)sp.ph=1;
        if(sp.ph===1&&hyp(u.x-sp.B.x,u.y-sp.B.y)<80)jobDone(j);break;}
      case'clear':{if(!campAlive(sp.camp))jobDone(j);break;}
      case'mine':case'ether':{if(j.prog>=sp.n)jobDone(j);break;}
      case'build':{const b=G.buildings.find(x=>!x.dead&&x.team===0&&x.tx===sp.tx&&x.ty===sp.ty&&x.type===sp.b);if(b&&b.done)jobDone(j);break;}
    }
  }
  if(E.jobs.length>40)E.jobs=E.jobs.filter(j=>j.state==='open'||j.state==='active'||G.time-(j.endT||G.time)<240);
  for(const j of E.jobs)if(j.state!=='open'&&j.state!=='active'&&!j.endT)j.endT=G.time;
}
/* execution of a job by an assigned agent (called from the brain) */
function econRunGig(u,ag,S){
  const E=S.eco,j=E.jobs.find(x=>x.id===ag.cid);
  if(!j||j.state!=='active'){ag.cid=0;const p=ag.prev;ag.role=p&&canRole(u,p.role)?p.role:agDefaultRole(u);ag.dm=p?p.dm:'auto';ag.dir=p?p.dir:{};ag.prev=null;return;}
  const sp=j.spec,o=u.order;ag.why=j.title;
  switch(sp.t){
    case'survey':{
      if(o.t==='move'&&o.jb===j.id&&!sp.pts.find(p=>p.x===o.x&&p.y===o.y&&p.done))return;
      let best=null,bd=1e9;for(const p of sp.pts){if(p.done)continue;const d=hyp(p.x-u.x,p.y-u.y);if(d<bd){bd=d;best=p;}}
      if(best)agSet(u,{t:'move',x:best.x,y:best.y,jb:j.id});break;}
    case'courier':{const T=sp.ph===0?sp.A:sp.B;if(o.t==='move'&&o.jb===j.id&&o.x===T.x&&o.y===T.y)return;agSet(u,{t:'move',x:T.x,y:T.y,jb:j.id});break;}
    case'clear':{if(!sp.camp._alive&&!campAlive(sp.camp))return;
      if(o.t==='attackmove'&&Math.abs(o.x-sp.camp.x)<30)return;
      if(u.hp<u.maxhp*0.35){ag.why='Retreating (hurt) — '+j.title;}
      agSet(u,{t:'attackmove',x:sp.camp.x,y:sp.camp.y,gs:0});break;}
    case'mine':runMine(u,ag,S,'crystal');ag.why=j.title+' ('+Math.round(j.prog)+'/'+sp.n+')';break;
    case'ether':runMine(u,ag,S,'geyser');ag.why=j.title+' ('+Math.round(j.prog)+'/'+sp.n+')';break;
    case'build':{
      if(o.t==='build')return;
      const T=G.teams[0],d=BDEF[sp.b];
      if(!canPlace(0,sp.b,sp.tx,sp.ty,true)){const b=G.buildings.find(x=>!x.dead&&x.team===0&&x.tx===sp.tx&&x.ty===sp.ty&&x.type===sp.b);
        if(b&&!b.done){agSet(u,{t:'build',type:b.type,tx:b.tx,ty:b.ty,paid:false,st:'go',bld:b,after:null});}
        else if(!b)jobFail(j,'site blocked');break;}
      if(!agDo(()=>orderBuild(u,sp.b,sp.tx,sp.ty)))ag.why='Waiting for '+d.name+' funds';break;}
    case'station':case'relay':{
      if(hyp(u.x-sp.x,u.y-sp.y)>sp.r*0.5){if(o.t!=='move'&&o.t!=='attackmove'||hyp(o.x-sp.x,o.y-sp.y)>40)agSet(u,{t:'attackmove',x:sp.x+(u.id%5-2)*24,y:sp.y+(u.id%3-1)*24,gs:0});}
      else ag.why=j.title+' — on station';
      break;}
  }
}
/* -------------------------------- stepping ----------------------------- */
function econStep(dt){
  const S=G.sw,E=S.eco;if(!E)return;
  wageStep(dt);
  for(const c of E.clients)c.budget=Math.min(600,c.budget+0.4*dt);
  const W=wageNow();
  if(G.time>=E.nextFree){genListing();E.nextFree=G.time+(9+16*S.rng())*(1+0.4*(W-1));}
  E.free=E.free.filter(l=>G.time<l.exp);
  if(G.time>=E.nextJob){genJob();E.nextJob=G.time+20+30*S.rng();}
  if(G.tick%3===0)jobsStep(dt*3);
  if(G.tick%10===0)payrollStep();
  // ledger buckets: one per colony hour
  S.ledAcc=(S.ledAcc||0)+dt;
  if(S.ledAcc>=PAY.hour){S.ledAcc=0;S.ledT.push(Object.assign({t:G.time},S.ledNow));S.ledNow={};if(S.ledT.length>40)S.ledT.shift();}
}
