/* Duel simulator (v6 ARSENAL): every pair of combat unit types at EQUAL COST in an open arena, N seeds, headless and deterministic.
     node tests/sim/duel.js                       full matrix (budget 1500, 12 seeds, detector variant) -> table + outliers
     node tests/sim/duel.js --seeds 20 --budget 1500 --units lancer,juggernaut,skiff --bare
     node tests/sim/duel.js --json out.json
   score(A vs B) = (cost-weighted hp left of A  -  that of B) / (starting cost of one side), seed-averaged; +1 = A wipes B without a scratch, 0 = even.
   Rules of the arena: both sides march at each other (attack-move) in the open; abilities are on autocast (as a Hard/Master AI would use them);
   Menders/Watchers are not part of the budget. --bare: no detector for either side (cloakers are then immune until they shoot).
   Exported for tests/sim/arsenal.js:  duel(S,a,b,seed,opts) -> {score,winner,ticks,left:[a,b]}  and  UNITS.  */
'use strict';
const load=require('./simlib3.js');
const UNITS=['rifleman','raptor','rocketeer','howitzer','juggernaut','skiff','titan','bulwark','reaver','specter',
  'lancer','flaktrooper','interceptor','dreadnought','sunderer','disruptor','jackal','mauler','marksman','phantom'];

