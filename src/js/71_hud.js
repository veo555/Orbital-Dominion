/* =========================================================================
   UI (2/2) — HUD, information panel, command-card rendering, objectives,
   control groups, economy / market panel and tooltips
   ========================================================================= */
const glyphCache={};
function glyphURL(name,size){
  const k=name+'|'+size;if(glyphCache[k])return glyphCache[k];
  const c=mkCanvas(size,size),g=c.getContext('2d');g.translate(size/2,size/2);g.scale(size/40,size/40);glyph(g,name);return glyphCache[k]=c.toDataURL();
}
function hydrateGlyphs(root){for(const el of(root||document).querySelectorAll('[data-g]')){if(el.dataset.done)continue;el.style.backgroundImage='url('+glyphURL(el.dataset.g,48)+')';el.dataset.done='1';}}

/* ----------------------------- tooltips --------------------------------- */
function showTipHTML(html,rect,above){
  const tip=$('tip');tip.innerHTML=html;tip.classList.remove('hidden');
  const w=tip.offsetWidth,h=tip.offsetHeight;let x=rect.left+rect.width/2-w/2,y=above===false?rect.bottom+8:rect.top-h-8;
  x=clamp(x,6,VW-w-6);if(y<6)y=rect.bottom+8;tip.style.left=x+'px';tip.style.top=y+'px';
}
function hideTip(){$('tip').classList.add('hidden');}
const fmtCost=c=>c?((c.c?'<span class="tc">◆ '+Math.round(c.c)+'</span> ':'')+(c.e?'<span class="te">◆ '+Math.round(c.e)+'</span> ':'')+(c.mana?'<span class="tm">✦ '+c.mana+'</span> ':'')):'';
function cmdTipHTML(c,i){
  let h='<b>'+c.name+'</b> '+(ui.touchMode?'':'<span class="hk2">['+SLOT_KEYS[i].toUpperCase()+']</span>')+'<div class="tr">'+fmtCost(c.cost)+(c.supply?'<span class="ts">'+c.supply+'</span> ':'')+(c.time?'<span class="tt">'+Math.round(c.time)+'s</span>':'')+'</div>';
  const d=c.def;
  if(d&&d.hp&&!d.isB){
    h+='<div class="tstat">HP '+d.hp+(d.dmg?' · ATK '+d.dmg+' · RNG '+d.range:'')+' · ARM '+d.armor+(d.speed?' · SPD '+d.speed:'')+'</div>';
    if(d.dmg)h+='<div class="tstat">Hits '+hitsText(d)+(Object.keys(d.bon||{}).length?' · <span class="ok">'+bonText(d)+'</span>':'')+'</div>';
    h+='<div class="tstat dim">'+Object.keys(d.tags).map(t=>TAGNAME[t]).join(', ')+'</div>';
  }else if(d&&c.isB){h+='<div class="tstat">HP '+d.hp+' · ARM '+d.armor+(d.dmg?' · ATK '+d.dmg+' · RNG '+d.range:'')+'</div>';}
  h+='<div class="d">'+c.tip+'</div>';
  if(d&&d.note&&!c.isB)h+='<div class="d warn">'+d.note+'</div>';
  if(!c.ok&&c.why)h+='<div class="r">'+c.why+'</div>';
  return h;
}

/* --------------------------- command card ------------------------------ */
let cmdSig='';
function sigOf(cmds){return cmds.map(c=>c?c.name+'|'+(c.icon):'-').join(',')+'|'+ui.menu;}
function renderCmdCard(){
  const cmds=buildCommands();ui.cmds=cmds;cmdSig=sigOf(cmds);let h='';
  for(let i=0;i<12;i++){const c=cmds[i];
    if(!c){h+='<div class="cb empty"></div>';continue;}
    const cost=c.cost?((c.cost.c?'<span class="tc">'+Math.round(c.cost.c)+'</span>':'')+(c.cost.e?'<span class="te">'+Math.round(c.cost.e)+'</span>':'')+(c.cost.mana?'<span class="tm">'+c.cost.mana+'</span>':'')):'';
    h+='<div class="cb'+(c.ok?'':' dis')+'" data-i="'+i+'"><img src="'+iconURL(c.icon)+'" draggable="false"><span class="hk">'+SLOT_KEYS[i].toUpperCase()+'</span><span class="co">'+cost+'</span>'+(c.badge!==undefined&&c.badge!==''?'<span class="bg">'+c.badge+'</span>':'')+'<i class="cd"></i></div>';}
  $('cmd').innerHTML=h;ui.cmdDirty=false;
}
function refreshCmdState(){
  const nc=buildCommands();if(sigOf(nc)!==cmdSig){renderCmdCard();return;}
  ui.cmds=nc;const btns=$('cmd').children;
  for(let i=0;i<12;i++){const c=nc[i],el=btns[i];if(!c||!el)continue;el.classList.toggle('dis',!c.ok);
    const cd=el.querySelector('.cd');if(cd)cd.style.height=(c.cd?c.cd()*100:0)+'%';
    const bg=el.querySelector('.bg');if(bg&&c.badge!==undefined&&bg.textContent!==String(c.badge))bg.textContent=c.badge;}
}

