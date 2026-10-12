/* ARSENAL (v6-G2) headless gate: damage-type matrix, ability state machines (cooldown / energy / autocast / queue), stim-siege-cloak-burrow-pounce-overcharge-EMP-snipe-lance-scan,
   upgrade tiers, structure barrier, detector coverage, counter relations (duel simulator), campaign lock, AI use of the new units, determinism, save/restore in the middle of abilities.
     node tests/sim/arsenal.js              run the suite once against the real sources
     node tests/sim/arsenal.js --mutants    CLAUDE.md rule 15: run the same suite against textual mutants of the sources; every mutant MUST fail at least one check
   The mutants live at the bottom of this file. A mutant that is not caught means the suite has a hole. */
'use strict';
const load=require('./simlib3.js'),{arena,duel}=require('./duel.js');
const Lst=require('./storylib.js')();

function suite(xform,quiet){
  const fails=[];let nOk=0;
  const ok=(c,m)=>{if(c)nOk++;else fails.push(m);if(!quiet)console.log((c?'ok    ':'FAIL  ')+m);};
  const near=(a,b,e)=>Math.abs(a-b)<=(e===undefined?1e-6:e);
  function pin(S,seed){let s=seed>>>0||7;S.sandbox.Math.random=function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  /* a quiet game: no AI, no creeps, no units; returns helpers that place things in an open arena far from both bases */
  function world(opts){
    const S=load(undefined,xform);pin(S,3);
    S.newGame(Object.assign({seed:11,faction:'aurora',enemy:'meridian',arsenalOff:[false,false]},opts||{}));
    const G=S.G;G.ais=[null,null];for(const u of G.units)u.dead=true;G.units.length=0;
    const A=arena(S);const cx=A.x0+A.w/2,cy=A.y0+A.h/2;
    const W={S,G,cx,cy,
      sp(type,team,dx,dy){return S.addUnit(type,team,cx+dx,cy+dy);},
      bld(type,team,dx,dy){return S.addBuilding(type,team,Math.floor((cx+dx)/32),Math.floor((cy+dy)/32),true);},
      run(n){for(let i=0;i<n;i++)S.step();},
      eyes(team,dx,dy){return S.addUnit('watcher',team,cx+(dx||0),cy+(dy||0));},   // sight for the tests that need to SEE a target (and a detector: use only where that is harmless)
      T:t=>G.teams[t]};
    return W;
  }
  const buff=(u,k)=>{const b=u.buffs.find(x=>x.k===k);return b?b.t:0;};

  /* ----------------------------------------------------------------- A. data */
  {const S=load(undefined,xform);const U=S.UDEF,B=S.BDEF,AB=S.ABIL;
    const ars=Object.keys(U).filter(k=>U[k].arsenal);
    ok(ars.length===11,'A: 11 new unit definitions ('+ars.join(' ')+')');
    ok(Object.keys(B).filter(k=>B[k].arsenal).join()==='lab,siegeworks','A: 2 new tech structures (lab, siegeworks)');
    ok(ars.every(k=>U[k].role&&U[k].aiCls&&U[k].desc&&U[k].note!==undefined&&U[k].cost.c+U[k].cost.e>0),'A: every new unit has role, AI class, description, note and a cost');
    ok(Object.keys(U).filter(k=>U[k].abil).every(k=>U[k].abil.every(a=>AB[a])),'A: every ability id used by a unit exists in ABIL');
    ok(Object.keys(AB).every(k=>['self','toggle','point','unit'].includes(AB[k].tgt)&&Number.isInteger(AB[k].slot)&&AB[k].slot>=0&&AB[k].slot<12&&typeof AB[k].tip==='string'&&AB[k].tip.length>20),'A: every ability has a targeting mode, a command-card slot and a tooltip');
    ok(Object.keys(U).filter(k=>U[k].abil).every(k=>{const sl=U[k].abil.map(a=>AB[a].slot);return new Set(sl).size===sl.length&&!sl.includes(6);}),'A: no two abilities of one unit share a slot; slot 6 is reserved for the autocast switch');
    ok(ars.every(k=>!U[k].fac||U[k].fac.every(f=>S.FACTION_IDS.includes(f))),'A: faction restrictions name real factions');
    const prodAll=(f)=>{const s=new Set();for(const b of ['garrison','airfield','foundry','lab','siegeworks']){const W=world({faction:f,enemy:f==='meridian'?'obsidian':'meridian'});const hb={type:b,team:0,def:S.BDEF[b]};for(const id of W.S.prodList(hb))if(W.S.UDEF[id].arsenal)s.add(id);}return s;};
    const per={};for(const f of S.FACTION_IDS)per[f]=prodAll(f);
    ok(S.FACTION_IDS.every(f=>per[f].size>=7&&per[f].size<=9),'A: every faction can train 7-9 of the new units ('+S.FACTION_IDS.map(f=>f+':'+per[f].size).join(' ')+')');
    ok(ars.every(k=>S.FACTION_IDS.some(f=>per[f].has(k))),'A: every new unit is trainable by at least one faction');
    const only=(id)=>S.FACTION_IDS.filter(f=>per[f].has(id));
    ok(only('sunderer').join()==='meridian'&&only('jackal').join()==='obsidian'&&only('marksman').join()==='aurora'&&only('lancer').length===3,'A: faction-exclusive units are exclusive (sunderer meridian, jackal obsidian, marksman aurora), role units are shared');
    // tier tables: cost, time and era never decrease, cost strictly increases
    const tiered=Object.keys(S.TECH).filter(k=>S.TECH[k].lv.length>1);
    ok(tiered.length>=6&&tiered.every(k=>{const L=S.TECH[k].lv;return L.every((x,i)=>i===0||(x.c+x.e>L[i-1].c+L[i-1].e&&x.time>L[i-1].time&&x.era>=L[i-1].era));}),'A: tiered upgrades: '+tiered.join(', ')+' - cost and time grow per level, era never drops');
    ok(S.TECH.stims.lv.length===3&&S.TECH.stims.base===1&&S.TECH.weapons.lv.length===3&&S.TECH.barrier.lv.length===3,'A: stims has 3 tiers (v5: 1), weapons 3, barrier 3');
    ok(S.BUILD_PAGES.every(p=>p.length<=8)&&S.BUILD_PAGES.flat().includes('lab')&&S.BUILD_PAGES.flat().includes('siegeworks'),'A: build pages hold <= 8 entries each (phone targets) and list the new structures');
  }

  /* ------------------------------------------------- B. damage types x armor classes */
  {const W=world();const S=W.S;
    const t={light:W.sp('rifleman',1,0,0),armored:W.sp('juggernaut',1,40,0),air:W.sp('skiff',1,80,0),massive:W.sp('titan',1,120,0),struct:W.bld('turret',1,-200,100)};
    ok(S.armorClassOf(t.light)==='light'&&S.armorClassOf(t.armored)==='armored'&&S.armorClassOf(t.air)==='air'&&S.armorClassOf(t.massive)==='massive'&&S.armorClassOf(t.struct)==='struct','B: armor classes: rifleman light, juggernaut armored, skiff air, titan massive, turret structure');
    const arm={light:0,armored:3,air:0,massive:4,struct:2};
    // expected damage = 100 x multiplier - armor (documented matrix, written out here independently of DMGX)
    const X={kin:{light:1,armored:1,struct:1,air:1,massive:1},exp:{light:.95,armored:1.15,struct:1.2,air:1,massive:1},en:{light:1.15,armored:.85,struct:.85,air:1.15,massive:.9},prc:{light:.75,armored:1.25,struct:1,air:1,massive:1.25}};
    let all=true,bad='';for(const dt in X)for(const c in X[dt]){const got=S.dmgVs(100,{},t[c],false,dt,0),want=100*X[dt][c]-arm[c];if(!near(got,want,1e-9)){all=false;bad=dt+'/'+c+' '+got+' != '+want;}}
    ok(all,'B: dmgVs reproduces the documented matrix for 4 damage types x 5 armor classes '+bad);
    ok(near(S.dmgVs(100,{},t.armored,false,'prc',3),125)&&near(S.dmgVs(100,{},t.armored,false,'prc',1),123)&&near(S.dmgVs(100,{},t.massive,false,'prc',9),125),'B: piercing ignores flat armor up to its penetration (never below 0)');
    ok(S.dmgVs(10,{armored:5},t.armored,false)===12&&S.dmgVs(7,{},t.massive,false)===3&&S.dmgVs(20,{},t.light,true)===20,'B: v5 formula untouched when no damage type is given (10+5 bonus - 3 armor = 12; 7 vs armor 4 = 3)');
    ok(S.UDEF.rifleman.dt===undefined&&S.UDEF.juggernaut.dt===undefined,'B: no v5 unit carries a damage type (kinetic baseline = campaign balance)');
    // predictor agrees with the sim (cmbDmg)
    let agree=true;for(const [id,c] of [['lancer','armored'],['lancer','light'],['phantom','light'],['phantom','armored'],['interceptor','air'],['flaktrooper','air'],['dreadnought','massive']]){
      const a=S.cmbStackOf(id,1,{}),tg={light:'rifleman',armored:'juggernaut',air:'skiff',massive:'titan'}[c],b=S.cmbStackOf(tg,1,{});
      const sim=S.dmgVs(S.UDEF[id].dmg,S.UDEF[id].bon,t[c],!!S.UDEF[id].proj,S.UDEF[id].dt,S.UDEF[id].pen||0),pred=S.cmbDmg(a,b);if(!near(sim,pred,1e-9))agree=false;}
    ok(agree,'B: the combat predictor (cmbDmg) matches the simulation damage for new weapons');
  }

  /* ------------------------------------------------- C. abilities */
  {// cooldown + energy + target rules (Snipe)
    const W=world(),S=W.S,m=W.sp('marksman',0,0,0),b=W.sp('bulwark',1,200,0);m.energy=100;
    ok(S.abCheck(m,'snipe')==='','C: snipe is ready with full energy');
    ok(S.abUse(m,'snipe',b.x,b.y,b)&&b.hp===150&&near(m.energy,50)&&near(m.ab.snipe.cd,8),'C: snipe deals 130 armor-ignoring damage (280 -> 150 vs armor 3), costs 50 energy, starts an 8 s cooldown');
    ok(S.abCheck(m,'snipe')==='Recharging'&&!S.abUse(m,'snipe',b.x,b.y,b),'C: a second snipe is refused while recharging');
    W.run(250);ok(S.abCheck(m,'snipe')==='','C: after 8 s the cooldown has elapsed (energy regenerated to '+m.energy.toFixed(1)+')');
    m.energy=49;ok(S.abCheck(m,'snipe')==='Not enough energy','C: not enough energy blocks the ability');
    m.energy=100;const j=W.sp('juggernaut',1,100,40);ok(!S.abUse(m,'snipe',j.x,j.y,j)&&near(m.energy,100),'C: snipe refuses a non-biological target and spends nothing');
    const h=W.sp('hero_idris',1,150,-60);const hp0=h.hp;m.ab.snipe.cd=0;S.abUse(m,'snipe',h.x,h.y,h);ok(near(hp0-h.hp,70),'C: snipe does 70 to a hero');
  }
  {// stim: gating and the three tiers
    const W=world(),S=W.S;const r=W.sp('rifleman',0,0,0);
    ok(S.abCheck(r,'stim').startsWith('Research'),'C: Overdrive needs the Combat Stims research');
    const res=[];for(const lv of [1,2,3]){W.T(0).stims=lv;const u=W.sp('rifleman',0,30*lv,30);const hp=u.hp;S.abUse(u,'stim');res.push([hp-u.hp,buff(u,'stim')]);}
    ok(res[0][0]===12&&near(res[0][1],8)&&res[1][0]===12&&near(res[1][1],11)&&res[2][0]===6&&near(res[2][1],14),'C: Overdrive tiers: I = 8 s / 12 HP, II = 11 s / 12 HP, III = 14 s / 6 HP ('+JSON.stringify(res)+')');
    const raptor=W.sp('raptor',0,0,60);W.run(2);ok(raptor.ab.stim&&raptor.ab.pounce&&S.abCheck(raptor,'pounce')==='','C: the Raptor has Overdrive and Pounce');
  }
  {// siege mode + minimum range (Sunderer)
    const W=world(),S=W.S,su=W.sp('sunderer',0,0,0),g1=W.bld('generator',1,80,-20);
    W.run(40);ok(g1.hp<g1.maxhp,'C: a mobile Sunderer shoots a target 80 px away');
    const W2=world(),S2=W2.S,s2=W2.sp('sunderer',0,0,0),near2=W2.bld('generator',1,80,-20),far2=W2.bld('generator',1,300,60);W2.eyes(0,150,0);
    S2.abUse(s2,'siege');W2.run(70);
    ok(s2.sieged&&near(S2.rangeOf(s2),390),'C: Siege Mode deploys (range 390)');
    W2.run(220);ok(near2.hp===near2.maxhp&&far2.hp<far2.maxhp,'C: a deployed Sunderer cannot hit inside its minimum range (120) but hits the target at 300 px (near '+near2.hp+'/'+near2.maxhp+', far '+Math.round(far2.hp)+'/'+far2.maxhp+')');
    const hw=W2.sp('howitzer',0,0,200);W2.T(0).optics=0;S2.abUse(hw,'siege');W2.run(60);const r0=S2.rangeOf(hw);W2.T(0).optics=1;const r1=S2.rangeOf(hw);W2.T(0).optics=2;const r2=S2.rangeOf(hw);
    ok(r0===350&&r1===410&&r2===470,'C: Siege Optics adds +60 / +120 range to deployed siege units (350 / '+r1+' / '+r2+')');
  }
  {// cloak: toggle, drain, firing, detection
    const W=world(),S=W.S,p=W.sp('phantom',0,0,0),obs=W.sp('raptor',1,150,0);p.mute=1;   // mute: isolate the drain from the shot cost
    S.abilCommand([p],'cloak');W.run(2);ok(p.cloaked&&p.ab.cloak.on&&!p.ab.cloak.auto,'C: Cloak toggles on (a manual toggle switches autocast off for that unit)');
    const e0=p.energy;W.run(60);ok(p.energy<e0-1.5&&p.energy>e0-3.5,'C: cloaking drains ~1.2 energy/s and regeneration pauses ('+(e0-p.energy).toFixed(2)+' in 2 s)');
    ok(!S.seen(1,p),'C: an enemy without a detector cannot see a cloaked Phantom');
    const wt=W.sp('watcher',1,60,20);W.run(3);ok(S.seen(1,p),'C: a Watcher (detector) next to it reveals it');wt.dead=true;W.run(2);
    obs.dead=true;p.mute=0;p.energy=50;const g=W.sp('rifleman',1,60,0);const en0=p.energy;W.run(120);
    ok(p.cloaked&&p.energy<en0-8&&g.hp<g.maxhp,'C: a cloaked Phantom keeps its cloak while firing and pays 3 energy per shot (energy '+en0+' -> '+p.energy.toFixed(1)+', cloaked '+p.cloaked+', target hp '+g.hp+')');g.dead=true;
    p.energy=0.5;W.run(30);ok(!p.ab.cloak.on&&!p.cloaked,'C: cloak drops when the energy is gone');
    ok(S.abCheck(p,'cloak')==='Recharging'||S.abCheck(p,'cloak')==='Not enough energy','C: and cannot be switched on again without energy');
  }
  {// burrow
    const W=world(),S=W.S,m=W.sp('mauler',0,0,0),e=W.sp('rifleman',1,40,0);m.hp=100;
    S.abUse(m,'burrow');W.run(4);ok(m.root===1&&m.mute===1&&m.cloaked,'C: Burrow roots, mutes and cloaks the Mauler');
    const ehp=e.hp;W.run(90);ok(e.hp===ehp,'C: a burrowed Mauler does not attack');
    ok(m.hp>=100+6*2.5,'C: and regenerates 6 HP/s ('+m.hp.toFixed(0)+')');
    const x0=m.x;S.setOrder(m,{t:'move',x:m.x+120,y:m.y});ok(!m.ab.burrow.on&&m.root===0,'C: a move order surfaces it');
  }
  {// pounce
    const W=world(),S=W.S,r=W.sp('raptor',0,0,0),t=W.sp('rifleman',1,150,0);t.order={t:'hold'};t.mute=1;
    W.run(6);const hp=t.hp;S.abilCommand([r],'pounce',t.x,t.y,t);let st=0;for(let i=0;i<60&&t.hp===hp;i++)W.run(1);st=buff(t,'stun');
    ok(r.ab.pounce.cd>10&&t.hp<=hp-17&&st>0,'C: Pounce leaps at the target at triple speed and hits it with a stun ('+hp+' -> '+Math.round(t.hp)+', stun '+st.toFixed(2)+'s)');
    const f=W.sp('skiff',1,0,120);ok(!S.abUse(r,'pounce',f.x,f.y,f),'C: Pounce cannot target aircraft');
  }
  {// overcharge shield
    const W=world(),S=W.S,b=W.sp('bulwark',0,0,0);b.energy=100;S.abUse(b,'overcharge');W.run(2);
    ok(b.sh===90&&b.armAdd===3,'C: Overcharge: 90 shield points and +3 armor');
    S.damageEnt(b,50,1,null);ok(b.hp===280&&b.sh===40,'C: a 50 point hit is absorbed entirely by the shield');
    S.damageEnt(b,100,1,null);ok(b.sh===0&&b.hp===220,'C: a 100 point hit: 40 absorbed, 60 reaches the hull');
    const c=W.sp('bulwark',0,50,0);S.abUse(c,'overcharge');W.run(260);ok(c.sh===0,'C: the shield expires after 8 s');
  }
  {// EMP
    const W=world(),S=W.S,d=W.sp('disruptor',0,0,0),mk=W.sp('marksman',1,200,0),j=W.sp('juggernaut',1,230,30),far=W.sp('marksman',1,330,0);
    mk.sh=80;mk.shMax=80;mk.energy=100;far.energy=100;d.energy=100;const hp=j.hp;
    W.run(2);const ex=W.cx+215,ey=W.cy+10;ok(S.abUse(d,'emp',ex,ey),'C: EMP Pulse fires at a point in range');
    ok(near(d.energy,40)&&near(mk.energy,30)&&mk.sh===0&&near(far.energy,100),'C: EMP drains 70 energy and destroys shields inside the radius only (cost 60 energy)');
    ok(buff(j,'slow')>4&&near(hp-j.hp,25),'C: EMP slows mechanical units for 5 s and deals them 25 damage');
    const ph=W.sp('phantom',1,215,-30);ph.mute=1;ph.ab.cloak.on=true;ph.ab.cloak.auto=false;W.run(2);ok(ph.cloaked,'C: (control) a cloaked Phantom is cloaked');d.ab.emp.cd=0;d.energy=100;W.run(1);S.abUse(d,'emp',ex,ey-30);W.run(1);ok(!ph.ab.cloak.on&&!ph.cloaked,'C: EMP breaks a cloak');
  }
  {// orbital lance
    const W=world(),S=W.S,d=W.sp('dreadnought',0,0,0),t=W.sp('titan',1,300,0),b=W.bld('depot',1,-150,150);
    ok(S.abUse(d,'lance',t.x,t.y,t)&&t.hp===900,'C: Lance: no damage at the moment of the order (charging)');
    W.run(40);ok(t.hp===900,'C: still charging after 1.3 s');W.run(12);ok(t.hp===640,'C: 260 damage lands after 1.6 s');
    d.ab.lance.cd=0;d.energy=100;S.abUse(d,'lance',b.x,b.y,b);W.run(55);ok(b.hp===b.maxhp-420||b.dead,'C: 420 damage to a structure');
  }
  {// pulse scan
    const W=world(),S=W.S,w=W.sp('watcher',0,0,0),ph=W.sp('phantom',1,300,0),e=W.sp('rifleman',0,-50,0);ph.ab.cloak.on=true;ph.ab.cloak.auto=false;W.run(2);
    ok(!S.seen(0,ph),'C: (control) the cloaked Phantom is unseen');
    ok(S.abUse(w,'scan',ph.x,ph.y),'C: Pulse Scan on its position (range 420)');W.run(3);ok(S.seen(0,ph),'C: the scan reveals the cloaked unit');
    W.run(30*8+40);ok(!S.seen(0,ph),'C: and expires after 8 s');
  }
  {// autocast: Snipe on, then off
    const run=(auto)=>{const W=world(),S=W.S,m=W.sp('marksman',0,0,0),e=W.sp('raptor',1,200,0);e.order={t:'hold'};m.ab.snipe.auto=auto;m.energy=100;W.run(40);return{hit:m.ab.snipe.cd>0&&m.energy<80,m};};
    ok(run(true).hit,'C: autocast Snipe fires by itself at a valuable biological target in range');
    ok(!run(false).hit,'C: with autocast off it does not');
    const W=world(),S=W.S;W.T(0).stims=1;const r=W.sp('rifleman',0,0,0),a=W.sp('rifleman',1,150,0),b=W.sp('rifleman',1,150,30);r.ab.stim.auto=true;W.run(20);ok(buff(r,'stim')>0,'C: autocast Overdrive starts when two enemies are close');
    const W3=world();const sp=W3.sp('specter',0,0,0),e=W3.sp('rifleman',1,150,0);W3.run(16);ok(sp.ab.cloak.auto&&sp.ab.cloak.on&&sp.cloaked,'C: the Specter\'s cloak is on autocast: it cloaks when an enemy is near');
    const W4=world();const sp4=W4.sp('specter',0,0,0);W4.run(30);ok(!sp4.cloaked&&near(sp4.energy,100),'C: and stays visible (and keeps its energy) when nothing is near');
  }
  {// queue + abilCommand
    const W=world(),S=W.S,m=W.sp('marksman',0,0,0),e=W.sp('raptor',1,120,20);e.order={t:'hold'};m.energy=100;W.run(6);
    S.setOrder(m,{t:'move',x:m.x-60,y:m.y});const n=S.abilCommand([m],'snipe',e.x,e.y,e,true);
    ok(n===1&&m.oq.length===1&&m.oq[0].t==='abil','C: a targeted ability is queueable behind a move order');
    W.run(120);ok(e.hp<e.maxhp||e.dead,'C: the queued Snipe runs after the move ('+Math.round(e.hp)+' hp left)');
    const W2=world(),S2=W2.S,u=[W2.sp('howitzer',0,0,0),W2.sp('howitzer',0,30,0)];S2.abilCommand(u,'siege');W2.run(60);ok(u.every(x=>x.sieged),'C: abilCommand toggles a whole selection (siege)');S2.abilCommand(u,'siege');W2.run(60);ok(u.every(x=>!x.sieged),'C: and back');
    const W3=world(),S3=W3.S,hz=W3.sp('howitzer',0,0,0);hz.ab.siege.auto=true;const tg=W3.bld('generator',1,260,0);W3.eyes(0,100,50);W3.run(260);ok(hz.sieged&&tg.hp<tg.maxhp,'C: autocast Siege deploys a Howitzer when a structure is in deploy range');
  }

  /* ------------------------------------------------- D. upgrades + barrier */
  {const W=world(),S=W.S,T=W.T(0);T.era=2;T.c=2000;T.e=2000;
    const lab=W.bld('lab',0,0,0);const c0=T.c,e0=T.e;
    ok(S.queueResearch(lab,'barrier')&&T.c===c0-150&&T.e===e0-100,'D: Barrier Field I costs 150 crystals + 100 ether');
    W.run(1500);ok(T.barrier===1,'D: research completes (tier I) ');
    const gen=W.bld('generator',0,300,0),hub=S.G.buildings.find(b=>b.team===0&&b.type==='hub');W.run(10);
    ok(gen.sh===120&&gen.shMax===120&&hub.shMax===240,'D: every finished structure gets the barrier (120; Hubs 240)');
    S.damageEnt(gen,50,1,null);ok(gen.sh===70&&gen.hp===gen.maxhp,'D: the barrier absorbs damage before the hull');
    W.run(30*3);ok(gen.sh<120&&gen.sh===70,'D: no regeneration during the first 5 s without damage');
    W.run(30*6);ok(gen.sh===120,'D: then it recharges');
    T.c=2000;T.e=2000;const c1=T.c;ok(S.queueResearch(lab,'barrier')&&c1-T.c===200,'D: tier II costs more (200 crystals)');
    S.cancelQueue(lab,0);T.barrier=2;T.era=2;ok(!S.queueResearch(lab,'barrier'),'D: tier III is refused in Era II (era gate)');
    T.era=3;ok(S.queueResearch(lab,'barrier'),'D: and accepted in Era III');S.cancelQueue(lab,0);T.barrier=3;ok(S.techNext(T,'barrier')===null,'D: after tier III the line is complete');
    T.reactor=2;const m=W.sp('marksman',0,0,300);W.run(2);ok(m.emax===160,'D: Energy Cells II: maximum energy 160');
    T.cloakcell=2;const ph=W.sp('phantom',0,0,350);ph.energy=100;S.abUse(ph,'cloak');W.run(30);ok(near(100-ph.energy,0.6,0.02),'D: Cloak Cells II halve the cloak drain ('+(100-ph.energy).toFixed(2)+'/s)');
  }

  /* ------------------------------------------------- E. detector coverage */
  {const W=world(),S=W.S;const wt=W.sp('watcher',1,0,0),md=W.sp('mender',1,600,0);W.run(1);
    const c=(t,x,y)=>S.detectorsCover(t,W.cx+x,W.cy+y);
    ok(c(1,259,0)&&!c(1,262,0),'E: a Watcher detects out to 260');
    ok(c(1,600+229,0)&&!c(1,600+232,0),'E: a Mender detects out to 230');
    ok(!c(0,0,0),'E: detection is per team');
    ok(S.G.buildings.some(b=>b.team===1&&b.type==='hub')&&S.detectorsCover(1,S.G.buildings.find(b=>b.team===1&&b.type==='hub').x+150,S.G.buildings.find(b=>b.team===1&&b.type==='hub').y),'E: a Hub detects (200)');
  }

  /* ------------------------------------------------- F. counters (duel simulator, 4 seeds, equal cost) */
  {const S=load(undefined,xform);
    const sc=(a,b,seeds)=>{let s=0;for(let i=0;i<seeds;i++)s+=i%2===0?duel(S,a,b,i,{budget:1200}).score:-duel(S,b,a,i,{budget:1200}).score;return s/seeds;};
    const rel=[['lancer','juggernaut',.15],['lancer','mauler',.1],['flaktrooper','skiff',.5],['flaktrooper','interceptor',.5],['flaktrooper','phantom',.3],['interceptor','skiff',.2],['rifleman','phantom',.2],['dreadnought','titan',.5],['rifleman','dreadnought',.0]];
    for(const [a,b,min] of rel){const v=sc(a,b,4);ok(v>=min,'F: '+a+' beats '+b+' at equal cost (score '+v.toFixed(2)+' >= '+min+')');}
    const back=[['raptor','lancer',.2],['skiff','flaktrooper',.0]];
    // reverse relations: the counter of the counter
    ok(sc('raptor','lancer',4)>=.2,'F: Raptors beat Lancers (light rush vs piercing)');
    ok(sc('flaktrooper','rifleman',4)<=-.5,'F: a Flak Trooper cannot hurt ground units (loses to Riflemen)');
    ok(sc('skiff','flaktrooper',4)<=-.5,'F: and Skiffs lose to Flak');
  }

  /* ------------------------------------------------- G. campaign stays v5 */
  {const m=Lst.STORY.missions[0],S=load(undefined,xform);pin(S,5);S.newGame({campaign:m,aiBoth:true,autoResume:true});const G=S.G;
    ok(G.teams[0].arsOff===true&&G.teams[1].arsOff===true,'G: a campaign mission starts with the arsenal off for both sides');
    const hasDone=()=>{};void hasDone;
    const gar=S.addBuilding('garrison',0,10,10,true),fou=S.addBuilding('foundry',0,14,10,true),air=S.addBuilding('airfield',0,18,10,true),arm=S.addBuilding('armory',0,22,10,true);
    ok(S.prodList(gar).join()===['rifleman','raptor','rocketeer','mender',S.FACTIONS[G.teams[0].faction].unique].join()&&S.prodList(fou).join()==='howitzer,juggernaut,titan'&&S.prodList(air).join()==='skiff','G: Garrison / Foundry / Airfield train exactly the v5 lists');
    G.teams[0].era=3;G.teams[0].c=5000;G.teams[0].e=5000;
    ok(!S.reqUnit(0,'lancer').ok&&!S.reqUnit(0,'dreadnought').ok&&!S.reqBuild(0,'lab').ok&&!S.reqBuild(0,'siegeworks').ok,'G: new units and structures are locked ("'+S.reqUnit(0,'lancer').why+'")');
    G.teams[0].stims=1;ok(S.techNext(G.teams[0],'stims')===null&&S.techNext(G.teams[0],'barrier')===null&&S.techNext(G.teams[0],'weapons')!==null,'G: stims has only tier I, the new lines are closed, weapons keep their 3 tiers');
    const u=S.addUnit('raptor',0,G.sites[0].cx*32,G.sites[0].cy*32+120);S.step();ok(S.abCheck(u,'pounce')==='Locked in this mission','G: new abilities on v5 units are locked');
    const sp=S.addUnit('specter',0,G.sites[0].cx*32+60,G.sites[0].cy*32+160);S.step();S.step();ok(sp.cloaked,'G: the Specter keeps its permanent v5 cloak');
    const m2=Object.assign({},m,{setup:Object.assign({},m.setup||{},{arsenal:true})});const S2=load(undefined,xform);pin(S2,5);S2.newGame({campaign:m2,aiBoth:true,autoResume:true});
    ok(S2.G.teams[0].arsOff===false,'G: a mission can opt in with setup.arsenal');
  }
  {const S=load(undefined,xform);pin(S,5);S.newGame({seed:5,faction:'aurora',enemy:'meridian',arsenalOff:[false,true]});
    ok(S.G.teams[0].arsOff===false&&S.G.teams[1].arsOff===true,'G: per-team switch (the "legacy AI" used by the balance tests)');
    const gar=S.addBuilding('garrison',1,10,10,true);ok(S.prodList(gar).length===5,'G: the legacy side trains the v5 five only');
  }

  /* ------------------------------------------------- H. AI uses the new units */
  {const seen={};let exc=0,games=0,army=0;
    for(const [fa,fb,seed] of [['meridian','obsidian',31],['aurora','meridian',32],['obsidian','aurora',33]]){
      const S=load(undefined,xform);pin(S,seed);S.newGame({seed,faction:fa,enemy:fb,diff:'hard',aiBoth:true});games++;
      for(let i=0;i<30*60*9;i++){try{S.step();}catch(e){exc++;if(exc<3&&!quiet)console.log(e.stack.split('\n').slice(0,3).join('|'));}
        if(i%150===0)for(const u of S.G.units)if(!u.dead&&u.team<2&&S.UDEF[u.type].arsenal)seen[u.type]=(seen[u.type]||0)+1;
        if(S.G.over)break;}
      army+=S.G.units.filter(u=>!u.dead&&!u.def.worker&&u.team<2).length;
    }
    const kinds=Object.keys(seen);
    ok(exc===0,'H: three Hard AI-vs-AI games of 9 game-minutes: no exceptions');
    ok(kinds.length>=4,'H: the AI trains at least 4 different new unit types ('+kinds.join(' ')+')');
    ok(army>=20,'H: armies are alive at the end (production not stuck): '+army+' units');
  }

  /* ------------------------------------------------- I. determinism + J. save/restore */
  function hashOf(S){const G=S.G;let h=2166136261>>>0;const add=n=>{h^=Math.round(n*64)|0;h=Math.imul(h,16777619)>>>0;};
    add(G.tick);for(const u of G.units){add(u.x);add(u.y);add(u.hp);add(u.energy||0);add(u.sh||0);if(u.ab)for(const k in u.ab){add(u.ab[k].cd);add(u.ab[k].on?1:0);add(u.ab[k].t);}}
    for(const b of G.buildings){add(b.hp);add(b.sh||0);}for(const z of G.zones){add(z.t);add(z.x);}for(const t of G.teams){add(t.c||0);add(t.e||0);add(t.barrier||0);}add(G.rng()*1e6);return h;}
  function scenario(S){   // mid-fight state with every state machine active
    const G=S.G;const cx=G.sites[0].cx*32+200,cy=G.sites[0].cy*32+200;
    const mk=(t,tm,dx,dy)=>S.addUnit(t,tm,cx+dx,cy+dy);
    const ph=mk('phantom',0,0,0),ml=mk('mauler',0,40,0),su=mk('sunderer',0,0,60),dn=mk('dreadnought',0,60,60),bw=mk('bulwark',0,-50,0),dw=mk('watcher',0,-80,40),
      e1=mk('rifleman',1,300,0),e2=mk('titan',1,320,60),e3=mk('marksman',1,260,-60),rp=mk('raptor',0,0,-60);
    G.teams[0].era=3;G.teams[0].stims=2;G.teams[0].barrier=1;G.teams[0].optics=1;
    S.abUse(ph,'cloak');S.abUse(ml,'burrow');S.abUse(su,'siege');S.abUse(bw,'overcharge');S.abUse(dn,'lance',e2.x,e2.y,e2);S.abUse(dw,'scan',cx+250,cy);
    S.abUse(rp,'pounce',e1.x,e1.y,e1);e3.ab.snipe.auto=true;
    return S;
  }
  {const run=()=>{const S=load(undefined,xform);pin(S,9);S.newGame({seed:17,faction:'meridian',enemy:'aurora',diff:'hard',aiBoth:true});S.G.teams[0].arsOff=false;for(let i=0;i<1200;i++)S.step();scenario(S);for(let i=0;i<900;i++)S.step();return hashOf(S);};
    const a=run(),b=run();ok(a===b,'I: determinism: the same seed and Math.random stream give the same state hash with abilities active ('+a.toString(16)+' / '+b.toString(16)+')');
  }
  {const S=load(undefined,xform);let st=9;S.sandbox.Math.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
    S.newGame({seed:17,faction:'meridian',enemy:'aurora',diff:'hard',aiBoth:true});for(let i=0;i<1200;i++)S.step();scenario(S);for(let i=0;i<20;i++)S.step();
    const snap=S.gameSnapshot(),stSave=st;
    for(let i=0;i<600;i++)S.step();const hA=hashOf(S);
    st=stSave;const G2=S.gameRestore(snap);for(let i=0;i<600;i++)S.step();const hB=hashOf(S);
    ok(!!G2&&hA===hB,'J: snapshot taken in the middle of cloak / burrow / siege / overcharge / lance / scan / pounce, restored: 600 ticks give the same hash ('+hA.toString(16)+' / '+hB.toString(16)+')');
    const u=S.G.units.find(x=>x.type==='mauler'&&x.team===0&&!x.dead);ok(!u||(u.ab&&u.def===S.UDEF.mauler),'J: restored units keep their ability state and their shared definition');
  }
  return{fails,nOk};
}

/* ------------------------------------------------------------------ mutants (rule 15) */
const MUTANTS=[
  ['damage matrix: piercing armored/light swapped','prc:{light:0.75,armored:1.25','prc:{light:1.25,armored:0.75'],
  ['damage matrix: energy air/armored swapped','en: {light:1.15,armored:0.85,struct:0.85,air:1.15','en: {light:1.15,armored:1.15,struct:0.85,air:0.85'],
  ['armor class: massive not recognised','if(d.tags.massive)return\'massive\';return e.flying','return e.flying'],
  ['armor penetration ignored','if(pen)arm=Math.max(0,arm-pen);',''],
  ['ability cooldown not started','  s.cd=A.cd;if(team===0)uiDirty();return true;','  s.cd=0;if(team===0)uiDirty();return true;'],
  ['ability energy not paid','  if(A.energy)u.energy-=A.energy;\n',''],
  ['energy not checked','if(A.energy&&!(A.tgt===\'toggle\'&&on)&&u.energy<A.energy)return\'Not enough energy\';',''],
  ['stim tier II duration','STIMDUR=[8,8,11,14]','STIMDUR=[8,8,8,14]'],
  ['stim tier III HP cost','STIMHP=[12,12,12,6]','STIMHP=[12,12,12,12]'],
  ['siege minimum range ignored','&&!(src.sieged&&tooClose(src,t))',''],
  ['siege optics range','return u.sieged&&d.siege?d.siege.range+siegeRangeAdd(u):d.range','return u.sieged&&d.siege?d.siege.range:d.range'],
  ['shield does not absorb','if(e.sh>0)amt=shieldHit(e,amt);',''],
  ['barrier caps','BARRIER=[0,120,260,420]','BARRIER=[0,60,260,420]'],
  ['barrier regeneration delay','G.time-(b.shT||-99)>5','G.time-(b.shT||-99)>0'],
  ['flak splash also hits ground','!!e.flying!==!!p.aas','!!e.flying!==false'],
  ['detector radius','dx*dx+dy*dy<=d.r*d.r','dx*dx+dy*dy<=d.r*d.r*2'],
  ['campaign lock off','if(!s.arsenal)off=[true,true];','off=[false,false];'],
  ['legacy lists leak new units','if(!any)return list;','return list;if(!any)return list;'],
  ['cloak drain free','u.energy-=cloakDrain(u)*dt;','u.energy-=0;'],
  ['burrow does not mute','u.root=1;u.mute=1;u.path=null','u.root=1;u.path=null'],
  ['EMP keeps shields','e.sh=0;e.shExp=0;if(e.def.tags.mech)','if(e.def.tags.mech)'],
  ['snipe accepts any target','if(id===\'snipe\')return t.kind===\'unit\'&&!!t.def.tags.bio&&t.team!==u.team;',''],
  ['lance fires at once','!z.fired&&z.t+dt>=z.max','!z.fired'],
  ['tier gate removed','return T.arsOff&&R.base!==undefined?R.base:R.lv.length;','return R.lv.length;'],
  ['ability state not saved (zones dropped)','G.zones.push({type:\'lance\'','G.nozones.push({type:\'lance\''],
];
function runMutants(){
  let caught=0,miss=[];
  for(const [name,a,b] of MUTANTS){
    let hit=0;
    const xf=code=>{if(!code.includes(a))throw new Error('mutation anchor not found: '+a.slice(0,50));hit++;return code.replace(a,b);};
    let res;try{res=suite(xf,true);}catch(e){res={fails:['EXCEPTION '+(e.message||e).toString().slice(0,60)]};}
    if(res.fails.length){caught++;console.log('caught   '+name+'  <- '+res.fails[0].slice(0,100));}
    else{miss.push(name);console.log('NOT CAUGHT  '+name);}
  }
  console.log('\n'+caught+'/'+MUTANTS.length+' mutants caught');
  return miss;
}
if(require.main===module){
  if(process.argv.includes('--mutants')){const miss=runMutants();process.exit(miss.length?1:0);}
  const t0=Date.now();const r=suite(null,false);
  console.log('\n'+r.nOk+' checks passed, '+r.fails.length+' failed ('+((Date.now()-t0)/1000).toFixed(0)+' s)');
  if(r.fails.length){console.log('FAILED:\n  '+r.fails.join('\n  '));}
  else console.log('ALL ARSENAL CHECKS PASSED');
  process.exit(r.fails.length?1:0);
}
module.exports={suite};
