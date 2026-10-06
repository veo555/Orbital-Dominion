/* =========================================================================
   SWARM UI (v3) — the Swarm panel (Overseer · Roster · Market · Ledger),
   the plain-language command box, role assignment, agent info cards and the
   map overlays for agents.
   ========================================================================= */
const swui={tab:'ov',mk:'hire',hist:[],hi:-1,filter:'all',horizon:300,hireRole:{},taskFor:null,sig:'',force:true,tipOwn:false,outSig:''};
const swEsc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const swR0=v=>Math.round(v);
const swR1=v=>(Math.round(v*10)/10).toFixed(1);
const swDomName=id=>{const d=DOMAINS.find(x=>x.id===id);return d?d.name:id==='ov'?'Overseer':id;};
function swDirty(){swui.force=true;swui.hud=true;}
function swReset(){
  swui.tab='ov';swui.mk='hire';swui.taskFor=null;swui.sig='';swui.force=true;swui.outSig='';swui.hi=-1;swui.tipOwn=false;
  const p=$('swPanel');if(p)p.classList.add('hidden');
  const b=$('swBody');if(b)b.dataset.h='';
  const o=$('swOut');if(o){o.innerHTML='';o.dataset.h='';}
  const i=$('swIn');if(i){i.value='';i.blur();}
}
function swMode(){
  const S=G.sw;if(!S||!S.on)return'Off';
  const P=S.pol,ms=DOMAINS.map(d=>S.dom[d.id]);
  if(ms.every(m=>m==='act')&&P.autoEnroll)return'Autopilot';
  if(ms.every(m=>m==='advise')&&!P.autoEnroll)return'Advisor';
  return'Custom';
}
function swToggleMaster(){
  const S=G.sw;if(!S)return;
  if(S.on){ovPreset('manual');toast('Swarm AI off — units follow only your plain orders','good');}
  else{S.on=true;ovLog('ov','Swarm AI switched on ('+swMode()+')');toast('Swarm AI on — '+swMode(),'good');}
  sfx('click');swDirty();
}
function swEnv(){
  return{sel:ownUnits(),cam:{x:cam.x+VW/cam.z/2,y:cam.y+(TOPBAR+(VH-BOTTOM-TOPBAR)/2)/cam.z},group:n=>groupEntities(n).filter(e=>e.kind==='unit')};
}
function swAgents(){return G.sw.agents.filter(u=>!u.dead&&u.ag&&(u.ag.auto||u.ag.free));}
function swFocus(){
  if(ui.panel!=='swarm')togglePanel('swarm');
  const i=$('swIn');if(i){i.focus();}
}
function swSend(text){
  text=String(text||'').trim();if(!text||!G||!G.sw)return null;
  if(swui.hist[swui.hist.length-1]!==text)swui.hist.push(text);if(swui.hist.length>40)swui.hist.shift();swui.hi=-1;
  const r=ovCommand(text,swEnv());
  sfx(r.fail?'err':'ack');swOut();swDirty();
  if(ui.panel!=='swarm')toast(r.say.length>150?r.say.slice(0,147)+'…':r.say,r.fail?'bad':'good');
  return r;
}
function swOut(){
  const S=G.sw,el=$('swOut');if(!el||!S)return;
  const L=(S.cmdLog||[]).slice(-4),sig=L.length+'|'+(L.length?L[L.length-1].a:'');
  if(sig===swui.outSig)return;swui.outSig=sig;
  el.innerHTML=L.length?L.map(e=>'<div class="sq">'+swEsc(e.q)+'</div><div class="sa'+(e.ok?'':' bad')+'">'+swEsc(e.a)+'</div>').join(''):
    '<div class="sa dim">Give plain orders to the selection, to a group (“group 2 patrol the natural”) or to the whole colony. Try one of these:</div>';
  el.scrollTop=el.scrollHeight;
}

/* ---------------------------- role assignment --------------------------- */
const SW_POINT_ROLES={guard:'Guard here',patrol:'Patrol to here',escort:'Click a friendly unit to escort'};
function swTargetLabel(kind){return kind&&kind.startsWith('role:')?SW_POINT_ROLES[kind.slice(5)]||'Assign':null;}
function swRoleUnits(role){return ownUnits().filter(u=>!u.def.hero&&!u.def.creep&&canRole(u,role));}
function swEnsureOn(){const S=G.sw;if(!S.on){S.on=true;toast('Swarm AI switched on','good');swDirty();}}
function swAssignRole(role){
  const S=G.sw,us=swRoleUnits(role);
  if(!us.length){toast('None of the selected units can take the role “'+ROLES[role].n+'”','bad');sfx('err');return false;}
  swEnsureOn();
  if(SW_POINT_ROLES[role]){ui.target={kind:'role:'+role};ui.place=null;sfx('click');return true;}
  for(const u of us)if(!u.ag)agEnroll(u,true);
  if(role==='assault'){
    let k=0;for(const u of us)if(u.ag&&agDirect(u,'assault',{}))k++;
    const ok=ovLaunchAssault(us.filter(u=>u.ag&&u.ag.role==='assault'));
    toast(ok?k+' raiders march on the enemy base':'No enemy structure known to attack yet',ok?'good':'bad');
  }else{
    const k=ovAssign(us,role,{});toast(k+' '+(k===1?'agent is':'agents are')+' now '+ROLES[role].ing,'good');
  }
  sfx('ack');uiDirty();swDirty();return true;
}
function swApplyRole(role,wx,wy,shift){
  const us=swRoleUnits(role);if(!us.length)return;swEnsureOn();
  if(role==='guard'){
    for(const u of us){if(!u.ag)agEnroll(u,true);if(u.ag)agDirect(u,'guard',{x:wx,y:wy,r:200});}
    ping(wx,wy,'#7cd0ff');toast(us.length+' guard'+(us.length===1?'':'s')+' take position','good');
  }else if(role==='patrol'){
    const cx=us.reduce((s,u)=>s+u.x,0)/us.length,cy=us.reduce((s,u)=>s+u.y,0)/us.length;
    for(const u of us){if(!u.ag)agEnroll(u,true);if(u.ag)agDirect(u,'patrol',{pts:[{x:cx,y:cy},{x:wx,y:wy}]});}
    ping(wx,wy,'#8fe0c0');toast(us.length+' on patrol between here and there','good');
  }else if(role==='escort'){
    const e=entityAt(wx,wy);
    if(!e||e.kind!=='unit'||e.team!==0||us.includes(e)){toast('Click a friendly unit to escort','bad');ui.target={kind:'role:escort'};sfx('err');return;}
    for(const u of us){if(!u.ag)agEnroll(u,true);if(u.ag)agDirect(u,'escort',{tid:e.id});}
    ping(e.x,e.y,'#c8b0ff');toast(us.length+' escorting '+e.def.name,'good');
  }
  sfx('ack');uiDirty();swDirty();
  if(shift&&SW_POINT_ROLES[role])ui.target={kind:'role:'+role};
}
function swAutoMode(units){
  const S=G.sw;let k=0;swEnsureOn();
  for(const u of units){if(u.def.hero||u.def.creep)continue;if(!u.ag)agEnroll(u,true);if(u.ag){agAutoMode(u);k++;}}
  toast(k+' unit'+(k===1?'':'s')+' now follow the Overseer','good');sfx('ack');uiDirty();swDirty();
}
function swEnrollToggle(units){
  const S=G.sw,cand=units.filter(u=>!u.def.hero&&!u.def.creep&&u.team===0);if(!cand.length)return;
  const allIn=cand.every(u=>u.ag&&u.ag.auto);
  if(allIn){for(const u of cand)agEnroll(u,false);toast(cand.length+' unit'+(cand.length===1?'':'s')+' back under your direct control','good');}
  else{swEnsureOn();let k=0;for(const u of cand)if(agEnroll(u,true))k++;toast((k===1?'1 unit is now an autonomous agent':k+' units are now autonomous agents')+(SET.swarmHints&&!S.toldRole?' — press F to give a role':''),'good');S.toldRole=1;}
  sfx('click');uiDirty();swDirty();
}

