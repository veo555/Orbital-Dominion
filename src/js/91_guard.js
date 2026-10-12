/* =========================================================================
   91_GUARD — error boundaries, recovery and watchdogs (v5).  UI/robustness module: it never reads or writes simulation state except to pause (G.paused).
   Everything here is a FUNCTION DECLARATION (hoisted: boot() in 90_main.js runs before this file's top level) and the state lives on guardS.s, so there is no
   temporal-dead-zone trap.  No network: errors are logged with console.error('[guard] ...') and the last one is kept in localStorage for the next start.

   What it does
   * guardInstall()        window 'error' + 'unhandledrejection' handlers (logged, counted); the resize handler is wrapped (guardResize).
   * guardRun(kind,fn,..)  the frame loop (90_main.js) runs sim stepping, camera/fog, rendering and HUD as four SEPARATE guarded calls: a render error never stops
                           the simulation, a HUD error never stops rendering.  Errors are reported with guardReport().
   * guardReport()         keeps the last 40 errors; MORE THAN 5 errors inside 2 seconds (frame loop or global) trip the breaker: guardTrip().
   * guardTrip()           pauses the match, autosaves it (78_resume.js), stops the frame body and shows a small recovery dialog:
                           Reload | Continue from autosave | Main menu (| Repair: clear offline cache, PWA only).  No frozen or black screen.
   * guardBootFailed()     the same dialog when boot() itself threw (Reload | Repair).
   * watchdog              a sim step slower than 250 ms three frames in a row, or a frame whose sim stepping exceeds the time budget, switches the loop to SHED mode
                           (2 steps per frame, no terrain streaming) and drops the backlog instead of spiralling; 300 fast frames switch it back.
   * guardCam()            non-finite camera / zoom is repaired before it can reach the renderer; guardResize() ignores 0-size / non-finite viewports and DPRs,
                           coalesces an orientation-change storm into one resize, and retries when the viewport is valid again.
   Test seams: window.__RTS.guard (only with window.__TEST) exposes state, inject({sim,view,render,ui,stepMs}) fault counters and reset().  tests/e2e/e2e_robust_*.py
   ========================================================================= */
function guardS(){
  return guardS.s||(guardS.s={log:[],errTimes:[],tripped:false,shed:false,slowFrames:0,fastFrames:0,counts:{sim:0,view:0,render:0,ui:0,global:0,resize:0,camera:0,audio:0},
    cfg:{window:2000,max:5,slowStep:250,budget:120,shedBudget:40},fault:{},installed:false,rv:null,rvT:0,rvRuns:0,rvQ:0,rvPending:false,rvSkipped:0,dlg:null,autosaved:false,reason:'',trips:0,shedEvents:0,lastStepMs:0});
}
function guardApi(){
  const S=guardS();
  return{state:S,inject(o){Object.assign(S.fault,o||{});},reset(){S.errTimes.length=0;S.log.length=0;S.tripped=false;S.shed=false;S.slowFrames=0;S.fastFrames=0;for(const k in S.counts)S.counts[k]=0;S.fault={};guardHideDialog();},
    report:guardReport,trip:guardTrip,log:()=>S.log.slice()};
}
function guardInstall(){
  const S=guardS();if(S.installed)return;S.installed=true;
  window.addEventListener('error',e=>{
    if(e&&/ResizeObserver loop/.test(String(e.message||'')))return;                  // benign browser notice
    guardReport('global',e&&e.error||e&&e.message||'error event');
  });
  window.addEventListener('unhandledrejection',e=>{guardReport('global',e&&e.reason||'unhandled rejection');try{e.preventDefault();}catch(_){}});
  S.rv=resizeView;resizeView=guardResize;                                                // every caller (resize, orientationchange, visualViewport, quality) goes through the guard
}
function guardMsg(e){try{return String(e&&e.message||e).slice(0,300);}catch(_){return'error';}}
function guardReport(kind,e){
  const S=guardS(),now=performance.now(),msg=guardMsg(e);
  S.counts[kind]=(S.counts[kind]||0)+1;
  S.log.push({t:Math.round(now),kind,msg});if(S.log.length>40)S.log.shift();
  try{console.error('[guard] '+kind+': '+msg);}catch(_){}
  try{localStorage.setItem('orbital_dominion_v4_lasterr',JSON.stringify({at:Date.now(),kind,msg,build:BUILD.id}));}catch(_){}
  S.errTimes.push(now);while(S.errTimes.length&&now-S.errTimes[0]>S.cfg.window)S.errTimes.shift();
  if(!S.tripped&&S.errTimes.length>S.cfg.max)guardTrip(kind+': '+msg);
}
/* one guarded call of the frame loop: fn(a,b) */
function guardRun(kind,fn,a,b){try{fn(a,b);return true;}catch(e){guardReport(kind,e);return false;}}

