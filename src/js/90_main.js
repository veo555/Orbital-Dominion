/* =========================================================================
   MAIN — input, game flow, animated menu background, main loop, test hooks
   ========================================================================= */
function resetUI(){
  ui.sel=[];ui.selSet=new Set();ui.activeType=null;ui.menu=null;ui.place=null;ui.target=null;ui.drag=null;ui.panel=null;ui.hover=null;ui.pings=[];ui.inc=[];ui.lastInc=0;ui.lastAlert=-99;ui.groups={};
  ui.infoDirty=ui.cmdDirty=true;ui.endAt=0;ui.endRes=null;ui.lastClick={t:0,type:null,id:0};ui.idleIdx=0;ui.surr=0;hudCache={};cmdSig='';
  $('ecoPanel').classList.add('hidden');$('ecoPanel').dataset.h='';$('objectives').dataset.h='';$('groups').dataset.h='';
  swReset();
}
/* startGame() = a skirmish from the main-menu settings; startGame({campaign:mission,diff}) = a campaign mission (seed, factions, setup come from the mission data) */
function startGame(opts){
  opts=opts||{};let camp=opts.campaign||null;
  stopSpeech();
  const resumed=!!opts.resume;
  if(resumed){                                                                        // 78_resume.js: continue a saved match
    if(!gameRestore(opts.resume))return false;
    if(opts.campaignId)camp=cuMissions().find(x=>x.id===opts.campaignId)||null;
    G.paused=true;
  }
  else if(camp)newGame({campaign:camp,diff:opts.diff||SET.diff});
  else newGame({diff:SET.diff,faction:SET.faction,enemy:SET.enemy,seed:ui.seedOverride!=null?ui.seedOverride:undefined});
  ui.demo=false;ui.running=true;resetUI();applyTeamPalettes();buildTerrain();initFog();updateVision();updateFog(1,true);
  if(typeof campMatchStart==='function')campMatchStart(camp);
  cam.z=cam.tz=rootEl.classList.contains('compact')?1.2:1;const hub=G.buildings.find(b=>b.team===0&&b.type==='hub');centerOn(hub.x,hub.y);
  setSel([hub]);
  hideOverlays();$('hud').classList.remove('hidden');overlayStack=[];measureHud();centerOn(hub.x,hub.y);
  setAccent(FACTIONS[G.teams[0].faction].col);
  setTxt('bSpeedT',G.speed+'×');if(!resumed)G.speed=1;
  platMatchStart();
  if(resumed){showOverlay('pauseMenu');setTxt('bMenuT','▶');platPauseChanged(true);toast('Match restored — press ▶ to continue.','good');return true;}
  if(camp){const o=typeof campObjectives==='function'?campObjectives().find(x=>x.kind==='primary'):null;toast((camp.title||'Mission')+(o?' — '+o.text:''),'good');}
  else toast(ui.touchMode?'Tap your Hub to train Haulers, then expand — destroy all enemy structures to win.':'Train Haulers (Q) and expand — destroy all enemy structures to win. Press H for help.','good');
  say('Mission started');
  return true;
}
function stopSpeech(){try{if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();}catch(e){}}
function startDemo(){
  const fs=FACTION_IDS.slice().sort(()=>Math.random()-.5);
  newGame({diff:'normal',faction:fs[0],enemy:fs[1],aiBoth:true});
  ui.demo=true;ui.running=true;resetUI();applyTeamPalettes();buildTerrain();initFog();updateFog(1,true);G.speed=3;cam.z=cam.tz=0.9;ui.demoT=0;ui.demoPt=null;ui.demoEnd=0;
  $('hud').classList.add('hidden');
  const s=G.sites[0];centerOn(s.cx*TILE,s.cy*TILE);
}
function toMenu(){stopSpeech();platMatchStop();if(typeof campMatchStop==='function')campMatchStop();startDemo();syncMenu();showOverlay('menu');overlayStack=[];}
function togglePause(){
  if(!G||G.over||ui.demo)return;G.paused=!G.paused;
  if(G.paused){showOverlay('pauseMenu');}else{hideOverlays();overlayStack=[];}
  setTxt('bMenuT',G.paused?'▶':'☰');platPauseChanged(G.paused);if(G.paused&&typeof resumeWrite==='function')resumeWrite();
}
function setSpeed(dir,cycle){
  if(ui.demo)return;const L=[1,1.5,2,3];let i=L.indexOf(G.speed);if(i<0)i=0;i=cycle?(i+1)%L.length:clamp(i+dir,0,L.length-1);G.speed=L[i];setTxt('bSpeedT',G.speed+'×');toast('Game speed '+G.speed+'×','good');
}
/* menu background: a slow camera over an AI-vs-AI match */
function demoUpdate(dt){
  ui.demoT-=dt;
  if(G.over){if(!ui.demoEnd)ui.demoEnd=performance.now()+4000;else if(performance.now()>ui.demoEnd&&!$('menu').classList.contains('hidden')===false){}}
  if(G.over&&ui.demoEnd&&performance.now()>ui.demoEnd){const wasMenu=!$('menu').classList.contains('hidden');startDemo();if(wasMenu)showOverlay('menu');return;}
  if(ui.demoT<=0){ui.demoT=6+Math.random()*4;
    let fight=null;for(const u of G.units){if(u.dead||u.team>1||u.def.worker)continue;if(u.target&&!u.target.dead&&u.target.team!==u.team){fight=u;break;}}
    if(fight)ui.demoPt={x:fight.x,y:fight.y};
    else{const hubs=G.buildings.filter(b=>!b.dead&&b.type==='hub');const h=hubs[Math.floor(Math.random()*hubs.length)];ui.demoPt=h?{x:h.x,y:h.y}:{x:WW/2,y:WH/2};}}
  if(ui.demoPt){const tx=ui.demoPt.x-VW/cam.z/2,ty=ui.demoPt.y-VH/cam.z/2,k=Math.min(1,dt*0.9);cam.x+=(tx-cam.x)*k;cam.y+=(ty-cam.y)*k;clampCam();}
}
function cameraUpdate(dt){
  if(!G||!ui.running||G.paused||ui.demo)return;
  let dx=0,dy=0;const k=ui.keys,sp=950*dt/Math.sqrt(cam.z),m=8;
  if(k.arrowleft)dx-=sp;if(k.arrowright)dx+=sp;if(k.arrowup)dy-=sp;if(k.arrowdown)dy+=sp;
  if(SET.edge&&ui.inWin&&!ui.touchMode&&!ui.mmDrag&&!ui.drag&&!ui.midDrag){
    if(ui.mx<m)dx-=sp;else if(ui.mx>VW-m)dx+=sp;if(ui.my<m)dy-=sp;else if(ui.my>VH-m)dy+=sp;}
  if(dx||dy){cam.x+=dx/cam.z;cam.y+=dy/cam.z;clampCam();}
}
/* custom cursors */
const curCache={};
function cursorFor(kind){
  if(curCache[kind])return curCache[kind];
  const c=mkCanvas(32,32),g=c.getContext('2d');g.translate(16,16);g.lineCap='round';g.lineWidth=2.4;
  const dark=()=>{g.strokeStyle='rgba(0,0,0,.8)';g.lineWidth=4.6;};
  const draw=(fn,col)=>{dark();fn();g.strokeStyle=col;g.lineWidth=2.2;fn();};
  switch(kind){
    case'attack':draw(()=>{g.beginPath();g.arc(0,0,8,0,TAU);g.moveTo(-13,0);g.lineTo(-4,0);g.moveTo(13,0);g.lineTo(4,0);g.moveTo(0,-13);g.lineTo(0,-4);g.moveTo(0,13);g.lineTo(0,4);g.stroke();},'#ff5a4a');break;
    case'gather':draw(()=>{g.beginPath();g.moveTo(-8,-3);g.lineTo(-4,-9);g.lineTo(4,-9);g.lineTo(8,-3);g.lineTo(0,10);g.closePath();g.stroke();},'#ffd45a');break;
    case'repair':draw(()=>{g.beginPath();g.moveTo(-9,9);g.lineTo(2,-2);g.stroke();g.beginPath();g.arc(5,-5,5,0.9,TAU-0.2);g.stroke();},'#7cc4ff');break;
    case'target':draw(()=>{g.beginPath();g.arc(0,0,9,0,TAU);g.moveTo(-14,0);g.lineTo(-6,0);g.moveTo(14,0);g.lineTo(6,0);g.moveTo(0,-14);g.lineTo(0,-6);g.moveTo(0,14);g.lineTo(0,6);g.stroke();},'#7cffb0');break;
    case'move':draw(()=>{g.beginPath();g.moveTo(-9,0);g.lineTo(9,0);g.moveTo(2,-7);g.lineTo(10,0);g.lineTo(2,7);g.stroke();},'#6dff9d');break;
  }
  return curCache[kind]='url('+c.toDataURL()+') 16 16, crosshair';
}
function cursorUpdate(){
  if(ui.touchMode){ui.hover=null;return;}
  let c='default';
  if(ui.place)c='crosshair';
  else if(ui.target)c=cursorFor('target');
  else if(G&&ui.running&&ui.inWin){
    const w=s2w(ui.mx,ui.my),e=entityAt(w.x,w.y);ui.hover=e;
    const own=ownUnits();
    if(own.length&&e){
      if(e.team===1||(e.team===2&&e.kind==='unit'))c=own.some(u=>!u.def.noWeapon&&!u.def.worker)?cursorFor('attack'):'default';
      else if(e.kind==='res'||(e.kind==='building'&&e.team===0&&e.type==='siphon'&&e.done))c=own.some(u=>u.def.worker)?cursorFor('gather'):'default';
      else if(e.kind==='building'&&e.team===0&&(!e.done||e.hp<e.maxhp)&&own.some(u=>u.def.worker))c=cursorFor('repair');
      else if(e.kind==='unit'||e.kind==='building')c='pointer';
    }else if(e)c='pointer';
  }
  if(cv.style.cursor!==c)cv.style.cursor=c;
}
function applyTarget(wx,wy,shift){
  const tg=ui.target;if(!tg)return;ui.target=null;const k=tg.kind;
  if(k.startsWith('role:')){swApplyRole(k.slice(5),wx,wy,shift);return;}
  if(k==='rally'){for(const b of ownBuildings())setRally(b,wx,wy,entityAt(wx,wy));}
  else if(k==='repair'){const e=entityAt(wx,wy),ws=ownUnits().filter(u=>u.def.worker);
    if(e&&e.team===0&&e.hp<e.maxhp&&(e.kind==='building'||e.def.tags.mech)&&ws.length){for(const u of ws)setOrder(u,{t:'repair',target:e},shift);ping(e.x,e.y,'#7cc4ff');sfx('ack',undefined,undefined,ws[0]);}else msg(0,'Nothing to repair there');}
  else if(k==='trade'){const e=entityAt(wx,wy),fs=ownUnits().filter(u=>u.def.trade);
    if(e&&e.kind==='neutral'&&e.type==='post'&&fs.length){for(const u of fs)setOrder(u,{t:'trade',post:e,st:'toPost'},shift);ping(e.x,e.y,'#ffd45a');sfx('ack',undefined,undefined,fs[0]);}else msg(0,'Pick a Trading Post');}
  else if(k.startsWith('skill')){const h=heroUnit(0),i=+k.slice(5);if(h){setOrder(h,{t:'cast',i,x:wx,y:wy});ping(wx,wy,'#ff9a6a');sfx('ack',undefined,undefined,h);}}
  else issueGroup(ownUnits(),wx,wy,k,shift);
}
function bindInput(){
  window.addEventListener('resize',resizeView);
  cv.addEventListener('contextmenu',e=>e.preventDefault());mm.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('mouseleave',()=>{ui.inWin=false;});document.addEventListener('mouseenter',()=>{ui.inWin=true;});
  const mmWorld=e=>{const r=mm.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*WW,y:(e.clientY-r.top)/r.height*WH};};
  window.addEventListener('mousemove',e=>{
    if(ui.touchMode)return;
    const px=ui.mx,py=ui.my;ui.mx=e.clientX;ui.my=e.clientY;ui.inWin=true;
    if(ui.drag){ui.drag.x1=e.clientX;ui.drag.y1=e.clientY;}
    if(ui.midDrag){cam.x-=(e.clientX-px)/cam.z;cam.y-=(e.clientY-py)/cam.z;clampCam();}
    if(ui.mmDrag&&G){const p=mmWorld(e);centerOn(p.x,p.y);}});
  cv.addEventListener('mousedown',e=>{
    audioInit();if(!G||!ui.running||G.paused||ui.demo)return;
    ui.mx=e.clientX;ui.my=e.clientY;const w=s2w(e.clientX,e.clientY);
    if(e.button===1){e.preventDefault();ui.midDrag=true;return;}
    if(e.button===0){
      if(ui.place){updatePlaceGhost();tryPlace(e.shiftKey);return;}
      if(ui.target){applyTarget(w.x,w.y,e.shiftKey);return;}
      ui.drag={x0:e.clientX,y0:e.clientY,x1:e.clientX,y1:e.clientY};
    }else if(e.button===2){
      if(ui.place||ui.target){ui.place=null;ui.target=null;return;}
      contextCommand(w.x,w.y,e.shiftKey);
    }});
  window.addEventListener('mouseup',e=>{
    if(e.button===1)ui.midDrag=null;ui.mmDrag=false;
    if(ui.touchMode||e.button!==0||!ui.drag||!G)return;
    const d=ui.drag;ui.drag=null;
    if(Math.abs(d.x1-d.x0)<5&&Math.abs(d.y1-d.y0)<5){const w=s2w(d.x1,d.y1);clickSelect(w.x,w.y,e.shiftKey,performance.now(),e.ctrlKey||e.metaKey);}else boxSelect(d,e.shiftKey);});
  cv.addEventListener('wheel',e=>{e.preventDefault();if(!G||!ui.running||ui.demo)return;ui.zx=e.clientX;ui.zy=e.clientY;cam.tz=clamp(cam.tz*(e.deltaY<0?1.12:1/1.12),0.5,1.7);},{passive:false});
  mm.addEventListener('mousedown',e=>{
    audioInit();if(!G||!ui.running||ui.demo)return;const p=mmWorld(e);
    if(e.button===0){
      if(ui.place)return;
      if(ui.target){applyTarget(p.x,p.y,e.shiftKey);return;}
      ui.mmDrag=true;centerOn(p.x,p.y);}
    else if(e.button===2){const own=ui.sel.filter(s=>s.team===0);
      if(own.length&&own[0].kind==='building'){for(const b of own)if(b.done)setRally(b,p.x,p.y,null);}else issueGroup(ownUnits(),p.x,p.y,'move',e.shiftKey);}});
  const cmdEl=$('cmd');
  cmdEl.addEventListener('mousedown',e=>{const b=e.target.closest('.cb');if(!b||b.dataset.i===undefined)return;e.preventDefault();audioInit();if(tpSuppressed())return;runCmd(+b.dataset.i);if(!ui.touchMode)hideTip();});
  cmdEl.addEventListener('mouseover',e=>{if(ui.touchMode)return;const b=e.target.closest('.cb');if(b&&b.dataset.i!==undefined){const i=+b.dataset.i,c=ui.cmds[i];if(c)showTipHTML(cmdTipHTML(c,i),b.getBoundingClientRect());}});
  cmdEl.addEventListener('mouseleave',hideTip);
  $('info').addEventListener('mousedown',e=>{
    const q=e.target.closest('[data-q]');
    if(q){const b=ownBuildings().find(x=>x.queue.length>+q.dataset.q);if(b){cancelQueue(b,+q.dataset.q);sfx('cancel');}return;}
    const g=e.target.closest('[data-id]');
    if(g){const id=+g.dataset.id,ent=ui.sel.find(s=>s.id===id);if(!ent)return;if(e.shiftKey)setSel(ui.sel.filter(s=>s!==ent));else if(e.ctrlKey)setSel(ui.sel.filter(s=>s.type===ent.type));else setSel([ent]);selSfx();}});
  $('groups').addEventListener('mousedown',e=>{const a=e.target.closest('[data-grpadd]');if(a){const n=nextFreeGroup();if(n){groupSet(n,false);ui.groupsDirty=true;$('groups').dataset.h='';}return;}const g=e.target.closest('[data-grp]');if(g)groupRecall(+g.dataset.grp);});
  for(const el of document.querySelectorAll('[data-tip]')){el.addEventListener('mouseover',()=>{if(!ui.touchMode)showTipHTML(el.dataset.tip,el.getBoundingClientRect(),false);});el.addEventListener('mouseleave',()=>{if(!ui.touchMode)hideTip();});}
  $('ecoPanel').addEventListener('mousedown',e=>{
    const b=e.target.closest('[data-act]');if(!b)return;e.preventDefault();audioInit();const a=b.dataset.act.split(':');
    if(a[0]==='close')togglePanel('eco');
    else if(a[0]==='tax'){setTax(0,+a[1]);sfx('click');}
    else if(a[0]==='amt'){ui.mktAmt=+a[1];sfx('click');}
    else if(a[0]==='mkt'){if(!hasDone(0,'exchange')){toast('Build an Exchange (Era II) to trade','bad');sfx('err');}else if(mktTrade(0,a[1],ui.mktAmt))sfx('coin');else{toast('Not enough resources for that trade','bad');sfx('err');}}
    ui.ecoDirty=true;$('ecoPanel').dataset.h='';renderEco();});
  $('bIdle').onclick=selectIdle;$('bArmy').onclick=selectArmy;$('bHero').onclick=selectHero;
  $('bObj').onclick=()=>{ui.objOpen=!ui.objOpen;$('objectives').dataset.h='';renderObjectives();};
  $('bSpeed').onclick=()=>setSpeed(1,true);
  $('bMute').onclick=()=>{audioInit();setTxt('bMuteT',toggleMute()?'🔇':'🔊');};
  $('bMenu').onclick=togglePause;$('chMor').onclick=()=>togglePanel('eco');$('chMkt').onclick=()=>togglePanel('eco');
  /* menus */
  $('facRow').addEventListener('click',e=>{const f=e.target.closest('.fac');if(!f)return;SET.faction=f.dataset.f;saveSettings();syncMenu();});
  $('enemyRow').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;SET.enemy=b.dataset.e;saveSettings();syncMenu();});
  $('diffRow').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;SET.diff=b.dataset.d;saveSettings();syncMenu();});
  $('seedIn').addEventListener('input',e=>{const v=e.target.value.trim();ui.seedOverride=v===''?null:(isNaN(+v)?[...v].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7):+v);});
  $('bStart').onclick=()=>{audioInit();startGame();};$('bContinue').onclick=()=>{audioInit();resumeGame();};
  $('bHelp').onclick=()=>{audioInit();openSub('helpMenu');};$('bSet').onclick=()=>{audioInit();openSub('setMenu');};
  $('bHelpX').onclick=closeSub;$('bSetX').onclick=()=>{saveSettings();closeSub();};
  $('bResume').onclick=togglePause;$('bPHelp').onclick=()=>openSub('helpMenu');$('bPSet').onclick=()=>openSub('setMenu');
  $('bRestart').onclick=()=>{if(typeof campRestart==='function'&&campRestart())return;startGame();};
  $('bSurr').onclick=()=>{if(performance.now()-ui.surr<3500){ui.surr=0;hideOverlays();G.paused=false;endGame('defeat');}else{ui.surr=performance.now();$('bSurr').textContent='Click again to confirm';setTimeout(()=>{$('bSurr').textContent='Surrender';},3600);}};
  $('bToMenu').onclick=()=>{if(typeof campPauseBack==='function'&&campPauseBack())return;toMenu();};$('bAgain').onclick=()=>{startGame();};$('bEndMenu').onclick=toMenu;
  $('setMusic').addEventListener('input',e=>{SET.music=e.target.value/100;applyVolumes();saveSettings();});
  $('setSfx').addEventListener('input',e=>{SET.sfx=e.target.value/100;applyVolumes();saveSettings();});
  $('setVoice').addEventListener('input',e=>{SET.voiceVol=e.target.value/100;applyVolumes();saveSettings();});
  for(const k of['edge','voice','hints','shake','swarm','swarmHints','cb','rm','haptics','wake','fps'])$('set_'+k).addEventListener('change',e=>{SET[k]=e.target.checked;saveSettings();if(k==='hints')renderObjectives();if(k==='rm')rootEl.classList.toggle('rm',SET.rm);});
  $('set_quality').addEventListener('change',e=>setQualityMode(e.target.value));

  swBind();bindTouch();platInit();supInit();
  window.addEventListener('keydown',e=>{
    if(e.target&&e.target.tagName==='INPUT'&&e.target.type!=='range'&&e.target.type!=='checkbox')return;
    const k=e.key.toLowerCase();
    if(k==='escape'){
      const cur=currentOverlay();
      if(cur==='helpMenu'||cur==='setMenu'){closeSub();return;}
      if(typeof campEsc==='function'&&campEsc(cur))return;   // campaign menu / briefing / debrief / Extras: back one step
      if(cur==='menu')return;
    }
    if(!G||!ui.running||ui.demo)return;
    ui.keys[k]=true;if(e.key==='Alt')ui.keys.alt=true;
    if(['arrowup','arrowdown','arrowleft','arrowright',' ','tab','backspace','f1','f2','f3','f4'].includes(k))e.preventDefault();
    if(G.over)return;
    if(k==='escape'){
      if(ui.place||ui.target||ui.menu||ui.panel){ui.place=null;ui.target=null;if(ui.menu){ui.menu=null;ui.cmdDirty=true;}if(ui.panel)togglePanel(ui.panel);return;}
      togglePause();return;}
    if(k==='p'){togglePause();return;}
    if(G.paused)return;
    if(k==='h'){G.paused=true;showOverlay('pauseMenu');openSub('helpMenu');return;}
    if(e.code&&e.code.startsWith('Digit')){const n=+e.code.slice(5);if(n>=1&&n<=9){e.preventDefault();if(e.ctrlKey||e.metaKey)groupSet(n,false);else if(e.shiftKey)groupSet(n,true);else groupRecall(n);return;}}
    if(k==='f1'){selectIdle();return;}if(k==='f2'){selectArmy();return;}if(k==='f3'){selectHero();return;}
    if(k===' '){if(G.alertPos)centerOn(G.alertPos.x,G.alertPos.y);return;}
    if(k==='backspace'){goHub();return;}
    if(k==='tab'){const types=[];for(const s of ui.sel)if(!types.includes(s.type))types.push(s.type);
      if(types.length>1){ui.activeType=types[(types.indexOf(ui.activeType)+1)%types.length];ui.infoDirty=ui.cmdDirty=true;}return;}
    if(k==='+'||k==='='){setSpeed(1);return;}if(k==='-'||k==='_'){setSpeed(-1);return;}
    if(k==='m'){togglePanel('eco');return;}
    if(k==='k'){togglePanel('swarm');return;}
    if(k==='j'){if(G.sw)swToggleMaster();return;}
    if(k==='enter'||k==='/'){e.preventDefault();swFocus();return;}
    if(k==='o'){ui.objOpen=!ui.objOpen;$('objectives').dataset.h='';renderObjectives();return;}
    if(k==='t'){setTax(0,(G.teams[0].tax+1)%3);toast('Taxes: '+TAX[G.teams[0].tax].n,'good');return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const i=SLOT_KEYS.indexOf(k);if(i>=0&&ui.cmds[i]){e.preventDefault();runCmd(i);}
  });
  window.addEventListener('keyup',e=>{ui.keys[e.key.toLowerCase()]=false;if(e.key==='Alt')ui.keys.alt=false;});
  window.addEventListener('blur',()=>{ui.keys={};ui.inWin=false;});
}