/* ------------------------------ panel render ---------------------------- */
function swSeg(act,cur,opts){return'<div class="seg sm">'+opts.map(o=>'<button data-act="'+act+':'+o[0]+'" class="'+(String(cur)===String(o[0])?'sel':'')+'">'+o[1]+'</button>').join('')+'</div>';}
function swTg(act,on,label,tip){return'<button class="tg'+(on?' on':'')+'" data-act="'+act+'"'+(tip?' data-tip="'+swEsc(tip)+'"':'')+'><i></i>'+label+'</button>';}
const swTipd=(t,d)=>'<b>'+t+'</b><div class=\'d\'>'+d+'</div>';
function swClk(t){return colonyClock(t).txt;}
function swRender(){
  const host=$('swPanel');if(!host)return;
  if(ui.panel!=='swarm'||!G||!G.sw){host.classList.add('hidden');return;}
  host.classList.remove('hidden');
  const S=G.sw;
  $('swSub').textContent=swMode()+' · '+swClk(G.time);
  const pw=$('swPwr');pw.textContent=S.on?'AI on':'AI off';pw.classList.toggle('ok',S.on);pw.classList.toggle('bad',!S.on);
  // tabs
  const E=S.eco,nOpen=E.jobs.filter(j=>j.state==='open'&&j.client!=='me').length+E.free.length,nAg=swAgents().length;
  const tabs=[['ov','Overseer',S.props.length],['ro','Roster',nAg],['mk','Market',nOpen],['lg','Ledger',0]];
  const th=tabs.map(t=>'<button data-act="tab:'+t[0]+'" class="'+(swui.tab===t[0]?'sel':'')+'">'+t[1]+(t[2]?'<i style="'+(t[0]==='ov'?'':'background:#2d5f93;color:#fff')+'">'+t[2]+'</i>':'')+'</button>').join('');
  const tb=$('swTabs');if(tb.dataset.h!==th){tb.innerHTML=th;tb.dataset.h=th;}
  const ex=$('swEx');if(!ex.dataset.h){ex.innerHTML=NL_EXAMPLES.map((e,i)=>'<button data-act="ex:'+i+'">'+swEsc(e)+'</button>').join('');ex.dataset.h='1';}
  swOut();
  let h='';
  try{h=swui.tab==='ov'?swOverseer():swui.tab==='ro'?swRoster():swui.tab==='mk'?swMarket():swLedger();}
  catch(err){h='<div class="sec bad">UI error: '+swEsc(err.message)+'</div>';console.error(err);}
  const body=$('swBody'),tk=swui.tab+(swui.tab==='mk'?swui.mk:'');
  if(body.dataset.h!==h||swui.force){const sc=swui.lastTab===tk?body.scrollTop:0;body.innerHTML=h;body.dataset.h=h;body.scrollTop=sc;swui.lastTab=tk;}
  swui.force=false;
  swCanvases();swRetip();
}
function swRetip(){
  if(!swui.tipOwn)return;
  const el=document.elementFromPoint(ui.mx,ui.my),n=el&&el.closest?el.closest('#swPanel [data-tip]'):null;
  if(n)showTipHTML(n.dataset.tip,n.getBoundingClientRect());else{hideTip();swui.tipOwn=false;}
}

/* --------------------------------- Overseer ----------------------------- */
function swOverseer(){
  const S=G.sw,P=S.pol,O=S.ov,T=G.teams[0],E=S.eco,mode=swMode(),bb=S.bb,sm=bb.summary||{};
  let h='';
  h+='<div class="sec"><div class="seg pre">'+[['autopilot','Autopilot','acts on everything'],['advisor','Advisor','suggests, you approve'],['manual','Manual','Swarm AI off']].map(([id,n,d])=>
    '<button data-act="preset:'+id+'" class="'+((id==='autopilot'&&mode==='Autopilot')||(id==='advisor'&&mode==='Advisor')||(id==='manual'&&mode==='Off')?'sel':'')+'"><b>'+n+'</b><span>'+d+'</span></button>').join('')+'</div>'+
    '<div class="ds">Mode: <b>'+mode+'</b>'+(mode==='Custom'?' — domains and policies set individually below.':mode==='Off'?' — nothing is automated; contracts still bill.':'.')+' The Overseer is a deterministic rule engine plus a price-signal allocator, not a language model: it explains every decision in the log.</div></div>';
  // status
  const pi=O.scarcity||1,piTxt=pi>1.15?'ether is scarcer → favour ether work':pi<0.87?'crystals are scarcer → favour mining':'balanced';
  h+='<div class="sec"><div class="sh">Colony <small>'+swClk(G.time)+'</small></div><div class="kv">'+
    '<span>Mining <b class="tc">'+swR1(O.inc.c)+'</b> ◆/s · <b class="te">'+swR1(O.inc.e)+'</b> ether/s</span>'+
    '<span>Agents <b>'+(sm.enrolled||0)+'</b>'+(sm.free?' <small class="dim">('+sm.free+' hired)</small>':'')+'</span>'+
    '<span>Workers <b>'+(sm.workers||0)+'</b> · army <b>'+(sm.army||0)+'</b></span>'+
    '<span data-tip="'+swEsc(swTipd('Price signal π','π = (ether demand ÷ ether supply) ÷ (crystal demand ÷ crystal supply). Demand comes from what your buildings can produce; supply is mining income plus market conversion. The allocator moves at most one worker per pass toward the scarcer resource, with two-pass hysteresis so it never oscillates.'))+'">π <b>'+pi.toFixed(2)+'</b> <small class="dim">'+piTxt+'</small></span>'+
    (bb.threat?'<span class="bad">⚠ threat near the base ('+bb.threatN+' supply)</span>':'')+
    '</div></div>';
  // suggestions
  const pr=S.props;
  h+='<div class="sec"><div class="sh">Suggestions <small>'+(!S.on?'swarm is off':pr.length?pr.length+' waiting':'none — the Overseer is watching')+'</small>'+(pr.length>1?' <button class="mini ok" data-act="approveall">Approve all</button>':'')+'</div>'+
    pr.map(p=>'<div class="prop"><span class="dtag d-'+p.dom+'">'+swDomName(p.dom)+'</span><span class="pt">'+swEsc(p.text)+(p.extra?'<small>'+swEsc(p.extra)+'</small>':'')+'</span><button class="mini ok" data-act="approve:'+p.id+'" title="Do it">✓</button><button class="mini" data-act="dismiss:'+p.id+'" title="Dismiss">×</button></div>').join('')+
    (!pr.length&&S.on&&DOMAINS.every(d=>S.dom[d.id]!=='advise')?'<div class="ds">Suggestions only appear for domains set to <b>Advise</b>.</div>':'')+'</div>';
  // domains
  h+='<div class="sec"><div class="sh">Domains <small>off · advise (propose) · act (do it)</small></div>'+DOMAINS.map(d=>
    '<div class="drow"><div class="dn" data-tip="'+swEsc(swTipd(d.name,d.d))+'">'+d.name+'</div>'+swSeg('dom:'+d.id,S.dom[d.id],[['off','Off'],['advise','Advise'],['act','Act']])+'</div>').join('')+'</div>';
  // policies
  h+='<div class="sec"><div class="sh">Policies</div>'+
    swTg('pol:pay',S.pay,'Pay agents',swTipd('Pay agents','Agents earn a wallet from a commission on the value they deliver and from kill bounties, and spend it themselves on gear and clinic fees. Switch off and agents work for nothing (and cannot buy gear).'))+
    swTg('pol:bounty',P.bounty>0,'Kill bounties',swTipd('Kill bounties','Pays an agent 5% of the cost of every enemy it kills, from the treasury.'))+
    swTg('pol:flee',P.flee,'Workers flee danger',swTipd('Flee','Non-combatant agents run to the Hub when armed enemies close in, and return afterwards.'))+
    swTg('pol:react',P.react,'Answer alarms',swTipd('Alarms','Guards and patrols rush toward a friendly structure or unit that has just been hit.'))+
    swTg('pol:clinic',P.clinic,'Field clinic',swTipd('Field clinic','Wounded agents seek a Mender and pay 0.2◆ per HP out of their own wallet.'))+
    swTg('pol:subsidy',P.subsidy,'Subsidise clinic',swTipd('Subsidy','When an agent cannot afford its treatment, the treasury covers the rest. Off: unaffordable healing is refused.'))+
    swTg('pol:autoEnroll',P.autoEnroll,'Auto-enroll new units',swTipd('Auto-enroll','Every newly trained unit becomes an agent immediately.'))+
    swTg('pol:hunt',P.hunt,'Allow creep hunts',swTipd('Hunts','Armed agents may assemble a hunting party and clear creep camps once their Lanchester strength is at least 1.9× the camp’s.'))+
    swTg('pol:assault',P.assault,'Allow assaults',swTipd('Assaults','Armed agents may mass at the staging point and march on the enemy base in waves.'))+
    '<div class="drow" style="margin-top:6px"><div class="dn" data-tip="'+swEsc(swTipd('Commission','Share of the value an agent delivers (mined crystals, trade profit, creep bounty) that is paid to its wallet from the treasury.'))+'">Commission</div>'+swSeg('comm',String(P.comm),[['0','0%'],['0.025','2.5%'],['0.05','5%'],['0.08','8%'],['0.12','12%']])+'</div></div>';
  // standing orders
  const st=[],seen=new Set();for(let i=S.stand.length-1;i>=0;i--){if(!seen.has(S.stand[i].txt)){seen.add(S.stand[i].txt);st.push(S.stand[i].txt);}}
  if(st.length)h+='<div class="sec"><div class="sh">Standing orders <small><button class="mini" data-act="clearstand">Clear</button></small></div><div class="lg">'+st.slice(0,6).map(t=>'<div>• '+swEsc(t)+'</div>').join('')+'</div></div>';
  // log
  const lg=S.log.slice(-9).reverse();
  h+='<div class="sec"><div class="sh">Decisions <small>why the colony did what it did</small></div><div class="lg">'+(lg.length?lg.map(l=>'<div><time>'+fmtTime(l.t)+'</time><span class="dtag d-'+l.dom+'">'+swDomName(l.dom)+'</span> '+swEsc(l.text)+'</div>').join(''):'<div class="dim">Nothing yet.</div>')+'</div></div>';
  return h;
}