/* ---------------------------------------------------------------- recovery dialog */
function guardHideDialog(){const S=guardS();if(S.dlg&&S.dlg.parentNode)S.dlg.parentNode.removeChild(S.dlg);S.dlg=null;}
function guardButton(label,id,fn,primary){
  const b=document.createElement('button');b.className='btn'+(primary?' big':'');b.id=id;b.type='button';b.textContent=label;
  b.addEventListener('click',()=>{try{fn();}catch(e){try{location.reload();}catch(_){}}});return b;
}
function guardRepair(){   // PWA only: forget the offline copy so the next load comes from the network
  const jobs=[];
  try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)jobs.push(navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))));}catch(_){}
  try{if(window.caches&&caches.keys)jobs.push(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.indexOf('od-')===0).map(k=>caches.delete(k)))));}catch(_){}
  Promise.all(jobs).catch(()=>{}).then(()=>{try{location.reload();}catch(_){}});
}
function guardDialog(title,reason,opts){
  const S=guardS();guardHideDialog();
  const o=document.createElement('div');o.id='guardDlg';o.className='overlay dim';o.setAttribute('role','alertdialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby','guardTtl');
  o.style.zIndex='9999';o.style.display='flex';
  const card=document.createElement('div');card.className='card narrow';
  const h=document.createElement('h2');h.className='ttl';h.id='guardTtl';h.textContent=title;
  const p=document.createElement('p');p.className='dim';p.id='guardMsg';p.textContent=reason;
  const q=document.createElement('p');q.className='dim small';q.id='guardNote';
  q.textContent=opts.autosaved?'Your match was saved a moment ago.':(opts.canContinue?'An earlier autosave of your match is available.':'');
  const row=document.createElement('div');row.className='row end';row.style.flexWrap='wrap';row.style.gap='8px';
  row.appendChild(guardButton('Reload','guardReload',()=>location.reload(),!opts.canContinue));
  if(opts.canContinue)row.appendChild(guardButton('Continue from autosave','guardContinue',guardContinue,true));
  if(opts.menu)row.appendChild(guardButton('Main menu','guardMenu',guardMenu,false));
  if(opts.repair)row.appendChild(guardButton('Repair (clear offline copy)','guardRepairBtn',guardRepair,false));
  card.appendChild(h);card.appendChild(p);card.appendChild(q);card.appendChild(row);o.appendChild(card);document.body.appendChild(o);
  S.dlg=o;
  try{const b=o.querySelector('button.big')||o.querySelector('button');if(b)b.focus();}catch(_){}
}
function guardCanRepair(){return typeof BUILD!=='undefined'&&BUILD.variant==='pwa'&&!!(navigator.serviceWorker);}
function guardTrip(reason){
  const S=guardS();if(S.tripped)return;
  S.tripped=true;S.reason=String(reason||'');S.trips++;
  let saved=false;
  try{if(G&&ui.running&&!ui.demo&&!G.over){G.paused=true;saved=typeof resumeWrite==='function'&&!!resumeWrite();}}catch(_){}
  S.autosaved=saved;
  let canContinue=false;try{canContinue=typeof resumeMeta==='function'&&!!resumeMeta();}catch(_){}
  try{guardDialog('Something went wrong','The game hit repeated errors and was stopped to protect your match. ('+S.reason.slice(0,140)+')',{autosaved:saved,canContinue,menu:true,repair:guardCanRepair()});}catch(e){try{location.reload();}catch(_){}}
}
function guardBootFailed(e){
  const S=guardS();S.tripped=true;S.reason=guardMsg(e);S.log.push({t:Math.round(performance.now()),kind:'boot',msg:S.reason});
  try{console.error('[guard] boot: '+S.reason);}catch(_){}
  try{localStorage.setItem('orbital_dominion_v4_lasterr',JSON.stringify({at:Date.now(),kind:'boot',msg:S.reason,build:BUILD.id}));}catch(_){}
  try{guardDialog('The game could not start',S.reason,{canContinue:false,menu:false,repair:guardCanRepair()});}catch(_){}
}
/* back to a working game after a trip: forget the error history and the tripped state */
function guardClear(){const S=guardS();S.tripped=false;S.errTimes.length=0;S.shed=false;S.slowFrames=0;S.fastFrames=0;S.fault={};guardHideDialog();}
function guardContinue(){
  guardClear();
  try{if(typeof resumeGame==='function'){resumeGame();return;}}catch(_){}
  guardMenu();
}
function guardMenu(){
  guardClear();
  try{toMenu();}catch(e){try{location.reload();}catch(_){}}
}

/* ---------------------------------------------------------------- viewport guards */
function guardViewportOK(){const w=window.innerWidth,h=window.innerHeight,d=window.devicePixelRatio;return w>=8&&h>=8&&isFinite(w)&&isFinite(h)&&(d===undefined||(d>0&&isFinite(d)));}
function guardResize(){
  const S=guardS();
  if(!guardViewportOK()){S.rvPending=true;S.rvSkipped++;return;}                       // 0-size / hidden / transient viewport: keep the last good canvas
  const now=performance.now();
  if(now-S.rvT<30){if(!S.rvQ)S.rvQ=setTimeout(()=>{S.rvQ=0;guardResize();},40);return;}  // an orientation-change storm becomes one resize per 30 ms, and the last one always runs
  S.rvT=now;S.rvPending=false;S.rvRuns++;
  try{S.rv();}catch(e){guardReport('resize',e);}
}
function guardCam(){
  if(isFinite(cam.x)&&isFinite(cam.y)&&isFinite(cam.z)&&isFinite(cam.tz)&&cam.z>0&&cam.tz>0)return;
  guardS().counts.camera++;
  cam.z=cam.tz=1;cam.x=cam.y=0;
  try{const hub=G.buildings.find(b=>b.team===0&&b.type==='hub');if(hub)centerOn(hub.x,hub.y);else clampCam();}catch(_){cam.x=cam.y=0;}
  if(!isFinite(cam.x)||!isFinite(cam.y)){cam.x=cam.y=0;}
  if(typeof console!=='undefined')try{console.error('[guard] camera: non-finite camera repaired');}catch(_){}
}

/* ---------------------------------------------------------------- watchdog helpers used by frameSim */
function guardBusy(ms){const t=performance.now();while(performance.now()-t<ms){}}   // fault injection only (S.fault.stepMs)
function guardShed(on){
  const S=guardS();if(S.shed===on)return;S.shed=on;S.slowFrames=0;S.fastFrames=0;
  if(on){S.shedEvents++;try{toast('This device is struggling: the simulation was slowed down to stay responsive.','bad');}catch(_){}}
}
