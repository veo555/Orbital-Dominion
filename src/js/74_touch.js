/* =========================================================================
   TOUCH — Pointer-Events input for phones and tablets (Android, iPhone, iPad)
   Gesture scheme (docs/TOUCH_SPEC.md):
     one finger   drag on the map       pan (with inertia)
                  tap own unit/building  select  (double-tap: select all of that type on screen)
                  tap ground / enemy / crystal with a unit selected  -> the right-click command
                  hold ~0.4 s, then drag   box-select   (or switch the Select toggle on)
                  hold on a unit, release  add/remove it from the selection ("shift-click")
     two fingers  pinch = zoom about the fingers, drag = pan
     minimap      tap/drag = jump camera, hold = move order / rally point
     buttons      hold ~0.45 s = tooltip sheet (hover does not exist on touch)
   Mouse pointers keep using the original mouse handlers in 90_main.js; this layer only handles pointerType
   'touch' and 'pen', and cancels the compatibility mouse events the browser would otherwise fire for them.
   ========================================================================= */
const TP={ptrs:new Map(),mode:'idle',lp:null,pw:null,pd:0,fvx:0,fvy:0,lastMv:0,lastMx:0,lastMy:0,mm:null,mmLp:null,tipLp:null,tipShown:false,tipHold:false,suppressUntil:0,
  LONG:380,SLOP:10,PAD:16,LIFT:46};

function buzz(ms){if(SET.haptics&&navigator.vibrate){try{navigator.vibrate(ms);}catch(e){}}}
/* a long-press that opened a help sheet must not also fire the button: swallow the synthetic click that some browsers
   (iOS Safari) send on release. It arrives within a few ms of pointerup, so the window after release is short. */
function tpSuppressed(){return TP.tipHold||performance.now()<TP.suppressUntil;}
function tpLive(){return G&&ui.running&&!G.paused&&!ui.demo;}
function syncDock(){$('dkSel').classList.toggle('on',ui.selMode);$('dkQ').classList.toggle('on',ui.qMode);}

/* ------------------------------ canvas gestures ------------------------------ */
function tpDown(e){
  if(e.pointerType==='mouse')return;
  setTouchMode(true);audioInit();e.preventDefault();
  if(!tpLive())return;
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  const p={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,t0:performance.now()};
  TP.ptrs.set(e.pointerId,p);ui.mx=e.clientX;ui.my=e.clientY;TP.fvx=TP.fvy=0;
  if(TP.ptrs.size===2){tpPinchStart();return;}
  if(TP.ptrs.size>2)return;
  TP.mode='pending';clearTimeout(TP.lp);TP.lp=setTimeout(tpLong,TP.LONG);
  if(ui.place){ui.my=p.y-TP.LIFT;updatePlaceGhost();}
}
function tpLong(){
  if(TP.mode!=='pending'||ui.place||ui.target)return;
  const p=TP.ptrs.values().next().value;if(!p)return;
  TP.mode='box';ui.drag={x0:p.x0,y0:p.y0,x1:p.x,y1:p.y};buzz(14);
}
function tpMove(e){
  const p=TP.ptrs.get(e.pointerId);if(!p)return;e.preventDefault();
  const dx=e.clientX-p.x,dy=e.clientY-p.y,now=performance.now();p.x=e.clientX;p.y=e.clientY;
  if(TP.mode==='pinch'){tpPinchMove();return;}
  if(TP.mode==='pending'&&hyp(p.x-p.x0,p.y-p.y0)>TP.SLOP){
    clearTimeout(TP.lp);
    TP.mode=ui.place?'placedrag':ui.selMode?'box':'pan';
    if(TP.mode==='box')ui.drag={x0:p.x0,y0:p.y0,x1:p.x,y1:p.y};
  }
  if(TP.mode==='pan'&&tpLive()){
    cam.x-=dx/cam.z;cam.y-=dy/cam.z;clampCam();
    const dt=Math.max(8,now-TP.lastMv);TP.fvx=TP.fvx*0.55+(dx/dt*1000)*0.45;TP.fvy=TP.fvy*0.55+(dy/dt*1000)*0.45;TP.lastMv=now;
  }else if(TP.mode==='box'&&ui.drag){ui.drag.x1=p.x;ui.drag.y1=p.y;}
  else if(TP.mode==='placedrag'){ui.mx=p.x;ui.my=p.y-TP.LIFT;updatePlaceGhost();}
  TP.lastMv=now;
}
function tpUp(e){
  const p=TP.ptrs.get(e.pointerId);if(!p)return;e.preventDefault();
  TP.ptrs.delete(e.pointerId);clearTimeout(TP.lp);
  if(TP.mode==='pinch'||TP.mode==='ignore'){TP.mode=TP.ptrs.size?'ignore':'idle';return;}
  const mode=TP.mode;TP.mode='idle';
  if(!tpLive()){ui.drag=null;return;}
  if(mode==='pending')tpTap(p.x,p.y);
  else if(mode==='box'){
    const d=ui.drag;ui.drag=null;
    if(d&&(Math.abs(d.x1-d.x0)>8||Math.abs(d.y1-d.y0)>8))boxSelect(d,false);
    else tpLongTap(p.x,p.y);
  }else if(mode==='pan'){if(performance.now()-TP.lastMv>90){TP.fvx=TP.fvy=0;}}
  else if(mode==='placedrag'){ui.mx=p.x;ui.my=p.y-TP.LIFT;updatePlaceGhost();}
}
function tpCancel(e){
  TP.ptrs.delete(e.pointerId);clearTimeout(TP.lp);ui.drag=null;
  TP.mode=TP.ptrs.size?'ignore':'idle';
}
function tpPinchStart(){
  clearTimeout(TP.lp);ui.drag=null;
  const[a,b]=[...TP.ptrs.values()];TP.mode='pinch';TP.fvx=TP.fvy=0;
  TP.pd=Math.max(24,hyp(a.x-b.x,a.y-b.y));TP.pz=cam.z;TP.pw=s2w((a.x+b.x)/2,(a.y+b.y)/2);
}
function tpPinchMove(){
  const[a,b]=[...TP.ptrs.values()];if(!b)return;
  const d=hyp(a.x-b.x,a.y-b.y),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,nz=clamp(TP.pz*d/TP.pd,0.5,1.7);
  cam.z=cam.tz=nz;cam.x=TP.pw.x-cx/nz;cam.y=TP.pw.y-cy/nz;clampCam();
}