/* ------------------------------- main loop ------------------------------ */
let lastT=0,acc=0;
function frame(ts){
  requestAnimationFrame(frame);
  if(Q.fps&&ts-lastT<1000/Q.fps-1.5)return;           // battery saver: render at most 30 fps (the sim keeps its own fixed step)
  qualityFrame(ts-lastT);
  const dt=Math.min(0.1,(ts-lastT)/1000||0.016);lastT=ts;
  if(!G||!ui.running)return;
  frameBody(dt,ts/1000);
}
function frameBody(dt,t){
  if(G.camp&&G.camp.hold)acc=0;   // a blocking campaign dispatch card holds the world (step() also returns early): no catch-up burst after the resume
  else if(!G.paused&&(!G.over||G.time-G.overT<3)){acc+=dt*G.speed;let n=0;while(acc>=TICK&&n<14){step();acc-=TICK;n++;}if(n>=14)acc=0;}
  if(Math.abs(cam.tz-cam.z)>0.002)setZoom(cam.z+(cam.tz-cam.z)*Math.min(1,dt*12),ui.zx,ui.zy);
  if(ui.demo)demoUpdate(dt);else{cameraUpdate(dt);touchUpdate(dt);if(ui.place)updatePlaceGhost();}
  updateFog(dt,ui.fogForce);ui.fogForce=false;
  terrainStream(dt>0.028?2:5);   // sharp ground tiles: a few ms per frame, less when the frame is already slow
  render(t,dt);drawMinimap();fpsOverlay(dt);
  if(!ui.demo){hudUpdate(dt);cursorUpdate();if(typeof resumeTick==='function')resumeTick(dt);if(typeof campUiTick==='function')campUiTick(dt);
    if(ui.endRes&&performance.now()>ui.endAt&&!(G.camp&&G.camp.hold))showEnd();}   // a held dispatch card is read first, then the debrief
}

