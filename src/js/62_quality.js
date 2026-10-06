/* =========================================================================
   QUALITY — graphics presets and an adaptive scaler.
   Rendering only: the simulation never reads anything in here, so determinism and balance are unaffected.
     dpr     upper bound on canvas pixels per CSS pixel (capped again by the real devicePixelRatio)
     sc      sprite supersampling (sprites are baked at sc x and scaled down when drawn)
     smooth  imageSmoothingQuality for world drawing ('high' = mip-mapped / bicubic downsampling, no shimmer)
     hires   terrain detail: 0 = single 1x bake, 1 = sharp 2x tiles near the camera, 2 = 3x tiles
     fx      0 none · 1 vignette + grade · 2 + additive glows and dust · 3 + extra particles
     part    multiplier on cosmetic particle counts
     fps     0 = display rate, 30 = render at most 30 frames per second (battery saver)
   'auto' starts from a device heuristic and then moves between tiers using measured frame times.
   ========================================================================= */
const QUALITY={
  battery :{dpr:1,  sc:2,smooth:'low',   hires:0,fx:0,part:.4,fps:30},
  balanced:{dpr:1.5,sc:3,smooth:'medium',hires:0,fx:1,part:.7,fps:0},
  high    :{dpr:2,  sc:3,smooth:'high',  hires:1,fx:2,part:1, fps:0},
  ultra   :{dpr:3,  sc:4,smooth:'high',  hires:2,fx:3,part:1.3,fps:0}
};
const TIERS=['battery','balanced','high','ultra'];
const Q=Object.assign({tier:'high',auto:true,autoMax:2,acc:0,n:0,bad:0,good:0,lastSwitch:0,fpsAvg:60,msAvg:16,gate:0},QUALITY.high);

function autoTier(){
  const nav=navigator,mem=nav.deviceMemory||4,cores=nav.hardwareConcurrency||4,dpr=window.devicePixelRatio||1,phone=/Mobi|Android|iPhone|iPad/i.test(nav.userAgent||'');
  if(mem<=2||cores<=2)return'battery';
  if(mem<4||cores<4||(phone&&dpr>=3&&mem<6))return'balanced';
  return'high';
}
function applyQuality(tier,silent){
  const cfg=QUALITY[tier]||QUALITY.high,oldSC=SC;
  Q.tier=tier;Object.assign(Q,cfg);
  if(SC!==cfg.sc){SC=cfg.sc;for(const k in spriteCache)delete spriteCache[k];}
  if(typeof resizeView==='function'&&cv)resizeView();
  if(typeof terrainQualityChanged==='function')terrainQualityChanged();
  if(!silent&&typeof toast==='function'&&SET.fps)toast('Graphics: '+tier+(Q.auto?' (auto)':''),'good');
}
function initQuality(){
  Q.auto=SET.quality==='auto'||!QUALITY[SET.quality];
  Q.autoMax=TIERS.indexOf('high');
  applyQuality(Q.auto?autoTier():SET.quality,true);
}
function setQualityMode(mode){   // called from the settings menu
  SET.quality=mode;saveSettings();Q.auto=mode==='auto'||!QUALITY[mode];Q.bad=Q.good=0;
  applyQuality(Q.auto?autoTier():mode,true);
}
/* called once per animation frame with the real frame interval (ms). Windows of 2 s; hysteresis so it never flaps:
   3 slow windows in a row step down, 10 fast windows in a row step up (never above 'high' in auto mode). */
function qualityFrame(ms){
  // a stalled main thread, a throttled background tab or a loading hitch is not evidence about the GPU: ignore it
  if(!(ms>0)||ms>200||document.hidden){return;}
  Q.acc+=ms;Q.n++;
  if(Q.acc<2000)return;
  const mean=Q.acc/Q.n;Q.msAvg=mean;Q.fpsAvg=1000/mean;Q.acc=0;Q.n=0;
  if(!Q.auto||document.hidden||(G&&(G.paused||ui.demo)))return;
  const target=Q.fps===30?33.4:16.7;
  if(mean>target*1.55){Q.bad++;Q.good=0;}else if(mean<target*1.12){Q.good++;Q.bad=0;}else{Q.bad=0;Q.good=0;}
  const i=TIERS.indexOf(Q.tier),now=performance.now();
  if(Q.bad>=3&&i>0){Q.bad=0;Q.lastSwitch=now;applyQuality(TIERS[i-1]);}
  else if(Q.good>=10&&i<Q.autoMax&&now-Q.lastSwitch>30000){Q.good=0;Q.lastSwitch=now;applyQuality(TIERS[i+1]);}
}
/* optional frame statistics (Settings -> Show frame-rate statistics) */
let fpsEl=null,fpsT=0;
function fpsOverlay(dt){
  if(!SET.fps){if(fpsEl&&!fpsEl.classList.contains('hidden'))fpsEl.classList.add('hidden');return;}
  if(!fpsEl){fpsEl=document.createElement('div');fpsEl.id='fpsBox';document.body.appendChild(fpsEl);}
  fpsEl.classList.remove('hidden');fpsT-=dt;if(fpsT>0)return;fpsT=0.5;
  fpsEl.textContent=Q.fpsAvg.toFixed(0)+' fps · '+Q.msAvg.toFixed(1)+' ms · '+Q.tier+(Q.auto?' (auto)':'')+' · DPR '+DPR+' · SC '+SC+(typeof terrainChunkInfo==='function'?terrainChunkInfo():'');
}