/* ---------------------------------- Roster ------------------------------ */
const SW_GRP_ORDER={Economy:0,Recon:1,War:2,Support:3,Market:4,'—':5};
function swFilterOK(u,f){
  const ag=u.ag,g=ROLES[ag.role]?ROLES[ag.role].grp:'—';
  if(f==='all')return true;if(f==='eco')return g==='Economy';if(f==='war')return g==='War'||g==='Recon';if(f==='sup')return g==='Support';
  if(f==='hired')return !!ag.free||ag.role==='gig';return true;
}
function swRoster(){
  const S=G.sw,all=swAgents(),f=swui.filter;
  const list=all.filter(u=>swFilterOK(u,f)).sort((a,b)=>{const ga=SW_GRP_ORDER[ROLES[a.ag.role].grp]||0,gb=SW_GRP_ORDER[ROLES[b.ag.role].grp]||0;return ga-gb||(a.ag.role<b.ag.role?-1:a.ag.role>b.ag.role?1:0)||a.id-b.id;});
  const cnt={};for(const u of all)cnt[u.ag.role]=(cnt[u.ag.role]||0)+1;
  let h='<div class="sec"><div class="sh">Agents <small>'+all.length+' enrolled'+(nFreelancers()?' · '+nFreelancers()+' hired':'')+'</small></div>';
  h+='<div class="row" style="gap:5px;margin-bottom:5px">'+
    '<button class="mini" data-act="selall">Select all agents</button><button class="mini ok" data-act="enroll:workers">Enroll workers</button><button class="mini ok" data-act="enroll:army">Enroll army</button><button class="mini ok" data-act="enroll:all">Enroll everyone</button><button class="mini bad" data-act="release">Release all</button></div>';
  h+=Object.keys(cnt).length?'<div>'+Object.keys(cnt).map(r=>'<span class="chipb" data-tip="'+swEsc(swTipd(ROLES[r].n,ROLES[r].d))+'"><span class="rchip" style="--c:'+ROLES[r].col+'">'+ROLES[r].g+'</span>'+cnt[r]+'</span>').join('')+'</div>':
    '<div class="ds">No agents yet. Select units and press <b>V</b> to enroll them, or say “autopilot” to enroll everything and let the Overseer run the colony.</div>';
  h+='</div>';
  // assign selection
  const own=ownUnits().filter(u=>!u.def.hero&&!u.def.creep);
  if(own.length){
    const roles=ROLE_ORDER.filter(r=>own.some(u=>canRole(u,r)));
    h+='<div class="sec"><div class="sh">Selection <small>'+own.length+' unit'+(own.length===1?'':'s')+' · '+own.filter(u=>u.ag&&u.ag.auto).length+' enrolled</small></div>'+
      roles.map(r=>'<button class="chipb" data-act="role:'+r+'" data-tip="'+swEsc(swTipd(ROLES[r].n,ROLES[r].d+(SW_POINT_ROLES[r]?' <br>You will be asked to click a spot on the map.':'')))+'"><span class="rchip" style="--c:'+ROLES[r].col+'">'+ROLES[r].g+'</span>'+ROLES[r].n+'</button>').join('')+
      '<button class="chipb" data-act="roleauto" data-tip="'+swEsc(swTipd('Auto','The Overseer decides what these units do, by price signal and need.'))+'"><span class="rchip" style="--c:#9fe8ff">∞</span>Auto</button>'+
      '<button class="chipb" data-act="roleoff" data-tip="'+swEsc(swTipd('Release','Back to plain orders: the units do nothing on their own.'))+'"><span class="rchip" style="--c:#9aa6b8">×</span>Release</button></div>';
  }
  // filter
  h+='<div class="sec"><div class="row" style="gap:4px">'+[['all','All'],['eco','Economy'],['war','War & recon'],['sup','Support'],['hired','Hired']].map(([id,n])=>'<button class="mini'+(f===id?' sel':'')+'" data-act="filter:'+id+'">'+n+'</button>').join('')+'</div>';
  const max=60;
  for(const u of list.slice(0,max)){
    const ag=u.ag,R=ROLES[ag.role]||ROLES.free,hp=u.hp/u.maxhp;
    h+='<div class="agr'+(ui.selSet.has(u)?' sel':'')+'" data-act="sel:'+u.id+'"><span class="rchip" style="--c:'+R.col+'">'+R.g+'</span>'+
      '<div class="an"><b>'+swEsc(ag.name)+'</b><small>L'+ag.lvl+(ag.gear?' · Mk '+['','I','II','III'][ag.gear]:'')+(ag.free?' · hired':'')+'</small><div class="aw">'+swEsc(ag.manual?'under your orders':(ag.why||R.d))+'</div></div>'+
      '<div class="am"><span class="tc">'+swR0(ag.wallet)+'◆</span><small>+'+swR0(ag.earned)+'</small></div><div class="hpb"><i style="width:'+Math.round(hp*100)+'%;background:'+(hp>0.5?'#58e68b':hp>0.25?'#f0c040':'#ff5d5d')+'"></i></div></div>';}
  if(list.length>max)h+='<div class="ds">+'+(list.length-max)+' more</div>';
  if(!list.length&&all.length)h+='<div class="ds">No agents match this filter.</div>';
  h+='</div>';
  return h;
}

