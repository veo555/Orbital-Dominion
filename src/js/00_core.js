'use strict';
/* =========================================================================
   ORBITAL DOMINION v3 — core constants, helpers and data tables
   ========================================================================= */
const TILE=32,MW=88,MH=88,WW=MW*TILE,WH=MH*TILE,NN=MW*MH,TICK=1/30,CS=64,CW=Math.ceil(WW/CS),CH=Math.ceil(WH/CS);
const TAU=Math.PI*2,MAXSUP=120;
let TOPBAR=44,BOTTOM=198; // heights of the HUD bars in CSS px; measureHud() (60_render.js) keeps them equal to the real DOM
const clamp=(v,a,b)=>v<a?a:(v>b?b:v),lerp=(a,b,t)=>a+(b-a)*t,hyp=Math.hypot;
const $=id=>document.getElementById(id);
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(rng){
  const N=128,g=new Float32Array(N*N);for(let i=0;i<g.length;i++)g[i]=rng();
  const sm=t=>t*t*(3-2*t);
  function n2(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
    const x0=((xi%N)+N)%N,y0=((yi%N)+N)%N,x1=(x0+1)%N,y1=(y0+1)%N;
    const a=g[y0*N+x0],b=g[y0*N+x1],c=g[y1*N+x0],d=g[y1*N+x1],u=sm(xf),v=sm(yf);
    return lerp(lerp(a,b,u),lerp(c,d,u),v);}
  return (x,y)=>n2(x,y)*0.55+n2(x*2.1+11,y*2.1+7)*0.3+n2(x*4.3+3,y*4.3+19)*0.15;
}
const tg=(...a)=>{const o={};for(const k of a)o[k]=1;return o;};
const fmtTime=s=>{s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};

/* ------------------------------ settings ----------------------------- */
const SETKEY='orbital_dominion_v3_settings';
const SET={music:0.45,sfx:0.8,voiceVol:0.9,edge:true,voice:true,hints:true,shake:true,faction:'meridian',enemy:'random',diff:'normal',swarm:true,swarmHints:true,quality:'auto',theme:'',cb:false,rm:false,haptics:true,wake:true,fps:false};
try{const s=JSON.parse(localStorage.getItem(SETKEY)||'null');if(s)Object.assign(SET,s);}catch(e){}
function saveSettings(){try{localStorage.setItem(SETKEY,JSON.stringify(SET));}catch(e){}}

/* ------------------------------ factions ----------------------------- */
const NEUTRAL_COL={base:'#9a8cb8',light:'#d9cdf2',dark:'#4a3f66',glow:'#b79cff'};
const FACTIONS={
  meridian:{id:'meridian',name:'Meridian Corps',tag:'Fortress builders',unique:'bulwark',hero:'hero_idris',
    col:{base:'#3d8bff',light:'#a6ceff',dark:'#17408f',glow:'#5aa9ff'},
    bonus:['Structures +20% HP','Repairs cost half as much','Unique: Bulwark shield-walker'],
    blurb:'Disciplined engineers who fortify every position and win by attrition.',style:'turtle'},
  obsidian:{id:'obsidian',name:'Obsidian Collective',tag:'Relentless aggressors',unique:'reaver',hero:'hero_kaz',
    col:{base:'#ff4d4d',light:'#ffb0a8',dark:'#8a1717',glow:'#ff6a5a'},
    bonus:['Units train 8% faster','Cheaper Raptors','Unique: Reaver life-stealing berserker'],
    blurb:'A war-cult that overwhelms the enemy before they can tech up.',style:'rush'},
  aurora:{id:'aurora',name:'Aurora Syndicate',tag:'Merchants & shadows',unique:'specter',hero:'hero_lyra',
    col:{base:'#27d3a2',light:'#a8ffe6',dark:'#0d6b55',glow:'#4dffd0'},
    bonus:['Trade profit +30%','Haulers carry +1 per trip','Exchange costs 40% less','Unique: Specter cloaked striker'],
    blurb:'Brokers of the void who out-earn rivals and strike from the dark.',style:'trader'}
};
const FACTION_IDS=['meridian','obsidian','aurora'];

