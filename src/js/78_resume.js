/* =========================================================================
   78_RESUME — autosave of the running match and the main-menu "Continue" button (UI side of 46_save.js).
   One slot (skirmish or campaign mission). Written every RESUME_EVERY seconds of real time while a match runs, whenever the app is sent to the
   background (autoPause) and never during a blocking dispatch card; erased when the match ends. localStorage only: nothing leaves the device.
   ========================================================================= */
const RESUMEKEY='orbital_dominion_v4_resume',RESUME_EVERY=30;
const RS={t:0,metaOK:false};
/* the slot's metadata, validated: another build's slot, a corrupt one, or one with odd field types is not offered (and never crashes the menu) */
function resumeMeta(){
  try{
    const m=JSON.parse(localStorage.getItem(RESUMEKEY+'_meta')||'null');
    if(!m||typeof m!=='object'||m.v!==1||(m.camp!==null&&typeof m.camp!=='string')||typeof m.title!=='string'||typeof m.time!=='number'||!isFinite(m.time)||m.time<0)return null;
    if(typeof BUILD!=='undefined'&&m.build!==BUILD.id)return null;
    return{v:1,at:+m.at||0,camp:m.camp,title:m.title.slice(0,60),time:Math.round(m.time),diff:typeof m.diff==='string'?m.diff:'normal',faction:typeof m.faction==='string'?m.faction:'meridian',build:m.build};
  }catch(e){return null;}
}
function resumeWrite(){
  if(!G||!ui.running||ui.demo||G.over||(G.camp&&(G.camp.hold||CU.dispBusy)))return false;
  try{
    const snap=gameSnapshot();if(!snap)return false;
    const meta={v:1,build:BUILD.id,at:Date.now(),camp:G.camp&&G.camp.m?G.camp.m.id:null,title:G.camp&&G.camp.m?(G.camp.m.title||G.camp.m.id):'Skirmish',time:Math.round(G.time),diff:G.diff,faction:G.teams[0].faction};
    localStorage.setItem(RESUMEKEY,snap);localStorage.setItem(RESUMEKEY+'_meta',JSON.stringify(meta));RS.t=0;return true;
  }catch(e){try{localStorage.removeItem(RESUMEKEY);localStorage.removeItem(RESUMEKEY+'_meta');}catch(_){}return false;}   // quota or serialisation failure: no half-written slot
}
function resumeClear(){try{localStorage.removeItem(RESUMEKEY);localStorage.removeItem(RESUMEKEY+'_meta');}catch(e){}resumeSync();}
function resumeTick(dt){if(G.paused)return;RS.t+=dt;if(RS.t>=RESUME_EVERY)resumeWrite();}
function resumeSync(){
  const b=$('bContinue');if(!b)return;const m=resumeMeta();b.classList.toggle('hidden',!m);
  if(m)b.textContent='Continue — '+(m.camp?m.title:'Skirmish')+' · '+fmtTime(m.time);
}
function resumeGame(){
  const m=resumeMeta();let text=null;try{text=localStorage.getItem(RESUMEKEY);}catch(e){}
  let started=false;
  try{started=!!m&&!!text&&startGame({resume:text,campaignId:m.camp});}catch(e){started=false;try{guardReport('resume',e);}catch(_){}}
  if(!started){toast('That saved match could not be loaded.','bad');resumeClear();try{toMenu();}catch(_){}}
}