/* what a tap means: select, or act like a right-click */
function isContextTarget(ent,units){
  if(!ent||ent.team!==0)return false;
  const workers=units.some(u=>u.def.worker);if(!workers)return false;
  if(ent.kind==='building')return !ent.done||ent.hp<ent.maxhp||(ent.type==='siphon'&&ent.done);
  return ent.kind==='unit'&&ent.hp<ent.maxhp&&!!ent.def.tags.mech&&!ent.def.worker&&!ui.selSet.has(ent);
}
function tpTap(sx,sy){
  const w=s2w(sx,sy),now=performance.now();
  if(ui.place){ui.mx=sx;ui.my=sy-TP.LIFT;updatePlaceGhost();return;}
  if(ui.target){const q=ui.qMode;ui.qMode=false;syncDock();applyTarget(w.x,w.y,q);return;}
  const ent=entityAt(w.x,w.y,TP.PAD),own=ui.sel.filter(e=>e.team===0),units=own.filter(e=>e.kind==='unit');
  if(ent&&ent.team===0&&(ent.kind==='unit'||ent.kind==='building')&&!(units.length&&isContextTarget(ent,units))){
    clickSelect(w.x,w.y,false,now,false,ent);buzz(6);return;}
  if(units.length){const q=ui.qMode;ui.qMode=false;syncDock();contextCommand(w.x,w.y,q);buzz(8);return;}
  if(own.length&&!ent){setSel([]);return;}          // buildings selected: tapping empty ground deselects
  clickSelect(w.x,w.y,false,now,false,ent||null);
}
function tpLongTap(sx,sy){                         // hold, then release without dragging
  const w=s2w(sx,sy),ent=entityAt(w.x,w.y,TP.PAD);
  if(!ent||ent.team!==0||(ent.kind!=='unit'&&ent.kind!=='building'))return;
  const cur=ui.sel.filter(e=>e.team===0&&e.kind===ent.kind),i=cur.indexOf(ent);
  if(i>=0)cur.splice(i,1);else cur.push(ent);
  setSel(cur.slice(0,80));buzz(10);
}