/* -------------------------------- eras ------------------------------- */
const ERAS=[null,{n:1,name:'Landing',rom:'I'},{n:2,name:'Industrial',rom:'II',cost:{c:300,e:100},time:40},{n:3,name:'Orbital',rom:'III',cost:{c:500,e:300},time:60}];

/* ------------------------------- units ------------------------------- */
const TAGNAME={light:'light units',armored:'armored vehicles',struct:'structures',air:'air units',bio:'biological',mech:'mechanical'};
const UDEF={
  hauler:{name:'Hauler',hp:45,armor:0,speed:92,r:8,sight:200,cost:{c:50,e:0},supply:1,time:12,dmg:5,cd:1,range:12,worker:true,era:1,tags:tg('light','bio'),
    desc:'Gathers crystals and ether, constructs and repairs structures.',note:'Fragile. Use Call to Arms when raided.'},
  rifleman:{name:'Rifleman',hp:55,armor:0,speed:85,r:8,sight:210,cost:{c:50,e:0},supply:1,time:14,dmg:7,cd:.75,range:135,air:true,proj:'bullet',pspd:640,era:1,tags:tg('light','bio'),stim:true,
    desc:'Cheap all-round infantry. Hits ground and air.',note:'Loses to Raptors, Reavers and splash.'},
  raptor:{name:'Raptor',hp:85,armor:0,speed:132,r:9,sight:200,cost:{c:75,e:25},supply:2,time:18,dmg:11,bon:{light:5},cd:.6,range:16,era:1,tags:tg('light','bio'),stim:true,
    desc:'Fast melee raider that shreds light infantry. Cannot hit air.',note:'Loses to Juggernauts and splash damage.'},
  rocketeer:{name:'Rocketeer',hp:75,armor:0,speed:80,r:9,sight:220,cost:{c:100,e:50},supply:2,time:22,dmg:12,bon:{armored:14,struct:6},cd:1.2,range:165,air:true,proj:'rocket',pspd:390,era:2,tags:tg('light','bio'),
    desc:'Guided rockets. Devastating against armor; hits air.',note:'Loses to Raptors and Riflemen swarms.'},
  mender:{name:'Mender',hp:60,armor:0,speed:88,r:8,sight:220,cost:{c:75,e:50},supply:2,time:20,era:2,tags:tg('light','bio'),energy:100,heal:true,detect:230,noWeapon:true,
    desc:'Heals biological allies using energy. Reveals cloaked units nearby.',note:'Unarmed. Keep it behind the line.'},
  howitzer:{name:'Howitzer',hp:95,armor:1,speed:62,r:12,sight:230,cost:{c:150,e:125},supply:3,time:30,dmg:22,cd:2.2,range:170,splash:34,proj:'shell',pspd:330,era:2,tags:tg('armored','mech'),
    siege:{dmg:52,cd:2.6,range:350,splash:56,bon:{struct:25}},
    desc:'Artillery. Siege Mode (S) trebles range and adds splash but locks it in place. Ground targets only.',note:'Helpless up close. Loses to Raptors and air.'},
  juggernaut:{name:'Juggernaut',hp:320,armor:3,speed:68,r:15,sight:200,cost:{c:200,e:100},supply:4,time:36,dmg:26,bon:{light:6,struct:8},cd:1,range:95,proj:'bolt',pspd:520,era:2,tags:tg('armored','mech'),
    desc:'Heavy walker. Very durable and strong against light infantry.',note:'Loses to Rocketeers and air.'},
  skiff:{name:'Skiff',hp:125,armor:0,speed:140,r:11,sight:240,cost:{c:125,e:100},supply:2,time:26,dmg:14,bon:{light:4},cd:.9,range:140,air:true,flying:true,proj:'bolt',pspd:600,era:2,tags:tg('air','mech'),
    desc:'Fast fighter craft that ignores terrain. Hits air and ground.',note:'Loses to Riflemen, Rocketeers and Turrets.'},
  titan:{name:'Titan',hp:900,armor:4,speed:52,r:19,sight:240,cost:{c:400,e:300},supply:8,time:60,dmg:55,bon:{struct:25},cd:1.8,range:215,splash:42,proj:'shell',pspd:420,era:3,tags:tg('armored','mech'),
    desc:'Colossal siege walker. Splash cannon crushes bases and armies.',note:'Slow. Loses to massed Rocketeers.'},
  freighter:{name:'Freighter',hp:140,armor:0,speed:106,r:11,sight:200,cost:{c:150,e:0},supply:2,time:22,era:2,tags:tg('light','mech'),trade:true,noWeapon:true,
    desc:'Runs trade routes. Right-click a Trading Post to start; profit scales with distance.',note:'Unarmed. Raiders will hunt it.'},
  /* faction-unique units */
  bulwark:{name:'Bulwark',hp:280,armor:3,projArmor:2,speed:70,r:13,sight:210,cost:{c:150,e:75},supply:3,time:28,dmg:18,bon:{light:4},cd:.9,range:105,air:true,proj:'bolt',pspd:520,era:2,tags:tg('armored','bio'),unique:true,
    desc:'Shielded walker. Extra armor against ranged attacks; hits air and ground.',note:'Loses to Rocketeers.'},
  reaver:{name:'Reaver',hp:120,armor:0,speed:138,r:10,sight:205,cost:{c:100,e:50},supply:2,time:20,dmg:15,bon:{light:3},cd:.65,range:16,lifesteal:.5,era:2,tags:tg('light','bio'),unique:true,
    desc:'Berserker that heals for half of the damage it deals. Cannot hit air.',note:'Loses to Juggernauts and splash.'},
  specter:{name:'Specter',hp:70,armor:0,speed:112,r:9,sight:230,cost:{c:125,e:75},supply:2,time:24,dmg:24,bon:{light:3},cd:1.1,range:125,proj:'bolt',pspd:640,cloak:true,era:2,tags:tg('light','bio'),unique:true,
    desc:'Permanently cloaked striker. Only visible to Menders, Turrets and Hubs. Cannot hit air.',note:'Fragile once detected.'},
  /* neutral creatures */
  crawler:{name:'Dune Crawler',hp:75,armor:0,speed:96,r:9,sight:200,dmg:9,cd:.8,range:16,creep:true,bounty:14,xp:30,era:1,tags:tg('light','bio'),supply:0,desc:'Hostile native creature.'},
  spitter:{name:'Acid Spitter',hp:55,armor:0,speed:84,r:9,sight:220,dmg:11,cd:1.1,range:150,air:true,proj:'acid',pspd:420,creep:true,bounty:22,xp:45,era:1,tags:tg('light','bio'),supply:0,desc:'Hostile native creature.'},
  brute:{name:'Ancient Brute',hp:430,armor:2,speed:70,r:16,sight:200,dmg:32,cd:1.4,range:30,creep:true,bounty:70,xp:130,era:1,tags:tg('armored','bio'),supply:0,desc:'Hostile native creature.'}
};
/* heroes (one per faction) */
const HERO_LVL_XP=[0,0,180,450,850,1400,2100];
const HERO_MAXLVL=6;
UDEF.hero_idris={name:'Marshal Idris',hero:true,hid:'idris',faction:'meridian',hp:520,armor:2,speed:88,r:12,sight:250,cost:{c:250,e:100},supply:3,time:35,dmg:26,cd:.9,range:150,air:true,proj:'bullet',pspd:640,era:1,tags:tg('light','bio'),mana:100,
  desc:'Meridian commander. Projects a defensive banner and calls down orbital fire.',note:'Hero — revives at the Hub.'};
