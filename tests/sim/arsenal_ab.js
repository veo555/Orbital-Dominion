/* Balance evidence for the new content (v6 ARSENAL): AI-vs-AI games, headless, mirrored.
   MODE=legacy (default): the T2 AI WITH the new content against the same AI restricted to the v5 roster (G.teams[t].arsOff: the "v5 AI snapshot": same code, v5 units / buildings / techs only).
     Every seed is played twice with the sides swapped (the new-content AI keeps its faction and takes the other start corner): 24 games = 12 seeds x 2.
   MODE=ladder: tier ladder with the new content on for both sides (master vs hard, hard vs normal, normal vs easy): the skill ordering must survive.
   usage: node tests/sim/arsenal_ab.js [--games 24] [--minutes 18] [--tier hard] [--shard 0/2] [--json out.json]
   Result of a game: +1 = the first side listed wins (structures destroyed), 0 = the other, 0.5 = undecided at the time limit (decided on army value + structures would bias; we count it as half).
   Wilson 95 % interval of the win rate over the decided + half-counted games. */
'use strict';
const load=require('./simlib3.js');
const args=process.argv.slice(2);const arg=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
const N=+arg('games',24),MIN=+arg('minutes',18),TIER=arg('tier','hard'),MODE=process.env.MODE||'legacy';
const [sh,shn]=(arg('shard','0/1')).split('/').map(Number);
const FP=[['meridian','obsidian'],['obsidian','aurora'],['aurora','meridian'],['obsidian','meridian'],['aurora','obsidian'],['meridian','aurora']];
function wilson(k,n,z){z=z||1.96;if(!n)return[0,1];const p=k/n,d=1+z*z/n,c=p+z*z/(2*n),h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return[(c-h)/d,(c+h)/d];}
function play(seed,f0,f1,newTeam,tierA,tierB,legacy){
  const S=load();let st=(seed*2654435761)>>>0;S.sandbox.Math.random=function(){st=(st+0x6D2B79F5)>>>0;let t=st;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  S.newGame({seed,faction:f0,enemy:f1,diff:tierA,aiBoth:true,arsenalOff:legacy?[newTeam===1,newTeam===0]:[false,false]});
  S.G.ais[0]=S.makeAI(0,S.DIFF[newTeam===0||!legacy?tierA:tierA]);S.G.ais[1]=S.makeAI(1,S.DIFF[tierB]);
  let exc=0;
  for(let i=0;i<MIN*60*30;i++){try{S.step();}catch(e){exc++;}if(S.G.over)break;}
  const G=S.G;const army=[0,1].map(t=>G.units.filter(u=>!u.dead&&u.team===t&&!u.def.worker).reduce((n,u)=>n+u.def.supply,0));
  let over=G.over;if(!over){const hubs=[0,1].map(t=>G.buildings.filter(b=>!b.dead&&b.team===t&&b.type==='hub').length);   // time limit: a side with no army and fewer hubs while the other fields >= 20 supply has lost
    if(army[0]>=20&&army[1]===0&&hubs[0]>=hubs[1])over='victory';else if(army[1]>=20&&army[0]===0&&hubs[1]>=hubs[0])over='defeat';}
  return{over,exc,t:Math.round(G.time),army};
}
const rows=[];let k=0,n=0,exc=0,und=0;const t0=Date.now();
if(MODE==='legacy'){
  for(let i=0;i<N/2;i++){if(i%shn!==sh)continue;
    const [fa,fb]=FP[i%FP.length],seed=100+i;
    // game 1: the new AI is team 0 (faction fa), the v5-restricted AI is team 1 (fb)
    const r1=play(seed,fa,fb,0,TIER,TIER,true),w1=r1.over==='victory'?1:r1.over==='defeat'?0:0.5;
    // game 2: sides swapped: the new AI is team 1 and keeps faction fa; the v5 AI is team 0 with fb
    const r2=play(seed,fb,fa,1,TIER,TIER,true),w2=r2.over==='defeat'?1:r2.over==='victory'?0:0.5;
    for(const [r,w,tag] of [[r1,w1,'new=T0'],[r2,w2,'new=T1']]){k+=w;n++;exc+=r.exc;if(w===0.5)und++;rows.push({seed,fa,fb,tag,win:w,t:r.t,army:r.army,exc:r.exc});
      console.log('seed '+seed+' '+fa+'(new) vs '+fb+'(v5) '+tag+' -> '+(w===1?'NEW WINS':w===0?'v5 wins':'undecided')+' at '+r.t+'s army '+r.army.join('/')+(r.exc?' EXC '+r.exc:''));}
  }
}else{
  const L=[['master','hard'],['hard','normal'],['normal','easy']];
  for(const [A,B] of L){let ka=0,na=0;
    for(let i=0;i<N/2;i++){if(i%shn!==sh)continue;const [fa,fb]=FP[i%FP.length],seed=200+i;
      const r1=play(seed,fa,fb,0,A,B,false),w1=r1.over==='victory'?1:r1.over==='defeat'?0:0.5;
      const r2=play(seed,fb,fa,1,B,A,false),w2=r2.over==='defeat'?1:r2.over==='victory'?0:0.5;   // tier A plays team 1 (faction fa) in the swapped game
      // in game 2 the A tier is team 1: makeAI above assigned tierA to team 0, so swap via the arguments (B on team 0)
      ka+=w1+w2;na+=2;exc+=r1.exc+r2.exc;}
    const [lo,hi]=wilson(ka,na);console.log(A+' beats '+B+': '+ka+'/'+na+' = '+(100*ka/na).toFixed(0)+' %  Wilson95 ['+(100*lo).toFixed(0)+', '+(100*hi).toFixed(0)+']');rows.push({ladder:A+'>'+B,k:ka,n:na});}
}
if(MODE==='legacy'){const [lo,hi]=wilson(k,n);console.log('\nnew-content AI vs v5-roster AI ('+TIER+'): '+k+'/'+n+' = '+(100*k/n).toFixed(0)+' %  Wilson95 ['+(100*lo).toFixed(0)+', '+(100*hi).toFixed(0)+']  undecided '+und+'  exceptions '+exc+'  '+((Date.now()-t0)/1000|0)+'s');}
if(arg('json'))require('fs').writeFileSync(arg('json'),JSON.stringify({mode:MODE,k,n,und,exc,rows}));
