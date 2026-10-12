/* =========================================================================
   72_ARSENAL_UI (v6) — everything the player sees of the ARSENAL: ability buttons (cooldown sweep, autocast), target mode, info-card lines, glyphs for the new icons,
   shields / burrow / zone / shot drawing.  Pure presentation: it only READS simulation state (rule 12) and calls the sim API (abilCommand, abUse) for commands.
   Command-card contract (CLAUDE.md rule 7 / 11): ability buttons are ordinary cards (slot -> SLOT_KEYS), targeted abilities use the existing target mode
   (beginTarget('abil:<id>') -> applyTarget -> abilApply), so the touch flow is "tap the button, then tap the target" with no new input path.
   ========================================================================= */

/* ------------------------------------- glyphs (51_art_b.js glyph() falls back to glx()) ------------------------------------- */
const GLX={
  cloak(g){g.strokeStyle='#a8ffe6';g.beginPath();g.arc(0,-8,4.5,0,TAU);g.stroke();g.setLineDash([3,3]);g.beginPath();g.moveTo(-9,13);g.quadraticCurveTo(-10,-1,0,-2);g.quadraticCurveTo(10,-1,9,13);g.closePath();g.stroke();g.setLineDash([]);},
  pounce(g){g.strokeStyle='#ffb36a';g.beginPath();g.moveTo(-13,12);g.quadraticCurveTo(-4,-12,11,-6);g.stroke();g.beginPath();g.moveTo(3,-13);g.lineTo(12,-6);g.lineTo(4,1);g.stroke();g.lineWidth=2;for(const o of[-5,0,5]){g.beginPath();g.moveTo(9+o*.3,6+o);g.lineTo(15,10+o*.8);g.stroke();}},
  sprint(g){g.strokeStyle='#ffe27a';for(const x of[-9,2]){g.beginPath();g.moveTo(x,-10);g.lineTo(x+9,0);g.lineTo(x,10);g.stroke();}g.lineWidth=2;g.beginPath();g.moveTo(-15,-4);g.lineTo(-10,-4);g.moveTo(-15,4);g.lineTo(-10,4);g.stroke();},
  overcharge(g){g.strokeStyle='#8fd0ff';g.beginPath();g.moveTo(0,-14);g.lineTo(12,-8);g.lineTo(10,6);g.lineTo(0,14);g.lineTo(-10,6);g.lineTo(-12,-8);g.closePath();g.stroke();g.strokeStyle='#ffe27a';g.beginPath();g.moveTo(2,-8);g.lineTo(-4,1);g.lineTo(3,1);g.lineTo(-2,9);g.stroke();},
  emp(g){g.strokeStyle='#6ad4f2';for(const r of[6,11,16]){g.beginPath();g.arc(0,0,r,0,TAU);g.lineWidth=r>11?1.6:2.4;g.stroke();}g.lineWidth=3;g.strokeStyle='#e8fbff';g.beginPath();g.moveTo(2,-7);g.lineTo(-3,1);g.lineTo(3,1);g.lineTo(-2,8);g.stroke();},
  snipe(g){g.strokeStyle='#ff9a8a';g.beginPath();g.arc(0,0,9,0,TAU);g.stroke();g.lineWidth=2;g.beginPath();g.moveTo(-16,0);g.lineTo(-4,0);g.moveTo(16,0);g.lineTo(4,0);g.moveTo(0,-16);g.lineTo(0,-4);g.moveTo(0,16);g.lineTo(0,4);g.stroke();g.fillStyle='#ff9a8a';g.beginPath();g.arc(0,0,2.2,0,TAU);g.fill();},
  burrow(g){g.strokeStyle='#caa070';g.beginPath();g.moveTo(-15,6);g.quadraticCurveTo(0,-14,15,6);g.stroke();g.beginPath();g.moveTo(-15,12);g.lineTo(15,12);g.stroke();g.strokeStyle='#e8d8b8';g.beginPath();g.moveTo(0,-2);g.lineTo(0,9);g.moveTo(-4,5);g.lineTo(0,10);g.lineTo(4,5);g.stroke();},
  lance(g){g.strokeStyle='#ff7a5a';g.beginPath();g.moveTo(0,-16);g.lineTo(0,6);g.stroke();g.strokeStyle='#ffe0b0';g.lineWidth=1.8;g.beginPath();g.moveTo(-6,8);g.lineTo(6,8);g.moveTo(-4,12);g.lineTo(4,4);g.moveTo(4,12);g.lineTo(-4,4);g.stroke();g.lineWidth=1.4;g.strokeStyle='#ff7a5a';g.beginPath();g.moveTo(-5,-13);g.lineTo(0,-16);g.lineTo(5,-13);g.stroke();},
  scan(g){g.strokeStyle='#a8e6ff';g.lineWidth=2;g.beginPath();g.arc(0,0,13,0,TAU);g.stroke();g.beginPath();g.arc(0,0,7,0,TAU);g.stroke();g.lineWidth=3;g.beginPath();g.moveTo(0,0);g.lineTo(10,-9);g.stroke();g.fillStyle='#a8e6ff';for(const p of[[-6,5],[5,6],[-3,-8]]){g.beginPath();g.arc(p[0],p[1],1.8,0,TAU);g.fill();}},
  barrier(g){g.strokeStyle='#7cc4ff';g.beginPath();for(let i=0;i<6;i++){const a=i/6*TAU+TAU/12;g.lineTo(Math.cos(a)*14,Math.sin(a)*14);}g.closePath();g.stroke();g.lineWidth=2;g.beginPath();g.arc(0,5,9,Math.PI,TAU);g.stroke();g.beginPath();g.moveTo(-9,5);g.lineTo(9,5);g.stroke();},
  cloakcell(g){g.strokeStyle='#a8ffe6';g.beginPath();g.rect(-8,-12,16,24);g.moveTo(-3,-12);g.lineTo(-3,-15);g.lineTo(3,-15);g.lineTo(3,-12);g.stroke();g.lineWidth=2;g.setLineDash([2,3]);g.beginPath();g.arc(0,0,5,0,TAU);g.stroke();g.setLineDash([]);},
  reactor(g){g.strokeStyle='#c9a0ff';g.beginPath();g.arc(0,0,13,0,TAU);g.stroke();g.strokeStyle='#ffe27a';g.beginPath();g.moveTo(2,-9);g.lineTo(-5,1);g.lineTo(2,1);g.lineTo(-2,10);g.stroke();},
  optics(g){g.strokeStyle='#ffb36a';g.beginPath();g.arc(-2,0,10,0,TAU);g.stroke();g.lineWidth=2;g.beginPath();g.moveTo(-2,-16);g.lineTo(-2,16);g.moveTo(-14,0);g.lineTo(10,0);g.stroke();g.setLineDash([2,3]);g.beginPath();g.arc(-2,0,15,-0.6,0.6);g.stroke();g.setLineDash([]);},
  autocast(g){g.strokeStyle='#9fe8ff';g.lineWidth=2.6;g.beginPath();g.arc(0,0,12,0.5,TAU*0.5-0.2);g.stroke();g.beginPath();g.arc(0,0,12,TAU*0.5+0.5,TAU-0.2);g.stroke();g.fillStyle='#9fe8ff';g.font='bold 14px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText('A',0,1);}
};
function glx(g,name){const f=GLX[name];if(!f)return false;f(g);return true;}

/* ------------------------------------- command card ------------------------------------- */
function abilTargetLabel(kind){if(!kind||kind.indexOf('abil:')!==0)return'';const A=ABIL[kind.slice(5)];return A?A.name+(A.tgt==='unit'?': click a target unit':': click a spot'):'';}
/* ability buttons for the active unit type (slot = ABIL.slot) + the autocast switch (slot 6). `mk` is buildCommands()'s card factory. */
function abilityButtons(units,act,mk){
  const ids=act.def.abil;if(!ids||act.def.hero)return;
  const mine=units.filter(u=>u.ab);
  let autoIds=[];
  for(const id of ids){
    const A=ABIL[id];if(A.arsenal&&!arsenalOn(0))continue;
    const U=mine.filter(u=>u.ab[id]),why=U.map(u=>abCheck(u,id)),ok=why.some(w=>!w),on=U.some(u=>abOn(u,id));
    const nm=id==='siege'?(on?'Unsiege':'Siege Mode'):A.tgt==='toggle'?A.name+(on?': ON':': off'):A.name;
    const unitTip=ok?'':'';void unitTip;
    mk(A.slot,{icon:'g:'+A.icon,name:nm,tip:A.tip+(A.cd?' Recharge '+A.cd+'s.':''),ok,why:why.find(w=>w)||'',
      cost:A.energy?{c:0,e:0,mana:A.energy}:null,
      badge:U.some(u=>u.ab[id].auto)?'A':'',
      cd:()=>{let m=1;for(const u of U){const s=u.ab[id];m=Math.min(m,A.cd?clamp(s.cd/A.cd,0,1):0);}return m;},
      run:()=>abilRun(id,U)});
    if(A.autoOK)autoIds.push(id);
  }
  if(autoIds.length){
    const on=mine.some(u=>autoIds.some(id=>u.ab[id]&&u.ab[id].auto));
    mk(6,{icon:'g:autocast',name:on?'Autocast: on':'Autocast: off',ok:true,badge:on?'ON':'',
      tip:'Autocast (D): the unit uses its abilities by itself when the situation fits (stim in a fight, EMP on clusters, snipe on valuable bio targets, siege when enemies are in deploy range...). Applies to the whole selection.',
      run:()=>{for(const u of mine)for(const id of autoIds)if(u.ab[id])u.ab[id].auto=!on;sfx('click');ui.cmdDirty=true;}});
  }
}
function abilRun(id,U){
  const A=ABIL[id];
  if(A.tgt==='point'||A.tgt==='unit'){beginTarget('abil:'+id);sfx('click');return;}      // tap the button, then tap the target
  const n=abilCommand(U,id);if(n&&A.tgt!=='self')sfx('click');
}
function abilApply(id,wx,wy,shift){                 // applyTarget() branch for kind 'abil:<id>'
  const A=ABIL[id],units=ownUnits().filter(u=>u.ab&&u.ab[id]);if(!A||!units.length)return;
  let tgt=null;
  if(A.tgt==='unit'){
    const e=entityAt(wx,wy,ui.touchMode?14:6);tgt=e&&e.kind==='unit'?e:null;
    if(!tgt||tgt.team===0||!units.some(u=>abTargetOK(u,id,tgt))){msg(0,id==='snipe'?'Snipe needs an enemy biological unit':id==='pounce'?'Pounce needs an enemy ground unit':'Pick an enemy unit');ui.target={kind:'abil:'+id};sfx('err');return;}
    wx=tgt.x;wy=tgt.y;}
  const r=abilCommand(units,id,wx,wy,tgt,shift);
  if(r>0){ping(wx,wy,'#9fe8ff');sfx('ack',undefined,undefined,units[0]);if(shift&&A.tgt!=='toggle')ui.target={kind:'abil:'+id};}
  else{const w=units.map(u=>abCheck(u,id)).find(x=>x);msg(0,w||'Cannot use that now');sfx('err');}
}
function abilDrawTargeting(id,w){                  // range ring around the nearest ready caster + effect radius at the cursor
  const A=ABIL[id],c=ownUnits().filter(u=>u.ab&&u.ab[id]).sort((a,b)=>hyp(a.x-w.x,a.y-w.y)-hyp(b.x-w.x,b.y-w.y))[0];if(!A||!c)return;
  ctx.strokeStyle='rgba(255,255,255,.3)';ctx.setLineDash([6,6]);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,A.range,0,TAU);ctx.stroke();ctx.setLineDash([]);
  const inR=hyp(c.x-w.x,c.y-w.y)<=A.range;ctx.strokeStyle=inR?'rgba(120,230,255,.95)':'rgba(120,230,255,.45)';ctx.fillStyle='rgba(80,200,255,.12)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(w.x,w.y,A.radius||14,0,TAU);ctx.fill();ctx.stroke();
}

