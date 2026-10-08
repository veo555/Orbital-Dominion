/* =========================================================================
   CAMPAIGN UI — chapter select, mission briefing, in-match objectives / radio strip / blocking cinematics, debrief, progress save and the Extras gallery.
   Contract: docs/CAMPAIGN_SPEC.md (§3 data, §4 radio, §7 runtime: events, hold / resume protocol, save helpers).
   This file only reads the story data and the runtime API (the campaign... / camp... functions of 45_campaign.js); it never writes simulation state.
   Everything private is prefixed cu / CU so it cannot collide with other modules in the shared IIFE scope.
   Wiring in other files (all guarded with typeof, so the game still runs when this module is absent):
     90_main.js   startGame(opts) -> campMatchStart, toMenu -> campMatchStop, frameBody -> campUiTick (+ the hold check), Esc -> campEsc, Restart -> campRestart
     72_menus.js  showEnd -> campShowEnd (debrief), syncMenu -> campSyncMenu
     70_ui.js     renderObjectives -> campRenderObjectives, hero / era buttons show campLocked reasons
   ========================================================================= */
const CU={save:null,saveFailed:false,cineBusy:false,holdWatch:0,radio:{cur:null,q:[],left:0,total:0},xp:null,deb:null,confirm:false,brief:null};