UDEF.hero_kaz={name:'Warlord Kaz',hero:true,hid:'kaz',faction:'obsidian',hp:620,armor:2,speed:96,r:13,sight:240,cost:{c:250,e:100},supply:3,time:35,dmg:34,bon:{light:4},cd:1.0,range:26,era:1,tags:tg('light','bio'),mana:100,
  desc:'Obsidian war-chief. A frontline brawler that drives allies into a frenzy.',note:'Hero — revives at the Hub.'};
UDEF.hero_lyra={name:'Seer Lyra',hero:true,hid:'lyra',faction:'aurora',hp:420,armor:1,speed:92,r:11,sight:260,cost:{c:250,e:100},supply:3,time:35,dmg:22,cd:.8,range:165,air:true,proj:'bolt',pspd:620,era:1,tags:tg('light','bio'),mana:120,
  desc:'Aurora seer. Mends allies, veils them in shadow and bends space itself.',note:'Hero — revives at the Hub.'};
/* hero skills: aura, active, ultimate */
const SKILLS={
  hero_idris:[
    {id:'banner',name:'Bulwark Banner',passive:true,max:3,req:[1,3,5],desc:lv=>`Aura: allies within 300 range gain +${lv} armor.`},
    {id:'barrage',name:'Suppressive Barrage',max:3,req:[1,3,5],cd:16,mana:50,range:380,radius:130,target:'point',desc:lv=>`Shell an area: ${30+20*lv} damage and 45% slow for 5s.`},
    {id:'orbital',name:'Orbital Strike',max:1,req:[4],cd:70,mana:100,range:540,radius:170,target:'point',desc:()=>`After a 2s warning an orbital beam deals 240 damage (300 to structures).`}],
  hero_kaz:[
    {id:'bloodlust',name:'Bloodlust',passive:true,max:3,req:[1,3,5],desc:lv=>`Aura: allies within 300 attack ${8*lv}% faster.`},
    {id:'shock',name:'Shockwave',max:3,req:[1,3,5],cd:15,mana:50,range:170,radius:130,target:'point',desc:lv=>`Slam the ground: ${30+20*lv} damage and stun for ${(0.8+0.4*lv).toFixed(1)}s.`},
    {id:'rampage',name:'Rampage',max:1,req:[4],cd:90,mana:90,range:0,radius:300,target:'self',desc:()=>`Nearby allies gain +40% speed and +40% damage for 12s.`}],
  hero_lyra:[
    {id:'regen',name:'Regeneration',passive:true,max:3,req:[1,3,5],desc:lv=>`Aura: allies within 300 regenerate ${(1.5*lv).toFixed(1)} HP/s.`},
    {id:'veil',name:'Phase Veil',max:3,req:[1,3,5],cd:24,mana:50,range:0,radius:230,target:'self',desc:lv=>`Cloak all allies around her for ${6+2*lv}s. Attacking breaks the veil.`},
    {id:'sing',name:'Singularity',max:1,req:[4],cd:80,mana:100,range:460,radius:200,target:'point',desc:()=>`Drags enemies to a point for 3s, dealing 25 damage per second.`}]
};

