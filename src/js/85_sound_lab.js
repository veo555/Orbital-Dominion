/* =========================================================================
   SOUND LAB — the audition panel behind Settings -> "Sound lab" (docs/AUDIO_SPEC.md §7).
   Lists every registered SFX voice (audioVoices) in five groups (Units, Buildings, Heroes & skills, UI & economy,
   Cinematic) with a faction switch; every music cue and intro section (MUSIC_CUES, musicInfo) with play and stop;
   live scene controls (musicScene, musicMood); every character voice reading a sample line (speak); and live peak /
   RMS meters on the master bus (audioMeter, an AnalyserNode).
   Public globals only, so the lab shows whatever is registered and needs no test hook. The panel is rendered on each
   open and its meter timer runs only while it is open. Zero network. Controls are native buttons and range inputs
   (Tab, Enter and Space work); Escape closes the lab and stops music and speech; while the lab is open no key reaches
   the game and Tab stays inside the lab.
   Every button has its own click handler (no delegation): a cloned button is dead, which the E2E gate relies on.
   The only top-level names are SOUNDLAB and soundLabInit; everything else lives in the closure.
   ========================================================================= */
const SOUNDLAB=(function(){
'use strict';
const FAC=['meridian','obsidian','aurora','wild'];
const FACNAME={meridian:'Meridian',obsidian:'Obsidian',aurora:'Aurora',wild:'Wild'};
/* the generic fallback voices play with the faction pitch bias the engine applies to them (80_audio.js FACP) */
const FACP={meridian:1,obsidian:0.84,aurora:1.22,wild:0.72};
const GROUPS=[['Units','Units'],['Buildings','Buildings'],['Heroes','Heroes & skills'],['UI','Interface & economy'],['Cinematic','Cinematic']];
const ST={root:null,card:null,entry:null,fac:'meridian',playing:null,timer:0,ticks:0,active:false,frozen:false,snap:null,style:'normal',
  voices:[],rows:[],groups:[],facBtns:[],cueBtns:[],secBtns:[],styleBtns:[],sl:{},m:{},
  shown:{peak:-Infinity,rms:-Infinity},last:{},status:null,now:null,caption:null,infos:{}};

/* ------------------------------------------------------------------ small helpers (all reads are guarded: the lab works before any module lands) */
const isOpen=()=>!!ST.root&&!ST.root.classList.contains('hidden');
const mk=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const cap=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
const UT=()=>typeof UNIT_TYPES!=='undefined'?UNIT_TYPES:[];
const BT=()=>typeof BUILDING_TYPES!=='undefined'?BUILDING_TYPES:[];
const EVO=()=>[].concat(typeof SFX_UNIT_EVENTS!=='undefined'?SFX_UNIT_EVENTS:[],typeof SFX_BUILDING_EVENTS!=='undefined'?SFX_BUILDING_EVENTS:[],['amb','deliver','mine']);
const STYLES=()=>typeof LINE_STYLES!=='undefined'?LINE_STYLES:['normal','radio','whisper','shout','narration','thought'];
const MOODL=()=>typeof MOODS!=='undefined'?MOODS:['calm','tension','battle','dread','victory'];
function vi(){try{return(typeof audioVoices==='function'&&audioVoices({info:true}))||[];}catch(e){return[];}}
function musicStateSafe(){try{return typeof musicState==='function'?musicState():null;}catch(e){return null;}}
function infoOf(id){
  if(ST.infos[id])return ST.infos[id];
  let r=null;try{r=typeof musicInfo==='function'?musicInfo(id):null;}catch(e){r=null;}
  if(r)ST.infos[id]=r;return r||null;
}
function sceneNow(){
  const st=musicStateSafe(),s=st&&st.scene;
  return s?{int:+s.int||0,night:+s.night||0,era:+s.era||1}:{int:0.3,night:0,era:1};
}
function setStatus(t){if(ST.status)ST.status.textContent=t;}

/* ------------------------------------------------------------------ classification: id -> group, row (unit / building / hero / skills), label, faction */
function classify(v){
  const p=v.id.split('.'),last=p[p.length-1],fac=p.length>=3&&FAC.indexOf(last)>=0?last:null,core=fac?p.slice(0,-1):p,head=core[0],rest=core.slice(1).join('.');
  if(head==='cine')return{group:'Cinematic',row:null,label:rest,fac};
  if(head==='global'||head==='ui')return{group:'UI',row:null,label:rest,fac};
  if(head==='skill')return{group:'Heroes',row:'skills',rowTitle:'Skills',label:rest,fac};
  if(head.indexOf('hero_')===0)return{group:'Heroes',row:head,rowTitle:cap(head.slice(5)),label:rest||'play',fac};
  if(BT().indexOf(head)>=0)return{group:'Buildings',row:head,rowTitle:cap(head),label:rest||'play',fac};
  if(UT().indexOf(head)>=0)return{group:'Units',row:head,rowTitle:cap(head),label:rest||'play',fac};
  return{group:'UI',row:null,label:v.id,fac};   // an unknown prefix still gets listed (in the generic list)
}
function rowRank(k){if(k==='skills')return 900;let i=UT().indexOf(k);if(i>=0)return i;i=BT().indexOf(k);return i>=0?100+i:999;}
function evRank(e){const i=EVO().indexOf(e);return i<0?99:i;}
function facRank(f){const i=FAC.indexOf(f||'');return i<0?9:i;}
function cmpCell(a,b){return(evRank(a.c.label)-evRank(b.c.label))||(facRank(a.c.fac)-facRank(b.c.fac))||(a.v.id<b.v.id?-1:a.v.id>b.v.id?1:0);}
function cmpFlat(a,b){const x=a.c.label.toLowerCase(),y=b.c.label.toLowerCase();return(x<y?-1:x>y?1:0)||(facRank(a.c.fac)-facRank(b.c.fac))||(a.v.id<b.v.id?-1:a.v.id>b.v.id?1:0);}

/* ------------------------------------------------------------------ playback actions */
function playVoice(v,fac,btn){
  const f=fac||ST.fac;let ok=false;
  try{ok=typeof audioPlay==='function'&&!!audioPlay(v.id,{faction:f,pitch:v.fallback?(FACP[f]||1):1});}catch(e){ok=false;}
  btn.classList.add('on');setTimeout(()=>btn.classList.remove('on'),240);
  setStatus(ok?'Played '+v.id+'.':(typeof muted!=='undefined'&&muted?'Not played: sound is muted in the game.':'Not played: audio is not running yet. Press again.'));
}
function cueClick(id){
  if(ST.playing===id){try{musicStop(0.4);}catch(e){}ST.playing=null;setStatus('Stopped '+id+'.');}
  else{try{musicPlay(id);}catch(e){}ST.playing=id;setStatus('Cue '+id+'.');}
  refresh();
}
function sectionClick(id,i){
  const inf=infoOf(id),s=inf&&inf.sections?inf.sections[i]:null;
  try{musicPlay(id,{section:i});}catch(e){}
  ST.playing=id;setStatus('Cue '+id+', section '+(s?s.name:String(i+1))+'.');refresh();
}
function stopAll(){try{musicStop(0.2);}catch(e){}try{speakStop();}catch(e){}ST.playing=null;setStatus('Stopped music and speech.');refresh();}
function sayChar(id,co){
  const nm=co.short||co.name||id,line=(co.quote&&String(co.quote).trim())||('This is a sample line for '+nm+'.');
  let r=null;try{r=typeof speak==='function'?speak(id,line,{style:ST.style}):null;}catch(e){r=null;}
  ST.caption.textContent=r?nm+' ('+ST.style+'): "'+line+'"':'Speech is not available in this build.';
}
/* the faction switch: a voice with a faction in its id shows only for that faction; faction-less voices (UI, cinematic, skills) always show */
function applyFaction(){
  for(const v of ST.voices){const vf=v.dataset.fac;v.classList.toggle('hidden',!!vf&&vf!==ST.fac);}
  for(const r of ST.rows)r.el.classList.toggle('hidden',!r.btns.some(b=>!b.classList.contains('hidden')));
  for(const g of ST.groups)g.cnt.textContent=g.btns.filter(b=>!b.classList.contains('hidden')).length+' voices';
  for(const b of ST.facBtns)b.setAttribute('aria-pressed',String(b.dataset.faction===ST.fac));
}
function setFaction(f){ST.fac=f;applyFaction();}

/* ------------------------------------------------------------------ building the panel (on open: whatever is registered now) */
function voiceBtn(it,rowTitle,flat){
  const v=it.v,c=it.c,fl=c.fac?FACNAME[c.fac]:'',txt=flat?(c.label+(fl?' · '+fl:'')):c.label;
  const b=mk('button','sl-v',txt);b.type='button';
  b.dataset.voice=v.id;b.dataset.fac=c.fac||'';b.dataset.cls=v.cls||'fire';
  b.title=v.id+' · '+(v.cls||'fire')+' · '+(+v.dur||0).toFixed(2)+' s'+(v.fallback?' · generic fallback':'');
  b.setAttribute('aria-label',(flat?txt:(rowTitle+' '+c.label+(fl?' ('+fl+')':'')))+(v.fallback?' (generic)':''));
  b.addEventListener('click',()=>playVoice(v,c.fac,b));
  ST.voices.push(b);return b;
}
function buildVoices(body){
  const map={};for(const g of GROUPS)map[g[0]]={rows:{},flat:[]};
  for(const v of vi()){
    const c=classify(v),g=map[c.group]||map.UI,it={v,c};
    if(c.row){(g.rows[c.row]||(g.rows[c.row]={key:c.row,title:c.rowTitle,items:[]})).items.push(it);}
    else g.flat.push(it);
  }
  for(const[key,title]of GROUPS){
    const sec=mk('section','sl-sec'),hid='slh-'+key.toLowerCase(),h=mk('h3','sl-h'),cnt=mk('small','');
    h.id=hid;h.append(title+' ',cnt);sec.setAttribute('aria-labelledby',hid);sec.dataset.group=key;sec.append(h);
    const g=map[key],G={el:sec,cnt,btns:[]};ST.groups.push(G);
    const rows=Object.keys(g.rows).map(k=>g.rows[k]).sort((a,b)=>(rowRank(a.key)-rowRank(b.key))||(a.key<b.key?-1:a.key>b.key?1:0));
    for(const r of rows){
      const row=mk('div','sl-row'),cells=mk('div','sl-cells'),R={el:row,btns:[]};
      row.dataset.row=r.key;r.items.sort(cmpCell);
      for(const it of r.items){const b=voiceBtn(it,r.title,false);cells.append(b);R.btns.push(b);G.btns.push(b);}
      row.append(mk('span','sl-rowname',r.title),cells);sec.append(row);ST.rows.push(R);
    }
    if(g.flat.length){
      const cells=mk('div','sl-cells sl-flat');g.flat.sort(cmpFlat);
      for(const it of g.flat){const b=voiceBtn(it,null,true);cells.append(b);G.btns.push(b);}
      sec.append(cells);
    }
    body.append(sec);
  }
}
function meter(key,label){
  const el=mk('div','sl-meter'),tr=mk('span','sl-track'),fill=mk('i'),db=mk('span','sl-db','-inf dB');
  el.dataset.meter=key;el.setAttribute('role','meter');el.setAttribute('aria-label',label+' level');
  el.setAttribute('aria-valuemin','-60');el.setAttribute('aria-valuemax','0');el.setAttribute('aria-valuenow','-60');el.setAttribute('aria-valuetext','silent');
  tr.append(fill);el.append(mk('span','sl-mlab',label),tr,db);
  ST.m[key]={el,fill,db};return el;
}
function buildHead(){
  const h=mk('header','sl-head'),top=mk('div','sl-top'),t=mk('h2','ttl','Sound lab'),tools=mk('div','sl-tools');
  t.id='slTitle';t.tabIndex=-1;
  const stop=mk('button','btn sl-stop','Stop all');stop.type='button';stop.dataset.lab='stop';stop.addEventListener('click',stopAll);
  const shut=mk('button','btn sl-close','Close');shut.type='button';shut.dataset.lab='close';shut.addEventListener('click',closeLab);
  tools.append(stop,shut);top.append(t,tools);
  const note=mk('p','sl-note','Every registered voice, music cue and character. Nothing here changes the game.');
  const facs=mk('div','sl-facs');facs.setAttribute('role','group');facs.setAttribute('aria-label','Faction');
  for(const f of FAC){
    const b=mk('button','sl-fac',FACNAME[f]);b.type='button';b.dataset.faction=f;
    b.title=f==='wild'?'Creeps and neutral units':FACNAME[f]+' faction';
    if(typeof FACTIONS!=='undefined'&&FACTIONS[f]&&FACTIONS[f].col)b.style.setProperty('--fc',FACTIONS[f].col.base);
    b.addEventListener('click',()=>setFaction(f));
    ST.facBtns.push(b);facs.append(b);
  }
  const meters=mk('div','sl-meters');meters.append(meter('peak','Peak'),meter('rms','RMS'));
  const status=mk('p','sl-status');status.setAttribute('aria-live','polite');ST.status=status;
  h.append(top,note,facs,meters,status);return h;
}
function slider(key,label,val,min,max,step,fmt,onVal,aria){
  const wrap=mk('label','sl-slide'),inp=mk('input'),out=mk('output');
  inp.type='range';inp.min=String(min);inp.max=String(max);inp.step=String(step);inp.value=String(Math.round(val));
  inp.dataset.lab=key;inp.setAttribute('aria-label',aria);
  out.textContent=fmt(+inp.value);
  inp.addEventListener('input',()=>{const v=+inp.value;onVal(v);out.textContent=fmt(v);});
  ST.sl[key]={inp,out,fmt};
  wrap.append(mk('span',null,label),inp,out);return wrap;
}
function syncSliders(){
  const sc=sceneNow(),vals={intensity:sc.int*100,night:sc.night*100,era:sc.era};
  for(const k in ST.sl){const s=ST.sl[k];if(document.activeElement!==s.inp)s.inp.value=String(Math.round(vals[k]));s.out.textContent=s.fmt(+s.inp.value);}
}
function cueBtn(id){
  const mc=typeof MUSIC_CUES!=='undefined'?(MUSIC_CUES[id]||{}):{};
  const b=mk('button','sl-cue');b.type='button';b.dataset.cue=id;b.setAttribute('aria-pressed','false');
  const meta=[mc.mood,mc.len?mc.len+' s':null,mc.loop?'loops':(mc.sting?'sting':'once')].filter(Boolean).join(' · ');
  b.append(mk('b',null,id),mk('small',null,meta));
  if(mc.faction&&typeof FACTIONS!=='undefined'&&FACTIONS[mc.faction]&&FACTIONS[mc.faction].col)b.style.setProperty('--fc',FACTIONS[mc.faction].col.base);
  b.addEventListener('click',()=>cueClick(id));ST.cueBtns.push(b);return b;
}
function sectionRow(id,info){
  const row=mk('div','sl-secrow');row.append(mk('span',null,id+' sections'));
  info.sections.forEach((s,i)=>{
    const nm=s.name||String(i+1),b=mk('button','sl-sec-btn',nm);
    b.type='button';b.dataset.cue=id;b.dataset.section=String(i);b.setAttribute('aria-pressed','false');
    b.setAttribute('aria-label','Play '+id+' from section '+nm+' ('+Math.round(s.seconds||0)+' s)');
    b.title=Math.round(s.seconds||0)+' s';b.addEventListener('click',()=>sectionClick(id,i));
    ST.secBtns.push(b);row.append(b);
  });
  return row;
}
function buildMusic(body){
  const sec=mk('section','sl-sec'),h=mk('h3','sl-h','Music');
  h.id='slh-music';sec.setAttribute('aria-labelledby','slh-music');sec.append(h);
  const sc=sceneNow(),live=mk('div','sl-live');
  live.setAttribute('role','group');live.setAttribute('aria-label','Live scene');
  live.append(
    slider('intensity','Intensity',sc.int*100,0,100,1,v=>Math.round(v)+' %',v=>{try{musicScene({intensity:v/100});}catch(e){}},'Music intensity'),
    slider('night','Night',sc.night*100,0,100,1,v=>Math.round(v)+' %',v=>{try{musicScene({night:v/100});}catch(e){}},'Night darkness'),
    slider('era','Era',sc.era,1,3,1,v=>['I','II','III'][v-1]||String(v),v=>{try{musicScene({era:v});}catch(e){}},'Music era'));
  sec.append(live);
  const moods=mk('div','sl-chips');moods.setAttribute('role','group');moods.setAttribute('aria-label','Scene mood');
  for(const m of MOODL()){
    const b=mk('button','btn sl-chip',cap(m));b.type='button';b.dataset.lab='mood';b.dataset.mood=m;
    b.addEventListener('click',()=>{try{musicMood(m);}catch(e){}syncSliders();});moods.append(b);
  }
  sec.append(moods);
  ST.now=mk('p','sl-now');ST.now.setAttribute('aria-live','polite');sec.append(ST.now);
  const cues=typeof MUSIC_CUES!=='undefined'?Object.keys(MUSIC_CUES):[];
  const isSting=c=>!!(MUSIC_CUES[c]&&MUSIC_CUES[c].sting),isTheme=c=>/^theme_/.test(c);
  const groups=[['Themes',c=>isTheme(c)],['Campaign',c=>!isSting(c)&&!isTheme(c)],['Stings',c=>isSting(c)]];
  for(const[title,pick]of groups){
    const list=cues.filter(pick);if(!list.length)continue;
    sec.append(mk('h4','sl-h2',title));
    const grid=mk('div','sl-chips');grid.setAttribute('role','group');grid.setAttribute('aria-label',title+' cues');
    for(const id of list)grid.append(cueBtn(id));
    sec.append(grid);
  }
  for(const id of cues){const info=infoOf(id);if(info&&info.sections&&info.sections.length>1)sec.append(sectionRow(id,info));}
  body.append(sec);
}
function buildChars(body){
  const sec=mk('section','sl-sec'),h=mk('h3','sl-h','Character voices');
  h.id='slh-chars';sec.setAttribute('aria-labelledby','slh-chars');sec.append(h);
  const sty=mk('div','sl-chips');sty.setAttribute('role','group');sty.setAttribute('aria-label','Line style');
  for(const s of STYLES()){
    const b=mk('button','btn sl-chip',cap(s));b.type='button';b.dataset.style=s;b.setAttribute('aria-pressed',String(s===ST.style));
    b.addEventListener('click',()=>{ST.style=s;for(const x of ST.styleBtns)x.setAttribute('aria-pressed',String(x.dataset.style===s));});
    ST.styleBtns.push(b);sty.append(b);
  }
  sec.append(sty);
  const grid=mk('div','sl-chips');grid.setAttribute('role','group');grid.setAttribute('aria-label','Characters');
  const chars=(typeof STORY!=='undefined'&&STORY&&STORY.characters)||{};
  for(const id of Object.keys(chars)){
    const co=chars[id]||{},nm=co.name||co.short||id,b=mk('button','btn sl-char',co.short||co.name||id);
    b.type='button';b.dataset.char=id;b.title=co.title||nm;b.setAttribute('aria-label','Read a sample line as '+nm);
    b.addEventListener('click',()=>sayChar(id,co));grid.append(b);
  }
  sec.append(grid);
  ST.caption=mk('p','sl-caption');ST.caption.setAttribute('aria-live','polite');sec.append(ST.caption);
  body.append(sec);
}
function build(){
  ST.voices=[];ST.rows=[];ST.groups=[];ST.facBtns=[];ST.cueBtns=[];ST.secBtns=[];ST.styleBtns=[];ST.sl={};ST.m={};
  const card=ST.card;card.textContent='';
  const body=mk('div','sl-body');
  buildVoices(body);buildMusic(body);buildChars(body);
  card.append(buildHead(),body);
}

/* ------------------------------------------------------------------ live state: cue buttons, now-playing line, meters */
function refresh(){
  const st=musicStateSafe();
  if(st&&st.cue&&st.cue!==ST.playing)ST.playing=st.cue;
  if(st&&!st.cue&&ST.playing&&!(MUSIC_CUES[ST.playing]&&MUSIC_CUES[ST.playing].sting))ST.playing=null;
  for(const b of ST.cueBtns)b.setAttribute('aria-pressed',String(b.dataset.cue===ST.playing));
  for(const b of ST.secBtns){const id=b.dataset.cue,n=+b.dataset.section;b.setAttribute('aria-pressed',String(!!st&&st.cue===id&&+st.section===n));}
  if(ST.now){
    let secName='';if(st&&st.cue){const inf=infoOf(st.cue),s=inf&&inf.sections&&inf.sections[+st.section];secName=s?s.name:'';}
    ST.now.textContent=st&&st.cue?'Now playing: '+st.cue+(secName?' · section '+secName:''):(ST.playing?'Last cue: '+ST.playing:'Music is stopped.');
  }
}
const db=x=>x>0?20*Math.log10(x):-Infinity;
function fall(prev,target){   // peak / RMS ballistics: rise at once, fall 60 dB per second; anything under the -60 dB display floor is silence (-inf), so a silent lab is perfectly still
  if(target<=-60)target=-Infinity;
  if(target>prev)return target;
  const v=prev-3;if(v<=-60)return -Infinity;
  return Math.max(v,target);
}
function paint(key,v){
  const m=ST.m[key];if(!m)return;
  const inf=v===-Infinity,pct=inf?0:Math.max(0,Math.min(100,(v+60)/60*100)),txt=inf?'-inf dB':v.toFixed(1)+' dB';
  const sig=pct.toFixed(1)+'|'+txt;if(ST.last[key]===sig)return;ST.last[key]=sig;
  m.fill.style.width=pct.toFixed(1)+'%';m.db.textContent=txt;
  m.el.setAttribute('aria-valuenow',inf?'-60':v.toFixed(1));m.el.setAttribute('aria-valuetext',txt);
  m.el.classList.toggle('hot',!inf&&v>-3);
}
function tick(){
  if(!isOpen()){stopTimer();unhush();return;}   // closed by some other path (the game took the screen): hand the sound back all the same
  const r=typeof audioMeter==='function'?audioMeter():null;
  ST.shown.peak=fall(ST.shown.peak,db(r?r.peak:0));
  ST.shown.rms=fall(ST.shown.rms,db(r?r.rms:0));
  paint('peak',ST.shown.peak);paint('rms',ST.shown.rms);
  if(++ST.ticks%4===0)refresh();
}
function startTimer(){if(!ST.timer)ST.timer=setInterval(tick,50);}
function stopTimer(){if(ST.timer){clearInterval(ST.timer);ST.timer=0;}}

/* ------------------------------------------------------------------ the lab owns the sound while it is open
   The menu's demo battle (or a running match) makes sounds of its own, and an audition is only readable in silence: so while the lab is
   open the simulation is frozen (G.paused, only if it was running) and the background cue stops. On close both come back: the music through
   musicRestore (the hook a film uses to hand the music back; it restores the scene and lets the director resume the menu cue). */
function hush(){
  if(ST.active)return;ST.active=true;ST.frozen=false;ST.snap=null;
  try{ST.snap=typeof musicState==='function'?musicState():null;}catch(e){}
  try{if(typeof G!=='undefined'&&G&&!G.paused&&typeof ui!=='undefined'&&ui.running){G.paused=true;ST.frozen=true;}}catch(e){}
  try{musicStop(0.3);}catch(e){}
  try{speakStop();}catch(e){}
}
function unhush(){
  if(!ST.active)return;ST.active=false;
  try{musicStop(0.2);}catch(e){}
  try{speakStop();}catch(e){}
  if(ST.frozen&&typeof G!=='undefined'&&G)G.paused=false;
  ST.frozen=false;
  const sn=ST.snap;ST.snap=null;
  if(sn){try{musicRestore(sn);}catch(e){}}
}

/* ------------------------------------------------------------------ open / close, focus and keys */
function openLab(){
  if(isOpen()||!ST.root||!ST.card)return;
  try{if(typeof audioInit==='function')audioInit();}catch(e){}   // a click on the entry is a user gesture: this creates / resumes the context
  build();applyFaction();
  ST.shown={peak:-Infinity,rms:-Infinity};ST.last={};ST.playing=null;
  hush();
  openSub('soundLab');                      // hides Settings; the overlay stack returns to it on close
  refresh();syncSliders();startTimer();
  const t=document.getElementById('slTitle');if(t)try{t.focus({preventScroll:true});}catch(e){}
}
function closeLab(){
  if(!isOpen())return;
  stopTimer();
  ST.playing=null;
  unhush();
  closeSub();                               // back to Settings
  if(ST.entry&&ST.entry.isConnected)try{ST.entry.focus();}catch(e){}
}
function focusables(){
  if(!ST.card)return[];
  return Array.prototype.filter.call(ST.card.querySelectorAll('button,input,select,textarea,a[href],[tabindex]'),
    e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length>0);
}
function trapTab(e){
  const f=focusables();if(!f.length)return;
  const a=document.activeElement,inside=!!a&&ST.card.contains(a),first=f[0],last=f[f.length-1];
  if(e.shiftKey){if(!inside||a===first){e.preventDefault();last.focus();}}
  else if(!inside||a===last){e.preventDefault();first.focus();}
}
function onKey(e){
  if(!isOpen())return;
  e.stopPropagation();                      // the game's own key handlers (Escape = pause or back, hotkeys, Tab/Space defaults) do not see keys meant for the lab
  if(e.key==='Escape'){e.preventDefault();closeLab();return;}
  if(e.key==='Tab')trapTab(e);
}
/* Settings row for the OPTIONAL recorded-voice pack (84_voice.js, tools/voicepack/README.md). File picker only: nothing is requested from the network. */
function buildPackRow(){
  const row=ST.entry&&ST.entry.parentNode;if(!row||!row.parentNode||document.getElementById('bVoicePack'))return;
  const r=mk('div','row'),b=mk('button','btn','Load voice pack...'),rm=mk('button','btn','Remove'),info=mk('span','dim small','Optional recorded voices (none loaded)'),inp=document.createElement('input');
  b.id='bVoicePack';b.type='button';rm.id='bVoicePackX';rm.type='button';rm.hidden=true;info.id='voicePackInfo';info.setAttribute('aria-live','polite');
  inp.type='file';inp.id='voicePackFile';inp.multiple=true;inp.hidden=true;inp.accept='.json,.zip,.ogg,.opus,.m4a,.mp3,.wav,application/json,application/zip,audio/*';
  const show=()=>{const s=typeof voicepackStatus==='function'?voicepackStatus():null;
    if(!s||!s.loaded||!s.accepted){info.textContent=s&&s.reasons&&s.reasons.length?'Voice pack rejected: '+s.reasons[0]:'Optional recorded voices (none loaded)';rm.hidden=true;return;}
    info.textContent='Voice pack: '+s.accepted+' lines'+(s.rejected?' ('+s.rejected+' rejected)':'')+(s.license&&s.license.statement?'. '+s.license.statement:'');rm.hidden=false;};
  b.addEventListener('click',()=>inp.click());
  inp.addEventListener('change',()=>{const f=inp.files;if(!f||!f.length)return;info.textContent='Checking voice pack...';
    voicepackLoadFiles(f).then(show,e=>{info.textContent='Voice pack not loaded: '+(e&&e.message||e);}).then(()=>{try{inp.value='';}catch(e){}});});
  rm.addEventListener('click',()=>{voicepackClear();show();});
  r.append(b,rm,info,inp);row.parentNode.insertBefore(r,row.nextSibling);
}
function init(){
  ST.root=document.getElementById('soundLab');ST.card=document.getElementById('slCard');ST.entry=document.getElementById('bSoundLab');
  if(!ST.root||!ST.card||!ST.entry)return;
  ST.fac=typeof SET!=='undefined'&&SET&&FAC.indexOf(SET.faction)>=0?SET.faction:'meridian';
  ST.entry.addEventListener('click',openLab);
  buildPackRow();
  document.addEventListener('keydown',onKey,true);
}
return{init,open:openLab,close:closeLab,isOpen};
})();
function soundLabInit(){SOUNDLAB.init();}
