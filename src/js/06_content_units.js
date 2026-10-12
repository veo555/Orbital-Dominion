/* =========================================================================
   06_CONTENT_UNITS (v6 ARSENAL) — new combat units, tech structures, upgrade lines, damage types and armor classes.
   SIM-SIDE DATA ONLY (headless: no DOM, canvas, audio). Loads right after 00_core.js and EXTENDS its tables (Object.assign / push), so the v5 entries stay
   exactly as they were; every entry added here carries `arsenal:true`. The rules that use these fields live in 33_abilities.js and the hooks in 20_sim.js / 30_systems.js.
   Campaign missions run with the v5 roster (G.arsenalOff, 33_abilities.js) unless the mission opts in with setup.arsenal.
   Field glossary (new, all optional):
     dt        damage type   'kin' (default, multiplier 1.0 on everything) | 'exp' explosive | 'en' energy | 'prc' piercing   (DMGX below)
     pen       armor penetration: flat armor points ignored by this weapon
     aaSplash  the splash hits FLYING targets only (ground units are never splashed by it)
     abil      ability ids (ABIL in 33_abilities.js), in command-card order
     energy / estart / eregen   energy pool, starting energy, regeneration per second (casters, cloakers, Watcher)
     fac       factions that can train it (omitted: all);   req: building that must exist (besides the producing one)
     role      one-line role shown on the info card;   aiCls: class used by the skirmish AI (42_ai_agent.js)
     regen     passive hp regeneration per second after 5 s without damage
   ========================================================================= */

/* ---------------------------- damage types x armor classes ---------------------------- */
/* Armor class of a target (one of five "size" classes; bio / mech stay tags for bonus damage):
     struct  every building          air     every flying unit          massive  tag 'massive' (Titan, Dreadnought)
     armored tag 'armored'           light   everything else
   DMGX[type][class] multiplies (base + bonus) BEFORE flat armor is subtracted.  'kin' is the calibration baseline of the whole v5 roster: all 1.0, so v5 units
   (which carry no dt) behave exactly as before. */
const ACLASSES=['light','armored','struct','air','massive'];
const DMGX={
  kin:{light:1.00,armored:1.00,struct:1.00,air:1.00,massive:1.00},
  exp:{light:0.95,armored:1.15,struct:1.20,air:1.00,massive:1.00},
  en: {light:1.15,armored:0.85,struct:0.85,air:1.15,massive:0.90},
  prc:{light:0.75,armored:1.25,struct:1.00,air:1.00,massive:1.25}};
const DTNAME={kin:'Kinetic',exp:'Explosive',en:'Energy',prc:'Piercing'};
const DTNOTE={kin:'baseline (x1.0 against everything)',exp:'strong vs structures and armor',en:'strong vs light units and air, weak vs armor and structures',prc:'strong vs armor, weak vs light units; ignores part of the armor'};
TAGNAME.massive='massive';TAGNAME.shield='shielded';