/* ----------------------------- info panel -------------------------------- */
function orderText(u){
  const o=u.order;
  switch(o.t){case'idle':return u.sieged?'Sieged':u.def.worker?'Idle':'Idle — guarding';case'hold':return'Holding position';case'move':return'Moving';case'attackmove':return'Attack-moving';
    case'attack':return'Attacking '+(o.target&&o.target.def?o.target.def.name:'');case'gather':return o.res&&o.res.type==='geyser'?'Extracting ether':'Mining crystals';case'build':return'Constructing '+BDEF[o.type].name;
    case'repair':return'Repairing';case'trade':return'Trade route — '+(o.st==='toPost'?'outbound':'returning');case'garrison':return'Sheltering in the Hub';case'cast':return'Casting';}return'';
}
const bar=(f,cls,txt)=>'<div class="pbar '+(cls||'')+'"><i style="width:'+clamp(f,0,1)*100+'%"></i><span>'+txt+'</span></div>';
function factionName(t){return t===2?'Wild creature':FACTIONS[G.teams[t].faction].name;}
function buffChips(u){return u.buffs.filter(b=>b.t>0).map(b=>({slow:'Slowed',stim:'Overdrive',stun:'Stunned',haste:'Haste',bloodlust:'Bloodlust',rampage:'Rampage',banner:'Banner',cloak:'Cloaked'}[b.k]||b.k)).map(n=>'<span class="chipx">'+n+'</span>').join('');}
function renderInfo(){
  const el=$('info'),sel=ui.sel;ui.infoDirty=false;el.classList.remove('none');
  if(!sel.length){
    const T=G.teams[0];
    el.classList.add('none');
    el.innerHTML=ui.touchMode?'<div class="nm">Orbital Dominion <small>'+FACTIONS[T.faction].name+' vs '+factionName(1)+'</small></div><div class="ds" style="margin-top:6px"><b>Tap</b> a unit or building to select it, then tap the ground, an enemy or a crystal patch to give an order. <b>Drag</b> to pan · <b>pinch</b> to zoom · <b>hold, then drag</b> to box-select.</div>'
      :'<div class="nm">Orbital Dominion <small>'+FACTIONS[T.faction].name+' vs '+factionName(1)+'</small></div><div class="ds" style="margin-top:6px">Select units or structures to give orders. <b>Right-click</b> moves, attacks and gathers — right-click an <b>Ether Siphon</b> with Haulers to harvest ether.</div>'+
      '<div class="ds">Hotkeys: <b>F1</b> idle Hauler · <b>F2</b> army · <b>F3</b> hero · <b>Space</b> last alert · <b>M</b> economy &amp; market · <b>K</b> Swarm AI · <b>Enter</b> give the Overseer an order · <b>H</b> help.</div>';
    return;}
  if(sel.length===1){
    const e=sel[0];
    if(e.kind==='res'){const geo=e.type==='geyser';el.innerHTML='<div class="ip"><img class="big" src="'+iconURL('g:'+(geo?'eth':'gem'))+'"><div class="ib"><div class="nm">'+(geo?'Ether Geyser':'Crystal Patch')+'</div>'+
      bar(e.amount/e.max,geo?'eth':'cry',Math.floor(e.amount)+' / '+e.max+' remaining')+'<div class="st">Workers: '+e.users.length+'/'+e.cap+(geo?(e.siphon?(e.siphon.done?' · Siphon online':' · Siphon under construction'):' · No siphon yet'):'')+'</div>'+
      '<div class="ds">'+(geo?(e.siphon?'Right-click the geyser or its Siphon with Haulers to extract ether.':'Select a Hauler and build an Ether Siphon here (Build menu), then send Haulers.'):'Right-click with a Hauler to mine. Haulers carry '+Math.round(5*(1+0.2*G.teams[0].mining))+' per trip.')+'</div></div></div>';return;}
    if(e.kind==='neutral'){const tw=e.type==='tower';el.innerHTML='<div class="ip"><img class="big" src="'+iconURL('n:'+e.type)+'"><div class="ib"><div class="nm">'+(tw?'Watchtower':'Trading Post')+'<small>Neutral</small></div>'+
      (tw?'<div class="st">'+(e.ctrl<0?'Uncontrolled':e.ctrl===0?'Controlled by you':'Controlled by the enemy')+'</div><div class="ds">Keep a unit next to it to control it. The controlling side sees 20 tiles around it — including high ground.</div>'
        :bar(e.demand,'cry','Demand '+Math.round(e.demand*100)+'%')+'<div class="ds">Freighters from an Exchange deliver goods here. Outbound payout = 0.6 × route length × demand, plus 0.25 × length for the return cargo. Each delivery lowers demand by 12%; it recovers slowly, so spread your routes.</div>')+'</div></div>';return;}
    const d=e.def,own=e.team===0,T=G.teams[e.team<2?e.team:0];
    const icon=e.kind==='unit'?'u:'+e.type+':'+(e.team===2?'meridian':T.faction):'b:'+e.type+':'+T.faction;
    let h='<div class="ip"><img class="big" src="'+iconURL(icon)+'"><div class="ib"><div class="nm">'+d.name+'<small>'+factionName(e.team)+(e.kind==='unit'&&d.hero?' · Level '+T.hero.level:'')+'</small></div>';
    h+=bar(e.hp/e.maxhp,e.hp/e.maxhp>0.5?'':e.hp/e.maxhp>0.25?'mid':'low',Math.ceil(e.hp)+' / '+e.maxhp);
    if(e.kind==='unit'){
      if(d.hero){const H=T.hero,nx=HERO_LVL_XP[Math.min(HERO_MAXLVL,H.level+1)],pv=HERO_LVL_XP[H.level];h+='<div class="bars2">'+bar(H.level>=HERO_MAXLVL?1:(H.xp-pv)/(nx-pv),'xp','XP '+Math.floor(H.xp)+(H.level>=HERO_MAXLVL?' (max)':' / '+nx))+bar(e.mana/heroMaxMana(e),'mana','Mana '+Math.floor(e.mana)+' / '+heroMaxMana(e))+'</div>';}
      else if(d.energy)h+=bar(e.energy/100,'mana','Energy '+Math.floor(e.energy));
      const Tm=G.teams[e.team<2?e.team:0],wl=e.team<2?Tm.wl:0,al=e.team<2?Tm.al:0;
      if(d.dmg){const atk=baseDmgOf(e);h+='<div class="st">ATK <b>'+atk.toFixed(0)+'</b>'+(Object.keys(bonOf(e)||{}).length?' <span class="ok">('+bonText({bon:bonOf(e)})+')</span>':'')+' · RNG <b>'+rangeOf(e)+'</b> · ARM <b>'+(d.armor+al+(e.armAdd||0))+'</b> · SPD <b>'+d.speed+'</b> · Hits '+hitsText(d)+'</div>';}
      else h+='<div class="st">ARM <b>'+(d.armor+al)+'</b> · SPD <b>'+d.speed+'</b></div>';
      h+='<div class="chips">'+Object.keys(d.tags).map(t=>'<span class="chipx">'+TAGNAME[t]+'</span>').join('')+(d.supply?'<span class="chipx sup">'+d.supply+' supply</span>':'')+buffChips(e)+'</div>';
      if(own)h+='<div class="ds"><b>'+orderText(e)+'</b>'+(e.carry>0?' · carrying '+e.carry+(e.carryType==='c'?' crystals':' ether'):'')+'</div>';
      if(!(d.hero&&own))h+='<div class="ds">'+d.desc+(d.note?' <span class="warn">'+d.note+'</span>':'')+'</div>';
      if(d.hero&&own){h+='<div class="skills">';for(let i=0;i<3;i++){const s=SKILLS[e.type][i],lv=T.hero.sk[i];h+='<div class="sk'+(lv?'':' off')+'" title="'+s.name+': '+s.desc(Math.max(1,lv)).replace(/"/g,'')+'"><img src="'+iconURL('g:'+s.id)+'"><b>'+s.name+'</b><span>'+'★'.repeat(lv)+'☆'.repeat(s.max-lv)+'</span></div>';}h+='</div>';}
    }else{
      h+='<div class="st">ARM <b>'+d.armor+'</b>'+(d.supply?' · +'+d.supply+' supply':'')+(d.dmg?' · ATK <b>'+baseDmgOf(e).toFixed(0)+'</b> · RNG <b>'+d.range+'</b>':'')+(e.done?'':' · <b>Under construction '+Math.floor(e.prog*100)+'%</b>')+(e.done&&e.nb?'':'')+'</div>';
      if(!e.done)h+=bar(e.prog,'prog','Building '+Math.floor(e.prog*100)+'% — '+(e.nb>0?e.nb+' builder'+(e.nb>1?'s':''):'no builders (send a Hauler)'));
      if(e.type==='habitat'){h+='<div class="st">Colonists housed: <b>'+Math.floor(T.colonists/Math.max(1,T.hab))+'</b> / '+BDEF.habitat.cap+' (empire total '+Math.floor(T.colonists)+')</div>';}
      if(e.type==='hub'&&e.garr.length)h+='<div class="st">Sheltering <b>'+e.garr.length+'</b> Haulers · cannon +'+3*e.garr.length+' dmg</div>';
      if(e.type==='exchange')h+='<div class="st">Market: 1 ether = <b>'+G.mkt.p.toFixed(2)+'</b> crystals</div>';
      h+='<div class="ds">'+d.desc+'</div>';
      if(own&&e.done&&e.queue.length){h+='<div class="q">';
        for(let i=0;i<5;i++){const q=e.queue[i];
          if(!q)h+='<div class="qi e"></div>';
          else{const ic=q.k==='u'?'u:'+q.id+':'+T.faction:q.k==='r'?'g:'+TECH[q.id].icon:q.k==='era'?'g:era':'u:'+FACTIONS[T.faction].hero+':'+T.faction;
            h+='<div class="qi" data-q="'+i+'" title="Click to cancel"><img src="'+iconURL(ic)+'">'+(i===0?'<i style="height:'+(q.t/q.total*100)+'%"></i>':'')+'</div>';}}
        h+='<div class="qt">'+(e.queue[0]?Math.max(0,Math.ceil((e.queue[0].total-e.queue[0].t)/moraleMul(0)))+'s':'')+'</div></div>';}
      if(own&&e.done&&e.rally)h+='<div class="ds">Rally point set'+(e.rally.res?' → '+(e.rally.res.type==='crystal'?'crystal patch (auto-mine)':'ether geyser (auto-extract)'):e.rally.post?' → Trading Post':'')+'</div>';
    }
    h+='</div>'+(own&&e.kind==='unit'?swInfoBlock(e):'')+'</div>';el.innerHTML=h;return;}
  // multi selection
  const counts={};for(const e of sel)counts[e.def.name]=(counts[e.def.name]||0)+1;
  let h='<div class="nm">'+sel.length+' selected<small>'+Object.keys(counts).map(k=>counts[k]+'× '+k).join(' · ')+'</small></div><div class="grid">';
  const show=sel.slice(0,48);
  for(const e of show){const icon=e.kind==='unit'?'u:'+e.type+':'+G.teams[e.team<2?e.team:0].faction:'b:'+e.type+':'+G.teams[e.team].faction;
    h+='<div class="gi'+(e.type===ui.activeType?' act':'')+'" data-id="'+e.id+'"><img src="'+iconURL(icon)+'"><i style="width:'+(e.hp/e.maxhp*100)+'%;background:'+(e.hp/e.maxhp>0.5?'#58e68b':e.hp/e.maxhp>0.25?'#f0c040':'#ff5d5d')+'"></i>'+(e.kind==='building'&&e.queue.length?'<u>'+e.queue.length+'</u>':'')+'</div>';}
  if(sel.length>48)h+='<div class="gi more">+'+(sel.length-48)+'</div>';
  h+='</div><div class="ds">'+(ui.touchMode?'Tap an icon to pick one unit · double-tap a unit to select every one of its type on screen.':'Tab cycles the active unit type · Shift-click removes · Ctrl-click selects all of a type on screen.')+'</div>';
  h+=swInfoMulti(sel);
  el.innerHTML=h;
}

/* ------------------------------- objectives ------------------------------ */
const OBJECTIVES=[
  {t:'Train Haulers at your Hub (Q) — reach 10',tt:'Tap your Hub and train Haulers — reach 10',d:()=>G.units.filter(u=>!u.dead&&u.team===0&&u.def.worker).length>=10},
  {t:'Build a Generator (select a Hauler → Build) before you hit the supply cap',d:()=>countB(0,'generator')>0},
  {t:'Build a Garrison to train soldiers',d:()=>hasDone(0,'garrison')},
  {t:'Select a unit and press V: make it an autonomous agent (K opens the Swarm panel)',tt:'Select a unit and tap Enroll as Agents (the Swarm panel is the AI chip in the top bar)',d:()=>!!G.sw&&G.sw.agents.some(u=>u.ag&&u.ag.auto&&!u.ag.free)},
  {t:'Tap ether: Build an Ether Siphon on a geyser, then right-click it with Haulers',tt:'Ether: build an Ether Siphon on a geyser, then tap it with Haulers selected',d:()=>G.teams[0].minedE>0},
  {t:'Raise your Hero at the Hub (W)',tt:'Raise your Hero at the Hub',d:()=>G.teams[0].hero.alive||G.teams[0].hero.deaths>0},
  {t:'Expand: build a second Command Hub at the natural expansion',d:()=>countB(0,'hub')>=2},
  {t:'Build Habitats and a Forum — morale and taxes boost the economy (M)',tt:'Build Habitats and a Forum — tap the morale chip to see how taxes boost the economy',d:()=>countB(0,'habitat',true)>0&&countB(0,'forum',true)>0},
  {t:'Advance to Era II at the Hub (E)',tt:'Advance to Era II at the Hub',d:()=>G.teams[0].era>=2},
  {t:'Press Enter and tell the Overseer something, e.g. “keep 14 miners”',tt:'Open the Swarm panel and tell the Overseer something, e.g. “keep 14 miners”',d:()=>!!G.sw&&!!G.sw.cmdLog&&G.sw.cmdLog.length>0},
  {t:'Open Market (K): hire a freelancer by the minute, hour, day, month or per task',tt:'Swarm panel → Market: hire a freelancer by the minute, hour, day, month or per task',d:()=>!!G.sw&&G.sw.eco.stats.hired>0},
  {t:'Take a job from the board with an agent and get paid',d:()=>!!G.sw&&G.sw.eco.stats.jobsDone>0},
  {t:'Defeat a creep camp for bounty and hero XP',d:()=>(G.teams[0].creeps||0)>0},
  {t:'Stand a unit next to a Watchtower to see across the map',d:()=>G.neutrals.some(n=>n.type==='tower'&&n.ctrl===0)},
  {t:'Build an Exchange and send a Freighter to a Trading Post',d:()=>G.teams[0].tradeEarn>0},
  {t:'Destroy every enemy structure to win',d:()=>false}];
function renderObjectives(){
  const host=$('objectives');if(!SET.hints){host.classList.add('hidden');return;}host.classList.toggle('hidden',!ui.objOpen);if(!ui.objOpen)return;
  const todo=[];for(const o of OBJECTIVES)if(!o.d())todo.push(o);
  const html='<b>Objectives</b>'+todo.slice(0,3).map((o,i)=>'<div class="ob'+(i?' dim':'')+'">'+(ui.touchMode&&o.tt?o.tt:o.t)+'</div>').join('');
  if(host.dataset.h!==html){host.innerHTML=html;host.dataset.h=html;}
}
function renderGroups(){
  const host=$('groups');let h='';
  for(let n=1;n<=9;n++){const arr=groupEntities(n);if(!arr.length)continue;const e=arr[0],icon=e.kind==='unit'?'u:'+e.type+':'+G.teams[0].faction:'b:'+e.type+':'+G.teams[0].faction;
    h+='<div class="gchip" data-grp="'+n+'"><b>'+n+'</b><img src="'+iconURL(icon)+'"><span>'+arr.length+'</span></div>';}
  if(host.dataset.h!==h){host.innerHTML=h;host.dataset.h=h;}
}

/* --------------------------- economy / market panel ---------------------- */
function moraleBreakdown(team){
  const T=G.teams[team];let forums=0;for(const b of G.buildings)if(!b.dead&&b.team===team&&b.done&&b.type==='forum')forums++;
  const rows=[['Base',56],['Tax policy ('+TAX[T.tax].n+')',TAX[T.tax].mor],['Forums ×'+Math.min(3,forums),6*Math.min(3,forums)],['Era bonus',5*(T.era-1)],['Hero alive',T.hero.alive?4:0],['Recent losses',-Math.min(18,T.rl*1.5)],['Recent kills',Math.min(10,T.rk*0.6)]];
  return rows;
}
function sparkline(cv,arr,lo,hi,col){
  const g=cv.getContext('2d'),w=cv.width,h=cv.height;g.clearRect(0,0,w,h);if(arr.length<2)return;
  g.strokeStyle='rgba(255,255,255,.1)';g.lineWidth=1;g.beginPath();const y1=h-(1-lo)/(hi-lo)*h;g.moveTo(0,y1);g.lineTo(w,y1);g.stroke();
  g.strokeStyle=col||'#ffd45a';g.lineWidth=1.6;g.beginPath();arr.forEach((v,i)=>{const x=i/(arr.length-1)*w,y=h-clamp((v-lo)/(hi-lo),0,1)*(h-3)-1.5;i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
  const last=arr[arr.length-1];g.fillStyle=col||'#ffd45a';g.beginPath();g.arc(w-1.5,h-clamp((last-lo)/(hi-lo),0,1)*(h-3)-1.5,2.2,0,TAU);g.fill();
}
ui.mktAmt=100;
function renderEco(){
  const host=$('ecoPanel');if(ui.panel!=='eco'){host.classList.add('hidden');return;}host.classList.remove('hidden');
  const T=G.teams[0],m=G.mkt,fee=T.faction==='aurora'?1.05:1.10,amt=ui.mktAmt,hasEx=hasDone(0,'exchange'),rows=moraleBreakdown(0),cap=T.hab*BDEF.habitat.cap;
  let h='<div class="ph"><b>Economy &amp; Market</b><button class="x" data-act="close">×</button></div>';
  h+='<div class="sec"><div class="sh">Morale <b>'+Math.round(T.morale)+'</b> → target <b>'+Math.round(T.mt)+'</b></div>'+bar(T.morale/100,T.morale<25?'low':T.morale<45?'mid':'',Math.round(T.morale)+'%')+
    '<div class="ds">Morale scales mining, building, repair and training speed by <b>'+(moraleMul(0)*100).toFixed(0)+'%</b>. Colonists only settle above 45 and flee below 25.</div></div>';
  h+='<div class="sec"><div class="sh">Taxes <small>'+Math.floor(T.colonists)+' / '+cap+' colonists in '+T.hab+' Habitat'+(T.hab===1?'':'s')+'</small></div><div class="seg">'+
    TAX.map((x,i)=>'<button data-act="tax:'+i+'" class="'+(T.tax===i?'sel':'')+'"><b>'+x.n+'</b><span>'+(T.colonists*x.inc*60).toFixed(0)+' ◆/min</span><span>'+(x.mor>0?'+':'')+x.mor+' morale</span></button>').join('')+'</div></div>';
  h+='<div class="sec"><div class="sh">Market <small>'+(hasEx?'Exchange online':'Build an Exchange (Era II) to trade')+'</small></div><canvas id="mktCv" width="296" height="64"></canvas>'+
    '<div class="mrow"><span>1 ether = <b>'+m.p.toFixed(2)+'</b> crystals</span><span class="dim">fee '+Math.round((fee-1)*100)+'% · '+m.vol+' trades</span></div>'+
    '<div class="seg amt">'+[100,500].map(a=>'<button data-act="amt:'+a+'" class="'+(amt===a?'sel':'')+'">'+a+'</button>').join('')+'</div>'+
    '<div class="tgrid">'+
    '<button data-act="mkt:buyE" '+(hasEx&&T.c>=amt*m.p*fee?'':'class="off"')+'>Buy '+amt+' ether<span>−'+Math.ceil(amt*m.p*fee)+' ◆</span></button>'+
    '<button data-act="mkt:sellE" '+(hasEx&&T.e>=amt?'':'class="off"')+'>Sell '+amt+' ether<span>+'+Math.floor(amt*m.p/fee)+' ◆</span></button>'+
    '<button data-act="mkt:buyC" '+(hasEx&&T.e>=amt/m.p*fee?'':'class="off"')+'>Buy '+amt+' crystals<span>−'+Math.ceil(amt/m.p*fee)+' ether</span></button>'+
    '<button data-act="mkt:sellC" '+(hasEx&&T.c>=amt?'':'class="off"')+'>Sell '+amt+' crystals<span>+'+Math.floor(amt/m.p/fee)+' ether</span></button></div>'+
    '<div class="ds">Prices follow a mean-reverting random walk (Ornstein–Uhlenbeck) with a slow seasonal swing; every trade pushes the price by 3.5%. Buy low, sell high.</div></div>';
  h+='<div class="sec"><div class="sh">Morale breakdown</div><table class="mt">'+rows.map(r=>'<tr><td>'+r[0]+'</td><td class="'+(r[1]>0?'ok':r[1]<0?'bad':'dim')+'">'+(r[1]>0?'+':'')+r[1].toFixed(r[1]%1?1:0)+'</td></tr>').join('')+'</table></div>';
  if(host.dataset.h!==h){const sc=host.scrollTop;host.innerHTML=h;host.dataset.h=h;host.scrollTop=sc;}
  const cvm=$('mktCv');if(cvm)sparkline(cvm,m.hist,0.5,2.0);
}
function togglePanel(n){
  ui.panel=ui.panel===n?null:n;ui.ecoDirty=true;
  if(ui.panel==='eco')renderEco();else $('ecoPanel').classList.add('hidden');
  if(ui.panel==='swarm'){swDirty();swRender();}else{$('swPanel').classList.add('hidden');const i=$('swIn');if(i&&document.activeElement===i)i.blur();}
  sfx('click');
}

/* --------------------------------- HUD ----------------------------------- */
let hudCache={};
function setTxt(id,v){if(hudCache[id]!==v){hudCache[id]=v;const el=$(id);if(el)el.textContent=v;}}
let infoTimer=0,cmdTimer=0,slowTimer=0;
function hudUpdate(dt){
  if(!G)return;const T=G.teams[0];
  setTxt('rC',String(Math.floor(T.c)));setTxt('rE',String(Math.floor(T.e)));
  const sup=T.used+'/'+T.cap;setTxt('rS',sup);$('chS').classList.toggle('warn',T.used>=T.cap);
  slowTimer-=dt;
  if(slowTimer<=0){slowTimer=0.5;
    const r=incomeRates();setTxt('rCi','+'+Math.round(r.c)+'/m');setTxt('rEi','+'+Math.round(r.e)+'/m');
    setTxt('eraRom',ERAS[T.era].rom);setTxt('eraName',ERAS[T.era].name);
    setTxt('morV',String(Math.round(T.morale)));$('morBar').style.width=Math.round(T.morale)+'%';$('morBar').className=T.morale<25?'low':T.morale<45?'mid':'';setTxt('taxName',TAX[T.tax].n+' tax');
    setTxt('mktP',G.mkt.p.toFixed(2));sparkline($('mktSpark'),G.mkt.hist,0.5,2.0);
    const dl=G.daylight;setTxt('dnIcon',dl>0.65?'☀':dl>0.25?'◐':'☾');
    const idle=idleWorkers().length;setTxt('idleN',String(idle));$('bIdle').classList.toggle('flash',idle>0);
    let army=0;for(const u of G.units)if(!u.dead&&u.team===0&&!u.def.worker&&!u.def.trade)army+=u.def.supply;setTxt('armyN',String(army));
    const hu=heroUnit(0),H=T.hero;setTxt('heroN',hu?'L'+H.level:(H.reviving?'…':H.deaths>0?'†':'—'));$('bHero').classList.toggle('learn',!!hu&&skillPoints(0)>0);
    renderObjectives();renderGroups();if(ui.panel==='eco')renderEco();swHud();
    const en=G.buildings.filter(b=>!b.dead&&b.team===1).length;setTxt('vsTxt',factionName(1)+' · '+DIFF_NAMES[G.diff]);
  }
  if(swui.hud){swui.hud=false;swHud();}
  if(swui.force&&ui.panel==='swarm')swRender();
  setTxt('clock',fmtTime(G.time));
  infoTimer-=dt;if(ui.infoDirty||infoTimer<=0){infoTimer=0.22;renderInfo();}
  if(ui.cmdDirty)renderCmdCard();else{cmdTimer-=dt;if(cmdTimer<=0){cmdTimer=0.12;refreshCmdState();}}
}
const DIFF_NAMES={easy:'Easy',normal:'Normal',hard:'Hard'};