/* ------------------------------------- info card ------------------------------------- */
function dtText(d){const dt=d.dt||'kin';return DTNAME[dt];}
function dtNote(d){const dt=d.dt||'kin';return DTNAME[dt]+' damage: '+DTNOTE[dt];}
function upgradeChips(e){
  const T=G.teams[e.team<2?e.team:0],d=e.def,L=[];
  const add=(n,lv)=>{if(lv>0)L.push(n+' '+['','I','II','III'][lv]);};
  if(d.dmg||d.noWeapon===undefined)add('Weapons',T.wl);add('Plating',T.al);
  if(d.stim)add('Stims',T.stims);
  if(d.siege)add('Optics',T.optics);
  if(d.cloak||d.abil&&d.abil.indexOf('cloak')>=0)add('Cloak cells',T.cloakcell);
  if(d.energy)add('Energy cells',T.reactor);
  return L;
}
function arsenalUnitInfo(e,own){                    // extra lines of the unit info card: role / damage type / armor class / abilities / upgrades
  const d=e.def;let h='';
  const cls=armorClassOf(e);
  h+='<div class="chips">'+(d.role?'<span class="chipx">'+d.role+'</span>':'')+(d.dmg?'<span class="chipx" title="'+dtNote(d).replace(/"/g,'')+'">'+dtText(d)+(d.pen?' · pen '+d.pen:'')+'</span>':'')+'<span class="chipx" title="Armor class: damage types are multiplied by it">'+cls+' class</span></div>';
  if(e.sh>0)h+=bar(e.sh/Math.max(1,e.shMax||e.sh),'mana','Shield '+Math.ceil(e.sh));
  if(own&&e.ab){
    const L=[];for(const id in e.ab){const A=ABIL[id];if(A.arsenal&&!arsenalOn(e.team))continue;const s=e.ab[id],on=abOn(e,id);
      L.push('<span class="chipx'+(on?' sup':'')+'" title="'+A.tip.replace(/"/g,'')+'">'+A.name+(on?' ON':s.cd>0?' '+Math.ceil(s.cd)+'s':'')+(s.auto?' · auto':'')+'</span>');}
    if(L.length)h+='<div class="chips">'+L.join('')+'</div>';
    const U=upgradeChips(e);if(U.length)h+='<div class="chips">'+U.map(x=>'<span class="chipx">'+x+'</span>').join('')+'</div>';}
  return h;
}

/* ------------------------------------- drawing hooks (60_render.js) ------------------------------------- */
function arsenalDrawUnit(u,t){                      // called inside drawUnit's translated context
  const d=u.def;
  if(u.sh>0){ctx.strokeStyle='rgba(140,210,255,'+(0.35+0.25*Math.sin(t*6+u.id))+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,d.r+5,0,TAU);ctx.stroke();ctx.fillStyle='rgba(120,190,255,.10)';ctx.fill();}
  if(u.ab&&u.ab.burrow&&u.ab.burrow.on){ctx.fillStyle='rgba(120,90,50,.55)';ctx.beginPath();ctx.ellipse(0,2,d.r+5,d.r*.7+3,0,0,TAU);ctx.fill();}
  if(u.ab&&u.ab.cloak&&u.ab.cloak.on&&(u.team===0||ui.demo)){ctx.strokeStyle='rgba(168,255,230,.5)';ctx.setLineDash([3,4]);ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,d.r+4,0,TAU);ctx.stroke();ctx.setLineDash([]);}
}
function arsenalBar(e,x,y,w){                       // second bar line (shield) above a structure
  if(e.sh>0&&e.shMax)drawBar(x,y,w,e.sh/e.shMax,'#7cc4ff',3);
}
function arsenalDrawZone(z,t){
  if(z.type==='scan'){const p=clamp(z.t/z.max,0,1);ctx.strokeStyle='rgba(168,230,255,'+(0.5*(1-p*0.6))+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();ctx.fillStyle='rgba(120,200,255,.07)';ctx.fill();
    ctx.save();ctx.translate(z.x,z.y);ctx.rotate(t*2.4);const q=ctx.createLinearGradient(0,0,z.r,0);q.addColorStop(0,'rgba(168,230,255,.45)');q.addColorStop(1,'rgba(168,230,255,0)');ctx.fillStyle=q;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,z.r,-0.35,0);ctx.closePath();ctx.fill();ctx.restore();}
  else if(z.type==='lance'){const p=clamp(z.t/z.max,0,1);ctx.strokeStyle='rgba(255,120,80,'+(0.35+0.4*p)+')';ctx.lineWidth=1+3*p;ctx.beginPath();ctx.moveTo(z.sx,z.sy);ctx.lineTo(z.x,z.y);ctx.stroke();
    ctx.strokeStyle='rgba(255,230,190,'+(0.4+0.5*p)+')';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(z.x,z.y,z.r*(1.2-p*.8),0,TAU);ctx.stroke();}
  else if(z.type==='barrage'){ctx.strokeStyle='rgba(255,170,90,'+(0.4+0.2*Math.sin(t*10))+')';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();ctx.setLineDash([]);}
}
function arsenalDrawFx(f,t){
  if(f.kind==='shot'){const p=f.t/f.max;ctx.globalAlpha=1-p;ctx.strokeStyle=f.col;ctx.lineWidth=2.4-1.4*p;ctx.beginPath();ctx.moveTo(f.x0,f.y0);ctx.lineTo(f.x,f.y);ctx.stroke();ctx.globalAlpha=1;}
}

/* test-side seam (window.__TEST='live' only, 90_main.js): the sim API the browser gate drives */
function arsenalTestApi(){return{ABIL,DMGX,abUse,abCheck,abOn,abilCommand,abilApply,abilityButtons,techNext,queueResearch,queueEra,armorClassOf,arsenalOn,prodList,reqUnit,reqBuild,detectorsCover,findEnt,emaxOf,seen,dmgVs,uCost,bCost,glyphURL,iconURL,meshFor,unitSprite,buildingSprite,BUILD_PAGES,hasDone,spawnUnit,setOrder,recalcTeams,GLX};}