/* ------------------------------ buildings ----------------------------- */
const BDEF={
  hub:{name:'Command Hub',w:4,h:4,hp:1500,armor:1,cost:{c:400,e:0},time:70,supply:10,sight:270,era:1,dropoff:true,detect:200,prod:['hauler'],
    dmg:8,cd:1,range:235,air:true,ground:true,proj:'bolt',pspd:600,
    desc:'Main base. Drop-off point, trains Haulers and your Hero, advances your Era. Fires on attackers; sheltered Haulers add firepower.'},
  generator:{name:'Generator',w:2,h:2,hp:350,armor:1,cost:{c:100,e:0},time:20,supply:8,sight:150,era:1,desc:'Provides +8 supply.'},
  depot:{name:'Depot',w:2,h:2,hp:400,armor:1,cost:{c:75,e:0},time:18,sight:160,era:1,dropoff:true,research:['mining','compress','cargo'],
    desc:'Forward drop-off point for resources. Researches gathering upgrades.'},
  siphon:{name:'Ether Siphon',w:2,h:2,hp:450,armor:1,cost:{c:75,e:0},time:25,sight:150,era:1,onGeyser:true,desc:'Built on an ether geyser. Send Haulers here (right-click) to extract ether.'},
  habitat:{name:'Habitat',w:2,h:2,hp:300,armor:0,cost:{c:100,e:0},time:22,sight:150,era:1,req:'hub',cap:10,desc:'Houses 10 colonists who pay taxes each second. Colonists only settle while morale is above 45%.'},
  garrison:{name:'Garrison',w:3,h:3,hp:1000,armor:1,cost:{c:150,e:0},time:40,sight:200,era:1,req:'hub',
    desc:'Trains infantry and your faction\'s unique unit.'},
  armory:{name:'Armory',w:3,h:3,hp:750,armor:1,cost:{c:100,e:50},time:35,sight:200,era:1,req:'garrison',research:['weapons','armor','stims'],
    desc:'Researches weapon, armor and combat upgrades.'},
  forum:{name:'Forum',w:3,h:3,hp:600,armor:1,cost:{c:125,e:0},time:30,sight:190,era:2,req:'hub',morale:6,desc:'Civic center: +6 morale (up to three Forums count).'},
  exchange:{name:'Exchange',w:3,h:3,hp:700,armor:1,cost:{c:150,e:50},time:38,sight:190,era:2,req:'hub',prod:['freighter'],market:true,
    desc:'Trade crystals and ether on the shared market, and dispatch Freighters to Trading Posts.'},
  foundry:{name:'Foundry',w:3,h:3,hp:900,armor:1,cost:{c:150,e:100},time:45,sight:200,era:2,req:'armory',prod:['howitzer','juggernaut','titan'],
    desc:'Builds heavy ground units: Howitzers, Juggernauts and (Era III) Titans.'},
  airfield:{name:'Airfield',w:3,h:3,hp:850,armor:1,cost:{c:150,e:100},time:42,sight:200,era:2,req:'armory',prod:['skiff'],desc:'Builds Skiff fighter craft.'},
  turret:{name:'Defense Turret',w:2,h:2,hp:320,armor:2,cost:{c:100,e:0},time:20,sight:230,era:1,req:'garrison',dmg:14,cd:.7,range:195,air:true,ground:true,proj:'bolt',pspd:600,detect:230,
    desc:'Automated defense. Hits ground and air and detects cloaked units.'}
};
for(const k in BDEF){const d=BDEF[k];d.id=k;d.tags=tg('struct');d.ground=d.ground!==false;d.air=!!d.air;d.supply=d.supply||0;}
for(const k in UDEF){const d=UDEF[k];d.id=k;d.ground=true;d.air=!!d.air;d.flying=!!d.flying;d.bon=d.bon||{};d.supply=d.supply||0;}
const BUILD_PAGES=[['hub','generator','siphon','depot','garrison','armory','habitat','turret'],['forum','exchange','foundry','airfield']];