/* ---------------------------------- units ---------------------------------- */
const NEWU={
  lancer:{name:'Lancer',hp:110,armor:1,speed:74,r:10,sight:210,cost:{c:100,e:50},supply:2,time:24,dmg:30,cd:1.5,range:145,air:false,proj:'bolt',pspd:720,era:2,tags:tg('light','bio'),dt:'prc',pen:3,
    role:'Anti-armor infantry',aiCls:'anti',desc:'Armor-piercing slug thrower. Piercing damage ignores 3 armor and hits armored units and massive targets hard. Ground only.',note:'Weak against light infantry and melee rushers. Cannot hit air.'},
  flaktrooper:{name:'Flak Trooper',hp:70,armor:0,speed:80,r:9,sight:220,cost:{c:90,e:40},supply:2,time:22,dmg:8,bon:{air:9},cd:.9,range:190,air:true,ground:false,proj:'flak',pspd:560,splash:44,aaSplash:true,era:2,tags:tg('light','bio'),dt:'exp',
    role:'Anti-air specialist',aiCls:'aa',desc:'Flak cannon with a burst that hits every aircraft in the blast. Cannot target the ground.',note:'Helpless against ground units. Raptors, Reavers and Jackals eat it.'},
  interceptor:{name:'Interceptor',hp:100,armor:0,speed:175,r:10,sight:260,cost:{c:110,e:90},supply:2,time:24,dmg:10,bon:{air:6},cd:.55,range:150,air:true,ground:false,flying:true,proj:'bolt',pspd:720,era:2,tags:tg('air','mech'),dt:'en',
    role:'Air superiority fighter',aiCls:'air',desc:'Very fast air-to-air fighter with energy cannons. Cannot attack ground targets.',note:'Loses to Flak Troopers, Rocketeers and Turrets.'},
  watcher:{name:'Watcher',hp:55,armor:0,speed:115,r:9,sight:320,cost:{c:60,e:60},supply:1,time:16,flying:true,detect:260,noWeapon:true,era:2,tags:tg('air','mech'),energy:100,estart:100,eregen:.5,abil:['scan'],
    role:'Detector flyer',aiCls:'det',desc:'Flying sensor platform. Reveals cloaked units in a wide radius. Pulse Scan lights up an area (and strips cloaks) for a few seconds.',note:'Unarmed and fragile. Keep it behind the army.'},
  dreadnought:{name:'Dreadnought',hp:950,armor:3,speed:42,r:24,sight:280,cost:{c:500,e:350},supply:10,time:80,dmg:32,bon:{struct:16},cd:1.1,range:235,air:true,flying:true,proj:'bolt',pspd:640,era:3,tags:tg('air','mech','massive'),dt:'exp',
    energy:100,estart:100,eregen:.5,abil:['lance'],req:'lab',role:'Capital ship',aiCls:'cap',desc:'Capital ship. Slow, heavily armored and armed against both air and ground. Orbital Lance deletes a single target after a short charge.',note:'Needs a Research Lab. Massed Interceptors, Flak Troopers and Lancers bring it down.'},
  /* Meridian */
  sunderer:{name:'Sunderer',hp:190,armor:2,speed:64,r:13,sight:240,cost:{c:175,e:125},supply:3,time:32,dmg:20,cd:1.3,range:140,air:false,proj:'bolt',pspd:640,era:2,tags:tg('armored','mech'),dt:'prc',pen:1,
    siege:{dmg:54,cd:2.6,range:390,minr:120,splash:50,bon:{struct:18},dt:'exp'},abil:['siege'],fac:['meridian'],role:'Siege tank',aiCls:'art',
    desc:'Armored siege tank. Mobile mode fires piercing slugs; Siege Mode (S) deploys for a very long range explosive shell with splash, but cannot hit anything closer than 120. Ground only.',note:'A deployed Sunderer is helpless up close. Raptors and air break it.'},
  disruptor:{name:'Disruptor',hp:80,armor:0,speed:84,r:9,sight:230,cost:{c:125,e:100},supply:2,time:26,dmg:9,cd:1,range:130,air:true,proj:'bolt',pspd:700,era:2,tags:tg('light','mech'),dt:'en',
    energy:100,estart:60,eregen:.6,abil:['emp'],fac:['meridian'],role:'Caster (EMP)',aiCls:'cast',desc:'Caster. EMP Pulse drains energy and mana, tears down shields and barriers, breaks cloaks and slows mechanical units.',note:'Fragile. Useless without energy.'},
  /* Obsidian */
  jackal:{name:'Jackal',hp:62,armor:0,speed:165,r:8,sight:280,cost:{c:70,e:0},supply:1,time:14,dmg:5,bon:{light:2},cd:.45,range:105,air:false,proj:'bullet',pspd:660,era:2,tags:tg('light','bio'),
    abil:['sprint'],fac:['obsidian'],role:'Fast raider / scout',aiCls:'light',desc:'Cheap and very fast skirmisher. Scouts, picks off Haulers and runs. Sprint (S) adds a burst of speed.',note:'Dies to anything that catches it. Ground only.'},
  mauler:{name:'Mauler',hp:190,armor:1,speed:80,r:12,sight:215,cost:{c:100,e:60},supply:3,time:26,dmg:15,bon:{light:4},cd:.9,range:55,air:false,proj:'acid',pspd:480,era:2,tags:tg('armored','bio'),regen:1.5,
    abil:['burrow'],fac:['obsidian'],role:'Regenerating brawler',aiCls:'heavy',desc:'Tough biomech brawler that regenerates when left alone. Burrow (S) hides it underground (cloaked, healing fast) until it springs out.',note:'Short range. Lancers and Rocketeers hurt it; a detector exposes a burrowed Mauler.'},
  /* Aurora */
  marksman:{name:'Marksman',hp:72,armor:0,speed:80,r:9,sight:250,cost:{c:125,e:100},supply:2,time:26,dmg:14,cd:1.2,range:175,air:false,proj:'bullet',pspd:900,era:2,tags:tg('light','bio'),dt:'prc',pen:1,
    energy:100,estart:75,eregen:.9,abil:['snipe'],fac:['aurora'],role:'Caster (Snipe)',aiCls:'cast',desc:'Long-range rifleman. Snipe deals 130 damage to one biological target, ignoring armor.',note:'Snipe needs energy. Fragile; ground only.'},
  phantom:{name:'Phantom',hp:135,armor:0,speed:125,r:11,sight:250,cost:{c:150,e:125},supply:3,time:30,dmg:13,cd:.65,range:125,air:false,flying:true,proj:'bolt',pspd:700,era:2,tags:tg('air','mech'),dt:'en',
    energy:100,estart:100,eregen:.8,abil:['cloak'],fac:['aurora'],role:'Cloaked ground-attack flyer',aiCls:'air',desc:'Gunship that can cloak (drains energy). Energy cannons shred light infantry. Attacks only ground targets.',note:'Detectors (Mender, Turret, Watcher, Hub) reveal it; armored units shrug off its shots.'}
};
Object.assign(UDEF,NEWU);
for(const k in NEWU){const d=UDEF[k];d.id=k;d.arsenal=true;d.ground=d.ground!==false;d.air=!!d.air;d.flying=!!d.flying;d.bon=d.bon||{};d.supply=d.supply||0;}
UDEF.titan.tags.massive=1;                                   // display / damage-class only: no v5 bonus keys on it