/* ---------------------------------- Market ------------------------------ */
function swSpark(cv,arr,lo,hi,mean,col){
  const g=cv.getContext('2d'),w=cv.width,h=cv.height;g.clearRect(0,0,w,h);if(arr.length<2)return;
  const Y=v=>h-4-clamp((v-lo)/(hi-lo),0,1)*(h-8);
  g.strokeStyle='rgba(255,255,255,.08)';g.lineWidth=1;for(const v of[0.75,1,1.25,1.5]){g.beginPath();g.moveTo(0,Y(v));g.lineTo(w,Y(v));g.stroke();}
  g.setLineDash([4,4]);g.strokeStyle='rgba(155,214,255,.55)';g.beginPath();g.moveTo(0,Y(mean));g.lineTo(w,Y(mean));g.stroke();g.setLineDash([]);
  g.strokeStyle=col;g.lineWidth=1.8;g.beginPath();arr.forEach((v,i)=>{const x=i/(arr.length-1)*(w-3)+1,y=Y(v);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
  g.fillStyle=col;g.beginPath();g.arc(w-2,Y(arr[arr.length-1]),2.6,0,TAU);g.fill();
  g.fillStyle='#7f98b4';g.font='10px system-ui';g.fillText('μ',3,Y(mean)-3);
}
function swTaskOpts(l){
  const d=UDEF[l.type],o=[];
  const armed=!d.worker&&!d.noWeapon&&!d.trade&&!!d.dmg;
  const P=(spec)=>Math.ceil(taskPrice(spec,l.lvl,l.ask));
  if(d.worker){
    o.push({k:'m100',label:'Mine 100 crystals',spec:()=>({t:'mine',n:100,res:'c',dur:110}),price:P({t:'mine',n:100})});
    o.push({k:'m250',label:'Mine 250 crystals',spec:()=>({t:'mine',n:250,res:'c',dur:560}),price:P({t:'mine',n:250})});
    if(countB(0,'siphon',true)>0)o.push({k:'e60',label:'Extract 60 ether',spec:()=>({t:'ether',n:60,res:'e',dur:240}),price:P({t:'ether',n:60})});
    const hub=ownHubs(0)[0];
    if(hub&&reqBuild(0,'generator').ok)o.push({k:'bg',label:'Build a Generator',spec:()=>{const s=findBuildingSpot('generator',hub.x,hub.y);return s?{t:'build',b:'generator',tx:s.tx,ty:s.ty,dur:160}:null;},price:P({t:'build',b:'generator'})});
  }
  if(armed){const c=nlPlace('camp',{});if(c&&c.camp)o.push({k:'cl',label:'Clear the nearest camp (lvl '+c.camp.lvl+')',spec:()=>{const cc=nlPlace('camp',{});return cc&&cc.camp?{t:'clear',camp:cc.camp,lvl:cc.camp.lvl,dur:210}:null;},price:P({t:'clear',lvl:c.camp.lvl})});}
  if(!d.worker&&d.speed>=110&&!d.trade){
    o.push({k:'sv',label:'Survey 3 sectors',spec:()=>{const cells=bbCells(G.sw).filter(q=>q.reach&&!q.base),pts=[];for(let j=0;j<3&&cells.length;j++){const q=spick(cells);pts.push({x:q.x,y:q.y,done:false});}return pts.length?{t:'survey',pts,len:routeLen(pts,ownHubs(0)[0]),dur:160}:null;},price:P({t:'survey',len:40})});}
  return o;
}
function swJobOK(u,j){
  if(u.dead||u.def.hero||u.def.creep||(u.ag&&u.ag.cid))return false;
  if(j.need==='armed')return canRole(u,'guard');
  if(j.need==='worker')return !!u.def.worker;
  return true;
}
/* who would take this job?  The selection if it fits, otherwise the nearest suitable free agents.  commit=true also enrolls selected units. */
function swPickAgents(j,commit){
  const sel=ownUnits().filter(u=>swJobOK(u,j));
  if(sel.length){if(commit)for(const u of sel)if(!u.ag||!u.ag.auto)agEnroll(u,true);return{us:sel,sel:true};}
  const need=j.type==='clear'?3:j.type==='quota'?2:1,w=j.where||{x:0,y:0};
  const us=swAgents().filter(u=>!u.ag.free&&u.ag.auto&&swJobOK(u,j)&&jobEligible(u,j)&&u.hp>u.maxhp*0.6).sort((a,b)=>j.type==='clear'?dpsOf(b)-dpsOf(a):hyp(a.x-w.x,a.y-w.y)-hyp(b.x-w.x,b.y-w.y));
  return{us:us.slice(0,need),sel:false};
}
function swMarket(){
  const S=G.sw,E=S.eco,T=G.teams[0],W=E.W,hz=swui.horizon;
  let h='';
  if(!S.on)h+='<div class="sec bad" style="border:none">The Swarm AI is off — hired agents stand idle but contracts still bill. Press J to switch it on, or dismiss them below.</div>';
  // wage index
  const dv=(W.v-W.mu)/W.mu;
  h+='<div class="sec"><div class="sh" data-tip="'+swEsc(swTipd('Colony calendar and cadences','1 colony minute = 10 s of game time · hour 1:00 · day 6:00 · month 36:00. Longer commitments are cheaper per second (minute ×1.35 · hour ×1.15 · day ×0.95 · month ×0.72) but are billed in advance for whole periods. Minute and hour re-price at the spot index every period; day and month lock the rate at signing.'))+'" style="cursor:help">Wage index <small>spot price of labour · mean-reverting random walk ⓘ</small></div>'+
    '<div class="kv"><span><b class="big">'+W.v.toFixed(2)+'</b></span><span>mean μ <b>'+W.mu.toFixed(2)+'</b><br><span class="'+(dv>0.08?'bad':dv<-0.08?'ok':'dim')+'">'+(dv>=0?'+':'')+(dv*100).toFixed(0)+'% vs mean</span></span>'+
    '<span data-tip="'+swEsc(swTipd('Expected wage index','E[W] over the next 1:00, 6:00 and 36:00 of game time under mean reversion (half-life ≈ 58 s): μ + (W₀−μ)(1−e^{−κh})/(κh), κ = 0.012/s. Spot cadences (minute, hour) re-price at the then-current W, so their cost follows this curve; day and month contracts freeze today’s W.'))+'">E[W] <b>'+expW(60).toFixed(2)+'</b> · <b>'+expW(360).toFixed(2)+'</b> · <b>'+expW(2160).toFixed(2)+'</b><br><span class="dim">1:00 · 6:00 · 36:00</span></span></div>'+
    '<canvas class="swcv" id="swWageCv" width="404" height="48"></canvas>'+
    '<div class="ds">'+(dv>0.08?'Above its mean: spot rates should drift down; a locked day/month rate would lock in a premium.':dv<-0.08?'Below its mean: a locked day or month rate is attractive — spot rates should drift up.':'Near fair value: choose a cadence by how long you need the agent, not by timing.')+(W.ev&&G.time-W.evT<90?' <b class="warn">'+swEsc(W.ev)+'.</b>':'')+'</div></div>';
  const ctN=E.ctr.filter(c=>c.kind==='hire'&&c.state==='active').length,jbN=E.jobs.filter(j=>j.client!=='me'&&(j.state==='open'||j.state==='active')).length;
  h+='<div class="row" style="gap:4px;margin:6px 0 2px">'+[['hire','Hire',E.free.length],['ctr','Contracts',ctN],['jobs','Jobs & clients',jbN]].map(([id,n,c])=>'<button class="mini'+(swui.mk===id?' sel':'')+'" data-act="mk:'+id+'">'+n+(c?' · '+c:'')+'</button>').join('')+'</div>';
  let HIRE='',CTR='',JOBS='';
  // listings
  const cap=maxFree(),nf=nFreelancers();
  HIRE+='<div class="sec"><div class="sh">Freelancers for hire <small>'+nf+' / '+cap+' hired · listings come and go</small></div>'+
    '<div class="row" style="gap:4px;margin-bottom:4px;align-items:center"><span class="dim" style="font-size:11px">Plan for</span>'+[[60,'1:00'],[300,'5:00'],[900,'15:00'],[3600,'60:00']].map(([s,n])=>'<button class="mini'+(hz===s?' sel':'')+'" data-act="hor:'+s+'">'+n+'</button>').join('')+'<span class="dim" style="font-size:11px">· total outlay for whole billing periods is shown under each cadence; ★ = cheapest</span></div>';
  if(!E.free.length)HIRE+='<div class="ds">No listings right now — new ones appear every ~20 s.</div>';
  for(const l of E.free){
    const d=UDEF[l.type],eraOK=d.era<=T.era,roles=l.roles,sel=swui.hireRole[l.id]&&roles.includes(swui.hireRole[l.id])?swui.hireRole[l.id]:roles[0];
    const tbl=cadenceTable(l.type,l.lvl,l.ask,hz),best=tbl.reduce((a,b)=>b.total<a.total?b:a,tbl[0]),bad=hireCheck(l);
    const tleft=Math.max(0,l.exp-G.time);
    HIRE+='<div class="cardx"><div class="hd"><img src="'+iconURL('u:'+l.type+':'+T.faction)+'"><b>'+swEsc(l.name)+'</b><small>'+d.name+' · L'+l.lvl+' · asks '+Math.round(l.ask*100)+'% · reliability '+'★'.repeat(Math.round(l.rel*5))+'☆'.repeat(5-Math.round(l.rel*5))+'</small><span class="sp"></span><small>'+fmtTime(tleft)+'</small></div>'+
      '<div class="sub3">Works as: '+roles.map(r=>'<button class="mini'+(sel===r?' sel':'')+'" data-act="hrole:'+l.id+':'+r+'">'+ROLES[r].n+'</button>').join(' ')+'</div>'+
      (bad?'<div class="sub3 bad">'+swEsc(bad)+'</div>':'')+
      '<div class="cadrow">'+tbl.map(t=>{const c=CADI[t.cad],afford=T.c>=Math.ceil(t.period),off=!!bad||!afford;
        return'<button class="cadb'+(t.cad===best.cad?' best':'')+(off?' off':'')+'" data-act="hire:'+l.id+':'+t.cad+'" data-tip="'+swEsc(swTipd(c.name+' contract',c.blurb+'<br>Pay '+Math.ceil(t.period)+'◆ now, then every '+fmtTime(c.secs)+'. Over '+fmtTime(hz)+' you would pay '+t.n+' period'+(t.n>1?'s':'')+' = <b>'+swR0(t.total)+'◆</b> ('+(t.perSec).toFixed(2)+'◆/s); '+(t.waste>0?fmtTime(t.waste)+' of that is unused time.':'no wasted time.')))+'"><b>'+c.name+'</b><span>'+Math.ceil(t.period)+'◆</span><small>'+swR0(t.total)+(t.cad===best.cad?' ★':'')+'</small></button>';}).join('')+
      '<button class="cadb'+(bad?' off':'')+'" data-act="taskmenu:'+l.id+'" data-tip="'+swEsc(swTipd('Pay per task','Fixed price, escrowed up front and paid only when the task is complete. If the contractor dies, quits or misses the deadline you are refunded in full.'))+'"><b>Task</b><span>fixed</span><small>on completion</small></button></div>';
    if(swui.taskFor===l.id){
      const opts=swTaskOpts(l);
      HIRE+='<div class="sub3" style="margin-top:6px">Pay by task completion:'+(opts.length?'':' <span class="dim">no tasks available for this kind of worker right now</span>')+'</div>'+opts.map(o=>'<button class="chipb'+(T.c>=o.price&&!bad?'':' off')+'" data-act="hiretask:'+l.id+':'+o.k+'">'+swEsc(o.label)+' <b class="tc">'+o.price+'◆</b></button>').join('');
    }
    HIRE+='</div>';
  }
  // contracts
  const ct=E.ctr.filter(c=>c.kind==='hire'&&c.state==='active');
  CTR+='<div class="sec"><div class="sh">Your contracts <small>'+ct.length+' active · '+E.stats.hired+' hired · '+E.stats.quit+' quit · '+E.stats.fired+' dismissed · '+E.stats.dead+' lost</small></div>';
  if(!ct.length)CTR+='<div class="ds">No active contracts.</div>';
  for(const c of ct){
    const u=byId(c.uid),cd=c.cad==='task'?null:CADI[c.cad],j=c.jobId?E.jobs.find(x=>x.id===c.jobId):null;
    CTR+='<div class="cardx"><div class="hd"><b>'+swEsc(c.name)+'</b><small>'+UDEF[c.type].name+' L'+c.lvl+' · '+(cd?cd.name+(cd.float?' (spot)':' (locked)'):'Task')+'</small><span class="sp"></span>'+(u?'<button class="mini" data-act="selc:'+c.uid+'">Find</button>':'')+'</div>'+
      '<div class="sub3">'+(c.cad==='task'?(j?swEsc(j.title)+' — '+swJobProg(j):'task')+' · escrow '+swR0(c.paid)+'◆':'paid '+swR0(c.paid)+'◆ · '+(c.notice?'<b class="warn">leaves at next bill</b>':'next bill in '+fmtTime(Math.max(0,c.nextDue-G.time))+' (≈'+Math.ceil(periodPrice(c.type,c.lvl,c.cad,wageNow(),c.ask))+'◆)'))+(c.arrears>0?' · <b class="bad">arrears '+swR0(c.arrears)+'◆</b>':'')+'</div>'+
      (c.cad==='task'?'<div class="row" style="gap:5px"><button class="mini bad" data-act="fire:'+c.id+':now">Cancel task</button></div>':
      '<div class="row" style="gap:5px">'+(c.notice?'':'<button class="mini" data-act="fire:'+c.id+':notice" data-tip="'+swEsc(swTipd('Do not renew','The contract runs to the end of the paid period and the agent leaves instead of being billed again.'))+'">Do not renew</button>')+'<button class="mini bad" data-act="fire:'+c.id+':now" data-tip="'+swEsc(swTipd('Dismiss now','Immediate. The paid period is forfeited; any job in progress fails.'))+'">Dismiss now</button></div>')+'</div>';}
  CTR+='</div>';
  // job board
  const act=E.jobs.filter(j=>j.state==='active'&&j.client!=='me'),open=E.jobs.filter(j=>j.state==='open'&&j.client!=='me').sort((a,b)=>(b.retainer?0:b.pay)-(a.retainer?0:a.pay));
  JOBS+='<div class="sec"><div class="sh">Job board <small>'+open.length+' open · '+act.length+' active · '+E.stats.jobsDone+' done · '+E.stats.jobsFailed+' failed</small></div>';
  JOBS+='<div class="ds">Select enrolled agents on the map first (or leave it to me and the nearest suitable free agents are picked). Rewards are paid by the client on completion, or — for retainers — at the end of every period you choose.</div>';
  for(const j of act)JOBS+=swJobCard(j,true);
  if(!open.length&&!act.length)JOBS+='<div class="ds">No jobs posted. Clients post every ~20–50 s; their budgets refill slowly.</div>';
  for(const j of open)JOBS+=swJobCard(j,false);
  JOBS+='</div>';
  // clients
  JOBS+='<div class="sec"><div class="sh">Clients <small>budget and reputation</small></div>'+E.clients.map(c=>'<div style="margin:3px 0;font-size:12px"><span class="cl" style="--c:'+c.col+'">'+swEsc(c.name)+'</span> <span class="dim">rep '+swR0(c.rep)+' · '+c.done+' done · '+c.failed+' failed</span><div class="mbar2" style="--c:'+c.col+'"><i style="width:'+Math.round(clamp(c.budget/600,0,1)*100)+'%"></i></div></div>').join('')+'</div>';
  h+=swui.mk==='ctr'?CTR:swui.mk==='jobs'?JOBS:HIRE;
  return h;
}
function swJobProg(j){
  const sp=j.spec;
  switch(sp.t){case'survey':return j.prog+'/'+sp.pts.length+' sectors';case'courier':return sp.ph===0?'to pickup':'delivering';case'clear':return campAlive(sp.camp)?'camp still standing':'camp cleared';
    case'mine':case'ether':return swR0(j.prog)+'/'+sp.n;case'build':return'under construction';
    case'station':case'relay':return(j.tT>0?Math.round(j.onT/j.tT*100):0)+'% on station this period';}
  return'';
}
function swJobCard(j,active){
  const E=G.sw.eco,cl=j.clientObj||E.clients.find(c=>c.id===j.client)||{name:'Client',col:'#9fc3e6'};
  const needTxt=j.need==='armed'?'needs armed agent':j.need==='worker'?'needs a worker':'any agent';
  let h='<div class="cardx"><div class="hd"><span class="cl" style="--c:'+cl.col+'">'+swEsc(cl.name.split(' ')[0])+'</span><b>'+swEsc(j.title)+'</b></div>';
  if(active){
    const us=j.agents.map(byId).filter(Boolean);
    h+='<div class="jm">'+(j.retainer?'<b>'+CADI[j.cad].name+'</b> billing · '+swR0(j.rate)+'◆ per '+fmtTime(j.period)+' · next in '+fmtTime(Math.max(0,j.nextDue-G.time))+' · paid so far <b class="tc">'+swR0(j.paidTotal)+'◆</b>':'Reward <b class="tc">+'+j.pay+'◆</b>'+(j.deadline?' · '+fmtTime(Math.max(0,j.deadline-G.time))+' left':''))+'</div>'+
      '<div class="jm">'+swJobProg(j)+' · '+us.map(u=>swEsc(u.ag.name)).join(', ')+'</div>'+
      '<div class="row" style="gap:5px">'+(us[0]?'<button class="mini" data-act="selc:'+us[0].id+'">Find</button>':'')+'<button class="mini bad" data-act="jcancel:'+j.id+'">'+(j.retainer?'End retainer':'Abandon')+'</button></div></div>';
    return h;
  }
  const rk=j.risk===undefined?null:riskLabel(j.risk);
  const left=Math.max(0,j.expire-G.time);
  if(j.retainer){
    const R=jobRates(j);
    h+='<div class="jm">'+needTxt+' · open for '+fmtTime(left)+' · pays at the <b>end</b> of each period by time on station (≥70% full, ≥40% pro rata)</div>'+
      '<div class="cadrow" style="grid-template-columns:repeat(4,1fr)">'+['min','hour','day','month'].map(c=>{const r=R[c],pk=swPickAgents(j);return'<button class="cadb'+(pk.us.length?'':' off')+'" data-act="accept:'+j.id+':'+c+'" data-tip="'+swEsc(swTipd(CADI[c].name+' retainer','Client pays '+swR0(r.period)+'◆ per '+fmtTime(r.secs)+' ('+(r.period/r.secs).toFixed(3)+'◆/s). Client may terminate at each period end with probability '+Math.round(r.hazard*100)+'%.'))+'"><b>'+CADI[c].name+'</b><span>'+swR0(r.period)+'◆</span><small>'+(r.period/r.secs).toFixed(2)+'/s'+(r.hazard?' · '+Math.round(r.hazard*100)+'%↯':' · firm')+'</small></button>';}).join('')+'</div></div>';
    return h;
  }
  const pk=swPickAgents(j);
  h+='<div class="jm">Reward <b class="tc">+'+j.pay+'◆</b> · risk <b class="'+(rk==='high'?'bad':rk==='medium'?'warn':'ok')+'">'+(rk||'—')+'</b> · '+needTxt+' · '+fmtTime(j.dur)+' to finish · open for '+fmtTime(left)+'</div>'+
    '<div class="row" style="gap:5px;align-items:center"><button class="mini ok'+(pk.us.length?'':' off')+'" data-act="accept:'+j.id+'">Accept</button><span class="dim" style="font-size:11px">'+(pk.us.length?(pk.sel?'with your selection ('+pk.us.length+')':'with '+pk.us.map(u=>swEsc(u.ag.name)).join(', ')):'no suitable agent free — enroll one')+'</span></div></div>';
  return h;
}

/* --------------------------------- Ledger ------------------------------- */
function swLedger(){
  const S=G.sw,L=S.led,E=S.eco,T=G.teams[0];
  const inc=L.gig+L.gear+L.clinic,cost=L.wage+Math.max(0,L.escrow)+L.comm+L.bounty+L.bonus,net=inc-cost;
  const row=(name,v,tip,cls)=>'<tr><td'+(tip?' data-tip="'+swEsc(tip)+'"':'')+'>'+name+'</td><td class="'+(cls||'')+'">'+(v>=0?'+':'−')+swR0(Math.abs(v))+'</td></tr>';
  let h='<div class="sec"><div class="sh">Treasury cash flow <small>since the mission began</small></div><table class="mt sw">'+
    '<tr><th>Inflow</th><th>◆</th></tr>'+
    row('Job-board income',L.gig,swTipd('Jobs','Rewards and retainer payments from the neutral clients.'),'ok')+
    row('Agents’ gear purchases',L.gear,swTipd('Gear','Agents spend their own wallets on Mk I/II/III gear; the money lands in the treasury.'),'ok')+
    row('Clinic fees',L.clinic,swTipd('Clinic','Paid by wounded agents to Menders’ field clinic.'),'ok')+
    '<tr><th>Outflow</th><th></th></tr>'+
    row('Wages to hired freelancers',-L.wage,swTipd('Wages','Minute / hour / day / month contract billing.'),'bad')+
    row('Task escrow (net of refunds)',-L.escrow,swTipd('Escrow','Pay-per-task contracts that were completed; failed tasks are refunded.'),'bad')+
    row('Commission to agents',-L.comm,swTipd('Commission','Wallet payments to enrolled agents for delivered value.'),'bad')+
    row('Kill bounties and bonuses',-(L.bounty+L.bonus),null,'bad')+
    '<tr><td><b>Net from the swarm layer</b></td><td class="'+(net>=0?'ok':'bad')+'"><b>'+(net>=0?'+':'−')+swR0(Math.abs(net))+'</b></td></tr></table>'+
    '<div class="ds">Not cash: clinic subsidy ('+swR0(L.subsidy)+'◆ of healing paid by policy), peer payments between agents ('+swR0(L.peer)+'◆) and wallets lost with fallen agents ('+swR0(L.lost)+'◆). The treasury is the player’s <b>'+swR0(T.c)+'◆</b>.</div></div>';
  h+='<div class="sec"><div class="sh">Per colony hour <small>income ▲ green · costs ▼ red</small></div><canvas class="swcv" id="swLedCv" width="404" height="96"></canvas></div>';
  // agent P&L
  const ags=swAgents().slice().sort((a,b)=>(b.ag.earned-b.ag.cost)-(a.ag.earned-a.ag.cost));
  let tE=0,tC=0;for(const u of ags){tE+=u.ag.earned;tC+=u.ag.cost;}
  h+='<div class="sec"><div class="sh">Agent profit &amp; loss <small>value delivered vs what they cost</small></div><table class="mt sw"><tr><th>Agent</th><th>Earned</th><th>Cost</th><th>Net</th><th>ROI</th></tr>'+
    ags.slice(0,10).map(u=>{const a=u.ag,n=a.earned-a.cost,roi=a.cost>1?Math.round(n/a.cost*100)+'%':'—';return'<tr data-act="sel:'+u.id+'" style="cursor:pointer"><td>'+swEsc(a.name)+'</td><td>'+swR0(a.earned)+'</td><td>'+swR0(a.cost)+'</td><td class="'+(n>=0?'ok':'bad')+'">'+(n>=0?'+':'−')+swR0(Math.abs(n))+'</td><td>'+roi+'</td></tr>';}).join('')+
    '<tr><td><b>All '+ags.length+'</b></td><td><b>'+swR0(tE)+'</b></td><td><b>'+swR0(tC)+'</b></td><td class="'+(tE-tC>=0?'ok':'bad')+'"><b>'+swR0(tE-tC)+'</b></td><td></td></tr></table>'+
    '<div class="ds">“Earned” is the value of what an agent delivered (crystals ×  income multiplier, ether at the market price, trade profit, kills at 35% of unit cost). “Cost” is what it was paid: commission, wages, bounties. A hauler that earns ten times its commission is a good hire; a guard’s value shows as lives saved rather than ◆.</div></div>';
  h+='<div class="sec"><div class="sh">Totals</div><div class="kv"><span>Mined <b class="tc">'+swR0(T.minedC)+'</b> ◆ · <b class="te">'+swR0(T.minedE)+'</b> ether</span><span>Taxes <b>'+swR0(T.taxEarn)+'</b></span><span>Trade <b>'+swR0(T.tradeEarn)+'</b></span><span>Jobs done <b>'+E.stats.jobsDone+'</b> / failed <b>'+E.stats.jobsFailed+'</b></span></div></div>';
  return h;
}
function swDrawLed(cv){
  const S=G.sw,g=cv.getContext('2d'),w=cv.width,h=cv.height;g.clearRect(0,0,w,h);
  const B=S.ledT.concat([Object.assign({t:G.time,cur:1},S.ledNow)]).slice(-24);
  const vi=b=>(b.gig||0)+(b.gear||0)+(b.clinic||0),vc=b=>(b.wage||0)+Math.max(0,b.escrow||0)+(b.comm||0)+(b.bounty||0)+(b.bonus||0);
  let mx=10;for(const b of B)mx=Math.max(mx,vi(b),vc(b));
  const mid=h/2,bw=Math.min(22,(w-8)/B.length-2);
  g.strokeStyle='rgba(255,255,255,.12)';g.beginPath();g.moveTo(0,mid);g.lineTo(w,mid);g.stroke();
  B.forEach((b,i)=>{const x=4+i*((w-8)/B.length),a=vi(b)/mx*(mid-8),c=vc(b)/mx*(mid-8);
    g.globalAlpha=b.cur?0.55:1;g.fillStyle='#5be38a';g.fillRect(x,mid-a,bw,a);g.fillStyle='#ff7a6a';g.fillRect(x,mid,bw,c);g.globalAlpha=1;});
  g.fillStyle='#7f98b4';g.font='10px system-ui';g.fillText('max '+swR0(mx)+'◆ / colony hour (1:00 game time)',4,11);
}
function swCanvases(){
  const S=G.sw,wc=$('swWageCv');if(wc){const W=S.eco.W;swSpark(wc,W.hist,0.5,1.9,W.mu,'#ffd45a');}
  const lc=$('swLedCv');if(lc)swDrawLed(lc);
}

/* ------------------------------ panel actions --------------------------- */
function swSelect(ids,center){
  const us=ids.map(byId).filter(u=>u&&!u.dead);if(!us.length)return;setSel(us);
  if(center){const cx=us.reduce((s,u)=>s+u.x,0)/us.length,cy=us.reduce((s,u)=>s+u.y,0)/us.length;centerOn(cx,cy);}
}
function swAct(act){
  const S=G.sw,a=act.split(':'),P=S.pol,E=S.eco;
  switch(a[0]){
    case'close':togglePanel('swarm');return;
    case'tab':swui.tab=a[1];swui.taskFor=null;sfx('click');break;
    case'pwr':swToggleMaster();break;
    case'preset':ovPreset(a[1]);toast(a[1]==='autopilot'?'Autopilot: the Overseer acts on everything':a[1]==='advisor'?'Advisor: the Overseer only suggests':'Swarm AI off','good');sfx('click');break;
    case'dom':S.dom[a[1]]=a[2];ovPurge();sfx('click');break;
    case'pol':{const k=a[1];if(k==='pay')S.pay=!S.pay;else if(k==='bounty')P.bounty=P.bounty>0?0:0.05;else P[k]=!P[k];
      if(k==='autoEnroll'&&P.autoEnroll){const n=enrollAll(u=>!u.ag||!u.ag.auto);if(n)toast(n+' existing units enrolled','good');}sfx('click');break;}
    case'comm':P.comm=parseFloat(a[1]);sfx('click');break;
    case'approve':ovApprove(+a[1]);break;
    case'dismiss':ovDismiss(+a[1]);sfx('click');break;
    case'approveall':{const ids=S.props.map(p=>p.id);let n=0;for(const id of ids)if(ovApprove(id))n++;toast(n+' suggestion'+(n===1?'':'s')+' carried out','good');break;}
    case'clearstand':S.stand.length=0;P.keepWorkers=0;P.quota={};P.keepUnits={};sfx('click');break;
    case'send':{const i=$('swIn');swSend(i.value);i.value='';break;}
    case'ex':swSend(NL_EXAMPLES[+a[1]]);break;
    case'filter':swui.filter=a[1];sfx('click');break;
    case'sel':swSelect([+a[1]],true);sfx('click');break;
    case'selc':swSelect([+a[1]],true);sfx('click');break;
    case'selall':{const us=swAgents().slice(0,100);if(us.length){setSel(us);sfx('click');}break;}
    case'enroll':{swEnsureOn();const f=a[1]==='workers'?u=>u.def.worker:a[1]==='army'?u=>!u.def.worker&&!u.def.trade&&!u.def.noWeapon:null;const n=enrollAll(u=>(!u.ag||!u.ag.auto)&&(!f||f(u)));toast(n+' unit'+(n===1?'':'s')+' enrolled','good');sfx('click');break;}
    case'release':{let n=0;for(const u of S.agents.slice())if(!u.ag.free&&u.ag.auto){agEnroll(u,false);n++;}toast(n+' agents released to manual control','good');sfx('click');break;}
    case'role':swAssignRole(a[1]);break;
    case'roleauto':swAutoMode(ownUnits());break;
    case'roleoff':swEnrollToggle(ownUnits().filter(u=>u.ag&&u.ag.auto));break;
    case'mk':swui.mk=a[1];swui.taskFor=null;sfx('click');break;
    case'hor':swui.horizon=+a[1];sfx('click');break;
    case'hrole':swui.hireRole[+a[1]]=a[2];sfx('click');break;
    case'taskmenu':swui.taskFor=swui.taskFor===+a[1]?null:+a[1];sfx('click');break;
    case'hire':{const lid=+a[1],l=E.free.find(x=>x.id===lid);if(!l){toast('That listing is gone','bad');break;}
      const c=econHire(lid,a[2],{role:swui.hireRole[lid]});if(c){toast(l.name+' hired ('+CADI[a[2]].name.toLowerCase()+' contract)','good');}else sfx('err');break;}
    case'hiretask':{const lid=+a[1],l=E.free.find(x=>x.id===lid);if(!l){toast('That listing is gone','bad');break;}
      const o=swTaskOpts(l).find(x=>x.k===a[2]);if(!o){toast('That task is no longer available','bad');break;}
      const spec=o.spec();if(!spec){toast('Could not set that task up right now','bad');break;}
      const c=econHire(lid,'task',{spec});if(c){swui.taskFor=null;toast(l.name+' hired for: '+o.label,'good');}else sfx('err');break;}
    case'fire':{const cid=+a[1];econFire(cid,a[2]==='now');sfx('click');if(a[2]==='notice')toast('Contract will not be renewed','good');break;}
    case'accept':{const j=E.jobs.find(x=>x.id===+a[1]);if(!j){break;}const pk=swPickAgents(j,true);
      if(!pk.us.length){toast(j.need==='armed'?'Needs an armed, enrolled agent':'Enroll an agent first (select it, press V)','bad');sfx('err');break;}
      if(!S.on){toast('Switch the Swarm AI on first (J)','bad');sfx('err');break;}
      if(econAccept(j.id,pk.us,a[2])){toast('Job accepted: '+j.title,'good');sfx('ack');}else sfx('err');break;}
    case'jcancel':jobCancel(+a[1]);sfx('click');break;
    default:return;
  }
  swDirty();if(ui.panel==='swarm')swRender();
}
function swBind(){
  const P=$('swPanel');if(!P)return;
  P.addEventListener('mousedown',e=>{
    const b=e.target.closest('[data-act]');if(!b)return;
    e.preventDefault();audioInit();if(G&&G.sw)swAct(b.dataset.act);});
  P.addEventListener('mouseover',e=>{const n=e.target.closest('[data-tip]');if(n){swui.tipOwn=true;showTipHTML(n.dataset.tip,n.getBoundingClientRect());}});
  P.addEventListener('mouseout',e=>{const n=e.target.closest('[data-tip]');if(n){swui.tipOwn=false;hideTip();}});
  P.addEventListener('mouseleave',()=>{swui.tipOwn=false;hideTip();});
  const inp=$('swIn');
  inp.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter'){e.preventDefault();const t=inp.value;inp.value='';swSend(t);inp.blur();}
    else if(e.key==='Escape'){e.preventDefault();inp.blur();}
    else if(e.key==='ArrowUp'){e.preventDefault();if(swui.hist.length){swui.hi=swui.hi<0?swui.hist.length-1:Math.max(0,swui.hi-1);inp.value=swui.hist[swui.hi];}}
    else if(e.key==='ArrowDown'){e.preventDefault();if(swui.hi>=0){swui.hi++;if(swui.hi>=swui.hist.length){swui.hi=-1;inp.value='';}else inp.value=swui.hist[swui.hi];}}});
  inp.addEventListener('keyup',e=>e.stopPropagation());
  $('chSw').onclick=()=>togglePanel('swarm');
  $('bSwOn').onclick=()=>{if(G&&G.sw)swToggleMaster();};
}
function swHud(){
  const S=G.sw;if(!S)return;
  const np=S.props.length;
  setTxt('swSt',swMode());setTxt('swW','W '+S.eco.W.v.toFixed(2));setTxt('swProp',np&&S.on?String(np):'');
  $('chSw').classList.toggle('flash',np>0&&S.on&&ui.panel!=='swarm');
  $('bSwOn').classList.toggle('on',S.on);setTxt('swOnT',S.on?'AI on':'AI off');
  if(ui.panel==='swarm')swRender();
}

