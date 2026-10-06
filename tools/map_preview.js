#!/usr/bin/env node
/* Print the landmarks and an ASCII map of a skirmish/campaign map, in TILE coordinates (0..87), so mission scripts can reference real places.
     node tools/map_preview.js [seed=1101] [faction=meridian] [enemy=obsidian]
   The layout is point-symmetric and (apart from rock noise) the same for every seed: player 0 (you) starts bottom-left, the enemy top-right. */
const load=require('../tests/sim/simlib3.js');
const seed=+(process.argv[2]||1101),f=process.argv[3]||'meridian',e=process.argv[4]||'obsidian';
const L=load();L.newGame({seed,faction:f,enemy:e,diff:'normal'});const G=L.G,MW=L.MW,MH=L.MH,T=32;
const label=(s)=>s.main?(s.owner===0?'YOUR MAIN (high ground)':'ENEMY MAIN (high ground)'):('expansion h'+s.h+(s.owner>=0?' owner '+s.owner:''));
console.log('seed',seed,' player0 =',f,' enemy =',e,'  (tile coords x,y; origin top-left; map '+MW+'x'+MH+')\n');
console.log('HUB SITES (tx,ty = top-left of the 4x4 hub footprint; cx,cy = centre):');
for(const s of G.sites)console.log('  #'+s.id.toString().padEnd(2),'hub tile ('+s.tx+','+s.ty+')  centre ('+s.cx+','+s.cy+')  height '+s.h+'  '+label(s));
console.log('\nCREEP CAMPS (centre tile, level 1 weak … 3 strong):');
for(const c of G.camps)console.log('  camp #'+c.id,'('+Math.round(c.x/T)+','+Math.round(c.y/T)+')  lvl',c.lvl);
console.log('\nNEUTRAL STRUCTURES:');
for(const n of G.neutrals)console.log('  '+n.type.padEnd(6),'('+n.tx+','+n.ty+')',n.type==='post'?'trading post — freighter route endpoint':'watchtower — reveals ground around it');
const cr=G.res.filter(r=>r.type==='crystal'),ge=G.res.filter(r=>r.type==='geyser');
console.log('\nRESOURCES: '+cr.length+' crystal patches, '+ge.length+' ether geysers');
for(const s of G.sites){const near=G.res.filter(r=>Math.hypot(r.tx-s.cx,r.ty-s.cy)<12);console.log('  near site #'+s.id+': '+near.filter(r=>r.type==='crystal').length+' crystals, '+near.filter(r=>r.type==='geyser').length+' geysers');}
console.log('\nASCII MAP (each char = 1 tile wide x 2 tiles tall):  ~ void  # rock  ^ cliff  : ramp  . floor   H main hub  o expansion  1/2/3 creep camp  T tower  P post  c crystal  g geyser');
const grid=[];for(let y=0;y<MH;y++){const row=[];for(let x=0;x<MW;x++){const i=y*MW+x,t=G.TT[i];row.push(t===3?'~':t===1?'#':t===2?'^':G.RAMP[i]?':':'.');}grid.push(row);}
const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(grid[y]&&grid[y][x]!==undefined)grid[y][x]=c;};
for(const r of G.res)put(r.tx,r.ty,r.type==='crystal'?'c':'g');
for(const n of G.neutrals)put(n.tx+1,n.ty+1,n.type==='post'?'P':'T');
for(const c of G.camps)put(c.x/T,c.y/T,String(c.lvl));
for(const s of G.sites)put(s.cx,s.cy,s.main?'H':'o');
const head='   '+Array.from({length:MW},(_,x)=>x%10===0?String(x/10%10):' ').join('');console.log(head);
for(let y=0;y<MH;y+=2)console.log(String(y).padStart(2)+' '+grid[y].join(''));
