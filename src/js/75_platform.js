/* =========================================================================
   PLATFORM — what a phone, a browser tab and an installed app each need to feel right.
     lifecycle   auto-pause + audio suspend when the page is hidden / backgrounded, screen wake-lock while playing
     navigation  Android / system Back opens the pause menu instead of leaving mid-match (installed app only)
     chrome      fullscreen + landscape lock (Android, desktop), iOS audio session, share sheet
     install     Android/desktop install prompt, iPhone "Add to Home Screen" instructions, service-worker registration
   Nothing here touches the simulation and nothing makes a network request on its own (the service worker is only
   registered by the PWA build over http(s); the single-file build opened from disk registers nothing).
   ========================================================================= */
const UA=navigator.userAgent||'';
const PLAT={
  ios:/iPad|iPhone|iPod/.test(UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),
  android:/Android/i.test(UA),
  standalone:!!((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true),
  native:!!(window.Capacitor&&typeof Capacitor.isNativePlatform==='function'&&Capacitor.isNativePlatform()),
  web:/^https?:$/.test(location.protocol),
  wl:null,hist:false,deferred:null,swReg:null
};
PLAT.installed=PLAT.standalone||PLAT.native;
PLAT.canFull=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen)&&!PLAT.installed;

/* ------------------------------- lifecycle ------------------------------- */
function matchActive(){return !!(G&&ui.running&&!ui.demo&&!G.over);}
function suspendAudio(){try{if(AC&&AC.state==='running')AC.suspend();}catch(e){}}
function autoPause(){
  if(matchActive()&&!G.paused){G.paused=true;showOverlay('pauseMenu');setTxt('bMenuT','▶');}
  if(matchActive()&&typeof resumeWrite==='function')resumeWrite();
  suspendAudio();releaseWake();
}
async function acquireWake(){
  if(!SET.wake||!navigator.wakeLock||PLAT.wl||document.hidden)return;
  try{PLAT.wl=await navigator.wakeLock.request('screen');PLAT.wl.addEventListener('release',()=>{PLAT.wl=null;});}catch(e){PLAT.wl=null;}
}
function releaseWake(){if(PLAT.wl){try{PLAT.wl.release();}catch(e){}PLAT.wl=null;}}
function platMatchStart(){
  if((PLAT.installed)&&!PLAT.hist){try{history.pushState({od:1},'');PLAT.hist=true;}catch(e){}}
  acquireWake();
}
function platMatchStop(){releaseWake();}
function platPauseChanged(paused){if(paused)releaseWake();else acquireWake();}

/* ------------------------------- chrome ------------------------------- */
function toggleFullscreen(){
  const d=document,e=d.documentElement;
  if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);return;}
  if(e.requestFullscreen){
    e.requestFullscreen({navigationUI:'hide'}).then(()=>{try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(()=>{});}catch(_){}}).catch(()=>{});
  }else if(e.webkitRequestFullscreen)e.webkitRequestFullscreen();
}
function platShare(){
  const data={title:'Orbital Dominion',text:'A real-time strategy game with a swarm-agent economy.',url:location.href.split('#')[0]};
  if(navigator.share)navigator.share(data).catch(()=>{});
  else if(navigator.clipboard)navigator.clipboard.writeText(data.url).then(()=>toastAny('Link copied')).catch(()=>{});
}
function toastAny(t){   // toast() hides itself on the menu: show a small notice there too
  sfx('toast');const el=document.createElement('div');el.className='tmsg good';el.textContent=t;el.style.cssText='position:fixed;left:50%;top:calc(var(--tH) + 12px);transform:translateX(-50%);z-index:80';document.body.appendChild(el);setTimeout(()=>el.remove(),2600);
}
function syncPlatformUI(){
  const show=(id,on)=>{const el=$(id);if(el)el.classList.toggle('hidden',!on);};
  show('bFull',PLAT.canFull);show('bPFull',PLAT.canFull);
  show('bShare',!!(PLAT.web&&(navigator.share||navigator.clipboard)));
  show('bInstall',!PLAT.installed&&PLAT.web&&(!!PLAT.deferred||PLAT.ios));
}

/* ------------------------------- install + service worker ------------------------------- */
function updateBanner(onTap){
  let el=$('updBanner');
  if(!el){el=document.createElement('button');el.id='updBanner';el.className='btn';document.body.appendChild(el);}
  el.textContent='A new version is ready — tap to update';el.onclick=onTap;el.classList.remove('hidden');
}
function registerSW(){
  if(BUILD.variant!=='pwa'||!PLAT.web||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('sw.js').then(reg=>{
    PLAT.swReg=reg;
    const watch=w=>w&&w.addEventListener('statechange',()=>{
      if(w.state==='installed'&&navigator.serviceWorker.controller)updateBanner(()=>{w.postMessage('skip');});
    });
    watch(reg.installing);reg.addEventListener('updatefound',()=>watch(reg.installing));
  }).catch(()=>{});
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;if(!matchActive())location.reload();});
}

function platInit(){
  document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();else if(matchActive()&&!G.paused)acquireWake();});
  window.addEventListener('pagehide',autoPause);
  window.addEventListener('popstate',()=>{
    PLAT.hist=false;
    if(matchActive()){if(!G.paused)togglePause();try{history.pushState({od:1},'');PLAT.hist=true;}catch(e){}}
  });
  try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}   // iOS 16.4+: audible with the ring/silent switch off
  const cap=window.Capacitor&&Capacitor.Plugins&&Capacitor.Plugins.App;
  if(cap&&cap.addListener){
    cap.addListener('appStateChange',s=>{if(!s.isActive)autoPause();});
    cap.addListener('backButton',()=>{if(matchActive()){if(!G.paused)togglePause();}else if(cap.exitApp&&!currentOverlay())cap.exitApp();else if(currentOverlay()!=='menu')closeSub();});
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();PLAT.deferred=e;syncPlatformUI();});
  window.addEventListener('appinstalled',()=>{PLAT.deferred=null;PLAT.installed=true;syncPlatformUI();toastAny('Installed — launch it from your home screen');});
  $('bInstall').onclick=()=>{
    if(PLAT.deferred){PLAT.deferred.prompt();PLAT.deferred.userChoice.finally(()=>{PLAT.deferred=null;syncPlatformUI();});}
    else if(PLAT.ios)openSub('iosHelp');
  };
  $('bIosX').onclick=closeSub;
  $('bShare').onclick=platShare;
  for(const id of['bFull','bPFull'])$(id).onclick=toggleFullscreen;
  $('bPMute').onclick=()=>{audioInit();const m=toggleMute();setTxt('bMuteT',m?'🔇':'🔊');$('bPMute').textContent='Sound: '+(m?'off':'on');};
  syncPlatformUI();registerSW();
}