/* v5 units gain abilities (the old Stim / Siege Mode buttons are now framework abilities; the others are new and arsenal-gated) */
UDEF.rifleman.abil=['stim'];UDEF.raptor.abil=['stim','pounce'];UDEF.howitzer.abil=['siege'];UDEF.reaver.abil=['pounce'];
UDEF.specter.abil=['cloak'];UDEF.specter.energy=100;UDEF.specter.estart=100;UDEF.specter.eregen=.6;UDEF.specter.cloakTog=true;
UDEF.bulwark.abil=['overcharge'];UDEF.bulwark.energy=100;UDEF.bulwark.estart=100;UDEF.bulwark.eregen=.5;
UDEF.titan.abil=['barrage'];UDEF.titan.energy=100;UDEF.titan.estart=100;UDEF.titan.eregen=.5;
/* roles + AI class for the v5 units (documentation / info card; the AI table AI_CLS in 42_ai_agent.js is unchanged) */
UDEF.rifleman.role='Line infantry';UDEF.raptor.role='Melee raider (anti-light)';UDEF.rocketeer.role='Anti-armor / anti-air missiles';UDEF.mender.role='Healer / detector';
UDEF.howitzer.role='Artillery';UDEF.juggernaut.role='Heavy walker';UDEF.skiff.role='Light fighter (air + ground)';UDEF.titan.role='Siege walker';
UDEF.bulwark.role='Shield walker';UDEF.reaver.role='Life-stealing berserker';UDEF.specter.role='Cloaked striker';UDEF.hauler.role='Worker';UDEF.freighter.role='Trader';

