/* tests/audio/voice_live.js - the LIVE half of tests/audio/voice_gate.py (injected after boot with window.__TEST='live', after a real mouse click has created the AudioContext).
   Everything here drives the real speak()/speakStop()/bark()/say() through window.__RTS.AUD.voice with a FAKE speechSynthesis (headless Chromium has no usable voices), so the TTS paths
   (voice choice, ttsPitch/ttsRate, async voiceschanged, cancel, queue, onEnd) are exercised deterministically. Every scenario returns plain data; the gate asserts on it.
   window.VL
     tts(voices)            install the fake speechSynthesis / SpeechSynthesisUtterance (voices are NOT visible until deliver() fires 'voiceschanged', like Chrome)
     deliver(list)          make `list` the voice list and fire 'voiceschanged'
     untts()                restore the real ones
     basic() stopInterrupt() queue() barks() mute() flags() ttsChoice() ttsAssign(lists) ttsEnd() announcer() robust() perf()
   Nothing here touches the simulation. */
(function(){
'use strict';
const A=()=>window.__RTS.AUD,V=()=>A().voice,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now();
const L=window.VL={T:null};
const clean=()=>{V().stop();A().reset(true);};
const nodes=()=>A().stats().activeNodes;
/* wait until the music duck of an earlier line has released (a duck lasts the line + 0.5 s, then ramps back over 0.7 s) */
const calm=async(max)=>{const t0=now();while(now()-t0<(max||12000)&&A().stats().ducks.music<0.995)await wait(100);return A().stats().ducks.music;};

/* ---------------------------------------------------------------- fake speechSynthesis */
L.tts=function(opt){
  opt=opt||{};
  const T=L.T={voices:[],utts:[],cancels:0,speaks:0,hang:false,msPerChar:opt.msPerChar||40,cur:null,ls:{},order:[]};
  class U{constructor(t){this.text=String(t);this.voice=null;this.lang='';this.pitch=1;this.rate=1;this.volume=1;this.onend=null;this.onerror=null;}}
  const ss={speaking:false,pending:false,
    getVoices(){return T.voices.slice();},
    speak(u){T.speaks++;T.order.push('speak');T.utts.push({text:u.text,voice:u.voice&&u.voice.name,lang:u.lang,pitch:u.pitch,rate:u.rate,volume:u.volume});T.cur=u;ss.speaking=true;
      if(T.hang)return;
      u._t=setTimeout(()=>{if(T.cur===u){T.cur=null;ss.speaking=false;if(u.onend)u.onend({});}},Math.max(50,u.text.length*T.msPerChar/Math.max(.5,u.rate)));},
    cancel(){T.cancels++;T.order.push('cancel');const u=T.cur;if(u){clearTimeout(u._t);T.cur=null;ss.speaking=false;if(u.onerror)u.onerror({error:'canceled'});}},
    pause(){},resume(){},
    addEventListener(n,f){(T.ls[n]=T.ls[n]||[]).push(f);},removeEventListener(n,f){T.ls[n]=(T.ls[n]||[]).filter(x=>x!==f);}};
  T.ss=ss;T.realSS=Object.getOwnPropertyDescriptor(window,'speechSynthesis');T.realU=window.SpeechSynthesisUtterance;
  Object.defineProperty(window,'speechSynthesis',{value:ss,configurable:true,writable:true});
  window.SpeechSynthesisUtterance=U;
  return true;
};
L.deliver=function(list){const T=L.T;T.voices=list.slice();for(const f of (T.ls.voiceschanged||[]).slice())f({});return(T.ls.voiceschanged||[]).length;};
L.untts=function(){const T=L.T;if(!T)return false;try{if(T.realSS)Object.defineProperty(window,'speechSynthesis',T.realSS);else delete window.speechSynthesis;}catch(e){}window.SpeechSynthesisUtterance=T.realU;L.T=null;return true;};

/* ---------------------------------------------------------------- scenarios */
L.state=function(){const s=A().stats();return{state:s.state,muted:s.muted,sr:s.sampleRate,ducks:s.ducks,nodes:s.activeNodes,counters:s.counters,voiceSet:window.__RTS.SET.voice,voiceVol:window.__RTS.SET.voiceVol,demo:window.__RTS.ui.demo};};

/* a line is spoken, its graph exists while it plays, onEnd fires once at ~dur, nodes are released, the music is ducked, the lip-sync envelope moves */
L.basic=async function(){
  clean();const v=V(),t0=now();let ended=null,calls=0;
  const text='The colony holds the line tonight.',n0=nodes();
  const r=v.speak('idris',text,{onEnd:o=>{calls++;ended={o,ms:now()-t0};}});
  const c=v.cur();let lvMax=0,nDur=0;
  for(let i=0;i<14;i++){await wait(60);lvMax=Math.max(lvMax,v.level());nDur=Math.max(nDur,nodes());}
  const duck=A().stats().ducks.music;
  await wait(Math.max(0,r.dur*1000+900-14*60));
  return{res:r,hadCur:!!c,curChar:c&&c.id,n0,nDur,nAfter:nodes(),duck,lvMax,lvAfter:v.level(),ended,calls,curAfter:v.cur(),counters:A().stats().counters};
};
/* speakStop ends the line at once (onEnd reason 'stop', interrupted); a new line interrupts the old one (reason 'interrupt', once) */
L.stopInterrupt=async function(){
  clean();const v=V(),o={};
  let a=null,ac=0;v.speak('kaz','Hold the line, Marshal. They are coming from the north and we will not break.',{onEnd:x=>{ac++;a={x,ms:now()}}});
  await wait(250);const t1=now();v.stop();o.stop={calls:ac,reason:a&&a.x.reason,interrupted:a&&a.x.interrupted,latency:a?a.ms-t1:null,curNull:v.cur()===null};
  await wait(700);o.nodesAfterStop=nodes();
  let ia=null,ic=0,ib=null,bc=0;
  v.speak('kaz','The first line goes on for quite some time, you see.',{onEnd:x=>{ic++;ia=x;}});
  await wait(200);
  const rb=v.speak('lyra','Second.',{onEnd:x=>{bc++;ib=x;}});
  o.interrupt={aCalls:ic,aReason:ia&&ia.reason,aInterrupted:ia&&ia.interrupted,curIsB:!!v.cur()&&v.cur().id==='lyra',bDur:rb.dur};
  await wait(rb.dur*1000+700);o.interrupt.bCalls=bc;o.interrupt.bReason=ib&&ib.reason;o.interrupt.aCallsLater=ic;o.interrupt.curAfter=v.cur();
  /* empty text: onEnd still fires (asynchronously), dur 0 */
  let ec=0,er=null;const re=v.speak('kaz','   ',{onEnd:x=>{ec++;er=x;}});await wait(60);o.empty={dur:re.dur,calls:ec,reason:er&&er.reason,cur:v.cur()};
  return o;
};
/* queue: second line waits for the first; 8 lines at most; speakStop clears it */
L.queue=async function(){
  clean();const v=V(),ev=[],o={};
  const r1=v.speak('idris','One.',{onEnd:()=>ev.push('A.end')});
  const r2=v.speak('kaz','Two.',{queue:true,onEnd:()=>ev.push('B.end')});
  o.queued=r2.queued;o.qlen=v.queue();
  await wait(60);o.curDuring=v.cur()&&v.cur().id;
  await wait((r1.dur+r2.dur)*1000+1500);o.events=ev;o.qAfter=v.queue();o.curAfter=v.cur();
  /* cap */
  clean();v.speak('idris','A long first line that keeps the speaker busy for a while, more or less.');
  let q=0,sk=0;for(let i=0;i<14;i++){const r=v.speak('kaz','Line '+i+'.',{queue:true});if(r.queued)q++;if(r.skipped)sk++;}
  o.cap={queued:q,skipped:sk,qlen:v.queue()};v.stop();o.cap.qlenAfterStop=v.queue();o.cap.curAfterStop=v.cur();
  return o;
};
/* barks: shuffled bag (every line once before a repeat, never the same twice in a row), cooldowns, low volume, never over a spoken line, no music duck */
L.barks=async function(){
  clean();const v=V(),S=window.__RTS.STORY,o={};const had=S.barks;S.barks=Object.assign({},had||{});
  S.barks.idris={select:['Marshal Vale, reporting.','Ready.','At your word.'],ack:['Understood.']};S.barks.kaz={select:['Hm.','Go.','Now.','Forward.']};
  S.barks.kaz.fall=['Down.'];
  o.calm=await calm();
  const free={cooldown:0,globalGap:0},seq=[];
  for(let i=0;i<12;i++){const b=v.bark('idris','select',free);seq.push(b?b.line:null);v.stop();}
  o.seq=seq;
  const seq4=[];for(let i=0;i<16;i++){const b=v.bark('kaz','select',free);seq4.push(b?b.line:null);v.stop();}o.seq4=seq4;
  /* the texts come from the list */
  const b0=v.bark('idris','select',free);o.text=b0&&b0.text;o.textOk=!!b0&&S.barks.idris.select.indexOf(b0.text)>=0;
  const gm=v.cur()&&v.cur().h&&v.cur().h.gm.gain.value;o.barkGain=gm;o.barkBlips=!!b0&&b0.blips;
  await wait(60);o.duckBark=A().stats().ducks.music;v.stop();
  /* same text as a normal line: the gain ratio is the bark volume */
  await calm();v.speak('idris','Ready.',{});o.lineGain=v.cur()&&v.cur().h&&v.cur().h.gm.gain.value;await wait(120);o.duckLine=A().stats().ducks.music;v.stop();
  await wait(1700);
  /* default cooldowns: a second call right away is refused (global gap), the same (char,key) is refused for 5 s */
  const d1=v.bark('idris','ack');v.stop();const d2=v.bark('kaz','select');o.defaults={first:!!d1,immediate:d2===null};
  await wait(1600);const d3=v.bark('idris','ack');o.defaults.sameKeyAfterGap=d3===null;v.stop();
  const d4=v.bark('kaz','fall');o.defaults.otherCharAfterGap=!!d4;v.stop();
  /* over a spoken line: refused, and the line is not touched */
  v.speak('lyra','This line is long enough that nothing may talk over it.',{});
  const ob=v.bark('idris','select',free);o.overLine={bark:ob,stillLyra:v.cur()&&v.cur().id==='lyra'};
  /* a normal line interrupts a bark */
  v.stop();let ic=null;v.bark('idris','select',{cooldown:0,globalGap:0,onEnd:x=>{ic=x;}});v.speak('kaz','Interrupting now.',{});o.interruptsBark=ic&&ic.reason;v.stop();
  /* unknown key / unknown character / aliases */
  o.unknownKey=v.bark('idris','nope',free);o.unknownChar=v.bark('nobody','select',free);
  S.barks['hero_zzz']=undefined;
  o.aliasHero=(function(){const C=S.characters;let heroType=null;for(const k in C)if(C[k].hero){heroType=C[k].hero;break;}if(!heroType)return{skipped:true};const id=Object.keys(C).find(k=>C[k].hero===heroType);
    S.barks[id]=S.barks[id]||{select:['Alias line.']};const b=v.bark(heroType,'select',free);v.stop();return{heroType,id,canon:v.canon(heroType),ok:!!b};})();
  S.barks=had;if(!had)delete S.barks;
  return o;
};
/* mute + the settings flags */
L.mute=async function(){
  clean();const v=V(),o={};
  o.before=A().stats().muted;
  let ec=0,er=null;v.speak('idris','This is a rather long line that will be cut by the mute button.',{onEnd:x=>{ec++;er=x;}});
  await wait(200);A().mute();o.muted=A().stats().muted;o.cutCalls=ec;o.cutReason=er&&er.reason;o.curAfterMute=v.cur();
  const r=v.speak('idris','Nobody hears this.',{});o.mutedRes={blips:r.blips,tts:r.tts,dur:r.dur};v.stop();
  A().mute();o.unmuted=!A().stats().muted;
  const r2=v.speak('idris','Heard again.',{});o.unmutedRes={blips:r2.blips};v.stop();
  return o;
};
L.flags=async function(){
  clean();const v=V(),SET=window.__RTS.SET,o={};const sv=SET.voice,vv=SET.voiceVol;
  /* SET.voice = false: TTS off, the synthesized stream still plays */
  const n0=L.T?L.T.speaks:0;SET.voice=false;const r=v.speak('idris','Flag test line.',{});o.voiceOff={tts:r.tts,blips:r.blips,ttsSpeaks:L.T?L.T.speaks-n0:null};v.stop();SET.voice=true;
  /* volume follows SET.voiceVol */
  const vol=x=>{SET.voiceVol=x;const k=L.T.utts.length;v.speak('idris','Volume.',{});const u=L.T.utts[L.T.utts.length-1];v.stop();return L.T.utts.length>k?u.volume:null;};
  o.vol={a:vol(.9),b:vol(.45),c:vol(0)};
  SET.voice=sv;SET.voiceVol=vv;return o;
};
/* the voice choice for one character, with the fake voices already delivered */
L.ttsChoice=async function(){
  clean();const v=V(),T=L.T,o={};
  const k0=T.utts.length;const r=v.speak('idris','Pitch and rate.',{});const u=T.utts[T.utts.length-1];v.stop();
  o.res={tts:r.tts,voice:r.voice};o.utt=T.utts.length>k0?u:null;o.profile=v.profile('idris');
  const r2=v.speak('idris','Shout this.',{style:'shout'});const u2=T.utts[T.utts.length-1];v.stop();o.shout=u2;
  const r3=v.speak('idris','Whisper this.',{style:'whisper'});const u3=T.utts[T.utts.length-1];v.stop();o.whisper=u3;
  const r4=v.speak('idris','Radio this.',{style:'radio'});const u4=T.utts[T.utts.length-1];v.stop();o.radio=u4;
  /* when TTS speaks, the synthesized stream is a murmur under it: its gain is lower than the TTS-less one */
  const withT=(()=>{const x=v.speak('kaz','Mix level.',{});const g=v.cur()&&v.cur().h&&v.cur().h.gm.gain.value;v.stop();return g;})();
  const sv=window.__RTS.SET.voice;window.__RTS.SET.voice=false;const noT=(()=>{const x=v.speak('kaz','Mix level.',{});const g=v.cur()&&v.cur().h&&v.cur().h.gm.gain.value;v.stop();return g;})();window.__RTS.SET.voice=sv;
  o.mix={withTts:withT,noTts:noT};
  return o;
};
/* voice assignment: the same voices in a different order; unknown speakers; list sizes. `lists` = {name: [voice,...]} */
L.ttsAssign=async function(lists){
  clean();const v=V(),C=window.__RTS.STORY.characters,ids=Object.keys(C).filter(k=>!k.startsWith('fx_')&&!k.startsWith('probe_')),o={};
  const map=()=>{const m={};for(const id of ids){const x=v.tts.voice(id);m[id]=x?x.name:null;}return m;};
  for(const name in lists){
    L.deliver(lists[name]);const m=map(),vals=Object.values(m).filter(Boolean);
    o[name]={map:m,distinct:new Set(vals).size,nulls:Object.values(m).filter(x=>!x).length};
  }
  /* determinism: the English voices of the first list, shuffled (a reversed order), must map identically */
  const first=lists[Object.keys(lists)[0]];L.deliver(first);const m1=map();L.deliver(first.slice().reverse());const m2=map();
  o.reorder={same:JSON.stringify(m1)===JSON.stringify(m2)};
  /* stability: unknown speakers are assigned without moving anybody */
  L.deliver(first);const before=map();for(const x of ['zz_a','zz_b','zz_c','nobody'])v.tts.voice(x);const after=map();
  o.stable={same:JSON.stringify(before)===JSON.stringify(after)};
  /* the same list delivered again (Chrome fires voiceschanged more than once) keeps the mapping */
  const lg=L.deliver(first);const again=map();o.stable.refire=JSON.stringify(before)===JSON.stringify(again);o.listeners=lg;
  o.canon={narrator:v.canon('narrator'),narratorVoice:(v.tts.voice('narrator')||{}).name||null,roleChar:ids.find(k=>C[k].role==='narrator')||null,roleVoice:(function(){const k=ids.find(k=>C[k].role==='narrator');return k?((v.tts.voice(k)||{}).name||null):null;})()};
  return o;
};
/* onEnd is resolved by whichever finishes last (the synthesized stream or TTS); a TTS that never ends is resolved by the estimate */
L.ttsEnd=async function(){
  clean();const v=V(),T=L.T,o={};
  /* (a) TTS lasts longer than the blips */
  T.hang=false;T.msPerChar=250;let t0=now(),ended=null,calls=0;
  const text='Hold the line.';const r=v.speak('idris',text,{onEnd:x=>{calls++;ended={x,ms:now()-t0};}});
  const u=T.utts[T.utts.length-1];
  await wait(Math.max(r.dur*1000+900,4400));o.slow={tts:r.tts,dur:r.dur,ended,calls,uttRate:u&&u.rate,expectMs:u?text.length*250/Math.max(.5,u.rate):null};
  /* (b) TTS never ends */
  T.hang=true;t0=now();ended=null;calls=0;const r2=v.speak('idris','Hold.',{onEnd:x=>{calls++;ended={x,ms:now()-t0};}});
  const give=Math.max(r2.dur,1)*1700+2600;await wait(give);o.hang={tts:r2.tts,dur:r2.dur,ended,calls,waited:give};
  T.hang=false;T.msPerChar=40;
  /* (c) cancel/queue order on the fake: stop cancels once; a second line cancels the first before speaking */
  clean();T.order.length=0;v.speak('kaz','Order one is a longer line than the next one.',{});await wait(100);const c0=T.cancels;v.speak('lyra','Order two.',{});
  o.order=T.order.slice();o.cancelsOnInterrupt=T.cancels-c0;const c1=T.cancels;v.stop();o.cancelsOnStop=T.cancels-c1;o.speakingAfterStop=T.ss.speaking;
  return o;
};
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
/* the announcer: say() keeps its behaviour and rate limits, and yields to a character who is speaking */
L.announcer=async function(){
  clean();const v=V(),T=L.T,SET=window.__RTS.SET,ui=window.__RTS.ui,o={};
  const save={demo:ui.demo,voice:SET.voice,vv:SET.voiceVol};ui.demo=false;SET.voice=true;SET.voiceVol=.9;
  const k=()=>T.utts.length;
  let k0=k();v.say('Your forces are under attack');await wait(30);o.first=T.utts.slice(k0);
  k0=k();v.say('Hero level up');await wait(30);o.tooSoon=T.utts.length-k0;               // 2.2 s global gap
  await wait(2300);k0=k();v.say('Your forces are under attack');await wait(30);o.sameText=T.utts.length-k0;   // 9 s per text
  k0=k();v.say('Hero has fallen');await wait(30);o.otherText=T.utts.length-k0;
  /* yields to a character line */
  await wait(2300);v.speak('lyra','A character is talking right now and the announcer waits.',{});k0=k();v.say('Base under attack');await wait(30);o.duringLine=T.utts.length-k0;v.stop();
  /* flags */
  await wait(2300);SET.voice=false;k0=k();v.say('Flag off one');await wait(30);o.voiceOff=T.utts.length-k0;SET.voice=true;
  await wait(2300);ui.demo=true;k0=k();v.say('Demo mode one');await wait(30);o.demo=T.utts.length-k0;ui.demo=false;
  await wait(2300);A().mute();k0=k();v.say('Muted one');await wait(30);o.muted=T.utts.length-k0;A().mute();
  await wait(2300);SET.voiceVol=.45;k0=k();v.say('Quiet one');await wait(30);o.vol=T.utts[T.utts.length-1]&&T.utts[T.utts.length-1].volume;
  o.says=A().stats().counters.says;
  ui.demo=save.demo;SET.voice=save.voice;SET.voiceVol=save.vv;return o;
};
/* robustness: odd inputs must neither throw nor produce non-finite durations */
L.robust=async function(){
  clean();const v=V(),o=[];
  const T=['','   ','...','?!','12345678901234567890','Café naïve Über','A','Mr. Vale, Dr. Quill and Sgt. Doyle.','*bold* _it_ ~x~ `code` #h',
    'Emoji 😀 test 🎵 here.','“Smart quotes” — and dashes… really?','HELLO THERE GENERAL','a-b-c d/e f_g','x'.repeat(30)+' '+'word '.repeat(150),'<b>html</b> &amp; stuff'];
  for(const t of T){
    let e=null,r=null,p=null;const t0=now();
    try{r=v.speak('idris',t,{});p=v.plan(v.profile('idris'),t,'normal');}catch(x){e=String(x&&x.message||x);}
    o.push({text:t.slice(0,24),err:e,dur:r&&r.dur,syl:r&&r.syllables,planDur:p&&p.dur,finite:r?isFinite(r.dur)&&r.dur>=0:false,ms:now()-t0});v.stop();
  }
  const ids=[null,undefined,'',0,5,'nobody','Nobody','x'.repeat(200)];const prof=[];
  for(const id of ids){let e=null,pr=null;try{pr=v.profile(id);}catch(x){e=String(x);}prof.push({id:String(id).slice(0,12),err:e,f0:pr&&pr.f0,tract:pr&&pr.tract,timbre:pr&&pr.timbre,found:pr&&pr.found,pid:pr&&pr.id});}
  return{lines:o,profiles:prof,errors:A().stats().counters.errors,lastError:A().stats().lastError};
};
/* cost: the plan for 600 characters, the graph for a typical line (source nodes), time spent in speak() on the main thread */
L.perf=async function(){
  clean();const v=V(),o={};
  const P=v.profile('idris'),long='We rebuild, and we remember. The array wakes at dawn. '.repeat(11).slice(0,600),mid='Hold the line! They are coming from the north, and we will not break.';
  const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};
  const tp=[],ts=[],nn=[];
  for(let i=0;i<9;i++){await wait(150);let t=now();v.plan(P,mid+' '+i,'normal');tp.push(now()-t);t=now();const n0=nodes();v.speak('idris',mid+' '+i,{});ts.push(now()-t);nn.push(nodes()-n0);v.stop();}   // yields between lines: source nodes are released by their 'ended' events
  o.planMid=med(tp);o.speakMid=med(ts);o.nodesMid=Math.max.apply(null,nn);
  await wait(700);o.nodesBefore600=nodes();const t=now();const pl=v.plan(P,long,'normal');o.plan600=now()-t;o.dur600=pl.dur;o.syl600=pl.syl.length;
  const t2=now();const r=v.speak('idris',long,{});o.speak600=now()-t2;o.speak600nodes=nodes();o.speak600dur=r.dur;v.stop();
  await wait(700);o.nodesAfter=nodes();o.peak=A().stats().peakNodes;
  return o;
};
})();