/* ------------------------------ info-panel cards ------------------------ */
function swDirText(ag){
  const D=ag.dir||{};
  if(D.pts&&D.pts.length>1)return'patrol '+D.pts.map(p=>sectorName(p.x,p.y)).join(' ↔ ');
  if(D.x!==undefined)return'post at '+sectorName(D.x,D.y);
  if(D.tid){const t=byId(D.tid);return t&&!t.dead?'escorting '+t.def.name:'escort (target lost)';}
  if(D.bid)return'near a structure';
  return'';
}
function swInfoBlock(e){
  const S=G.sw;if(!S||e.team!==0)return'';
  const ag=e.ag;
  if(!ag||(!ag.auto&&!ag.free)){
    if(e.def.hero||e.def.creep)return'';
    return'<div class="ds swhint">Not an agent — press <b>V</b> to make it an autonomous agent.</div>';
  }
  const R=ROLES[ag.role]||ROLES.free,nx=ag.lvl>=AG_MAXLVL?null:AG_XP[ag.lvl+1],pv=AG_XP[ag.lvl];
  let h='<div class="agbox"><div class="agh"><span class="rchip" style="--c:'+R.col+'">'+R.g+'</span><b>'+swEsc(ag.name)+'</b><small>'+R.n+(ag.free?' · hired':ag.dm==='auto'?' · chosen by the Overseer':' · your directive')+(swDirText(ag)?' · '+swEsc(swDirText(ag)):'')+'</small></div>';
  h+='<div class="st">'+(S.on?(ag.manual?'<b>Under your orders</b> — it resumes its work when idle':swEsc(ag.why||R.d)):'<span class="warn">Swarm AI is off — idle</span>')+'</div>';
  h+='<div class="bars2">'+bar(nx?(ag.xp-pv)/(nx-pv):1,'xp','Level '+ag.lvl+(nx?' · '+swR0(ag.xp)+' / '+nx+' xp':' (max)'))+'</div>';
  h+='<div class="st">Wallet <b class="tc">'+swR0(ag.wallet)+'◆</b> · earned <b>'+swR0(ag.earned)+'</b> · paid <b>'+swR0(ag.cost)+'</b> · gear <b>'+(ag.gear?'Mk '+['','I','II','III'][ag.gear]:'none')+'</b>'+(ag.kills?' · kills <b>'+ag.kills+'</b>':'')+(ag.tasks?' · jobs <b>'+ag.tasks+'</b>':'')+'</div>';
  if(ag.free){const c=S.eco.ctr.find(x=>x.id===ag.free&&x.state==='active');if(c)h+='<div class="st">Contract: <b>'+(c.cad==='task'?'task':CADI[c.cad].name)+'</b> · paid '+swR0(c.paid)+'◆'+(c.cad==='task'?'':' · next bill in '+fmtTime(Math.max(0,c.nextDue-G.time)))+(c.notice?' · <span class="warn">not renewed</span>':'')+'</div>';}
  else if(ag.cid){const j=S.eco.jobs.find(x=>x.id===ag.cid);if(j)h+='<div class="st">On a job: <b>'+swEsc(j.title)+'</b> · '+(j.retainer?'retainer':'+'+j.pay+'◆')+'</div>';}
  return h+'</div>';
}
function swInfoMulti(sel){
  const S=G.sw;if(!S)return'';
  const us=sel.filter(e=>e.kind==='unit'&&e.team===0&&!e.def.hero&&!e.def.creep);if(!us.length)return'';
  const ag=us.filter(u=>u.ag&&u.ag.auto),cnt={};for(const u of ag)cnt[u.ag.role]=(cnt[u.ag.role]||0)+1;
  return'<div class="ds swhint"><b>'+ag.length+'</b> of '+us.length+' are agents'+(ag.length?' ('+Object.keys(cnt).map(r=>cnt[r]+' '+ROLES[r].n.toLowerCase()).join(', ')+')':'')+' · <b>V</b> '+(ag.length===us.length?'release':'enroll')+' · <b>F</b> assign a role · or press Enter and type an order.</div>';
}

