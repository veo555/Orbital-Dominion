const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function load(dir,xform){
  dir=dir||path.join(__dirname,'..','..','src','js');
  const files=fs.readdirSync(dir).filter(f=>/^(00|05|10|20|25|26|27|30|31|32|40|41|42|43|44|45|46)_/.test(f)).sort();
  let code=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
  if(xform)code=xform(code);   // v5: tests/sim/minify_determinism.js loads the MINIFIED sim bundle through the same harness
  code+=`
function toast(t,c){(globalThis.__toasts=globalThis.__toasts||[]).push(t);} function sfx(){} function uiDirty(){} function onVision(){} function onStepEnd(){} function onGameOver(r){globalThis.__over=r;} function onCampaignEvent(e){(globalThis.__campEv=globalThis.__campEv||[]).push(e);}
`;
  const store={};
  let _rs=(+process.env.RS||0)>>>0;const MathR=Object.create(Math);if(_rs){MathR.random=function(){_rs=(_rs+0x6D2B79F5)>>>0;let t=_rs;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}else MathR.random=Math.random;
  const sandbox={window:{},document:{getElementById:()=>({})},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}},console,Math:MathR,Date,Uint8Array,Float32Array,Int32Array,Uint32Array,Set,Map,Array,Object,Symbol,Number,String,JSON,performance,Infinity,NaN,parseFloat,parseInt,isNaN};
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{filename:'sim.js'});
  vm.runInContext('globalThis.__run=(c)=>eval(c);',sandbox);
  vm.runInContext('globalThis.__API={gameSnapshot,gameRestore,newGame,step,get G(){return G},setOrder,addUnit,addBuilding,orderBuild,queueUnit,queueHero,queueEra,queueResearch,findPath,canStand,canPlace,callToArms,mktTrade,castSkill,learnSkill,heroUnit,UDEF,BDEF,FACTION_IDS,DIFF,TILE,MW,MH,TICK,aiThink,updateVision,nearestRes,pathLength,hasDone,countB,reqUnit,reqBuild,recalcTeams,rebuildBlocked,setTax,skillPoints,kill,damageEnt,seen,TAX,mapConnected,agEnroll,agDirect,agAutoMode,mkAgent,swarmInit,agDo,agSet,hyp,ovPreset,enrollAll,econHire,econAccept,econFire,jobCancel,cadenceTable,bestCadence,periodPrice,wageNow,makeAI,nFreelancers,maxFree,ovApprove,ovCommand,ovReport,bbCells,campaignInit,campaignStep,campaignEnd,campaignOpts,campaignResume,campaignDrainEvents,campaignSummary,campObjectives,campEvalCond,campDo,campLocked,campNoDefaultEnd,emptyCampaignSave,campaignSaveSanitize,campaignSaveUpdate,campaignNextId,campaignCanPlay,campaignSaveRead,campaignSaveWrite,endGame,cancelQueue,spawnUnit,heroApply,footprintBusy,updateVision,STORY,MUSIC_CUES,COND_OPS,ACTION_OPS,MOODS,CAMP_SAVEKEY,TECH,HERO_LVL_XP,FACTIONS,ERAS}',sandbox);
  return Object.assign(sandbox.__API,{__run:(c)=>vm.runInContext(c,sandbox),sandbox});
};