/* ------------------------------ research ------------------------------ */
const TECH={
  weapons:{name:'Weapon Systems',key:'wl',at:'armory',icon:'wpn',lv:[{c:100,e:100,time:40,era:1},{c:175,e:175,time:60,era:2},{c:250,e:250,time:80,era:3}],desc:'+15% damage for all units per level.'},
  armor:{name:'Plating',key:'al',at:'armory',icon:'arm',lv:[{c:100,e:100,time:40,era:1},{c:175,e:175,time:60,era:2},{c:250,e:250,time:80,era:3}],desc:'+1 armor for all units per level.'},
  stims:{name:'Combat Stims',key:'stims',at:'armory',icon:'stim',lv:[{c:100,e:100,time:50,era:2}],desc:'Unlocks Overdrive for Riflemen and Raptors: +50% speed and fire rate for 8s at a cost of 12 HP.'},
  mining:{name:'Mining Lasers',key:'mining',at:'depot',icon:'gem',lv:[{c:100,e:0,time:35,era:1}],desc:'+20% crystals per trip.'},
  compress:{name:'Ether Compression',key:'compress',at:'depot',icon:'eth',lv:[{c:100,e:50,time:35,era:2}],desc:'+20% ether per trip.'},
  cargo:{name:'Cargo Hooks',key:'cargo',at:'depot',icon:'cargo',lv:[{c:125,e:50,time:40,era:2}],desc:'Haulers carry 2 more resources per trip.'}
};
const TAX=[{n:'Low',inc:0.012,mor:14},{n:'Normal',inc:0.03,mor:0},{n:'High',inc:0.055,mor:-18}];