/* -------------------------------- boot ---------------------------------- */
function boot(){
  cv=$('game');ctx=cv.getContext('2d');mm=$('mm');mmCtx=mm.getContext('2d');
  setTouchMode(!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches));rootEl.classList.toggle('rm',!!SET.rm);
  initQuality();resizeView();hydrateGlyphs();buildMenus();bindInput();campInit();soundLabInit();ui.inWin=true;
  if(window.ResizeObserver){const ro=new ResizeObserver(()=>{sizeMinimap();measureHud();});ro.observe($('top'));ro.observe($('bottom'));ro.observe($('mmWrap'));}
  showOverlay('menu');
  if(!window.__TEST||window.__TEST==='live')startDemo();
  if(!window.__TEST||window.__TEST==='live')requestAnimationFrame(frame);
}
if(window.__TEST){window.__RTS={makeAI,DIFF,newGame,startGame,startDemo,step,get G(){return G;},ui,cam,SET,UDEF,BDEF,TECH,FACTIONS,aiThink,setSel,buildCommands,runCmd,renderInfo,renderCmdCard,hudUpdate,entityAt,issueGroup,contextCommand,clickSelect,boxSelect,
  orderBuild,queueUnit,canPlace,addUnit,addBuilding,findPath,canStand,tryPlace,updatePlaceGhost,beginPlace,cancelQueue,setRally,groupSet,groupRecall,cmdStop,cmdHold,togglePause,togglePanel,renderEco,
  render:(t)=>{updateFog(0.05,true);render(t||1,0.016);},drawMinimap,frameBody,s2w,w2s,centerOn,setZoom,clampCam,showEnd,toMenu,showOverlay,mktTrade,heroUnit,castHero,learnSkill,applyTarget,TILE,MW,MH,WW,WH,
  endGame,buildTerrain,initFog,updateVision,updateFog,resetUI,hideOverlays,getScreen:(e)=>w2s(e.x,e.y),
  get TOPBAR(){return TOPBAR;},get BOTTOM(){return BOTTOM;},tch,tileFor,tileScaleWanted,terrainStream,terrainPaint,mkCanvas,Q,QUALITY,applyQuality,setQualityMode,get SC(){return SC;},get DPR(){return DPR;},TP,tpTap,tpLongTap,setTouchMode,measureHud,STORY,MUSIC_CUES,drawPortrait,PORTRAIT_PAINT,speak,musicPlay,musicStop,musicScene,musicStinger,musicDuck,musicMood,sfxUnit,sfxBuilding,cineSfx,audioVoices,audioRender,swui,swRender,swSend,swAct,swHud,ovCommand,ovPreset,ovApprove,econHire,econAccept,agEnroll,agDirect,enrollAll,cadenceTable,wageNow,swAgents,swAssignRole,swApplyRole,swToggleMaster,ROLES,CADI,DOMAINS,jobCancel,econFire,swTaskOpts,swPickAgents,AUD,MUSIC,MUSIC_DATA,MOTIF,musicInfo,musicState,musicRestore,musicRegister};}
boot();