/* -------------------------------- buildings -------------------------------- */
const NEWB={
  lab:{name:'Research Lab',w:3,h:3,hp:650,armor:1,cost:{c:150,e:150},time:45,sight:200,era:2,req:'armory',research:['barrier','cloakcell','reactor'],prod:['disruptor','marksman'],
    desc:'Advanced research and casters: Barrier Field, Cloak Cells, Energy Cells. Trains the faction caster and unlocks the Dreadnought.'},
  siegeworks:{name:'Siege Works',w:3,h:3,hp:800,armor:1,cost:{c:175,e:125},time:48,sight:200,era:2,req:'foundry',prod:['sunderer'],research:['optics'],
    desc:'Builds Sunderer siege tanks (Meridian) and researches Siege Optics.'}
};
Object.assign(BDEF,NEWB);
for(const k in NEWB){const d=BDEF[k];d.id=k;d.arsenal=true;d.tags=tg('struct');d.ground=true;d.air=false;d.supply=d.supply||0;}
BDEF.garrison.prodAdd=['lancer','flaktrooper','jackal','mauler'];                  // after the v5 list: rifleman raptor rocketeer mender + faction unique
BDEF.airfield.prodAdd=['interceptor','watcher','phantom','dreadnought'];
BDEF.foundry.research=['optics'];
BDEF.airfield.desc='Builds Skiff fighters, Interceptors, Watchers, Phantoms (Aurora) and, with a Research Lab, Dreadnoughts.';
BDEF.foundry.desc='Builds heavy ground units: Howitzers, Juggernauts and (Era III) Titans. Researches Siege Optics.';
BUILD_PAGES[1].push('lab','siegeworks');

/* --------------------------------- research --------------------------------- */
/* tiered lines: lv[] = cost / time / era gate per level.  `base` = the number of levels that exist in a campaign mission (v5: stims had one level). */
TECH.stims.lv=[{c:100,e:100,time:50,era:2},{c:150,e:150,time:60,era:2},{c:200,e:200,time:70,era:3}];TECH.stims.base=1;
TECH.stims.desc='I: unlocks Overdrive (+50% speed and fire rate for 8s, 12 HP). II: lasts 11s. III: lasts 14s and costs only 6 HP.';
TECH.weapons.desc='+15% damage for all units per level (I-III).';TECH.armor.desc='+1 armor for all units per level (I-III).';
Object.assign(TECH,{
  barrier:{name:'Barrier Field',key:'barrier',at:'lab',icon:'barrier',lv:[{c:150,e:100,time:45,era:2},{c:200,e:150,time:60,era:2},{c:250,e:250,time:75,era:3}],
    desc:'Every finished structure gets a regenerating energy barrier that absorbs damage first: 120 / 260 / 420 (Hubs double). Recharges after 5s without damage.'},
  cloakcell:{name:'Cloak Cells',key:'cloakcell',at:'lab',icon:'cloakcell',lv:[{c:100,e:125,time:40,era:2},{c:150,e:200,time:55,era:3}],
    desc:'Cloaking drains 25% / 50% less energy (Specter, Phantom).'},
  reactor:{name:'Energy Cells',key:'reactor',at:'lab',icon:'reactor',lv:[{c:100,e:125,time:40,era:2},{c:150,e:200,time:55,era:3}],
    desc:'+30 / +60 maximum energy and +30% / +60% energy regeneration for all casters and cloakers.'},
  optics:{name:'Siege Optics',key:'optics',at:'foundry',icon:'optics',lv:[{c:125,e:100,time:45,era:2},{c:200,e:175,time:60,era:3}],
    desc:'Deployed siege units (Howitzer, Sunderer) gain +60 / +120 range.'}
});
for(const k in TECH)if(!TECH[k].base)TECH[k].base=['weapons','armor','mining','compress','cargo'].includes(k)?TECH[k].lv.length:0;
for(const k of['barrier','cloakcell','reactor','optics'])TECH[k].arsenal=true;