function arena(S){
  const G=S.G,TILE=S.TILE,MW=S.MW,MH=S.MH;
  const hubs=G.buildings.filter(b=>b.type==='hub');
  for(const [W,H,minFar] of [[26,12,900],[22,10,700],[18,8,500],[16,6,300]]){
    let best=null,bd=1e18;
    for(let ty=3;ty<MH-H-3;ty+=2)for(let tx=3;tx<MW-W-3;tx+=2){
      const h0=G.H[ty*MW+tx];let ok=true;
      for(let y=0;y<H&&ok;y++)for(let x=0;x<W;x++){const i=(ty+y)*MW+tx+x;if(G.blocked[i]||G.H[i]!==h0||G.RAMP[i]){ok=false;break;}}
      if(!ok)continue;
      const cx=(tx+W/2)*TILE,cy=(ty+H/2)*TILE;let far=1e9;for(const h of hubs)far=Math.min(far,Math.hypot(h.x-cx,h.y-cy));
      if(far<minFar)continue;const d=Math.hypot(cx-MW*TILE/2,cy-MH*TILE/2);
      if(d<bd){bd=d;best={x0:tx*TILE,y0:ty*TILE,w:W*TILE,h:H*TILE};}
    }
    if(best)return best;
  }
  return null;
}
function value(S,id){const d=S.UDEF[id];return d.cost.c+d.cost.e;}
function spawn(S,id,team,n,ax,ay,dir,jit){
  const L=[];const cols=Math.max(1,Math.ceil(Math.sqrt(n/2)));const sp=Math.max(22,S.UDEF[id].r*2+6);
  for(let i=0;i<n;i++){
    const c=i%cols,r=Math.floor(i/cols);
    const x=ax-dir*c*sp+jit(),y=ay+(r-n/cols/2)*sp*0.9+jit();
    L.push(S.addUnit(id,team,x,y));
  }
  return L;
}
function duel(S,a,b,seed,o){
  o=o||{};const budget=o.budget||1500;
  S.newGame({seed:1000+seed*7,faction:o.fa||'meridian',enemy:o.fb||'obsidian',arsenalOff:[false,false]});
  const G=S.G;G.ais=[null,null];
  for(const u of G.units.slice())u.dead=true;G.units=[];
  const A=arena(S);if(!A)throw new Error('no arena on seed '+seed);
  const cy=A.y0+A.h/2,xa=A.x0+60,xb=A.x0+A.w-60,rng=G.rng;
  const jit=()=>(rng()-.5)*6;
  const na=Math.max(1,Math.round(budget/value(S,a))),nb=Math.max(1,Math.round(budget/value(S,b)));
  const ua=spawn(S,a,0,na,xa,cy,1,jit),ub=spawn(S,b,1,nb,xb,cy,-1,jit);
  let det=[];
  if(!o.bare){det.push(S.addUnit('watcher',0,xa-70,cy));det.push(S.addUnit('watcher',1,xb+70,cy));}
  const v0a=na*value(S,a),v0b=nb*value(S,b);
  const arm=(L,gx)=>{for(const u of L){if(u.ab)for(const id in u.ab)u.ab[id].auto=true;S.setOrder(u,{t:'attackmove',x:gx,y:cy,gs:0});}};
  arm(ua,xb);arm(ub,xa);
  for(const u of ua.concat(ub)){u.home={x:u.x,y:u.y};}
  let t=0;const T=o.ticks||2400;
  const alive=L=>L.some(u=>!u.dead);
  for(;t<T;t++){
    S.step();
    if(t%20===0){ // re-issue attack-move for idle survivors (units that finished their move stand idle and still acquire)
      for(const u of ua)if(!u.dead&&u.order.t==='idle'&&!u.sieged&&!u.mute)S.setOrder(u,{t:'attackmove',x:xb,y:cy,gs:0});
      for(const u of ub)if(!u.dead&&u.order.t==='idle'&&!u.sieged&&!u.mute)S.setOrder(u,{t:'attackmove',x:xa,y:cy,gs:0});
      for(const d of det){if(d.dead)continue;const own=d.team===0?ua:ub,al=own.filter(u=>!u.dead&&!u.def.noWeapon&&u.def.speed<=140);   // the detector follows its army (as the AI's Watcher does)
        if(al.length){let cx=0,cy2=0;for(const u of al){cx+=u.x;cy2+=u.y;}cx/=al.length;cy2/=al.length;const bx=cx+(d.team===0?-40:40);if(Math.hypot(d.x-bx,d.y-cy2)>60)S.setOrder(d,{t:'move',x:bx,y:cy2});}}}
    if(!alive(ua)||!alive(ub))break;
  }
  const left=L=>L.reduce((s,u)=>s+(u.dead?0:value(S,u.type)*Math.max(0,u.hp)/u.maxhp),0);
  const la=left(ua),lb=left(ub);
  const score=(la/v0a*Math.min(1,v0a/budget)-lb/v0b*Math.min(1,v0b/budget));   // fraction of the side's value left
  return{score,winner:la>lb*1.0001?a:lb>la*1.0001?b:'draw',ticks:t,left:[la/v0a,lb/v0b],n:[na,nb]};
}
module.exports={duel,UNITS,arena};
if(require.main===module){
  const args=process.argv.slice(2);const arg=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
  const seeds=+arg('seeds',12),budget=+arg('budget',1500),bare=args.includes('--bare');
  const units=(arg('units','')||'').split(',').filter(Boolean);const U=units.length?units:UNITS;
  const S=load();const M={};
  const t0=Date.now();
  for(let i=0;i<U.length;i++)for(let j=i+1;j<U.length;j++){
    let sum=0,wa=0,wb=0;
    for(let s=0;s<seeds;s++){
      // mirrored: A on the left for even seeds, on the right for odd seeds
      const r=s%2===0?duel(S,U[i],U[j],s,{budget,bare}):duel(S,U[j],U[i],s,{budget,bare});
      const sc=s%2===0?r.score:-r.score;sum+=sc;if(sc>0.02)wa++;else if(sc<-0.02)wb++;
    }
    M[U[i]+'|'+U[j]]={score:sum/seeds,wa,wb,seeds};
  }
  const out={budget,seeds,bare,units:U,M};
  if(arg('json')){require('fs').writeFileSync(arg('json'),JSON.stringify(out));}
  // table: row beats column when > 0
  const pad=(s,n)=>(s+' '.repeat(n)).slice(0,n);
  console.log('score(row vs column), +1 row wins clean, budget '+budget+', '+seeds+' seeds, '+(bare?'no detectors':'one Watcher per side')+', '+((Date.now()-t0)/1000).toFixed(0)+'s');
  console.log(pad('',12)+U.map(u=>pad(u.slice(0,6),7)).join(''));
  const get=(a,b)=>{if(a===b)return 0;const k=U.indexOf(a)<U.indexOf(b)?a+'|'+b:b+'|'+a;const m=M[k];return U.indexOf(a)<U.indexOf(b)?m.score:-m.score;};
  const avg={};
  for(const a of U){let s=0,n=0;let row=pad(a,12);for(const b of U){const v=get(a,b);row+=pad(a===b?'  .':(v>=0?'+':'')+v.toFixed(2),7);if(a!==b){s+=v;n++;}}avg[a]=s/n;console.log(row+' | mean '+(avg[a]>=0?'+':'')+avg[a].toFixed(2));}
  const rank=U.slice().sort((a,b)=>avg[b]-avg[a]);
  console.log('ranking by mean score: '+rank.map(u=>u+' '+avg[u].toFixed(2)).join(', '));
}