/* --------------------------- neutral creep camps ---------------------- */
const CAMP_TYPES={
  1:['crawler','crawler','crawler','spitter'],
  2:['crawler','crawler','spitter','spitter','brute'],
  3:['brute','brute','brute','spitter','spitter']
};
const DIFF={
  easy:{mult:0.85,iv:1.1,base:30,step:14,first:540,hubs:[360,820],air:false,hero:false,creep:false,smart:0.2},
  normal:{mult:1.0,iv:0.7,base:24,step:12,first:380,hubs:[210,600],air:true,hero:true,creep:true,smart:0.6},
  hard:{mult:1.25,iv:0.45,base:18,step:10,first:250,hubs:[140,400,720],air:true,hero:true,creep:true,smart:1.0}
};

/* =========================================================================
   SWARM LAYER (v3) — agent roles, colony calendar, wages, gear, job clients
   ========================================================================= */
/* Colony calendar: a base-6 ladder.  1 colony-minute = 10 s of game time, hour = 60 s, day = 360 s (one day/night cycle), month = 2160 s. */
const PAY={min:10,hour:60,day:360,month:2160};
/* Cadence ladder: a flexibility premium for short commitments, a discount for long ones.
   float=true  -> re-priced every period at the spot wage index W(t);  float=false -> rate locked at signing. */
const CADS=[
  {id:'min',  name:'Minute',per:'min', secs:PAY.min,  mult:1.35,float:true, blurb:'Spot rate, re-priced every 10 s. Cancel any time.'},
  {id:'hour', name:'Hour',  per:'hr',  secs:PAY.hour, mult:1.15,float:true, blurb:'Spot rate, re-priced every 60 s.'},
  {id:'day',  name:'Day',   per:'day', secs:PAY.day,  mult:0.95,float:false,blurb:'Rate locked at signing. Billed every 360 s.'},
  {id:'month',name:'Month', per:'mo',  secs:PAY.month,mult:0.72,float:false,blurb:'Deepest discount. Rate locked, billed every 2160 s up front.'},
  {id:'task', name:'Task',  per:'task',secs:0,        mult:1.22,float:false,blurb:'Fixed price paid on completion. Escrowed up front.'}];
