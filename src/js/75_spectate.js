/* =============================================================================
   75_SPECTATE (v6.1) — UI only: "Watch agents". Two T2 agents play a full match (aiBoth) in a replay-enabled game (47_replay.js), the
   camera follows the action (or is free), and a panel shows what each agent believes: its OWN win estimate V(s) (fog-honest, so the two
   lines can disagree), the material share, a stats table, a one-line "why" per agent and a timeline of key moments.  Every match has a
   short CODE (and a #watch=CODE link): the same code reproduces the same match.  Reads simulation state, never writes it (rule 12);
   wall-clock and Math.random are fine here (UI), the simulation's own draws come from the replay stream.
   ============================================================================= */
const SP={follow:true,hist:[],ev:[],prevMil:[null,null],prevBases:[0,0],prevEra:[1,1],lastUi:0,lastHist:-99,evKey:'',keys:{},drag:null,setup:null,rows:null,fold:false};
const SP_TIERS=[['easy','Easy'],['normal','Normal'],['hard','Hard'],['master','Master']];
function specSetErr(m){const e=$('wmErr');e.textContent=m||'';e.classList.toggle('hidden',!m);}
function specFill(){
  const opts=FACTION_IDS.map(f=>'<option value="'+f+'">'+FACTIONS[f].name+'</option>').join(''),t=SP_TIERS.map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('');
  for(const id of['wmFa','wmFb'])$(id).innerHTML=opts;for(const id of['wmTa','wmTb'])$(id).innerHTML=t;
  $('wmFa').value=FACTION_IDS[0];$('wmFb').value=FACTION_IDS[1];$('wmTa').value='master';$('wmTb').value='hard';
}
function specOpen(){specSetErr('');openSub('watchMenu');}
function specFromForm(){
  const code=$('wmCode').value.trim();
  if(code){const o=replayParse(code);if(!o){specSetErr('That replay code is not valid. Format: OD1-<seed>-<factionA>-<factionB>-<tierA>-<tierB>-<flags>');return null;}return o;}
  const fa=$('wmFa').value,fb=$('wmFb').value;if(fa===fb){specSetErr('Pick two different factions.');return null;}
  const sv=$('wmSeed').value.trim();let seed;
  if(sv===''){seed=(Math.random()*1e9)|0;}else if(/^\d{1,10}$/.test(sv)&&+sv<=4294967295){seed=+sv;}else{specSetErr('The seed must be a whole number (or blank).');return null;}
  const ta=$('wmTa').value,tb=$('wmTb').value;
  return{replay:true,aiBoth:true,seed,faction:fa,enemy:fb,diff:ta,diffs:[ta,tb],mapFx:$('wmFx').checked,arsenalOff:[false,false]};
}
function specStart(setup){
  SP.setup=setup;SP.hist=[];SP.ev=[];SP.prevMil=[null,null];SP.prevBases=[2,2];SP.lastHist=-99;SP.evKey='';SP.follow=true;
  platMatchStop();if(typeof campMatchStop==='function')campMatchStop();
  newGame(setup);
  ui.demo=true;ui.running=true;resetUI();ui.spec=true;applyTeamPalettes();buildTerrain();initFog();updateFog(1,true);
  G.speed=2;cam.z=cam.tz=rootEl.classList.contains('compact')?0.7:0.9;ui.demoT=0;ui.demoPt=null;ui.demoEnd=0;
  $('hud').classList.add('hidden');hideOverlays();overlayStack=[];
  const s=G.sites[0];centerOn(s.cx*TILE,s.cy*TILE);
  SP.prevBases=[specSide(0).bases,specSide(1).bases];SP.prevEra=[1,1];specNote(-1,'Match starts: '+FACTIONS[G.teams[0].faction].name+' (A) vs '+FACTIONS[G.teams[1].faction].name+' (B)');
  specBuild();$('spec').classList.remove('hidden');$('spRes').classList.add('hidden');
  try{history.replaceState(null,'','#watch='+replayCode());}catch(e){}
  specRefresh(true);
}
function specHide(){if(!ui.spec&&$('spec').classList.contains('hidden'))return;ui.spec=false;$('spec').classList.add('hidden');try{if(/^#watch=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);}catch(e){}}
function specExit(){specHide();toMenu();}
function specNew(){const o=Object.assign({},SP.setup);o.seed=(Math.random()*1e9)|0;specStart(o);}
function specBoot(){
  const m=/^#watch=(.+)$/.exec(location.hash||'');if(!m)return;
  const o=replayParse(decodeURIComponent(m[1]));if(o)specStart(o);
}
function specBuild(){   // static skeleton of the stats table, filled by specRefresh
  const rows=['Army value','Workers','Bases','Supply','Bank (crystal / ether)','Era'];
  $('spTab').innerHTML=rows.map((r,i)=>'<tr><td id="spa'+i+'"></td><td>'+r+'</td><td id="spb'+i+'"></td></tr>').join('');
  const nm=t=>FACTIONS[G.teams[t].faction].name+' · '+(G.rp.diffs[t]||G.rp.diff);
  setTxt('spA','A  '+nm(0));setTxt('spB',nm(1)+'  B');setTxt('spCode',replayCode());
  $('spA').style.color=G.teams[0].pal.glow||'';$('spB').style.color=G.teams[1].pal.glow||'';
}
function specSide(t){
  let w=0,al=[];for(const u of G.units){if(u.dead||u.team!==t)continue;if(u.def.worker)w++;else if(!u.def.trade)al.push(u);}
  let bases=0,st=0;for(const b of G.buildings){if(b.dead||b.team!==t||!b.done)continue;st++;if(b.type==='hub')bases++;}
  const T=G.teams[t];return{w,army:Math.round(aiArmyVal(al)),n:al.length,bases,st,used:T.used,cap:T.cap,c:Math.round(T.c),e:Math.round(T.e),era:T.era};
}
function specWhy(ai,S){
  if(!ai)return'';const pct=x=>Math.round(100*x)+'%';
  const v=ai.V!==undefined?' · own win estimate '+pct(ai.V):'';
  if(ai.mil==='attack')return'Attacking (wave '+ai.wave+'): predicted fight win '+pct(ai.pG)+v;
  if(ai.mil==='defend')return'Defending its base: enemy force near its structures is worth '+Math.round(ai.thrV||0)+v;
  if(ai.mil==='retreat')return'Retreating: predicted fight win '+pct(ai.pG)+' fell below its threshold'+v;
  if(ai.eco==='mass')return'Massing army: it has seen a stronger enemy force, so no greed'+v;
  return'Building up: '+S.n+' army units ('+S.army+' value); attacks when its predicted win beats '+pct(ai.th.aggr)+' and supply allows'+v;
}
function specNote(t,txt){SP.ev.push({t:G.time,team:t,txt});if(SP.ev.length>40)SP.ev.shift();}
const specClock=t=>{t=Math.floor(t);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};
function specTrack(S0,S1){
  const S=[S0,S1],nm=['A','B'];
  for(let t=0;t<2;t++){const ai=G.ais[t];if(!ai)continue;
    if(ai.mil!==SP.prevMil[t]){const p=Math.round(100*(ai.pG||0));
      if(ai.mil==='attack')specNote(t,nm[t]+' launches attack wave '+ai.wave+' (predicted win '+p+'%)');
      else if(ai.mil==='defend'&&SP.prevMil[t]!==null)specNote(t,nm[t]+' defends its base');
      else if(ai.mil==='retreat')specNote(t,nm[t]+' retreats (predicted win '+p+'%)');
      SP.prevMil[t]=ai.mil;}
    if(S[t].bases>SP.prevBases[t])specNote(t,nm[t]+' opens base #'+S[t].bases);
    else if(S[t].bases<SP.prevBases[t])specNote(t,nm[t]+' loses a base');
    if(S[t].era>SP.prevEra[t]){specNote(t,nm[t]+' reaches era '+S[t].era);}SP.prevEra[t]=S[t].era;
    SP.prevBases[t]=S[t].bases;}
}
function specRefresh(force){
  const S0=specSide(0),S1=specSide(1);specTrack(S0,S1);
  const sh=S0.army+S1.army>0?S0.army/(S0.army+S1.army):0.5;
  if(force||G.time-SP.lastHist>=5){SP.lastHist=G.time;SP.hist.push([G.time,G.ais[0]?G.ais[0].V:.5,G.ais[1]?G.ais[1].V:.5,sh]);if(SP.hist.length>360)SP.hist.shift();}
  setTxt('spT',specClock(G.time));
  const cells=[[S0.army,S1.army],[S0.w,S1.w],[S0.bases,S1.bases],[S0.used+'/'+S0.cap,S1.used+'/'+S1.cap],[S0.c+' / '+S0.e,S1.c+' / '+S1.e],[S0.era,S1.era]];
  cells.forEach((c,i)=>{setTxt('spa'+i,c[0]);setTxt('spb'+i,c[1]);});
  setTxt('spWhyA','A: '+specWhy(G.ais[0],S0));setTxt('spWhyB','B: '+specWhy(G.ais[1],S1));
  const key=SP.ev.length+':'+(SP.ev.length?SP.ev[SP.ev.length-1].t:0);
  if(key!==SP.evKey){SP.evKey=key;const el=$('spEv');el.innerHTML=SP.ev.slice(-8).reverse().map(e=>'<li>'+specClock(e.t)+' '+e.txt+'</li>').join('');}
  specGraph();
  setTxt('spPause',G.paused?'Play':'Pause');$('spPause').setAttribute('aria-label',G.paused?'Resume':'Pause');
  for(const b of document.querySelectorAll('#spec [data-sp]'))b.setAttribute('aria-pressed',String(+b.dataset.sp===G.speed));
  if(G.over&&$('spRes').classList.contains('hidden')){
    const r=$('spRes');r.classList.remove('hidden');
    r.textContent=G.over==='victory'?'Side A wins at '+specClock(G.time)+'.':G.over==='defeat'?'Side B wins at '+specClock(G.time)+'.':'Draw at '+specClock(G.time)+'.';}
}
function specGraph(){
  const c=$('spGraph');if(!c||!SP.hist.length)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),W=c.clientWidth||300,H=c.clientHeight||84;
  if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}
  const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);
  const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim()||'#999';
  const t1=Math.max(60,SP.hist[SP.hist.length-1][0]),X=t=>4+(W-8)*t/t1,Y=p=>H-4-(H-8)*Math.max(0,Math.min(1,p));
  g.strokeStyle=col('--line');g.lineWidth=1;g.beginPath();g.moveTo(4,Y(.5));g.lineTo(W-4,Y(.5));g.stroke();
  const line=(k,color,dash)=>{g.strokeStyle=color;g.lineWidth=2;g.setLineDash(dash||[]);g.beginPath();SP.hist.forEach((h,i)=>{const x=X(h[0]),y=Y(h[k]);if(i)g.lineTo(x,y);else g.moveTo(x,y);});g.stroke();g.setLineDash([]);};
  line(3,col('--txt2'),[3,3]);line(1,col('--info'));line(2,col('--warn'));
}
function specFrame(dt){
  if(!SP.follow){const k=SP.keys,sp=900*dt/Math.sqrt(cam.z);let dx=0,dy=0;if(k.arrowleft||k.a)dx-=sp;if(k.arrowright||k.d)dx+=sp;if(k.arrowup||k.w)dy-=sp;if(k.arrowdown||k.s)dy+=sp;if(dx||dy){cam.x+=dx/cam.z;cam.y+=dy/cam.z;clampCam();}}
  const now=performance.now();if(now-SP.lastUi>400){SP.lastUi=now;specRefresh(false);}
}
function specSetSpeed(v){G.speed=v;if(G.paused)G.paused=false;specRefresh(false);}
function specFollow(on){SP.follow=on;$('spFollow').setAttribute('aria-pressed',String(on));if(on)ui.demoT=0;}
function specCopy(txt,btn){
  const done=()=>{const o=btn.textContent;btn.textContent='Copied';setTimeout(()=>{btn.textContent=o;},1200);};
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,()=>{});return;}}catch(e){}
  const code=$('spCode');const r=document.createRange();r.selectNodeContents(code);const s=getSelection();s.removeAllRanges();s.addRange(r);try{document.execCommand('copy');done();}catch(e){}
}
function specInit(){
  specFill();
  $('bWatch').onclick=()=>{audioInit();specOpen();};
  $('wmBack').onclick=closeSub;
  $('wmGo').onclick=()=>{const o=specFromForm();if(o)specStart(o);};
  $('wmCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('wmGo').click();e.stopPropagation();});
  $('wmSeed').addEventListener('keydown',e=>{if(e.key==='Enter')$('wmGo').click();e.stopPropagation();});
  $('spPause').onclick=()=>{if(G.over)return;G.paused=!G.paused;specRefresh(false);};
  for(const b of document.querySelectorAll('#spec [data-sp]'))b.onclick=()=>specSetSpeed(+b.dataset.sp);
  $('spFollow').onclick=()=>specFollow(!SP.follow);
  $('spCopy').onclick=e=>specCopy(replayCode(),e.currentTarget);
  $('spLink').onclick=e=>specCopy(location.href.split('#')[0]+'#watch='+replayCode(),e.currentTarget);
  $('spNew').onclick=specNew;$('spExit').onclick=specExit;
  $('spFold').onclick=()=>{SP.fold=!SP.fold;$('spec').classList.toggle('fold',SP.fold);$('spFold').textContent=SP.fold?'▸':'▾';$('spFold').setAttribute('aria-expanded',String(!SP.fold));};
  addEventListener('keydown',e=>{if(!ui.spec)return;const tg=e.target&&e.target.tagName;if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA')return;
    const k=e.key.toLowerCase();
    if(k==='escape'){specExit();e.preventDefault();return;}
    if(k===' '){$('spPause').click();e.preventDefault();return;}
    if(k==='f'){specFollow(!SP.follow);return;}
    if('1248'.includes(k)&&k.length===1){specSetSpeed(+k);return;}
    SP.keys[k]=true;if(k.startsWith('arrow'))e.preventDefault();},true);
  addEventListener('keyup',e=>{SP.keys[e.key.toLowerCase()]=false;});
  cv.addEventListener('wheel',e=>{if(!ui.spec)return;e.preventDefault();cam.tz=clamp(cam.tz*(e.deltaY<0?1.12:1/1.12),0.45,1.7);},{passive:false});
  cv.addEventListener('pointerdown',e=>{if(!ui.spec)return;specFollow(false);SP.drag={x:e.clientX,y:e.clientY,id:e.pointerId};try{cv.setPointerCapture(e.pointerId);}catch(_){}});
  cv.addEventListener('pointermove',e=>{if(!ui.spec||!SP.drag||SP.drag.id!==e.pointerId)return;cam.x-=(e.clientX-SP.drag.x)/cam.z;cam.y-=(e.clientY-SP.drag.y)/cam.z;SP.drag.x=e.clientX;SP.drag.y=e.clientY;clampCam();});
  const up=e=>{if(SP.drag&&SP.drag.id===e.pointerId)SP.drag=null;};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
}