/* ------------------------------- small helpers ------------------------------- */
const cuEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;');
const cuS=()=>(typeof STORY!=='undefined'&&STORY)||{};
function cuMissions(){const m=cuS().missions;return Array.isArray(m)?m.filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id):[];}
const cuCine=id=>{const c=cuS().cine;return id&&typeof id==='string'&&c&&typeof c==='object'&&c[id]?c[id]:null;};
const cuChar=id=>{const c=cuS().characters;return id&&typeof id==='string'&&c&&c[id]?c[id]:null;};
function cuPlace(id){const p=cuS().world&&cuS().world.places;return Array.isArray(p)&&id?p.find(x=>x&&x.id===id)||null:null;}
const cuDur=s=>{s=Math.max(0,Math.round(+s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const cuTokC={};
function cuTok(n,fb){if(cuTokC[n])return cuTokC[n];let v='';try{v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();}catch(e){}return cuTokC[n]=v||fb||'#888888';}
function cuAudio(){try{if(typeof audioInit==='function')audioInit();}catch(e){}}
function cuFocus(id){const el=$(id);if(el&&!el.disabled&&!el.classList.contains('hidden')){try{el.focus({preventScroll:true});}catch(e){}}}
function cuDiffName(d){return(typeof DIFF_NAMES!=='undefined'&&DIFF_NAMES[d])||d;}

/* ------------------------------- progress save ------------------------------- */
/* The save is re-read from storage every time (so a changed / corrupted value is picked up); only when storage cannot be written
   (private mode, quota) the in-memory copy is kept as the source of truth for the session. */
function campSaveGet(){if(CU.save&&CU.saveFailed)return CU.save;return CU.save=campaignSaveRead();}
function campSavePut(s){CU.save=campaignSaveSanitize(s);CU.saveFailed=!campaignSaveWrite(CU.save);return CU.save;}
function cuMarkSeen(id){if(typeof id!=='string'||!id)return;const s=campSaveGet();if(s.seen[id])return;s.seen[id]=true;campSavePut(s);}
function campComplete(s){s=s||campSaveGet();const ms=cuMissions();return!!s.seen.credits||(ms.length>0&&ms.every(m=>s.done[m.id]));}
function campContinueTarget(){
  const s=campSaveGet(),ms=cuMissions();if(!ms.length)return null;
  const last=s.last&&ms.find(x=>x.id===s.last);if(last&&campaignCanPlay(s,last.id))return last;
  return ms.find(x=>!s.done[x.id]&&campaignCanPlay(s,x.id))||ms[0];
}
function campSetDiff(d){if(!CU_DIFFS.includes(d))return;const s=campSaveGet();s.diff=d;campSavePut(s);}
const CU_DIFFS=['easy','normal','hard'];

/* ------------------------------- faces, chips, stars ------------------------------- */
const cuPortC={};
function cuHeroChar(faction){
  const F=FACTIONS[faction];if(!F)return null;
  const u=UDEF[F.hero],hid=u&&u.hid;if(hid&&cuChar(hid))return hid;
  const ch=cuS().characters;if(ch)for(const k in ch)if(ch[k]&&ch[k].hero===F.hero)return k;
  return null;
}
/* a square avatar as a data: URL (cached); '' when the portrait painter is unavailable */
function cuPortrait(charId,size,expr){
  const ch=cuChar(charId);if(!ch)return'';
  const k=charId+'|'+size+'|'+(expr||'neutral');if(cuPortC[k]!==undefined)return cuPortC[k];
  let url='';
  try{
    if(typeof drawPortrait==='function'){
      const px=Math.round(size*2),c=mkCanvas(px,px),g=c.getContext('2d'),fc=FACTIONS[ch.faction],col=fc?fc.col:null;
      const bg=g.createLinearGradient(0,0,0,px);bg.addColorStop(0,col?col.dark:cuTok('--raise'));bg.addColorStop(1,cuTok('--panel'));g.fillStyle=bg;g.fillRect(0,0,px,px);
      drawPortrait(g,charId,expr||'neutral',px*0.5,px*0.6,px*1.15,{bottom:px,mode:'bust',face:'r'});
      url=c.toDataURL();
    }
  }catch(e){url='';}
  return cuPortC[k]=url;
}
function cuFaceHTML(charId,cls){
  const ch=cuChar(charId);if(!ch)return'';
  const url=cuPortrait(charId,cls==='cr'?56:44,'neutral'),fc=FACTIONS[ch.faction],col=fc?fc.col.base:cuTok('--raise2');
  return url?'<img class="cu-face" src="'+url+'" alt="'+cuEsc(ch.name||charId)+'">':'<span class="cu-face" style="--c:'+col+'" aria-label="'+cuEsc(ch.name||charId)+'">'+cuEsc((ch.short||ch.name||charId).slice(0,1))+'</span>';
}
function cuFacChip(id){
  const F=FACTIONS[id];if(!F)return'';
  return'<span class="cu-fac" style="--c:'+F.col.base+';--cr:'+hexRgb(F.col.base)+'"><img src="'+iconURL('b:hub:'+id)+'" alt="">'+cuEsc(F.name.split(' ')[0])+'</span>';
}
function cuStars(n,played){
  n=Math.max(0,Math.min(3,n|0));let h='<span class="cu-stars" role="img" aria-label="'+(played?n+' of 3 stars':'not completed')+'">';
  for(let i=0;i<3;i++)h+='<i class="'+(i<n?'on':'')+'">★</i>';return h+'</span>';
}
function cuActOf(m){
  const acts=cuS().acts;if(Array.isArray(acts)){const i=acts.findIndex(a=>a&&Array.isArray(a.missions)&&a.missions.includes(m.id));if(i>=0)return{n:i+1,title:acts[i].title||('Act '+(i+1))};}
  return m.act?{n:m.act,title:'Act '+m.act}:null;
}
function cuRestrictText(m){
  const r=m.setup&&m.setup.restrict,st=m.setup&&m.setup.start,out=[];
  if(r){
    for(const b of r.buildings||[])out.push(BDEF[b]?BDEF[b].name:b);
    for(const u of r.units||[])out.push(UDEF[u]?UDEF[u].name:u);
    if(Number.isInteger(r.maxEra)&&r.maxEra<3)for(let e=r.maxEra+1;e<=3;e++)if(ERAS[e])out.push('Era '+ERAS[e].rom);
  }
  if(st&&st.hero==='none')out.push('Hero');
  return out;
}

/* ------------------------------- menu buttons ------------------------------- */
function campSyncMenu(){
  const c=cuS().cine;
  $('bCamp').classList.toggle('hidden',cuMissions().length===0);
  $('bExtras').classList.toggle('hidden',!(c&&typeof c==='object'&&Object.keys(c).length));
}

/* ------------------------------- films (marks them seen; never blocks when the engine is missing) ------------------------------- */
function campFilm(id,done){
  let called=false;
  const fin=info=>{if(called)return;called=true;if(info&&info.reason!=='missing'&&info.reason!=='error')cuMarkSeen(id);if(done)done(info||{id,reason:'done'});};
  if(!cuCine(id)||typeof cinePlay!=='function'){fin({id,reason:'missing'});return false;}
  try{cinePlay(id,{onEnd:fin});}catch(e){fin({id,reason:'error'});return false;}
  return true;
}
function campChain(ids,done){
  const q=ids.filter((x,i)=>cuCine(x)&&ids.indexOf(x)===i);
  const next=()=>{const id=q.shift();if(!id){if(done)done();return;}campFilm(id,next);};
  next();
}
function campShow(id){if(currentOverlay()!==id)openSub(id);else showOverlay(id);}

/* ------------------------------- chapter select ------------------------------- */
function campOpen(){
  if(!cuMissions().length)return;
  CU.confirm=false;campRenderMenu();campShow('campMenu');cuFocus('cmContinue');
}
function cuCard(m,idx,save,tgt){
  const ms=cuMissions(),set=m.setup||{},d=save.done[m.id],ok=campaignCanPlay(save,m.id),prev=idx>0?ms[idx-1]:null;
  const hero=cuHeroChar(set.faction),pl=cuPlace(m.place),isNext=ok&&tgt&&tgt.id===m.id&&!d;
  let h='<article class="mc'+(d?' done':'')+(ok?'':' locked')+(isNext?' next':'')+'" data-m="'+cuEsc(m.id)+'">';
  h+='<div class="mc-top"><span class="mc-n">'+(idx+1)+'</span><div class="mc-t"><h4>'+cuEsc(m.title||m.id)+'</h4>'+(m.subtitle?'<small>'+cuEsc(m.subtitle)+'</small>':'')+'</div>'+cuStars(d?d.stars:0,!!d)+'</div>';
  if(pl)h+='<div class="mc-place">'+cuEsc(pl.name)+'</div>';
  h+='<div class="mc-meta">'+(hero?cuFaceHTML(hero):'')+cuFacChip(set.faction)+'<span class="cu-vs">VS</span>'+cuFacChip(set.enemy)+'</div>';
  if(m.synopsis)h+='<p class="mc-syn">'+cuEsc(m.synopsis)+'</p>';
  const st=d?'<span class="mc-st">'+(d.best!=null?'Best '+fmtTime(d.best)+' · ':'')+cuDiffName(d.diff)+'</span>'
    :ok?'<span class="mc-st">'+(isNext?'Next mission':'Not played')+'</span>'
    :'<span class="mc-st mc-lock">Locked'+(prev?' · win “'+cuEsc(prev.title||prev.id)+'” first':'')+'</span>';
  h+='<div class="mc-foot">'+st+'<button class="btn'+(isNext?' sel':'')+'" data-act="play:'+cuEsc(m.id)+'"'+(ok?'':' disabled')+' aria-label="'+(d?'Replay':'Play')+' mission '+(idx+1)+': '+cuEsc(m.title||m.id)+'">'+(d?'Replay':'Play')+'</button></div></article>';
  return h;
}
function campRenderMenu(){
  const S=cuS(),meta=S.meta||{},save=campSaveGet(),ms=cuMissions(),tgt=campContinueTarget();
  $('cmTitle').textContent=meta.title||'Campaign';$('cmTag').textContent=meta.tagline||'';
  const nDone=ms.filter(m=>save.done[m.id]).length,stars=ms.reduce((a,m)=>a+(save.done[m.id]?save.done[m.id].stars:0),0);
  $('cmProg').textContent=ms.length?(campComplete(save)?'Campaign complete — every cinematic is unlocked in Extras · ':'')+nDone+' / '+ms.length+' missions · '+stars+' / '+ms.length*3+' stars':'';
  const cont=$('cmContinue');cont.disabled=!tgt;
  if(tgt){const started=nDone>0,done=!!save.done[tgt.id];cont.textContent=(done?'Replay':started?'Continue':'Begin')+' — '+(ms.indexOf(tgt)+1)+'. '+(tgt.title||tgt.id);}else cont.textContent='Continue';
  $('cmIntro').classList.toggle('hidden',!cuCine('intro'));
  for(const b of $('cmDiff').querySelectorAll('[data-act^="diff:"]')){const on=b.dataset.act==='diff:'+save.diff;b.classList.toggle('sel',on);b.setAttribute('aria-pressed',on?'true':'false');}
  $('cmConfirm').classList.toggle('hidden',!CU.confirm);
  /* acts: STORY.acts when present, otherwise grouped by mission.act; missions no act claims are appended to the last group */
  const byId={};ms.forEach(m=>{byId[m.id]=m;});const used=new Set();let acts=[];
  if(Array.isArray(cuS().acts))acts=S.acts.filter(a=>a&&typeof a==='object').map(a=>({title:a.title||a.id||'',summary:a.summary||'',list:(Array.isArray(a.missions)?a.missions:[]).map(id=>byId[id]).filter(Boolean)}));
  acts.forEach(a=>a.list.forEach(m=>used.add(m.id)));
  const rest=ms.filter(m=>!used.has(m.id));
  if(rest.length){
    if(!acts.length){const g={};rest.forEach(m=>{(g[m.act||1]=g[m.act||1]||[]).push(m);});Object.keys(g).sort((a,b)=>a-b).forEach(k=>acts.push({title:'Act '+k,summary:'',list:g[k]}));}
    else acts[acts.length-1].list.push(...rest);
  }
  let h='';
  for(const a of acts){if(!a.list.length)continue;
    h+='<section class="act"><h3>'+cuEsc(a.title)+'</h3>'+(a.summary?'<p class="act-sum">'+cuEsc(a.summary)+'</p>':'')+'<div class="mgrid">'+a.list.map(m=>cuCard(m,ms.indexOf(m),save,tgt)).join('')+'</div></section>';}
  $('cmBody').innerHTML=h||'<p class="cu-note">No missions are available in this build.</p>';
}
function campPlay(id){
  const m=cuMissions().find(x=>x.id===id);if(!m)return;
  const s=campSaveGet();if(!campaignCanPlay(s,id)){if(typeof toastAny==='function')toastAny('Locked — win the previous mission first');return;}
  const first=cuMissions()[0]===m;
  const brief=()=>{if(m.briefing&&cuCine(m.briefing))campFilm(m.briefing,()=>campShowBrief(m));else campShowBrief(m);};
  if(first&&!s.seen.intro&&cuCine('intro'))campFilm('intro',brief);else brief();
}
function campLaunch(m){startGame({campaign:m,diff:campSaveGet().diff});}
function campRestart(){const m=ui.campMission;if(!m)return false;campLaunch(m);return true;}
function campResetProgress(){const s=campSaveGet(),n=emptyCampaignSave();n.diff=s.diff;campSavePut(n);CU.confirm=false;campRenderMenu();cuFocus('cmContinue');}
function campMenuAct(a){
  if(a==='back'){closeSub();return;}
  if(a==='continue'){const t=campContinueTarget();if(t)campPlay(t.id);return;}
  if(a.startsWith('diff:')){campSetDiff(a.slice(5));campRenderMenu();return;}
  if(a==='intro'){campFilm('intro',()=>{campRenderMenu();});return;}
  if(a==='reset'){CU.confirm=true;campRenderMenu();cuFocus('cmResetNo');return;}
  if(a==='reset-no'){CU.confirm=false;campRenderMenu();cuFocus('cmReset');return;}
  if(a==='reset-yes'){campResetProgress();return;}
  if(a.startsWith('play:')){campPlay(a.slice(5));return;}
}

/* ------------------------------- briefing ------------------------------- */
function campShowBrief(m){CU.brief=m;campRenderBrief(m);campShow('campBrief');cuFocus('cbStart');}
function campRenderBrief(m){
  const ms=cuMissions(),idx=ms.indexOf(m),set=m.setup||{},save=campSaveGet(),act=cuActOf(m),pl=cuPlace(m.place),hero=cuHeroChar(set.faction);
  const obj=(Array.isArray(m.objectives)?m.objectives:[]).filter(o=>o&&typeof o==='object'),shown=obj.filter(o=>o.kind!=='hidden'&&o.when==null);
  const prim=shown.filter(o=>o.kind==='primary'),bon=shown.filter(o=>o.kind==='bonus'),later=obj.length-shown.length;
  const nBonus=obj.filter(o=>o.kind==='bonus').length,par=m.stars&&Number.isFinite(+m.stars.par)&&+m.stars.par>0?+m.stars.par:0,lock=cuRestrictText(m);
  let h='<div class="cu-head"><div class="cu-prog">'+(act?cuEsc(act.title)+' · ':'')+'Mission '+(idx+1)+'</div><h2 class="ttl" id="cbTitle">'+cuEsc(m.title||m.id)+'</h2><div class="cu-tag">'+cuEsc(m.subtitle||'')+(pl?(m.subtitle?' · ':'')+cuEsc(pl.name):'')+'</div></div>';
  h+='<div class="cu-body"><div class="br-grid"><section>';
  if(m.synopsis)h+='<p class="br-syn">'+cuEsc(m.synopsis)+'</p>';
  h+='<div class="br-vs">'+(hero?cuFaceHTML(hero):'')+cuFacChip(set.faction)+'<span class="cu-vs">VS</span>'+cuFacChip(set.enemy)+'</div>';
  if(pl&&pl.desc)h+='<p class="cu-note">'+cuEsc(pl.desc.length>230?pl.desc.slice(0,227).replace(/\s+\S*$/,'')+'…':pl.desc)+'</p>';
  if(Array.isArray(m.hints)&&m.hints.length)h+='<h3>Hints</h3><ul class="ol">'+m.hints.map(x=>'<li>'+cuEsc(x)+'</li>').join('')+'</ul>';
  h+='<h3>Difficulty</h3><div class="cu-diffrow" id="cbDiff" role="group" aria-label="Difficulty">'+CU_DIFFS.map(d=>'<button class="btn'+(save.diff===d?' sel':'')+'" data-act="diff:'+d+'" aria-pressed="'+(save.diff===d)+'">'+cuDiffName(d)+'</button>').join('')+'</div>';
  h+='</section><section><h3>Objectives</h3><ul class="ol">'+prim.map(o=>'<li>'+cuEsc(o.text)+'</li>').join('')+(bon.length?bon.map(o=>'<li class="bonus">'+cuEsc(o.text)+' <small>bonus</small></li>').join(''):'')+'</ul>';
  if(later>0)h+='<p class="cu-note">More objectives may appear during the mission.</p>';
  h+='<h3>Stars</h3><ul class="ol"><li class="bonus">Win the mission</li>'+(nBonus?'<li class="bonus">Complete every bonus objective</li>':'')+(par?'<li class="bonus">Win in under '+fmtTime(par)+'</li>':'')+'</ul>';
  if(lock.length)h+='<h3>Locked at the start</h3><p class="cu-note">'+cuEsc(lock.join(' · '))+'. Some may unlock during the mission.</p>';
  h+='</section></div></div>';
  h+='<div class="cu-foot"><button class="btn" data-act="back">Back</button>'+(m.briefing&&cuCine(m.briefing)?'<button class="btn" data-act="replay">Replay briefing</button>':'')+'<span class="grow"></span><button class="btn big" id="cbStart" data-act="start">Start mission</button></div>';
  $('cbCard').innerHTML=h;
}
function campBriefAct(a){
  const m=CU.brief;
  if(a==='back'){closeSub();return;}
  if(!m)return;
  if(a.startsWith('diff:')){campSetDiff(a.slice(5));campRenderBrief(m);cuFocus('cbStart');return;}
  if(a==='replay'){campFilm(m.briefing,()=>{cuFocus('cbStart');});return;}
  if(a==='start'){campLaunch(m);return;}
}

/* ------------------------------- match start / stop ------------------------------- */
function campMatchStart(m){
  ui.campMission=m||null;CU.cineBusy=false;CU.holdWatch=0;CU.deb=null;campRadioClear();
  const host=$('objectives');host.classList.toggle('camp',!!m);host.dataset.h='';
  if(m)campRenderObjectives();
}
function campMatchStop(){const was=!!ui.campMission;ui.campMission=null;CU.cineBusy=false;campRadioClear();$('objectives').classList.remove('camp');$('objectives').dataset.h='';return was;}

/* ------------------------------- in-match objectives (replace the tutorial hints) ------------------------------- */
function campRenderObjectives(){
  const C=G&&G.camp,host=$('objectives');if(!C||!host)return;
  host.classList.add('camp');host.classList.toggle('hidden',!ui.objOpen);if(!ui.objOpen)return;
  const rank=o=>o.state==='active'?(o.kind==='primary'?0:1):o.state==='done'?2:3;
  const L=campObjectives().map((o,i)=>({o,i})).sort((a,b)=>rank(a.o)-rank(b.o)||a.i-b.i).map(x=>x.o);
  const par=C.m&&C.m.stars&&+C.m.stars.par>0?+C.m.stars.par:0;
  let h='<b>Objectives</b><p class="cobt">'+cuEsc(C.m&&C.m.title||'')+(par?'<small>par '+fmtTime(par)+'</small>':'')+'</p>';
  for(const o of L.slice(0,7))h+='<div class="ob'+(o.kind!=='primary'?' bonus':'')+(o.state==='done'?' done':o.state==='failed'?' fail':'')+'">'+(o.kind!=='primary'?'<span class="bt">'+(o.kind==='hidden'?'Secret':'Bonus')+'</span>':'')+cuEsc(o.text)+'</div>';
  /* first-mission field manual: the next undone basics from the skirmish hint list (Settings > Hints turns it off); the later hints stay out of the way */
  if(SET.hints&&cuMissions().indexOf(C.m)===0&&typeof OBJECTIVES!=='undefined'){
    const todo=OBJECTIVES.slice(0,3).filter(o=>{try{return !o.d();}catch(e){return false;}}).slice(0,2);
    if(todo.length)h+='<div class="fm"><b>Field manual</b>'+todo.map(o=>'<div class="ob dim">'+cuEsc(ui.touchMode&&o.tt?o.tt:o.t)+'</div>').join('')+'</div>';
  }
  if(host.dataset.h!==h){host.innerHTML=h;host.dataset.h=h;}
}
/* pause menu: mission title + objectives, and campaign wording on the buttons */
function campPauseSync(){
  const host=$('campPause'),C=G&&G.camp;
  if(!host)return;
  const pm=$('pauseMenu');if(pm)pm.classList.toggle('campOn',!!(C&&ui.campMission));
  if(!C||!ui.campMission){host.classList.add('hidden');host.innerHTML='';$('bRestart').textContent='Restart (new map)';$('bToMenu').textContent='Main menu';return;}
  const m=C.m,idx=cuMissions().indexOf(m),L=campObjectives();
  host.innerHTML='<h4>'+cuEsc((idx>=0?'Mission '+(idx+1)+': ':'')+(m.title||m.id))+'</h4><div class="cps">'+cuEsc(m.subtitle||'')+' · '+fmtTime(C.t)+(m.stars&&+m.stars.par>0?' · par '+fmtTime(+m.stars.par):'')+'</div>'+
    '<ul class="ol">'+L.map(o=>'<li class="'+(o.kind!=='primary'?'bonus ':'')+(o.state==='done'?'done':o.state==='failed'?'fail':'')+'">'+cuEsc(o.text)+'</li>').join('')+'</ul>';
  host.classList.remove('hidden');$('bRestart').textContent='Restart mission';$('bToMenu').textContent='Chapter select';
}

/* ------------------------------- radio strip ------------------------------- */
function campRadio(id){
  const L=cuS().radio&&cuS().radio[id];if(!L||typeof L.text!=='string'||!L.text)return;
  const R=CU.radio,ln={id,who:L.who||'',text:L.text,style:L.style||'radio',dur:Math.max(+L.dur||0,L.text.length/19+1.2)};
  if(!R.cur){radioShow(ln);return;}
  R.q=R.q.filter(x=>x.who!==ln.who);R.q.push(ln);while(R.q.length>3)R.q.shift();   // newer line of the same speaker replaces the stale queued one; at most 3 wait
}
function radioShow(ln){
  const R=CU.radio,el=$('campRadio');R.cur=ln;R.left=R.total=ln.dur;
  const ch=cuChar(ln.who),fc=ch&&FACTIONS[ch.faction];
  $('crWho').textContent=ch?(ch.short||ch.name||ln.who):(ln.who?String(ln.who):'Command');
  $('crTxt').textContent=ln.text;$('crTag').classList.toggle('hidden',ln.style!=='radio');
  $('crDot').style.setProperty('--c',fc?fc.col.base:cuTok('--acc2'));
  $('crFace').innerHTML=ch?cuFaceHTML(ln.who,'cr'):'';
  el.dataset.style=ln.style;el.dataset.who=ln.who;
  el.classList.remove('hidden');el.style.animation='none';void el.offsetWidth;el.style.animation='';
  $('crBar').style.transform='scaleX(1)';
  rootEl.classList.add('cr-on');rootEl.style.setProperty('--crH',el.offsetHeight+'px');
  try{if(typeof speak==='function')speak(ln.who,ln.text,{style:ln.style||'radio'});}catch(e){}
}
function radioNext(){const R=CU.radio;R.cur=null;if(R.q.length)radioShow(R.q.shift());else radioHide();}
function radioHide(){$('campRadio').classList.add('hidden');rootEl.classList.remove('cr-on');}
function campRadioClear(){const R=CU.radio;const had=!!R.cur;R.cur=null;R.q=[];radioHide();if(had)try{if(typeof speakStop==='function')speakStop();}catch(e){}}
function campRadioSkip(){if(CU.radio.cur){try{if(typeof speakStop==='function')speakStop();}catch(e){}radioNext();}}

/* ------------------------------- runtime events (45_campaign.js delivers them synchronously from inside step() / newGame()) ------------------------------- */
function cuName(kind,id){
  if(kind==='building')return BDEF[id]?BDEF[id].name:String(id);
  if(kind==='unit')return UDEF[id]?UDEF[id].name:String(id);
  if(kind==='era')return ERAS[id]?'Era '+ERAS[id].rom+' — '+ERAS[id].name:'Era '+id;
  return String(id);
}
function cuSfx(n){try{if(typeof sfx==='function')sfx(n);}catch(e){}}
function cuPing(tx,ty,kind,dur){
  if(!G||ui.demo)return;const col=kind==='bad'?'rgba(255,90,90,A)':kind==='good'?'rgba(90,230,140,A)':'rgba(120,190,255,A)';
  ui.pings.push({x:(tx+.5)*TILE,y:(ty+.5)*TILE,t:G.time,dur:dur||4,col});while(ui.pings.length>8)ui.pings.shift();
}
function campPlayHeld(id){                                 // a blocking `cine` action: the sim is held until campaignResume(id)
  CU.cineBusy=true;campRadioClear();
  const resume=()=>{CU.cineBusy=false;CU.holdWatch=0;try{campaignResume(id);}catch(e){}};   // flag first: the resume may deliver the next queued cinematic synchronously
  if(!campFilm(id,resume))return;                          // campFilm already called resume for a missing film
}
function onCampaignEvent(e){
  if(!e||typeof e!=='object')return;
  try{
    switch(e.type){
      case'radio':campRadio(e.id);break;
      case'cine':if(e.hold)campPlayHeld(e.id);break;
      case'obj':{
        const oh=$('objectives');if(oh)oh.dataset.h='';          // re-render the tracker on its next pass
        if(!e.init&&!ui.demo){
          const bonus=e.kind&&e.kind!=='primary';
          if(e.state==='active'){toast('New objective: '+e.text,'good');cuSfx('toast');}
          else if(e.state==='done'){toast((bonus?'Bonus complete: ':'Objective complete: ')+e.text,'good');cuSfx('done');}
          else if(e.state==='failed'){toast((bonus?'Bonus failed: ':'Objective failed: ')+e.text,'bad');cuSfx('alert');}
          if(G&&G.camp)campRenderObjectives();
        }
        break;}
      case'mood':try{if(typeof musicMood==='function')musicMood(e.mood);}catch(x){}break;
      case'ping':cuPing(e.tx,e.ty,e.kind,4);break;
      case'res':if(!ui.demo&&e.delta){toast((e.delta>0?'+':'−')+Math.abs(Math.round(e.delta))+(e.res==='e'?' ether':' crystals'),e.delta>0?'good':'bad');}break;
      case'reveal':cuPing(e.tx,e.ty,'info',3);break;
      case'strike':if(!ui.demo){if(e.side==='me'){toast('Orbital support inbound','good');cuPing(e.tx,e.ty,'good',(e.delay||2)+1.5);}else{toast('Incoming orbital strike!','bad');cuSfx('alert');cuPing(e.tx,e.ty,'bad',(e.delay||2)+1.5);}}break;
      case'unlock':if(!ui.demo&&e.kind!=='hero')toast((e.locked?'Locked: ':'Unlocked: ')+cuName(e.kind,e.id),e.locked?'bad':'good');break;
      case'herolevel':if(!ui.demo)toast('Hero level '+e.level,'good');break;
      case'end':campRadioClear();try{if(typeof musicMood==='function')musicMood(e.res==='victory'?'victory':'dread');}catch(x){}break;
    }
  }catch(err){try{console.error('[campaign ui] '+(err&&err.message));}catch(x){}}
}
/* called every rendered frame of a live match */
function campUiTick(dt){
  const C=G&&G.camp;if(!C)return;
  const R=CU.radio;
  if(R.cur&&!G.paused&&!document.hidden){R.left-=dt;$('crBar').style.transform='scaleX('+Math.max(0,R.left/R.total).toFixed(3)+')';if(R.left<=0)radioNext();}
  /* safety net: a held mission whose film never reports back must not freeze the game for good */
  if(C.hold&&!CU.cineBusy&&!(typeof cineActive==='function'&&cineActive())){CU.holdWatch+=dt;if(CU.holdWatch>1.5){CU.holdWatch=0;try{campaignResume();}catch(e){}}}else CU.holdWatch=0;
}

/* ------------------------------- debrief ------------------------------- */
function campShowEnd(res){
  const C=G&&G.camp,m=(C&&C.m)||ui.campMission;if(!m)return false;
  const R=(C&&C.result)||{res:res||'defeat',win:res==='victory',reason:'',t:G.overT||G.time,stars:0,diff:G.diff,par:null,bonusDone:0,bonusTotal:0,objectives:[]};
  const win=R.res==='victory'||R.win===true,before=campSaveGet(),prev=before.done[m.id]||null;
  CU.deb={m,R,win,prev,isNew:false,unlock:null};
  if(win){
    const nid=campaignNextId(m.id),wasOpen=nid?campaignCanPlay(before,nid):true;
    campSavePut(campaignSaveUpdate(before,m.id,R));
    CU.deb.isNew=!prev||R.stars>prev.stars||(prev.best!=null&&Math.round(R.t)<prev.best);
    CU.deb.unlock=nid&&!wasOpen?cuMissions().find(x=>x.id===nid)||null:null;
  }
  const show=()=>{campRenderDeb();overlayStack=['campDebrief'];showOverlay('campDebrief');cuFocus(win?'cdGo':'cdRetry');};   // the stack holds the card itself: a system Back press re-shows it instead of closing it
  if(!win&&R.reason!=='surrender'&&m.defeat&&cuCine(m.defeat))campFilm(m.defeat,show);else show();
  return true;
}
function campRenderDeb(){
  const D=CU.deb,m=D.m,R=D.R,win=D.win,T0=G.teams[0],T1=G.teams[1],ms=cuMissions(),idx=ms.indexOf(m),par=+R.par>0?+R.par:(m.stars&&+m.stars.par>0?+m.stars.par:0);
  const reason={win:'The mission objectives are complete.',structures:win?'Every enemy structure has been destroyed.':'Your last structure has fallen.',wipeout:'Your command hub and your army are gone.',surrender:'You gave the order to surrender.'}[R.reason]||(String(R.reason||'').startsWith('objective:')?'A primary objective failed.':win?'Mission accomplished.':'The mission was lost.');
  let h='<div class="cu-head"><div class="cu-prog">Mission '+(idx+1)+' · '+cuEsc(m.title||m.id)+' · '+cuDiffName(R.diff||G.diff)+'</div><h2 class="ttl '+(win?'cd-win':'cd-lose')+'" id="cdTitle">'+(win?'Victory':'Defeat')+'</h2><div class="cu-tag">'+cuEsc(reason)+'</div></div><div class="cu-body">';
  if(win){
    h+='<div class="cd-top"><div class="cd-stars" role="img" aria-label="'+R.stars+' of 3 stars">'+[0,1,2].map(i=>'<i class="'+(i<R.stars?'on':'')+'" style="--k:'+i+'">★</i>').join('')+'</div>'+
      '<div class="cd-time"><b>'+fmtTime(R.t)+'</b>'+(par?' <span class="dim">/ par '+fmtTime(par)+'</span>':'')+'<small>'+(D.prev&&D.prev.best!=null?'Best before: '+fmtTime(D.prev.best)+' · ':'')+'Mission time</small></div>'+(D.isNew?'<span class="cd-new">New best</span>':'')+'</div>';
    h+='<ul class="ol"><li class="done">Victory</li>'+
      '<li class="'+(R.bonusDone>=R.bonusTotal?'done':'fail')+'">'+(R.bonusTotal?'Bonus objectives '+R.bonusDone+' / '+R.bonusTotal:'No bonus objectives — star granted')+'</li>'+
      (par?'<li class="'+(R.t<=par?'done':'fail')+'">'+(R.t<=par?'Under par time':'Over par time')+' <small>('+fmtTime(R.t)+' / '+fmtTime(par)+')</small></li>':'')+'</ul>';
  }else{
    h+='<div class="cd-top"><div class="cd-time"><b>'+fmtTime(R.t)+'</b><small>Mission time</small></div></div>';
  }
  /* a win (also the default 'every enemy structure destroyed' rule, which can fire between two 5 Hz evaluations) means the primary objectives are accomplished */
  const objs=(Array.isArray(R.objectives)?R.objectives:[]).map(o=>win&&o.kind==='primary'&&o.state==='active'?Object.assign({},o,{state:'done'}):o);
  const row=(l,a,b)=>'<tr><td>'+l+'</td><td>'+a+'</td></tr>';
  if(win&&D.unlock)h+='<div class="cd-unlock">New mission unlocked: '+cuEsc(D.unlock.title||D.unlock.id)+'</div>';
  if(win&&campaignNextId(m.id)===null)h+='<div class="cd-unlock">Final mission complete — the ending follows.</div>';
  h+='<div class="cd-grid"><section><h3>Objectives</h3><ul class="ol">'+(objs.length?objs.map(o=>'<li class="'+(o.kind!=='primary'?'bonus ':'')+(o.state==='done'?'done':o.state==='failed'?'fail':o.state==='hidden'?'miss':'')+'">'+cuEsc(o.text)+(o.kind!=='primary'?' <small>'+(o.kind==='hidden'?'secret':'bonus')+'</small>':'')+'</li>').join(''):'<li class="miss">—</li>')+'</ul></section>'+
    '<section><h3>Battle report</h3><table class="cd-stat">'+row('Enemy units destroyed',T0.kills)+row('Units lost',T0.lost)+row('Structures built',T0.built)+row('Crystals mined',Math.round(T0.minedC))+row('Ether mined',Math.round(T0.minedE))+row('Hero level',T0.hero?T0.hero.level:'—')+row('Final era',ERAS[T0.era].rom+' vs '+ERAS[T1.era].rom)+'</table></section></div>';
  h+='</div><div class="cu-foot">'+(win?'<button class="btn" id="cdRetry" data-act="retry">Replay mission</button><span class="grow"></span><button class="btn big" id="cdGo" data-act="continue">Continue</button>':
    '<button class="btn" id="cdBack" data-act="back">Chapter select</button><span class="grow"></span><button class="btn big" id="cdRetry" data-act="retry">Retry mission</button>')+'</div>';
  $('cdCard').innerHTML=h;
}
function campToChapters(){toMenu();campOpen();}
function campPauseBack(){if(!ui.campMission)return false;campToChapters();return true;}   // pause menu "Chapter select"
function campDebAct(a){
  const D=CU.deb;if(!D)return;
  if(a==='retry'){campLaunch(D.m);return;}
  if(a==='back'){campToChapters();return;}
  if(a==='continue'){
    const m=D.m,chain=[m.debrief,m.after];if(campaignNextId(m.id)===null)chain.push('credits');
    $('cdGo')&&($('cdGo').disabled=true);
    campChain(chain,()=>{campToChapters();});
  }
}

/* ------------------------------- Extras: cinematic gallery ------------------------------- */
const CU_KINDS={intro:'Introduction',briefing:'Mission briefings',debrief:'Mission debriefs',interlude:'Interludes',ending:'Ending',credits:'Credits',defeat:'Defeat scenes'};
function cuCanExport(){return typeof cineExport==='function'&&typeof MediaRecorder!=='undefined'&&!!(window.HTMLCanvasElement&&HTMLCanvasElement.prototype.captureStream);}
function campOpenExtras(){
  const c=cuS().cine;if(!(c&&typeof c==='object'&&Object.keys(c).length))return;   // nothing to show (and the button is hidden) with an empty story
  CU.xp=null;campRenderExtras();campShow('extrasMenu');cuFocus('exBack');
}
function campRenderExtras(){
  const save=campSaveGet(),open=campComplete(save),list=typeof cineGallery==='function'?cineGallery():[],ms=cuMissions(),canX=cuCanExport(),order={};
  ms.forEach((m,i)=>{if(m.briefing)order[m.briefing]=i*10;if(m.debrief)order[m.debrief]=i*10+1;if(m.after)order[m.after]=i*10+2;if(m.defeat)order[m.defeat]=i*10+3;});
  const rows=list.filter(x=>x&&x.id).map(x=>({id:x.id,title:x.title||x.id,kind:x.kind||'interlude',len:x.len,seen:!!(save.seen[x.id]||x.seen),o:order[x.id]!==undefined?order[x.id]:1000}));
  const nSeen=rows.filter(r=>r.seen).length;
  $('exTag').textContent=rows.length?(open?'The campaign is complete — every cinematic is unlocked.':'Cinematics you have seen are listed here; finish the campaign to unlock them all.')+' · '+nSeen+' of '+rows.length+' seen':'No cinematics in this build.';
  let h='';
  for(const k of Object.keys(CU_KINDS)){
    const g=rows.filter(r=>r.kind===k).sort((a,b)=>a.o-b.o||(a.id<b.id?-1:1));if(!g.length)continue;
    h+='<section class="xg"><h3>'+CU_KINDS[k]+'</h3>';let nLock=0;
    for(const r of g){
      const ok=open||r.seen;
      if(!ok){nLock++;continue;}
      h+='<div class="xr" data-id="'+cuEsc(r.id)+'"><span class="xk">'+cuEsc(k)+'</span><div class="xt"><b>'+cuEsc(r.title)+'</b><small>'+cuDur(r.len)+'</small></div>'+
        '<span class="xs'+(r.seen?'':' new')+'">'+(r.seen?'Seen':'New')+'</span><div class="xb"><button class="btn" data-act="film:'+cuEsc(r.id)+'">Play</button>'+(canX?'<button class="btn" data-act="export:'+cuEsc(r.id)+'">Save video (.webm)</button>':'')+'</div><div class="xp hidden"><i></i></div></div>';
    }
    if(nLock)h+='<div class="xr lock" data-locked="'+nLock+'"><span class="xk">'+cuEsc(k)+'</span><div class="xt"><b>'+nLock+' locked cinematic'+(nLock>1?'s':'')+'</b></div><span class="xs">Locked</span></div>';
    h+='</section>';
  }
  $('exBody').innerHTML=h||'<p class="cu-note">No cinematics are available in this build.</p>';
}
function campExtrasAct(a,btn){
  if(a==='back'){campExportStop();closeSub();return;}
  if(a.startsWith('film:')){const id=a.slice(5);campExportStop();campFilm(id,()=>{campRenderExtras();});return;}
  if(a.startsWith('export:')){campExport(a.slice(7),btn);return;}
}
function campExportStop(){if(CU.xp&&CU.xp.ac){try{CU.xp.ac.abort();}catch(e){}}}
function campExport(id,btn){
  if(CU.xp){campExportStop();return;}                                 // a second press on the running export cancels it
  if(!cuCanExport()){if(typeof toastAny==='function')toastAny('Video export is not supported in this browser');return;}
  const row=btn.closest('.xr'),bar=row&&row.querySelector('.xp'),fill=bar&&bar.firstElementChild,ac=typeof AbortController!=='undefined'?new AbortController():null;
  CU.xp={id,ac};
  for(const b of $('exBody').querySelectorAll('[data-act^="film:"],[data-act^="export:"]'))if(b!==btn)b.disabled=true;
  btn.textContent='Cancel · 0%';if(bar)bar.classList.remove('hidden');
  const done=blob=>{
    CU.xp=null;
    if(blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=id+'.webm';document.body.appendChild(a);a.click();setTimeout(()=>{try{URL.revokeObjectURL(a.href);a.remove();}catch(e){}},4000);if(typeof toastAny==='function')toastAny('Saved '+id+'.webm');}
    else if(!ac||!ac.signal.aborted){if(typeof toastAny==='function')toastAny('Video export failed in this browser');}
    campRenderExtras();
  };
  let p;try{p=cineExport(id,{w:1280,h:720,signal:ac?ac.signal:undefined,onProgress:v=>{const pc=Math.round(v*100);if(fill)fill.style.width=pc+'%';btn.textContent='Cancel · '+pc+'%';}});}catch(e){p=null;}
  Promise.resolve(p).then(done,()=>done(null));
}

/* ------------------------------- Esc / system back ------------------------------- */
function campEsc(cur){
  switch(cur){
    case'campMenu':if(CU.confirm){CU.confirm=false;campRenderMenu();cuFocus('cmReset');}else closeSub();return true;
    case'campBrief':closeSub();return true;
    case'extrasMenu':campExportStop();closeSub();return true;
    case'campDebrief':if(CU.deb)campDebAct(CU.deb.win?'continue':'back');return true;
  }
  return false;
}

/* ------------------------------- init ------------------------------- */
function campInit(){
  const bind=(id,fn)=>{const el=$(id);if(!el)return;el.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled||!el.contains(b)||b.id==='campRadio')return;cuAudio();fn(b.dataset.act,b,e);});};
  bind('campMenu',campMenuAct);bind('campBrief',campBriefAct);bind('campDebrief',campDebAct);bind('extrasMenu',campExtrasAct);
  $('bCamp').addEventListener('click',()=>{cuAudio();campOpen();});
  $('bExtras').addEventListener('click',()=>{cuAudio();campOpenExtras();});
  $('campRadio').addEventListener('mousedown',e=>{e.preventDefault();campRadioSkip();});
  const pm=$('pauseMenu');
  if(pm&&typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(!pm.classList.contains('hidden'))campPauseSync();}).observe(pm,{attributes:true,attributeFilter:['class']});
  campSyncMenu();
  if(window.__TEST&&window.__RTS)Object.assign(window.__RTS,{CU,campSyncMenu,campOpen,campOpenExtras,campPlay,campShowBrief,campLaunch,campRestart,campShowEnd,campSaveGet,campSavePut,campRadio,campRadioClear,campRenderMenu,campRenderObjectives,campRenderExtras,campExport,campExportStop,campPauseSync,campUiTick,campFilm,campChain,campComplete,campContinueTarget,campMatchStart,campMatchStop,campEsc,cuPortrait,kill,damageEnt,campDo,campEvalCond,campObjectives,campaignSummary,campaignResume,campaignDrainEvents,campaignSaveRead,campaignSaveWrite,campaignSaveUpdate,campaignCanPlay,campaignNextId,emptyCampaignSave});   // test-only hooks (window.__TEST)
}