/* ------------------------------- map overlays --------------------------- */
function swDrawBadge(u,t){
  const ag=u.ag;if(!ag||u.team!==0||!(ag.auto||ag.free))return;
  const R=ROLES[ag.role]||ROLES.free,off=!G.sw.on,r=cam.z<0.8?3.6:5.4,x=u.x+u.def.r*0.85,y=u.y-u.def.r*0.95-(u.flying?18:0);
  ctx.save();ctx.globalAlpha=off?0.4:0.92;
  if(ag.free){ctx.strokeStyle='#ffe27a';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(x,y,r+1.8,0,TAU);ctx.stroke();}
  ctx.fillStyle=off?'#9aa6b8':R.col;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.strokeStyle=ag.manual?'#ffffff':'rgba(0,0,0,.65)';ctx.lineWidth=ag.manual?1.4:1;ctx.stroke();
  if(cam.z>=0.8){ctx.fillStyle='#06121f';ctx.font='bold 7.5px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(R.g,x,y+0.4);}
  ctx.restore();
}
function swDrawWorld(t){
  const S=G.sw;if(!S||ui.demo)return;
  const open=ui.panel==='swarm';
  // directives of the selected agents
  let n=0;
  for(const u of ui.sel){
    if(u.kind!=='unit'||!u.ag||!(u.ag.auto||u.ag.free)||n++>40)continue;
    const ag=u.ag,R=ROLES[ag.role]||ROLES.free,D=ag.dir||{};
    ctx.strokeStyle=R.col;ctx.fillStyle=R.col;ctx.lineWidth=1.3;ctx.globalAlpha=0.7;ctx.setLineDash([4,6]);
    if(D.pts&&D.pts.length>1){ctx.beginPath();D.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(D.pts[0].x,D.pts[0].y);ctx.stroke();ctx.setLineDash([]);for(const p of D.pts){ctx.beginPath();ctx.arc(p.x,p.y,3.4,0,TAU);ctx.fill();}}
    else if(ag.role==='guard'||D.x!==undefined){const a=anchorOf(u,ag),r=D.r||200;ctx.beginPath();ctx.arc(a.x,a.y,r*0.55,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=0.16;ctx.beginPath();ctx.arc(a.x,a.y,r*0.55,0,TAU);ctx.fill();}
    else if(D.tid){const tg=byId(D.tid);if(tg&&!tg.dead){ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(tg.x,tg.y);ctx.stroke();}}
    else if(ag.role==='gig'&&ag.cid){const j=S.eco.jobs.find(x=>x.id===ag.cid);if(j&&j.where){ctx.beginPath();ctx.moveTo(u.x,u.y);ctx.lineTo(j.where.x,j.where.y);ctx.stroke();}}
    ctx.setLineDash([]);ctx.globalAlpha=1;
  }
  // hunt and assault objectives
  const bb=S.bb,show=open||ui.sel.some(u=>u.ag&&(u.ag.role==='hunt'||u.ag.role==='assault'));
  if(show){
    if(bb.hunt&&bb.hunt.go&&bb.hunt.camp){const c=bb.hunt.camp;ctx.strokeStyle='rgba(255,176,112,.85)';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.beginPath();ctx.arc(c.x,c.y,70,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    if(bb.assault&&bb.assault.go&&bb.assault.tgt&&!bb.assault.tgt.dead){const A=bb.assault;ctx.strokeStyle='rgba(255,106,90,.7)';ctx.lineWidth=2;ctx.setLineDash([9,6]);ctx.beginPath();ctx.moveTo(A.stage.x,A.stage.y);ctx.lineTo(A.tgt.x,A.tgt.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(255,106,90,.8)';circ(ctx,A.tgt.x,A.tgt.y,5);}
  }
  // job markers while the Market tab is open
  if(open&&swui.tab==='mk'){
    for(const j of S.eco.jobs){
      if(!j.where||j.client==='me'||(j.state!=='open'&&j.state!=='active'))continue;
      const act=j.state==='active',col=act?'#5be38a':'#ffd45a',w=j.where;
      ctx.strokeStyle=col;ctx.lineWidth=2;ctx.globalAlpha=0.85;ctx.beginPath();ctx.moveTo(w.x,w.y-12);ctx.lineTo(w.x+9,w.y);ctx.lineTo(w.x,w.y+12);ctx.lineTo(w.x-9,w.y);ctx.closePath();ctx.stroke();
      if(j.retainer&&j.spec){ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(w.x,w.y,j.spec.r,0,TAU);ctx.stroke();ctx.setLineDash([]);}
      ctx.globalAlpha=1;ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.8)';
      const lbl=j.retainer?(j.cad&&act?CADI[j.cad].name:'retainer'):'+'+j.pay+'◆';ctx.strokeText(lbl,w.x,w.y-17);ctx.fillStyle=col;ctx.fillText(lbl,w.x,w.y-17);
    }
  }
}
