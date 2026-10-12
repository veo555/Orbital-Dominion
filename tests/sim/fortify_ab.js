/* v6-G1 balance probes (docs/DESIGN_FORTIFY.md §6). Not a pass/fail gate: prints numbers.
   node tests/sim/fortify_ab.js [games=24] [tier=hard] [minutes=15]
   1. cost efficiency: each static defence vs an equal-cost group of each unit type (combat predictor 41_ai_lib.js, P(defence wins))
   2. headless A/B: T2 vs T2, one side with the defence layer (AI_FORT), the other without; every seed is played twice with the sides
      swapped (mirrored), factions rotate. Win rate of the defended side with a Wilson 95 % interval; timeouts count as half. */
'use strict';
const load=require('./simlib3.js');
const N=+(process.argv[2]||24),tier=process.argv[3]||'hard',mins=+(process.argv[4]||15);
const S0=load();
console.log('--- cost efficiency (P that the structure wins vs an equal-cost group; 1 structure)');
const units=['rifleman','raptor','rocketeer','juggernaut','skiff','howitzer'];
console.log('structure      '+units.map(u=>u.padStart(11)).join(''));
for(const b of['turret','cannon','flak','bunker4','fortress']){
  const row=S0.__run(`(function(){const out=[];for(const u of ${JSON.stringify(units)}){
    let st,cost;
    if('${b}'==='bunker4'){const r=cmbStackOf('rifleman',4,{hp:(4*55+550)/4});r.range+=FORT.bunkerRange+32;r.static=true;r.armor=2;st=[r];cost=100+4*50;}   // 4 Riflemen inside: the bunker's HP spread over them, armor 2, +64 px reach
    else if('${b}'==='fortress'){const s=cmbStackOf('hub',1,{hp:2250});s.armor+=FORT.fortress.armor;s.dmg+=FORT.fortress.dmg*s.cd/FORT.fortress.cd;st=[s];cost=400+250+150;}   // the Fortress cannon folded into the Hub's dps (no splash credit)
    else{st=[cmbStackOf('${b}',1,{})];cost=BDEF['${b}'].cost.c+BDEF['${b}'].cost.e;}
    for(const s of st)s.cost=cost;const c=UDEF[u].cost.c+UDEF[u].cost.e,n=cost/c;const e=cmbStackOf(u,n,{});e.cost=c;
    out.push(cmbPredict(st,[e]).p);}return out;})()`);
  console.log(b.padEnd(15)+row.map(p=>p.toFixed(2).padStart(11)).join(''));}
console.log('\n--- A/B: '+N+' games, tier '+tier+', '+mins+' min cap (defended side = AI_FORT on)');
const facs=[['meridian','obsidian'],['obsidian','aurora'],['aurora','meridian'],['obsidian','meridian'],['aurora','obsidian'],['meridian','aurora']];
let w=0,n=0,tO=0;const built={};const t0=Date.now();
for(let g=0;g<N;g++){
  const seed=101+(g>>1),def=g&1,[f0,f1]=facs[(g>>1)%facs.length];
  const S=load();let st=seed;S.sandbox.Math.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  S.__run(`AI_FORT.offTeams={${1-def}:true}`);
  S.newGame({seed,faction:f0,enemy:f1,aiBoth:true,diff:tier});
  for(let t=0;t<30*60*mins&&!S.G.over;t++)S.step();
  for(const b of S.G.buildings)if(b.team===def&&['wall','gate','gatev','bunker','battery'].includes(b.type))built[b.type]=(built[b.type]||0)+1;
  let r;const alive=t=>S.G.buildings.some(b=>!b.dead&&b.team===t&&!b.def.noWin);
  if(!alive(def))r=0;else if(!alive(1-def))r=1;else{r=0.5;tO++;}
  w+=r;n++;console.log(`game ${g+1} seed ${seed} ${f0} vs ${f1}, defended side ${def}: ${r===1?'WIN':r===0?'loss':'timeout'} t=${Math.round(S.G.time)}s`);}
const p=w/n,z=1.96,den=1+z*z/n,c=(p+z*z/(2*n))/den,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
console.log(`\nDEFENDED SIDE WIN RATE ${(100*p).toFixed(1)} % over ${n} games (Wilson 95 % ${(100*(c-h)).toFixed(1)}-${(100*(c+h)).toFixed(1)} %), ${tO} timeouts; structures alive at the end ${JSON.stringify(built)}; ${Math.round((Date.now()-t0)/1000)} s`);
