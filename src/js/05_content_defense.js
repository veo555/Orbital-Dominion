/* =========================================================================
   05_CONTENT_DEFENSE (v6-G1 FORTIFY) — data only: defensive structures, the Dropship, the infantry tag, the Defence build page,
   the Hub upgrades (Fortress, Scanner Sweep) and the tuning constants of the defence systems (docs/DESIGN_FORTIFY.md §4).
   Loads right after 00_core.js (alphabetical order) and extends its tables in place. SIM-SIDE: no DOM.
   ========================================================================= */
TAGNAME.infantry='infantry';
/* tag 'infantry': the units a Bunker accepts (ranged foot soldiers and the two ranged heroes) */
for(const k of['rifleman','rocketeer','mender','specter','hero_idris','hero_lyra'])UDEF[k].tags.infantry=1;
const FORT_B={
  wall:{name:'Wall',w:1,h:1,hp:640,armor:2,cost:{c:50,e:0},time:8,sight:90,era:1,wall:true,line:true,noWin:true,
    desc:'Cheap, tough 1×1 barrier. Drag to draw a line of segments; your Haulers build them one after another. Blocks enemy ground units, which must break through. Gives no supply.'},
  gate:{name:'Gate',w:2,h:1,hp:900,armor:2,cost:{c:100,e:0},time:14,sight:110,era:1,wall:true,gate:true,noWin:true,alt:'gatev',
    desc:'Openable wall section. Auto: your units pass, enemies are blocked. Open: everyone passes. Closed: nobody passes. Turns to fit between walls.'},
  gatev:{name:'Gate',w:1,h:2,hp:900,armor:2,cost:{c:100,e:0},time:14,sight:110,era:1,wall:true,gate:true,noWin:true,alt:'gate',menuHide:true,
    desc:'Openable wall section. Auto: your units pass, enemies are blocked. Open: everyone passes. Closed: nobody passes. Turns to fit between walls.'},
  bunker:{name:'Bunker',w:2,h:2,hp:550,armor:2,cost:{c:100,e:0},time:22,sight:220,era:1,req:'garrison',cargo:4,cargoTag:'infantry',fireFromInside:true,salvage:0.75,
    desc:'Holds 4 infantry (Riflemen, Rocketeers, Menders, Specters, ranged heroes). They are protected inside and fire with +1 tile range. Right-click it with infantry to load. Salvage refunds 75%.'},
  cannon:{name:'Cannon Tower',w:2,h:2,hp:420,armor:2,cost:{c:125,e:0},time:24,sight:200,era:1,req:'garrison',dmg:30,bon:{armored:12},cd:1.4,range:160,air:false,ground:true,proj:'shell',pspd:520,
    desc:'Short-range heavy cannon. Hits ground only; strong against armored vehicles and walkers. Cannot hit air.'},
  flak:{name:'Anti-Air Battery',w:2,h:2,hp:300,armor:1,cost:{c:100,e:25},time:22,sight:270,era:1,req:'garrison',dmg:18,bon:{air:6},cd:0.8,range:255,air:true,ground:false,proj:'rocket',pspd:640,
    desc:'Long-range anti-air missiles. Hits air units only.'},
  sensor:{name:'Sensor Tower',w:2,h:2,hp:220,armor:0,cost:{c:100,e:75},time:25,sight:160,era:2,req:'armory',radar:30*TILE,
    desc:'Radar: enemy units within 30 tiles show as red blips on the map and minimap. Shows no detail, does not lift the fog and does not detect cloaked units.'},
  battery:{name:'Repair Battery',w:2,h:2,hp:300,armor:1,cost:{c:100,e:50},time:24,sight:200,era:1,req:'garrison',healRate:18,healRange:6*TILE,healCost:0.2,
    desc:'Repairs the most damaged friendly unit or structure within 6 tiles (18 HP/s) using ether (0.2 per HP; Meridian half).'},
  mine:{name:'Proximity Mine',w:1,h:1,hp:40,armor:0,cost:{c:30,e:10},time:6,sight:70,era:1,req:'garrison',mine:true,noWin:true,noBlock:true,
    trigger:1.2*TILE,blast:52,dmg:60,bon:{light:25},limit:12,
    desc:'Buried charge, invisible to the enemy unless detected. Explodes with splash when an enemy ground unit comes within 1.2 tiles. Single use; 12 per player.'},
  rocks:{name:'Rock Formation',w:1,h:1,hp:1500,armor:1,cost:{c:0,e:0},time:1,sight:0,era:1,rock:true,noWin:true,menuHide:true,
    desc:'Neutral rocks blocking a passage. Attack them on purpose to open the route.'}
};
for(const k in FORT_B){const d=FORT_B[k];d.id=k;d.tags=tg('struct');d.ground=d.ground!==false;d.air=!!d.air;d.supply=d.supply||0;d.bon=d.bon||{};BDEF[k]=d;}
/* Dropship: flying transport (Airfield, Era II). size of a passenger = its supply (Titan and flyers cannot load) */
UDEF.dropship={name:'Dropship',hp:150,armor:1,speed:125,r:12,sight:220,cost:{c:100,e:100},supply:2,time:28,era:2,flying:true,noWeapon:true,cargo:8,tags:tg('air','mech'),
  desc:'Flying transport. Carries up to 8 supply of ground units (not Titans). Load: right-click it with units. Unload at a point (S) or here (D). Its cargo dies with it.',note:'Unarmed. Escort it.'};
{const d=UDEF.dropship;d.id='dropship';d.ground=true;d.air=false;d.flying=true;d.bon={};}
BDEF.airfield.prod.push('dropship');
BUILD_PAGES.push(['wall','gate','bunker','cannon','flak','sensor','battery','mine']);
/* tuning of the defence systems (31_defense.js / 32_cargo.js) */
const FORT={
  bunkerRange:TILE,                  // range bonus of a unit firing from inside a Bunker, beyond the Bunker's half-size
  hubEnergyMax:100,hubEnergy0:50,hubEnergyRate:0.5,
  scan:{energy:50,r:8*TILE,t:10,cd:2},
  fortress:{cost:{c:250,e:150},time:50,era:2,req:'armory',hpMul:1.5,armor:3,dmg:40,bon:{armored:10},splash:34,cd:2.0,range:250,pspd:420},
  unloadGap:0.3,                     // Dropship: seconds between two passengers at the drop point
  breachCost:14,breachCd:1.5,breachIter:6000,
  rockHpMul:1,
  richMul:1.4
};
/* every id this track adds: locked in campaign missions unless a mission unlocks it (45_campaign.js locked()) */
const FORT_NEW={wall:1,gate:1,gatev:1,bunker:1,cannon:1,flak:1,sensor:1,battery:1,mine:1,rocks:1,dropship:1,fortress:1,scan:1};
