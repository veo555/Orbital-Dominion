/* CPU budget (v6 ARSENAL): tick time of the same AI-vs-AI skirmishes with the v5 sources (BASE_SRC dir, default: `git archive` of commit f70ab14, the last v5 commit) and the current ones.
   Budget: median tick time of the new code <= +5 % of the v5 code (arsenal ON for both AIs: the new content is exercised).   node tests/sim/arsenal_cpu.js
   Runs are interleaved (A B A B ...) and repeated so that machine noise hits both sides alike; the verdict uses the median of the per-seed ratios. */
'use strict';
const path=require('path'),fs=require('fs'),os=require('os'),cp=require('child_process');
const load=require('./simlib3.js');
const ROOT=path.join(__dirname,'..','..');
let base=process.env.BASE_SRC;
if(!base){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'od_v5_'));
  cp.execSync('git -C "'+ROOT+'" archive --format=tar f70ab14 src/js | tar -x -C "'+tmp+'"',{stdio:'inherit'});base=path.join(tmp,'src','js');}
const TICKS=+(process.env.TICKS||2400),SEEDS=[21,22,23,24];
function timeRun(dir,seed,diff){
  const S=load(dir);const {performance}=require('perf_hooks');
  S.newGame({seed,faction:['meridian','aurora','obsidian'][seed%3],enemy:['obsidian','meridian','aurora'][seed%3],diff,aiBoth:true});
  for(let i=0;i<600;i++)S.step();                 // warm-up + opening
  const t0=performance.now();for(let i=0;i<TICKS;i++)S.step();return(performance.now()-t0)/TICKS;
}
const ratios=[];
for(const seed of SEEDS)for(const diff of['hard']){
  const a=[],b=[];for(let r=0;r<2;r++){a.push(timeRun(base,seed,diff));b.push(timeRun(undefined,seed,diff));}
  const ma=Math.min(...a),mb=Math.min(...b);ratios.push(mb/ma);
  console.log('seed '+seed+' '+diff+': v5 '+ma.toFixed(3)+' ms/tick, v6 '+mb.toFixed(3)+' ms/tick, ratio '+(mb/ma).toFixed(3));
}
ratios.sort((x,y)=>x-y);const med=ratios[Math.floor(ratios.length/2)];
console.log('median ratio '+med.toFixed(3)+' (budget <= 1.05)');
console.log(med<=1.05?'CPU BUDGET OK':'CPU BUDGET EXCEEDED');process.exit(med<=1.05?0:1);