const CADI={};for(const c of CADS)CADI[c.id]=c;
const WAGE_K=0.03;        // wage per second = WAGE_K * sqrt(cost.c + 1.3*cost.e)  (before skill, cadence, index)
const SKILL_WAGE=0.22;    // +22% wage per skill level above 1
const WALLET_CAP=400;
const AG_XP=[0,0,50,140,280,480];
const AG_MAXLVL=5;
const GEAR=[null,{n:'Mk I',c:45},{n:'Mk II',c:110,need:'armory'},{n:'Mk III',c:220,need:'armory',era:2}];
const ROLES={
  mine:  {n:'Miner',      g:'M',ing:'mining crystals',col:'#6ad0ff',grp:'Economy', k:'worker',d:'Mines crystals; balances itself across fields.'},
  ether: {n:'Etherworker',g:'E',ing:'extracting ether',col:'#c58bff',grp:'Economy', k:'worker',d:'Extracts ether from siphons.'},
  build: {n:'Builder',    g:'B',ing:'building',col:'#ffd45a',grp:'Economy', k:'worker',d:'Takes construction tickets, assists builds, repairs, otherwise mines.'},
  repair:{n:'Mechanic',   g:'R',ing:'repairing',col:'#ffa24a',grp:'Economy', k:'worker',d:'Repairs damaged structures; otherwise mines.'},
  trade: {n:'Trader',     g:'T',ing:'running trade routes',col:'#7dffa8',grp:'Economy', k:'trade', d:'Runs the most profitable trade route.'},
  scout: {n:'Scout',      g:'S',ing:'scouting',col:'#a8e6ff',grp:'Recon',   k:'any',   d:'Explores the stalest parts of the map.'},
  guard: {n:'Guard',      g:'G',ing:'on guard',col:'#7cd0ff',grp:'War',     k:'armed', d:'Holds a post and answers alarms nearby.'},
  patrol:{n:'Patrol',     g:'P',ing:'patrolling',col:'#8fe0c0',grp:'War',     k:'armed', d:'Walks a loop and engages whatever it meets.'},
  hunt:  {n:'Hunter',     g:'H',ing:'hunting creeps',col:'#ffb070',grp:'War',     k:'armed', d:'Clears creep camps once the party is strong enough.'},
  assault:{n:'Raider',    g:'A',ing:'raiding',col:'#ff6a5a',grp:'War',     k:'armed', d:'Marches on the enemy base with the wave.'},
  escort:{n:'Escort',     g:'X',ing:'escorting',col:'#c8b0ff',grp:'War',     k:'any',   d:'Follows a unit and fights for it.'},
  medic: {n:'Medic',      g:'+',ing:'healing',col:'#8affc0',grp:'Support', k:'heal',  d:'Follows the wounded and the army.'},
  gig:   {n:'On Contract',g:'$',ing:'on a job',col:'#ffe27a',grp:'Market',  k:'any',   d:'Working a job from the job board.'},
  free:  {n:'Free',       g:'·',ing:'free',col:'#9aa6b8',grp:'—',       k:'any',   d:'Autonomous but without a directive.'}};
const ROLE_ORDER=['mine','ether','build','repair','trade','scout','guard','patrol','hunt','assault','escort','medic'];
/* freelancer archetypes the labour market can offer, gated by era */
const FREE_TYPES=[
  {t:'hauler',  era:1,roles:['mine','ether','build','repair'],w:3},
  {t:'rifleman',era:1,roles:['guard','patrol','hunt','escort'],w:2.4},
  {t:'raptor',  era:1,roles:['guard','patrol','scout','hunt'],w:1.4},
  {t:'rocketeer',era:2,roles:['guard','hunt','assault'],w:1.4},
  {t:'mender',  era:2,roles:['medic'],w:1.1},
  {t:'skiff',   era:2,roles:['scout','guard','patrol'],w:1},
  {t:'juggernaut',era:2,roles:['guard','hunt','assault'],w:0.9}];
const FREE_NAMES=['Ash','Brio','Calder','Dax','Edda','Fenn','Garr','Hale','Iko','Juno','Kade','Lior','Mace','Nox','Orla','Pike','Quill','Rook','Sable','Tarn','Ulla','Vex','Wren','Xan','Yara','Zed'];
const CLIENTS=[
  {id:'helios',name:'Helios Mining Co-op',col:'#6ad0ff',types:['quota','station']},
  {id:'kestrel',name:'Kestrel Logistics',col:'#7dffa8',types:['courier','relay']},
  {id:'vantage',name:'Vantage Survey Guild',col:'#a8e6ff',types:['survey','courier']},
  {id:'bastion',name:'Bastion Security Ltd',col:'#ff9a6a',types:['clear','station']}];
const JOB_NAMES={survey:'Survey',courier:'Courier run',clear:'Camp clearance',quota:'Mining bounty',station:'Guard retainer',relay:'Relay retainer'};