/* ------------------------------- minimap (touch) ------------------------------- */
function tpMM(e){return(r=>({x:(e.clientX-r.left)/r.width*WW,y:(e.clientY-r.top)/r.height*WH}))(mm.getBoundingClientRect());}
function tpMMCommand(p){
  const own=ui.sel.filter(s=>s.team===0);
  if(own.length&&own[0].kind==='building'){for(const b of own)if(b.done)setRally(b,p.x,p.y,null);}
  else if(ownUnits().length)issueGroup(ownUnits(),p.x,p.y,'move',false);
}
function bindTouchMinimap(){
  mm.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse')return;
    setTouchMode(true);audioInit();e.preventDefault();if(!G||!ui.running||ui.demo)return;
    try{mm.setPointerCapture(e.pointerId);}catch(_){}
    const p=tpMM(e);
    if(ui.target){const q=ui.qMode;ui.qMode=false;syncDock();applyTarget(p.x,p.y,q);return;}
    if(ui.place)return;
    TP.mm={id:e.pointerId,x0:e.clientX,y0:e.clientY,moved:false};
    clearTimeout(TP.mmLp);TP.mmLp=setTimeout(()=>{if(TP.mm&&!TP.mm.moved){TP.mm.long=true;buzz(14);tpMMCommand(tpMM(e));}},420);
    ui.mmDrag=true;centerOn(p.x,p.y);
  },{passive:false});
  mm.addEventListener('pointermove',e=>{
    if(!TP.mm||e.pointerId!==TP.mm.id)return;e.preventDefault();
    if(hyp(e.clientX-TP.mm.x0,e.clientY-TP.mm.y0)>8){TP.mm.moved=true;clearTimeout(TP.mmLp);}
    if(TP.mm.moved&&G){const p=tpMM(e);centerOn(p.x,p.y);}
  },{passive:false});
  const end=e=>{if(TP.mm&&e.pointerId===TP.mm.id){clearTimeout(TP.mmLp);TP.mm=null;ui.mmDrag=false;}};
  mm.addEventListener('pointerup',end);mm.addEventListener('pointercancel',end);
}

/* --------------------- long-press help sheet for buttons ---------------------- */
function bindTouchHelp(){
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'){setTouchMode(false);return;}
    setTouchMode(true);
    TP.tipShown=false;clearTimeout(TP.tipLp);
    const t=e.target.closest&&e.target.closest('.cb[data-i],[data-tip]');if(!t||t===cv)return;
    TP.tipLp=setTimeout(()=>{
      let html=null;
      if(t.classList.contains('cb')&&t.dataset.i!==undefined){const c=ui.cmds[+t.dataset.i];if(c)html=cmdTipHTML(c,+t.dataset.i);}
      else html=t.dataset.tip;
      if(html){showTipHTML(html,t.getBoundingClientRect());TP.tipShown=true;TP.tipHold=true;buzz(10);}
    },450);
  },{capture:true,passive:true});
  const stop=()=>{clearTimeout(TP.tipLp);if(TP.tipHold){TP.tipHold=false;TP.suppressUntil=performance.now()+120;}if(TP.tipShown)setTimeout(()=>{if(TP.tipShown){hideTip();TP.tipShown=false;}},2200);};
  document.addEventListener('pointerup',stop,{capture:true,passive:true});
  document.addEventListener('pointercancel',stop,{capture:true,passive:true});
  // tapping anywhere else dismisses a sheet that is still open
  document.addEventListener('pointerdown',e=>{if(TP.tipShown&&!e.target.closest('#tip')){hideTip();TP.tipShown=false;}},{capture:true,passive:true});
}

/* ------------------------------- dock + placement bar ------------------------------- */
function bindTouchDock(){
  $('dkHub').onclick=()=>{if(!tpLive())return;goHub();sfx('click');buzz(8);};
  $('dkSel').onclick=()=>{ui.selMode=!ui.selMode;syncDock();sfx('click');buzz(8);if(ui.selMode)toast('Select mode: drag to draw a box (two fingers pan and zoom)','good');};
  $('dkQ').onclick=()=>{ui.qMode=!ui.qMode;syncDock();sfx('click');buzz(8);if(ui.qMode)toast('Queue: your next order is added after the current ones','good');};
  $('dkX').onclick=()=>{if(!tpLive())return;ui.place=null;ui.target=null;setSel([]);sfx('click');buzz(8);};
  $('plNo').onclick=()=>{ui.place=null;ui.target=null;sfx('click');};
  $('plGo').onclick=()=>{if(!ui.place)return;updatePlaceGhost();const q=ui.qMode;tryPlace(q);if(!ui.place){ui.qMode=false;syncDock();}buzz(12);};
  $('rhX').onclick=()=>{$('rotateHint').classList.remove('show');TP.rotateDismissed=true;};
}
const TARGET_LABEL={attack:'Tap where to attack-move',move:'Tap where to move',rally:'Tap to set the rally point',repair:'Tap a damaged structure or machine',trade:'Tap a Trading Post'};
let plSig='';
function touchUpdate(dt){
  // inertia after a pan flick
  if((Math.abs(TP.fvx)>10||Math.abs(TP.fvy)>10)&&TP.mode!=='pan'&&TP.mode!=='pinch'&&tpLive()){
    cam.x-=TP.fvx*dt/cam.z;cam.y-=TP.fvy*dt/cam.z;clampCam();const k=Math.exp(-dt*4.2);TP.fvx*=k;TP.fvy*=k;
  }else if(TP.mode!=='pan'){TP.fvx=TP.fvy=0;}
  // placement / targeting bar
  const bar=$('placeBar'),want=ui.touchMode&&tpLive()&&(ui.place||ui.target);
  if(!want){if(!bar.classList.contains('hidden')){bar.classList.add('hidden');plSig='';}return;}
  const pl=ui.place,tg=ui.target;
  const txt=pl?('Place '+BDEF[pl.id].name+(pl.ok?'':' — '+(pl.why||'blocked'))):(TARGET_LABEL[tg.kind]||(tg.kind.startsWith('skill')?'Tap to aim the spell':(swTargetLabel(tg.kind)||'Tap the map')));
  const sig=(pl?(pl.ok?'1':'0'):'t')+txt;
  if(sig!==plSig){plSig=sig;$('plTxt').textContent=txt;$('plGo').classList.toggle('hidden',!pl);$('plGo').classList.toggle('off',!!pl&&!pl.ok);}
  bar.classList.remove('hidden');
  // rotate hint on phones held upright (once per session unless dismissed)
  const rh=$('rotateHint'),portrait=rootEl.classList.contains('portrait');
  if(!portrait&&rh.classList.contains('show'))rh.classList.remove('show');
}
let rotateShown=false;
function maybeRotateHint(){
  if(!rotateShown&&rootEl.classList.contains('portrait')&&!TP.rotateDismissed){rotateShown=true;$('rotateHint').classList.add('show');setTimeout(()=>$('rotateHint').classList.remove('show'),9000);}
}
/* finger feedback drawn on the canvas (screen space): long-press progress ring */
function touchOverlay(g){
  if(TP.mode!=='pending'||ui.place||ui.target)return;
  const p=TP.ptrs.values().next().value;if(!p)return;
  const el=performance.now()-p.t0;if(el<110)return;
  const f=clamp((el-110)/(TP.LONG-110),0,1);
  g.save();g.lineWidth=3;g.strokeStyle='rgba(109,255,157,'+(0.25+0.6*f)+')';g.beginPath();g.arc(p.x0,p.y0,24,-Math.PI/2,-Math.PI/2+TAU*f);g.stroke();
  g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=1;g.beginPath();g.arc(p.x0,p.y0,24,0,TAU);g.stroke();g.restore();
}

function bindTouch(){
  const opt={passive:false};
  cv.addEventListener('pointerdown',tpDown,opt);cv.addEventListener('pointermove',tpMove,opt);
  cv.addEventListener('pointerup',tpUp,opt);cv.addEventListener('pointercancel',tpCancel,opt);
  bindTouchMinimap();bindTouchHelp();bindTouchDock();
  // iOS ignores user-scalable=no: block page pinch-zoom and double-tap zoom ourselves
  for(const ev of['gesturestart','gesturechange','gestureend'])document.addEventListener(ev,e=>e.preventDefault(),opt);
  document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},opt);
  document.addEventListener('dblclick',e=>{if(!(e.target.closest&&e.target.closest('input,textarea')))e.preventDefault();},opt);
  window.addEventListener('contextmenu',e=>{if(!(e.target.closest&&e.target.closest('input,textarea')))e.preventDefault();});
  // audio must be unlocked inside a user gesture (iOS: touchend / click)
  for(const ev of['touchend','pointerup','click','keydown'])window.addEventListener(ev,audioInit,{passive:true,capture:true});
  window.addEventListener('orientationchange',()=>setTimeout(resizeView,250));
  if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>resizeView());
}
