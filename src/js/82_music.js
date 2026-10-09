/* =========================================================================
   MUSIC — adaptive sequencer and mixer. Contract: docs/AUDIO_SPEC.md §2, §4 and §9 (data format + authoring guide).
   Rendering/audio only: this module never reads or writes simulation state (it READS G/ui/SET to drive the in-match score).
   Public names (everything else is private to the MUSE closure):
     musicPlay(cue,opts) musicStop(fade) musicScene({faction,era,intensity,night,mood}) musicStinger(cue) musicDuck(amount,ms) musicMood(m)
     musicState() musicRestore(s) musicInfo(id) musicRegister(id,def)      MOTIF (leitmotif registry)   MUSIC_DATA (cue registry)   MUSIC (instruments + helpers)
   Design: a lookahead scheduler (100 ms timer, 0.6 s window) driven by AudioContext.currentTime; sections start on exact grid times; stems (pad bass arp lead drums perc choir)
   are separate gain nodes whose levels follow intensity/night/era; the same code builds the live score and the offline render (audioRender({cue}) / ({motif}) / ({inst})).
   ========================================================================= */
const MOTIF={};            // MOTIF[id]=function(key,mode,voice)->notes   (written in 83_motifs.js)
const MUSIC_DATA={};       // MUSIC_DATA[id]=cue definition              (83_music_*.js; format: docs/AUDIO_SPEC.md §9)
const MUSIC={INST:{}};     // MUSIC.INST[name]=function(n)->layers[] (synth instruments) + helpers filled in below (deg chord midi hz check info stats ...)
const MUSE=(function(){
'use strict';
const INST=MUSIC.INST;
const LOOK=0.6,MAKE=0.28,LEAD=0.23,TICKMS=100,SCENEMS=250,BUDGET=24;   // LOOK: the sequencer computes events this far ahead; MAKE: audio nodes are only created this far ahead (so nodes that exist = nodes about to sound, see AUD.capMusic);
  // LEAD: mean creation lead assumed by the offline node model (= MAKE - TICKMS/2); BUDGET: cap of source nodes that exist at once (live hard cap: AUD.capMusic = 24)
const cl=(v,a,b)=>v<a?a:(v>b?b:v);
const mixv=(a,b,t)=>a+(b-a)*t;
const isNum=v=>typeof v==='number'&&isFinite(v);
const sstep=(x,a,b)=>{if(!(b>a))return x>=a?1:0;const t=cl((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const WARN=[];function warn(m){if(WARN.length<300)WARN.push(m);}
const EMPTY={};
const LAST={id:'',dropped:0,peakEst:0,byStem:{}};   // diagnostics of the latest offline render (MUSIC.last())
const STAT={scheduled:0,dropped:0,late:0,errors:0,lastError:'',peakNodes:0,fallbacks:0,started:0,ticks:0};

/* ------------------------------------------------------------------ theory: pitch classes, scales, chords */
const NOTEPC={c:0,d:2,e:4,f:5,g:7,a:9,b:11};
function pcOf(s){
  if(isNum(s))return((Math.round(s)%12)+12)%12;
  const m=/^([A-Ga-g])([#b]*)/.exec(String(s));if(!m)return -1;
  let v=NOTEPC[m[1].toLowerCase()];for(let i=0;i<m[2].length;i++)v+=m[2][i]==='#'?1:-1;
  return((v%12)+12)%12;
}
function midiOf(n){
  if(isNum(n))return n;
  const m=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(n));if(!m)return NaN;
  return 12*(parseInt(m[3],10)+1)+NOTEPC[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);
}
const hzOf=m=>440*Math.pow(2,(m-69)/12);
const SCALES={major:[0,2,4,5,7,9,11],ionian:[0,2,4,5,7,9,11],dorian:[0,2,3,5,7,9,10],phrygian:[0,1,3,5,7,8,10],lydian:[0,2,4,6,7,9,11],mixolydian:[0,2,4,5,7,9,10],
  aeolian:[0,2,3,5,7,8,10],minor:[0,2,3,5,7,8,10],locrian:[0,1,3,5,6,8,10],harmonic:[0,2,3,5,7,8,11],melodic:[0,2,3,5,7,9,11],phrygdom:[0,1,4,5,7,8,10],
  pentatonic:[0,2,4,7,9],minorpent:[0,3,5,7,10],blues:[0,3,5,6,7,10],wholetone:[0,2,4,6,8,10],chromatic:[0,1,2,3,4,5,6,7,8,9,10,11]};
function scaleFor(mode,custom){if(Array.isArray(custom)&&custom.length)return custom;return SCALES[String(mode||'major').toLowerCase()]||SCALES.major;}
/* MIDI number of scale degree `deg` (1-based, may exceed 7 or be < 1) of key/mode; `oct` = octave number of degree 1 (D4 = 62 for key D, oct 4) */
function degMidi(tonicPc,scale,deg,oct,acc){
  const n=scale.length,i=deg-1,o=Math.floor(i/n),k=((i%n)+n)%n;
  return 12*(oct+1)+tonicPc+scale[k]+12*o+(acc||0);
}
const CQ={'':[0,4,7],M:[0,4,7],maj:[0,4,7],m:[0,3,7],min:[0,3,7],'5':[0,7,12],'2':[0,2,4,7],sus2:[0,2,7],sus4:[0,5,7],sus:[0,5,7],dim:[0,3,6],aug:[0,4,8],'6':[0,4,7,9],m6:[0,3,7,9],
  '7':[0,4,7,10],m7:[0,3,7,10],maj7:[0,4,7,11],M7:[0,4,7,11],mmaj7:[0,3,7,11],dim7:[0,3,6,9],m7b5:[0,3,6,10],'7sus4':[0,5,7,10],add9:[0,4,7,14],madd9:[0,3,7,14],
  '9':[0,4,7,10,14],m9:[0,3,7,10,14],maj9:[0,4,7,11,14],mb9:[0,3,7,13],b9:[0,4,7,13],m7b9:[0,3,7,10,13],'maj7#11':[0,4,7,11,18],'add#11':[0,4,7,18],'7#9':[0,4,7,10,15],'m11':[0,3,7,10,14,17],'sus2add9':[0,2,7,14]};
const CHC={};
function parseChord(sym){
  let c=CHC[sym];if(c)return c;
  const m=/^([A-Ga-g])([#b]?)([^/]*?)(?:\/([A-Ga-g][#b]?))?$/.exec(String(sym).trim());
  if(!m){warn('bad chord symbol "'+sym+'"');return CHC[sym]={sym,root:0,iv:[0,4,7],bass:null,bad:true};}
  const q=m[3].trim();let iv=CQ[q];
  if(!iv){warn('unknown chord quality "'+q+'" in '+sym+' (major assumed)');iv=CQ[''];}
  return CHC[sym]={sym,root:pcOf(m[1]+m[2]),iv,bass:m[4]?pcOf(m[4]):null,bad:!CQ[q]};
}
/* chord tones as pitch classes (deduplicated, in interval order), placed in the window [lo, lo+12) and sorted: a close voicing */
const VOC={};
function voicingOf(ch,lo,maxV){
  const key=ch.sym+'|'+lo+'|'+maxV;let v=VOC[key];if(v)return v;
  const seen={},out=[];
  for(let i=0;i<ch.iv.length&&out.length<maxV;i++){const pc=(ch.root+ch.iv[i])%12;if(seen[pc])continue;seen[pc]=1;out.push(lo+(((pc-lo)%12)+12)%12);}
  out.sort((a,b)=>a-b);return VOC[key]=out;
}
const atOrAbove=(pc,lo)=>lo+((((pc-lo)%12)+12)%12);

/* ------------------------------------------------------------------ patterns
   lane pattern (drums / perc): one char per step  . rest   x hit   X accent   o soft   g ghost   f flam   d drag   r roll   (spaces and | are ignored)
   melodic pattern: whitespace separated tokens, one step each:  .  rest  -  tie  C chord  B bass note  [#|b]N[' ,][!|~][:len]  (N = degree / chord-tone index)   or the keyword 'chord' (sustained chord) */
const LANEV={x:0.72,X:1,o:0.45,g:0.26,f:0.8,d:0.75,r:0.62},LANEA={f:'flam',d:'drag',r:'roll'};
const PCACHE={};
function compLane(str){
  let c=PCACHE['L'+str];if(c)return c;
  const s=String(str).replace(/[\s|]/g,''),ev=new Array(s.length);let bad=0;
  for(let i=0;i<s.length;i++){
    const ch=s[i];ev[i]=null;
    if(ch==='.'||ch==='_'||ch==='-')continue;
    const v=LANEV[ch];if(v===undefined){bad++;continue;}
    ev[i]={v,art:LANEA[ch]||''};
  }
  return PCACHE['L'+str]=c={len:s.length,ev,bad};
}
const TOKRE=/^(?:(\.|_|-)|(C|B)|([#b]*)(\d+))(['`,]*)(!|~)?(?::(\d+))?$/;
function compMel(str){
  let c=PCACHE['M'+str];if(c)return c;
  const toks=String(str).trim().split(/\s+/).filter(t=>t&&t!=='|'),ev=[];let bad=0,last=null;
  for(let i=0;i<toks.length;i++){
    const m=TOKRE.exec(toks[i]);
    if(!m){bad++;ev.push(null);continue;}
    const w=m[7]?Math.max(1,parseInt(m[7],10)):1;
    if(m[1]==='-'){if(last)last.len+=w;for(let k=0;k<w;k++)ev.push(null);continue;}   // '-' / '-:n' tie: extends the previous note by n steps
    if(m[1]){for(let k=0;k<w;k++)ev.push(null);last=null;continue;}                  // '.' / '.:n' rest of n steps
    let oct=0;for(let k=0;k<m[5].length;k++)oct+=m[5][k]===','?-1:1;
    const v=m[6]==='!'?1:m[6]==='~'?0.5:0.8;
    let e;
    if(m[2])e={t:m[2]==='C'?'c':'b',d:1,acc:0,oct,v,len:w};
    else{let acc=0;for(let k=0;k<m[3].length;k++)acc+=m[3][k]==='#'?1:-1;e={t:'n',d:parseInt(m[4],10),acc,oct,v,len:w};}
    ev.push(e);last=e;
    for(let k=1;k<w;k++)ev.push(null);   // ':n' occupies n steps
  }
  return PCACHE['M'+str]=c={len:ev.length,ev,bad};
}

/* ------------------------------------------------------------------ cue normalisation */
const STEMS=['pad','bass','arp','lead','drums','perc','choir'];
const DEFSTEM={
  pad:{inst:'pad_strings',reg:'C3',ref:'chord',gain:0.5,rev:0.3,prio:1,voices:4},
  bass:{inst:'bass_saw',reg:'C2',ref:'chord',gain:0.8,rev:0.05,prio:1},
  arp:{inst:'pluck',reg:'C4',ref:'chord',gain:0.4,gate:0.8,rev:0.22,dly:0.2,prio:0.4},
  lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.25,dly:0.1,prio:0.9},
  drums:{inst:'',kind:'lanes',reg:'C2',gain:0.8,rev:0.08,prio:0.95},
  perc:{inst:'',kind:'lanes',reg:'C2',gain:0.6,rev:0.12,prio:0.6},
  choir:{inst:'choir_aah',reg:'C3',ref:'chord',gain:0.4,rev:0.4,prio:0.6,voices:3},
  _:{inst:'pluck',reg:'C4',ref:'chord',gain:0.5,rev:0.2,prio:0.5}
};
const SKEYS={p:1,lanes:1,era:1,int:1,night:1,oct:1,vel:1,inst:1,gate:1,ref:1,sustain:1,voices:1};
function mkEntry(o,ctx){
  const e={pats:[],lanes:null,sustain:false,era:o.era||null,int:o.int||null,night:o.night||null,oct:o.oct|0,vel:o.vel===undefined?1:o.vel,inst:o.inst||null,gate:o.gate===undefined?1:o.gate,ref:o.ref||null,voices:o.voices|0};
  if(o.lanes){
    e.lanes=Object.keys(o.lanes).map(name=>{const ps=[].concat(o.lanes[name]).map(compLane);for(const p of ps)if(p.bad)ctx.w('lane "'+name+'" has '+p.bad+' unknown character(s)');return{name,pats:ps};});
  }else{
    const ps=[].concat(o.p===undefined?[]:o.p);
    for(const s of ps){
      if(s==='chord'){e.sustain=true;continue;}
      if(typeof s!=='string'){ctx.w('pattern is not a string');continue;}
      const c=compMel(s);if(c.bad)ctx.w('pattern "'+s.slice(0,40)+'" has '+c.bad+' unknown token(s)');e.pats.push(c);
    }
  }
  return e;
}
function normPlay(raw,ctx){
  if(raw==null||raw===false)return[];
  if(typeof raw==='string')return[mkEntry({p:raw},ctx)];
  if(Array.isArray(raw)){
    if(!raw.length)return[];
    if(typeof raw[0]==='string')return[mkEntry({p:raw},ctx)];
    let out=[];for(const r of raw)out=out.concat(normPlay(r,ctx));return out;
  }
  if(typeof raw==='object'){
    if(raw.p!==undefined||raw.lanes!==undefined||raw.sustain)return[mkEntry(raw.sustain&&raw.p===undefined?Object.assign({},raw,{p:'chord'}):raw,ctx)];
    const lanes={},rest={};let any=false;
    for(const k of Object.keys(raw)){if(SKEYS[k])rest[k]=raw[k];else{lanes[k]=raw[k];any=true;}}
    if(any)return[mkEntry(Object.assign(rest,{lanes}),ctx)];
  }
  ctx.w('unusable play entry');return[];
}
function curveOf(st){
  if(Array.isArray(st.mix)&&st.mix.length)return st.mix.map(p=>[+p[0],+p[1]]).sort((a,b)=>a[0]-b[0]);
  if(Array.isArray(st.on)){const a=+st.on[0],b=+st.on[1];return[[0,0],[a,0],[Math.max(b,a+0.001),1],[1,1]];}
  return[[0,1],[1,1]];
}
function curveAt(c,x){
  if(x<=c[0][0])return c[0][1];
  for(let i=1;i<c.length;i++)if(x<=c[i][0]){const a=c[i-1],b=c[i],t=b[0]>a[0]?(x-a[0])/(b[0]-a[0]):1;return a[1]+(b[1]-a[1])*t;}
  return c[c.length-1][1];
}
function normStem(name,raw,N){
  const d=Object.assign({},DEFSTEM[name]||DEFSTEM._,raw||{}),reg=midiOf(d.reg);
  if(!isNum(reg))N.w('stem '+name+': bad reg "'+d.reg+'"');
  return{name,inst:d.inst||'',kind:d.kind||(name==='drums'||name==='perc'?'lanes':'notes'),reg:isNum(reg)?reg:48,ref:d.ref==='scale'?'scale':'chord',gain:d.gain,gate:d.gate===undefined?0.9:d.gate,
    pan:d.pan||0,spread:d.spread||0,rev:d.rev||0,room:d.room||'hall',dly:d.dly||0,prio:d.prio===undefined?0.5:d.prio,voices:d.voices||4,swing:d.swing,
    curve:curveOf(d),eraGain:Array.isArray(d.eraGain)&&d.eraGain.length===3?d.eraGain:null,nightGain:d.nightGain===undefined?1:d.nightGain,nightOct:d.nightOct|0,
    kit:d.kit||EMPTY,p:d.p||EMPTY,strum:d.strum||0,human:d.human===undefined?(d.kind==='lanes'||name==='drums'||name==='perc'?0.003:0.006):d.human};
}
function parseChordList(spec,bars,spb,w){
  let list=spec;if(typeof list==='string')list=list.trim().split(/\s+/);
  if(!Array.isArray(list)||!list.length)return null;
  const total=bars*spb,chords=[],at=new Int16Array(total),start=new Uint8Array(total),len=[];let pos=0,guard=0;
  while(pos<total&&guard++<512){
    for(let i=0;i<list.length&&pos<total;i++){
      const m=/^(.*?)(?:@([\d.]+))?$/.exec(String(list[i]));
      const ch=parseChord(m[1]);if(ch.bad)w('chord "'+m[1]+'" is not understood');
      const nb=m[2]?parseFloat(m[2]):1,steps=Math.max(1,Math.round(nb*spb));
      const ci=chords.length;chords.push(ch);len.push(Math.min(steps,total-pos));start[pos]=1;
      for(let k=0;k<steps&&pos+k<total;k++)at[pos+k]=ci;
      pos+=steps;
    }
    if(pos<total&&guard===1)w('chord list covers fewer bars than the section: repeating');
  }
  return{chords,at,start,len};
}
const NCACHE={};
function norm(id){
  const raw=MUSIC_DATA[id];if(!raw||typeof raw!=='object')return null;
  const hit=NCACHE[id];if(hit&&hit.raw===raw)return hit;
  const N={id,raw,warn:[],w(m){N.warn.push(m);warn(id+': '+m);}};
  try{
    N.tempo=+raw.tempo||+raw.bpm||100;
    N.tempoEra=Array.isArray(raw.tempoEra)&&raw.tempoEra.length===3?raw.tempoEra.map(Number):null;
    N.meter=Array.isArray(raw.meter)?[raw.meter[0]|0||4,raw.meter[1]|0||4]:[(raw.beats|0)||4,(raw.beatUnit|0)||4];
    N.grid=raw.grid|0||16;N.swing=raw.swing||0;
    N.key=raw.key||'C';N.tonic=pcOf(N.key);if(N.tonic<0){N.w('bad key "'+raw.key+'"');N.tonic=0;}
    N.mode=raw.mode||'major';N.scale=scaleFor(N.mode,raw.scale);
    N.loop=!!raw.loop;N.loopFrom=raw.loopFrom|0;N.tail=raw.tail===undefined?2.5:raw.tail;N.gain=raw.gain===undefined?1:raw.gain;N.sting=!!raw.sting;N.duck=raw.duck===undefined?0.35:raw.duck;N.room=raw.room||'hall';
    N.fadeIn=raw.fadeIn;N.dlyBeats=raw.dly===undefined?0.75:raw.dly;N.dlyFb=raw.dlyFb===undefined?0.34:raw.dlyFb;
    N.stems={};N.order=[];
    const sdef=raw.stems||{};
    N.sections=[];
    const rs=Array.isArray(raw.sections)?raw.sections:[];
    if(!rs.length)N.w('no sections');
    let prevChords=null;
    for(let si=0;si<rs.length;si++){
      const r=rs[si],S={name:r.name||('s'+si),bars:Math.max(1,r.bars|0||4)};
      S.meter=Array.isArray(r.meter)?[r.meter[0]|0||4,r.meter[1]|0||4]:N.meter;
      S.spb=Math.max(1,Math.round(S.meter[0]*N.grid/S.meter[1]));S.q=S.meter[0]*4/S.meter[1];   // steps per bar, quarter notes per bar
      S.tempoMul=r.tempoMul||1;
      S.key=r.key||N.key;S.tonic=r.key?pcOf(r.key):N.tonic;if(S.tonic<0){N.w('section '+S.name+': bad key "'+r.key+'"');S.tonic=N.tonic;S.key=N.key;}
      S.mode=r.mode||N.mode;S.scale=(r.mode||r.scale)?scaleFor(r.mode||N.mode,r.scale):N.scale;   // a section may modulate / change mode (stems with ref:'scale', timpani tuning and motifs follow)
      const sw=(m)=>N.w('section '+S.name+': '+m);
      let cl0=parseChordList(r.chords,S.bars,S.spb,sw);
      if(!cl0){if(prevChords&&prevChords.fits===S.bars*S.spb)cl0=prevChords;else{sw('no chords: the tonic triad is used');const t=N.scale,rt=(N.tonic+0)%12,tri=[0,t[2%t.length]-t[0],t[4%t.length]-t[0]];
        cl0=parseChordList([parseChord('C').sym],S.bars,S.spb,sw);cl0.chords=[{sym:'tonic',root:rt,iv:tri,bass:null}];}}
      cl0.fits=S.bars*S.spb;prevChords=cl0;
      S.chords=cl0.chords;S.chordAt=cl0.at;S.chordStart=cl0.start;S.chordLen=cl0.len;
      S.mix=r.mix||EMPTY;S.inst=r.inst||EMPTY;S.play={};
      const pl=r.play||{};
      for(const sn of Object.keys(pl)){
        if(!N.stems[sn]){N.stems[sn]=normStem(sn,sdef[sn],N);N.order.push(sn);}
        const ents=normPlay(pl[sn],{w:m=>N.w('section '+S.name+' stem '+sn+': '+m)});
        for(const e of ents){
          const chk=(c,what)=>{if(c.len>0&&c.len%S.spb!==0&&S.spb%c.len!==0)N.w('section '+S.name+' stem '+sn+': '+what+' of '+c.len+' steps does not fit a bar of '+S.spb+' steps');else if(c.len>S.spb&&(S.bars*S.spb)%c.len!==0)N.w('section '+S.name+' stem '+sn+': '+what+' of '+c.len+' steps does not divide the section ('+S.bars*S.spb+' steps)');else if(c.len>S.bars*S.spb)N.w('section '+S.name+' stem '+sn+': '+what+' of '+c.len+' steps is longer than the section');};
          for(const c of e.pats)chk(c,'pattern');if(e.lanes)for(const l of e.lanes)for(const c of l.pats)chk(c,'lane "'+l.name+'"');
          const uses=e.inst||S.inst[sn]||N.stems[sn].inst;
          if(!e.lanes&&!e.sustain&&!e.pats.length)N.w('section '+S.name+' stem '+sn+': empty entry');
          if(!e.lanes&&uses&&!INST[uses]&&!(MUSIC.lateInst&&MUSIC.lateInst[uses]))N.w('section '+S.name+' stem '+sn+': unknown instrument "'+uses+'"');
        }
        S.play[sn]=ents;
      }
      S.motifs=[];
      for(const m of(r.motifs||[])){
        if(!m||!m.id){N.w('section '+S.name+': motif without id');continue;}
        const sn=m.stem||'lead';if(!N.stems[sn]){N.stems[sn]=normStem(sn,sdef[sn],N);N.order.push(sn);}
        S.motifs.push({id:m.id,bar:m.bar||0,beat:m.beat||0,stem:sn,inst:m.inst||null,key:m.key||null,mode:m.mode||null,oct:m.oct|0,transpose:m.transpose|0,vel:m.vel===undefined?1:m.vel,rate:m.rate||1,gate:m.gate});
      }
      N.sections.push(S);
    }
    for(const sn of Object.keys(sdef))if(!N.stems[sn]){N.stems[sn]=normStem(sn,sdef[sn],N);N.order.push(sn);}
    N.order.sort((a,b)=>N.stems[b].prio-N.stems[a].prio);
    let bars=0,q=0;for(const S of N.sections){bars+=S.bars;q+=S.bars*S.q/S.tempoMul;}
    N.bars=bars;N.loopLen=q*60/N.tempo;                       // seconds at the nominal tempo
    const vc=typeof MUSIC_CUES!=='undefined'?MUSIC_CUES[id]:null;N.len=vc?vc.len:N.loopLen;
    N.ok=N.sections.length>0;
  }catch(e){N.ok=false;N.w('normalisation threw: '+(e&&e.message||e));}
  return NCACHE[id]=N.ok?N:(N.sections=[],N);
}
function infoOf(id){
  const N=norm(id);if(!N||!N.ok)return null;
  return{id,tempo:N.tempo,bpm:N.tempo,tempoEra:N.tempoEra,beats:N.meter[0],meter:N.meter.slice(),key:N.key,mode:N.mode,loop:N.loop,sting:N.sting,len:N.len,loopLen:N.loopLen,bars:N.bars,
    sections:N.sections.map(s=>({name:s.name,bars:s.bars,meter:s.meter.slice(),key:s.key,mode:s.mode,seconds:s.bars*s.q*60/N.tempo/s.tempoMul})),stems:N.order.slice(),warnings:N.warn.slice()};
}

/* ------------------------------------------------------------------ instruments
   INST[name](n) -> layers[] for KIT.layer.  n = {f (Hz), midi, dur (gate s), vel 0..1, art, key (tonic pitch class), pr (stem params), hzT(semitones,octave), rng}.
   Rules: every layer carries an explicit `dur` (>= n.dur + its release), no `send`/`pan` (the stem owns reverb/delay/pan), attack >= 2 ms. */
const O=(type,f,o)=>Object.assign({k:'osc',type,f},o);
const NZ=(color,o)=>Object.assign({k:'noise',color},o);
const FMo=(f,ratio,idx,o)=>Object.assign({k:'fm',f,ratio,idx},o);
const LP=(f0,f1,t,q)=>{const o={type:'lp',f0};if(f1)o.f1=f1;if(t)o.t=t;if(q)o.q=q;return o;};
const HP=(f0,f1,t,q)=>{const o={type:'hp',f0};if(f1)o.f1=f1;if(t)o.t=t;if(q)o.q=q;return o;};
const BP=(f0,q,f1,t)=>{const o={type:'bp',f0,q:q||1};if(f1)o.f1=f1;if(t)o.t=t;return o;};
const pr=(n,k,d)=>n.pr&&n.pr[k]!==undefined?n.pr[k]:d;
Object.assign(INST,{
  /* --- pads, strings, choir. One source node per note unless stated: the cue has to fit AUD.capMusic = 24 nodes (the pad is the longest-lived layer, so it is the leanest) */
  pad_strings:n=>{const R=0.5,a=0.5;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a,d:0.5,s:0.8,r:R},filter:LP(800,2100,a+0.4,0.7),gain:0.45})];},
  pad_warm:n=>{const R=0.5,a=0.55;return[{k:'osc',harm:[1,0.3,0.16,0.07],f:n.f,dur:n.dur+R,env:{a,d:0.6,s:0.85,r:R},filter:LP(1800,0,0,0.6),gain:0.55}];},
  pad_dark:n=>{const R=0.55,a=0.7;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a,d:0.8,s:0.85,r:R},filter:LP(380,900,a+0.6,0.9),gain:0.5})];},
  pad_air:n=>{const R=0.7,a=0.9;return[{k:'osc',harm:[1,0.12,0.2,0.05],f:n.f,dur:n.dur+R,env:{a,d:0.9,s:0.8,r:R},filter:[HP(160),LP(3400,0,0,0.6)],gain:0.55}];},
  strings:n=>{const R=0.35,a=0.09;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a,d:0.2,s:0.75,r:R},filter:LP(1200+1400*n.vel,0,0,0.7),vib:{f:5.2,cents:9},gain:0.4})];},   // 2 nodes (carrier + vibrato LFO)
  choir_aah:n=>{const R=0.6,a=0.5;return[{k:'formant',src:'sawtooth',f:n.f,vowel:pr(n,'vowel','a'),to:pr(n,'to','o'),morph:n.dur,dur:n.dur+R,env:{a,d:0.4,s:0.8,r:R},gain:0.55}];},
  choir_ooh:n=>{const R=0.6,a=0.6;return[{k:'formant',src:'sawtooth',f:n.f,vowel:'o',to:'u',morph:n.dur,dur:n.dur+R,env:{a,d:0.4,s:0.8,r:R},gain:0.55}];},
  chant:n=>{const d=Math.max(0.12,Math.min(n.dur,0.4));return[{k:'formant',src:'sawtooth',f:n.f,vowel:pr(n,'vowel','o'),to:pr(n,'to','a'),morph:d,scale:pr(n,'scale',0.9),dur:d+0.1,env:{a:0.025,d:d,s:0},gain:0.8},NZ('white',{dur:0.07,env:{d:0.06},filter:BP(2200,1.2),gain:0.1})];},
  /* --- brass, winds, leads (one detune-free sawtooth through a sweeping low-pass: the brass identity is the filter attack, not the unison) */
  brass:n=>{const a=0.045,R=0.16,v=n.vel;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a,d:0.14,s:0.7,r:R},filter:LP(500+500*v,1400+3200*v,a+0.1,1.2),drive:0.22,gain:0.55})];},
  horn:n=>{const a=0.07,R=0.2;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a,d:0.2,s:0.7,r:R},filter:LP(450+300*n.vel,1100+1200*n.vel,a+0.12,0.9),gain:0.55})];},
  brass_stab:n=>{const R=0.1,v=n.vel,d=Math.min(n.dur,0.35);return[O('sawtooth',n.f,{detune:6,dur:d+R,env:{a:0.012,d:d,s:0},filter:LP(700+600*v,2600+2600*v,0.07,1.3),drive:0.3,gain:0.62})];},
  flute:n=>{const R=0.15;return[{k:'osc',harm:[1,0.16,0.05],f:n.f,dur:n.dur+R,env:{a:0.06,d:0.1,s:0.85,r:R},vib:{f:5.4,cents:14},gain:0.55},NZ('pink',{dur:0.14,env:{a:0.03,d:0.1},filter:BP(n.f*2,3),gain:0.1})];},
  lead_saw:n=>{const R=0.12;return[O('sawtooth',n.f,{detune:5,dur:n.dur+R,env:{a:0.012,d:0.2,s:0.7,r:R},filter:LP(900+2200*n.vel,0,0,1.2),gain:0.45})];},
  lead_square:n=>{const R=0.1;return[O('square',n.f,{dur:n.dur+R,env:{a:0.01,d:0.15,s:0.65,r:R},filter:LP(1400+1800*n.vel,0,0,0.9),gain:0.34})];},
  lead_dist:n=>{const R=0.1;return[O('sawtooth',n.f,{dur:n.dur+R,env:{a:0.01,d:0.2,s:0.7,r:R},filter:LP(1100+1500*n.vel,0,0,1.4),drive:0.75,gain:0.42})];},
  lead_bell:n=>{const rg=pr(n,'ring',1.0);return[FMo(n.f,3.5,{from:1.8,to:0.04,t:rg},{dur:rg+0.2,env:{a:0.004,d:rg},gain:0.5})];},
  /* --- plucks, bells, mallets */
  pluck:n=>[{k:'pluck',f:n.f,t60:pr(n,'t60',0.5),damp:pr(n,'damp',0.45),bright:pr(n,'bright',0.6),dur:0.6,gain:0.9}],
  harp:n=>[{k:'pluck',f:n.f,t60:0.8,damp:0.3,bright:0.75,dur:0.8,gain:0.85}],
  pluck_sq:n=>[O('square',n.f,{dur:Math.min(0.35,n.dur+0.08),env:{a:0.003,d:Math.min(0.35,n.dur+0.05)},filter:LP(2600*(0.5+n.vel*0.7),500,0.2,1.4),gain:0.4})],
  bell:n=>{const rg=pr(n,'ring',0.8);return[FMo(n.f,pr(n,'ratio',3.5),{from:pr(n,'idx',2.6),to:0.05,t:rg*0.8},{dur:rg+0.1,env:{a:0.003,d:rg},gain:0.55})];},
  glass:n=>{const rg=pr(n,'ring',1.1);return[FMo(n.f,2.0,{from:1.2,to:0.02,t:rg*0.9},{dur:rg+0.1,env:{a:0.005,d:rg},gain:0.6})];},
  marimba:n=>[{k:'pluck',mode:'modal',f:n.f,ratios:[1,3.93],t60:0.55,tilt:0.35,damp:2.5,dur:0.7,gain:0.75}],
  kalimba:n=>[{k:'pluck',mode:'modal',f:n.f,ratios:[1,5.4],t60:0.9,tilt:0.3,damp:3,dur:1.0,gain:0.65}],
  /* --- basses */
  bass_saw:n=>{const R=0.1,d=Math.max(n.dur,0.1);return[{k:'osc',harm:[1,0.5,0.33,0.25,0.2,0.16,0.13,0.11],f:n.f,dur:d+R,env:{a:0.008,d:0.3,s:0.55,r:R},filter:LP(240+520*n.vel,0,0,1.0),gain:0.62}];},
  bass_sub:n=>{const R=0.15,d=Math.max(n.dur,0.15);return[{k:'osc',harm:[1,0.14],f:n.f,dur:d+R,env:{a:0.03,d:0.2,s:0.85,r:R},gain:0.8}];},
  bass_dist:n=>{const R=0.07,d=Math.max(n.dur,0.08);return[O('sawtooth',n.f,{dur:d+R,env:{a:0.005,d:0.18,s:0.55,r:R},filter:LP(380+420*n.vel,0,0,1.1),drive:0.85,gain:0.42}),O('sine',n.f*0.5,{dur:d+R,env:{a:0.006,d:0.2,s:0.8,r:R},gain:0.5})];},
  bass_pulse:n=>{const R=0.05,d=Math.max(0.06,Math.min(n.dur,0.2));return[{k:'osc',harm:[1,0,0.33,0,0.2,0,0.14],f:n.f,dur:d+R,env:{a:0.004,d:d,s:0.3,r:R},filter:LP(500+700*n.vel,160,0.2,1.2),gain:0.55}];},
  /* --- metallic hits */
  stab_metal:n=>{const d=Math.min(0.3,n.dur+0.1);return[FMo(n.f,2.756,{from:3.6,to:0.25,t:d},{dur:d+0.05,env:{a:0.003,d:d},drive:0.35,gain:0.6})];},
  anvil:n=>[{k:'pluck',mode:'modal',f:n.f,ratios:[1,2.76,5.4],t60:0.5,tilt:0.6,damp:1.4,dur:0.55,gain:0.5}],
  clang:n=>[FMo(n.f||330,1.414,{from:5,to:0.5,t:0.4},{dur:0.5,env:{a:0.002,d:0.45},gain:0.45,rm:{f:(n.f||330)*1.61,depth:0.7}})],
  /* --- drums (percussion is synthesised hit by hit: the transient noise of kicks and toms is replaced by a drive on the pitch sweep, so most hits cost one node) */
  kick:n=>[O('sine',50,{pitch:{from:pr(n,'f0',160),to:pr(n,'f1',46),t:0.1},dur:0.3,env:{a:0.002,d:0.26},drive:0.3,gain:1.0})],
  kick_deep:n=>[O('sine',44,{pitch:{from:130,to:38,t:0.16},dur:0.5,env:{a:0.002,d:0.45},drive:0.25,gain:1.0})],
  kick_soft:n=>[O('sine',54,{pitch:{from:110,to:48,t:0.1},dur:0.3,env:{a:0.004,d:0.26},gain:0.9})],
  snare:n=>{
    if(n.art==='roll')return[NZ('white',{dur:n.dur+0.12,env:{a:0.04,d:n.dur,s:0.6,r:0.1},filter:[HP(900),BP(2300,0.7)],trem:{f:26,depth:0.85},gain:0.6})];
    return[NZ('white',{dur:0.2,env:{a:0.002,d:0.17},filter:[HP(850),BP(2300,0.7)],gain:0.8}),O('triangle',190,{pitch:{from:270,to:170,t:0.05},dur:0.12,env:{a:0.002,d:0.1},gain:0.5})];},
  snare_rim:n=>[O('square',420,{dur:0.05,env:{a:0.002,d:0.045},filter:BP(1700,1.4),gain:0.4}),NZ('white',{dur:0.06,env:{a:0.002,d:0.05},filter:HP(2500),gain:0.4})],
  clap:n=>[NZ('white',{dur:0.22,env:{a:0.004,d:0.2},filter:BP(1500,1.0),gain:0.75}),NZ('white',{delay:0.014,dur:0.18,env:{a:0.003,d:0.15},filter:BP(1850,1.0),gain:0.6})],
  hat:n=>[NZ('white',{dur:0.06,env:{a:0.002,d:0.05},filter:HP(7200),gain:0.4})],
  hat_o:n=>[NZ('white',{dur:0.26,env:{a:0.002,d:0.24},filter:HP(6500),gain:0.35})],
  shaker:n=>[NZ('white',{dur:0.09,env:{a:0.012,d:0.07},filter:[HP(5000),BP(8000,0.8)],gain:0.35})],
  ride:n=>[FMo(420,2.7,{from:4,to:1.2,t:0.4},{dur:0.5,env:{a:0.002,d:0.45},filter:HP(2500),gain:0.22})],
  crash:n=>[NZ('white',{dur:1.6,env:{a:0.003,d:1.4},filter:[HP(3000),BP(7000,0.5)],gain:0.6})],
  tamb:n=>[NZ('white',{dur:0.09,env:{a:0.002,d:0.08},filter:BP(6500,2.2),gain:0.45})],
  tom_hi:n=>tomFn(n,n.hzT(7,3),0.32),tom_mid:n=>tomFn(n,n.hzT(0,3),0.4),tom_lo:n=>tomFn(n,n.hzT(7,2),0.5),tom_r:n=>tomFn(n,n.hzT(0,2),0.55),
  timp1:n=>timpFn(n,n.hzT(0,2)),timp4:n=>timpFn(n,n.hzT(5,2)),timp5:n=>timpFn(n,n.hzT(7,1)),
  taiko:n=>{const f=n.hzT(0,1);return[{k:'osc',harm:[1,0.3,0.12],f,pitch:{from:f*1.8,to:f,t:0.07},dur:0.7,env:{a:0.003,d:0.6},gain:1.0},NZ('pink',{dur:0.1,env:{a:0.002,d:0.08},filter:LP(1200),gain:0.55})];},
  taiko_hi:n=>{const f=n.hzT(0,2);return[{k:'osc',harm:[1,0.25],f,pitch:{from:f*1.7,to:f,t:0.05},dur:0.45,env:{a:0.003,d:0.4},gain:0.9},NZ('pink',{dur:0.07,env:{a:0.002,d:0.06},filter:LP(2200),gain:0.5})];},
  sub_hit:n=>[O('sine',n.hzT(0,1)*0.5,{pitch:{from:n.hzT(0,1),to:n.hzT(0,1)*0.5,t:0.25},dur:1.2,env:{a:0.004,d:1.1},gain:1.0}),NZ('brown',{dur:0.3,env:{a:0.004,d:0.28},filter:LP(300),gain:0.5})],
  riser:n=>[NZ('white',{dur:n.dur,env:{a:n.dur*0.9,d:n.dur*0.1+0.05},filter:BP(400,1.2,6000,n.dur),gain:0.5})],
  swell:n=>[NZ('pink',{dur:n.dur+0.3,env:{a:n.dur*0.8,d:n.dur*0.2+0.2},filter:LP(300,3500,n.dur),gain:0.5})]
});
function tomFn(n,f,d){return[O('sine',f,{pitch:{from:f*1.5,to:f,t:0.06},dur:d+0.1,env:{a:0.003,d:d},drive:0.2,gain:0.9})];}
function timpFn(n,f){return[{k:'osc',harm:[1,0.32,0.12],f,pitch:{from:f*1.18,to:f,t:0.1},dur:0.85,env:{a:0.004,d:0.8},gain:0.95},NZ('pink',{dur:0.06,env:{a:0.003,d:0.05},filter:LP(700),gain:0.5})];}
function estLayer(L){
  const k=L.k||'osc';let n=1;
  if(k==='osc'){n=L.unison?Math.max(1,L.unison.n|0):1;if(L.vib)n++;}else if(k==='fm')n=2;else if(k==='pluck'&&L.mode==='modal')n=L.n||(L.ratios?L.ratios.length:5);else if(k==='formant'&&L.vib)n=2;
  if(L.rm)n++;if(L.trem)n++;return n;
}

/* ------------------------------------------------------------------ scene (intensity / night / era), shared by the live score and the director */
const SC={t:{int:0.3,night:0,era:1,faction:null,mood:null},cur:{int:0.3,night:0,era:1},sustainEra:1};
const MOODS={calm:{i:0.15,n:0},tension:{i:0.5},battle:{i:0.9},dread:{i:0.55,n:0.9},victory:{i:0.4,n:0}};
const CUEMOOD={heroic:{i:0.7},aggressive:{i:0.9},ethereal:{i:0.35},epic:{i:0.8},warm:{i:0.2},uneasy:{i:0.45,n:0.4},tense:{i:0.6},dark:{i:0.5,n:0.8},menacing:{i:0.75,n:0.6},resolute:{i:0.6},
  driving:{i:0.9},sorrow:{i:0.15,n:0.5},shock:{i:0.8},tender:{i:0.1},relief:{i:0.3},triumph:{i:0.85},reflective:{i:0.15},rise:{i:0.6}};
function setScene(s){
  const T=SC.t;if(!s||typeof s!=='object')return Object.assign({},T);
  let mi=null,mn=null;
  if(s.mood!==undefined){T.mood=s.mood==='none'||s.mood==null?null:s.mood;const m=MOODS[T.mood];if(m){mi=m.i;mn=m.n;}}
  if(isNum(s.intensity))T.int=cl(s.intensity,0,1);else if(mi!==null)T.int=mi;
  if(isNum(s.night))T.night=cl(s.night,0,1);else if(mn!==null&&mn!==undefined)T.night=mn;
  if(isNum(s.era))T.era=cl(Math.round(s.era),1,3);
  if(s.faction!==undefined)T.faction=s.faction||null;
  if(s.snap){SC.cur.int=T.int;SC.cur.night=T.night;SC.cur.era=T.era;}
  return Object.assign({},T);
}
function smoothScene(dt){
  const T=SC.t,C=SC.cur;
  const ka=1-Math.exp(-dt/(T.int>C.int?1.0:4.5)),kn=1-Math.exp(-dt/3);
  C.int+=(T.int-C.int)*ka;C.night+=(T.night-C.night)*kn;C.era=T.era;
}

/* ------------------------------------------------------------------ player: one cue being scheduled onto a graph (live handle or offline context) */
let SERIAL=0;
const into=(A,node)=>{A.out=node;return A.out;};   // live: the node itself; offline: a unity leaf (bit-exact mixing, see 80_audio.js leaf())
function keyTone(P){return(semi,oct)=>hzOf(12*(oct+1)+P.S.tonic+semi);}
function mkPlayer(A,N,o){
  const x=A.ctx,live=!A.off,P={id:N.id,N,A,x,live,serial:++SERIAL,sec:o.sec||0,bar:0,step:0,secStep:0,loops:0,t0:o.t0,nextTime:o.t0,nextBarT:o.t0,barT:o.t0,bpm:0,bpmT:0,sd:0.1,
    evq:[],rel:[],act:[],lead:LEAD,budget:o.budget>0?o.budget:BUDGET,peakSound:0,madeSum:0,madeN:0,madeHist:{},ended:false,done:false,killT:0,endT:0,fading:false,stem:{},stemOrder:[],vol:o.vol===undefined?1:o.vol,sting:!!o.sting,nc:0,solo:o.solo||null,mute:o.mute||null,
    scn:o.scn||null,sc:{int:SC.cur.int,night:SC.cur.night,era:SC.cur.era},S:null,dropped:0,peakEst:0,rng:mulberry32((KIT.hash(N.id)^Math.imul(o.seed|0,0x9E3779B1)^(live?Math.imul(SERIAL,7919):0))>>>0),
    nd:{f:0,midi:0,dur:0,vel:0,art:'',key:N.tonic,pr:EMPTY,rng:null,hzT:null,t:0},carry:0};
  P.nd.rng=P.rng;P.nd.hzT=keyTone(P);
  if(P.sec>=N.sections.length)P.sec=0;
  P.S=N.sections[P.sec];
  const t0=o.t0,fi=o.fadeIn>0?o.fadeIn:0;
  P.cg=x.createGain();P.cg.gain.setValueAtTime(fi>0?0:1,t0);if(fi>0)P.cg.gain.linearRampToValueAtTime(1,t0+fi);P.cg.connect(A.dest);
  P.cgR={};P.cgD=null;
  const tempo0=N.tempoEra?N.tempoEra[cl(P.sc.era,1,3)-1]:N.tempo;P.bpm=P.bpmT=tempo0*P.S.tempoMul;
  if(N.dlyBeats>0){const dly=60/P.bpm*N.dlyBeats;if(live)audioDelay('music',dly,N.dlyFb);else{A.cache.dlyT=dly;A.cache.dlyFb=N.dlyFb;}}
  for(const nm of N.order){
    const def=N.stems[nm],sm={name:nm,def,sg:x.createGain(),sel:null,target:0,last:-1,pn:null};
    sm.sg.gain.setValueAtTime(0,t0);
    let out=sm.sg;
    if(def.pan){const pn=x.createStereoPanner();pn.pan.value=cl(def.pan,-1,1);sm.sg.connect(pn);out=pn;}
    out.connect(into(A,P.cg));
    if(def.rev>0){
      const room=def.room||N.room;let rb=P.cgR[room];
      if(!rb){rb=P.cgR[room]=x.createGain();rb.gain.setValueAtTime(fi>0?0:1,t0);if(fi>0)rb.gain.linearRampToValueAtTime(1,t0+fi);rb.connect(KIT.rev(A,room));}
      sm.rs=x.createGain();sm.rs.gain.value=def.rev;out.connect(sm.rs);sm.rs.connect(into(A,rb));
    }
    if(def.dly>0){
      if(!P.cgD){P.cgD=x.createGain();P.cgD.gain.setValueAtTime(fi>0?0:1,t0);if(fi>0)P.cgD.gain.linearRampToValueAtTime(1,t0+fi);P.cgD.connect(KIT.dly(A));}
      sm.ds=x.createGain();sm.ds.gain.value=def.dly;out.connect(sm.ds);sm.ds.connect(into(A,P.cgD));
    }
    P.stem[nm]=sm;P.stemOrder.push(sm);
  }
  A.out=A.dest;
  return P;
}
function sceneFor(P,t){
  if(P.scn)return P.scn(t,P.sc);
  if(!P.live)return P.sc;   // offline with a fixed scene: the scene given to audioRender, never the live one
  const c=SC.cur;P.sc.int=c.int;P.sc.night=c.night;P.sc.era=c.era;return P.sc;
}
function stemLevel(P,sm,sc){
  const d=sm.def;let g=d.gain*curveAt(d.curve,sc.int);
  if(d.eraGain)g*=d.eraGain[cl(sc.era,1,3)-1];
  if(d.nightGain!==1)g*=mixv(1,d.nightGain,sc.night);
  const mm=P.S.mix[sm.name];if(mm!==undefined)g*=mm;
  if(P.solo&&P.solo.indexOf(sm.name)<0)g=0;if(P.mute&&P.mute.indexOf(sm.name)>=0)g=0;
  return g*P.N.gain*P.vol;
}
/* push the stem levels to the graph (live: smoothed toward the target; offline: automation from absolute time `at`) */
function applyLevels(P,sc,at,first){
  for(let i=0;i<P.stemOrder.length;i++){
    const sm=P.stemOrder[i],g=stemLevel(P,sm,sc);sm.target=g;
    if(Math.abs(g-sm.last)<0.003&&!first)continue;
    sm.last=g;const par=sm.sg.gain;
    if(first&&!P.live){par.setValueAtTime(g,at);}
    else if(P.live){const now=P.x.currentTime;par.cancelScheduledValues(now);par.setValueAtTime(par.value,now);par.setTargetAtTime(g,now,0.3);}
    else par.setTargetAtTime(g,at,0.25);
  }
}
function selectEntries(P,sm,sc){
  const list=P.S.play[sm.name];if(!list||!list.length)return null;
  const out=[];
  for(let i=0;i<list.length;i++){
    const e=list[i];
    if(e.era&&(sc.era<e.era[0]||sc.era>e.era[1]))continue;
    if(e.int&&(sc.int<e.int[0]||(e.int[1]>=1?sc.int>1:sc.int>=e.int[1])))continue;
    if(e.night&&(sc.night<e.night[0]||sc.night>e.night[1]))continue;
    out.push(e);
  }
  return out;
}
function enterBar(P){
  const sc=sceneFor(P,P.nextTime),S=P.S,N=P.N;
  if(P.secStep===0&&P.live===false&&P.scn===null){/* static offline scene: levels were set at build */}
  const era=cl(sc.era,1,3),tgt=(N.tempoEra?N.tempoEra[era-1]:N.tempo)*S.tempoMul;
  P.bpmT=tgt;P.bpm=P.live?P.bpm+cl(tgt-P.bpm,-1.5,1.5):tgt;
  P.sd=240/(P.bpm*N.grid);
  P.barT=P.nextTime;P.nextBarT=P.nextTime+S.spb*P.sd;
  if(P.live||P.scn)applyLevels(P,sc,P.nextTime,false);
  for(let i=0;i<P.stemOrder.length;i++)P.stemOrder[i].sel=selectEntries(P,P.stemOrder[i],sc);
  for(let i=0;i<S.motifs.length;i++){const m=S.motifs[i];if(Math.floor(m.bar)===P.bar)queueMotif(P,m,sc);}
}
function insertEv(P,ev){const q=P.evq;let i=q.length;while(i>0&&q[i-1].t>ev.t)i--;q.splice(i,0,ev);}
function queueMotif(P,m,sc){
  const fn=MOTIF[m.id];if(typeof fn!=='function'){if(!P.warned)P.warned={};if(!P.warned[m.id]){P.warned[m.id]=1;warn(P.id+': motif "'+m.id+'" is not registered');}return;}
  let res;
  try{res=fn(m.key||P.S.key,m.mode||P.S.mode,{inst:m.inst||P.stem[m.stem].def.inst,oct:m.oct,vel:m.vel,bpm:P.bpm,tempo:P.bpm,beat:60/P.bpm,stem:m.stem,era:sc.era,night:sc.night,intensity:sc.int});}
  catch(e){warn(P.id+': motif "'+m.id+'" threw '+(e&&e.message||e));return;}
  const notes=Array.isArray(res)?res:(res&&res.notes)||[];
  const inst=(res&&!Array.isArray(res)&&res.inst&&!m.inst)?res.inst:(m.inst||null);
  const q=60/P.bpm,t0=P.nextTime+(m.bar-P.bar)*P.S.spb*P.sd+m.beat*q;
  for(let i=0;i<notes.length;i++){
    const nt=notes[i];if(!nt)continue;
    const mid=midiOf(nt.n!==undefined?nt.n:nt.p);if(!isNum(mid))continue;
    insertEv(P,{t:t0+(+nt.b||0)*q/m.rate,stem:m.stem,inst,midi:mid+12*m.oct+m.transpose,dur:Math.max(0.05,(+nt.d||0.5)*q/m.rate*(m.gate||0.95)),vel:cl((nt.v===undefined?0.8:nt.v)*m.vel,0.05,1.2)});
  }
}
/* source nodes of this player that exist when a note starting at t is created: started on or before t and not yet ended (+ the creation lead: a node exists from MAKE seconds before it sounds until it ends) */
function conc(P,t,lead){let c=0;const a=P.act,ld=lead===undefined?P.lead:lead;for(let i=a.length-1;i>=0;i--){const e=a[i];if(e.e<t-3){a.splice(i,1);continue;}if(e.s<=t&&e.e+ld>t)c+=e.n;}return c;}
/* queue one note (the sequencer works LOOK s ahead; the audio nodes are only created MAKE s ahead, in flushQ) */
function emit(P,sm,instName,midi,f,t,dur,vel,art,pan){insertEv(P,{t,sm,inst:instName,midi,f,dur,vel,art,pan});}
/* build one note: instrument layers -> note bus -> stem. Admission is by priority against the number of source nodes that exist (cap AUD.capMusic = 24): a note that does not fit is dropped, lowest priority first */
function build(P,sm,instName,midi,f,t,dur,vel,art,pan){
  const fn=INST[instName];
  if(!fn){if(!P.missing)P.missing={};if(!P.missing[instName]){P.missing[instName]=1;warn(P.id+': unknown instrument "'+instName+'"');}return;}
  if(P.live){if(t<P.x.currentTime-0.02){STAT.late++;return;}}else if(t<0)t=0;   // humanised / flam hits before the start of an offline render land on 0
  const n=P.nd;n.f=f;n.midi=midi;n.dur=dur;n.vel=vel;n.art=art||'';n.pr=sm.def.p;n.t=t;n.key=P.S.tonic;
  const L=fn(n);if(!L||!L.length)return;
  let est=0,ld=0,st=0;   // est: source nodes of the whole note; st: the ones that start with it (later layers are accounted when they begin)
  for(let i=0;i<L.length;i++){const l=L[i],ne=estLayer(l),dl=l.delay||0;est+=ne;if(dl<0.03)st+=ne;const e=dl+(l.dur!==undefined?l.dur:dur);if(e>ld)ld=e;}
  const lim=P.budget*(0.55+0.45*sm.def.prio);
  const cc=conc(P,t);
  if(!P.live){const c0=conc(P,t,0)+st;if(c0>P.peakSound)P.peakSound=c0;P.madeSum+=cc+st;P.madeN++;const bk=Math.min(40,cc+st);P.madeHist[bk]=(P.madeHist[bk]||0)+1;}
  if(cc+st>lim){P.dropped++;STAT.dropped++;sm.dropped=(sm.dropped||0)+1;return;}
  if(cc+st>P.peakEst)P.peakEst=cc+st;
  if(P.live){const used=AUD.activeNodesMusic;if(used+est>AUD.capMusic){P.dropped++;STAT.dropped++;sm.dropped=(sm.dropped||0)+1;return;}if(used+est>STAT.peakNodes)STAT.peakNodes=used+est;}
  for(let i=0;i<L.length;i++){const l=L[i],dl=l.delay||0,ne=estLayer(l),e=dl+(l.dur!==undefined?l.dur:dur);P.act.push({s:t+dl,e:t+e,n:ne});sm.nodeSec=(sm.nodeSec||0)+ne*e;}
  const A=P.A,x=P.x,sc=P.sc;
  let nb;if(pan&&Math.abs(pan)>0.01){nb=x.createStereoPanner();nb.pan.value=cl(pan,-1,1);}else nb=x.createGain();
  const p=A.p;p.pitch=1;p.fmul=1-0.4*sc.night;p.variant=0;p.pan=0;
  A.out=nb;A.vg=vel;A.dur=dur;
  for(let i=0;i<L.length;i++)KIT.layer(A,t,L[i],p);
  nb.connect(into(A,sm.sg));
  if(P.live)P.rel.push({t:t+ld+0.4,nb});
  STAT.scheduled++;
}
function laneHit(P,sm,lane,ev,t){
  const inst=sm.def.kit[lane]||lane;if(!INST[inst]){emit(P,sm,inst,0,0,t,0,0);return;}
  const v=ev.v*(1+(P.rng()-0.5)*0.12),d=Math.max(0.05,P.sd*0.9);
  if(ev.art==='flam'){emit(P,sm,inst,0,0,t-0.03,d,v*0.45,'',0);}
  else if(ev.art==='drag'){emit(P,sm,inst,0,0,t-0.065,d,v*0.4,'',0);emit(P,sm,inst,0,0,t-0.032,d,v*0.5,'',0);}
  emit(P,sm,inst,0,0,t,d,v,ev.art==='roll'?'roll':'',0);
}
function patIdx(P,e,pats){
  if(pats.length>1){const c=pats[P.bar%pats.length];return{c,i:P.step%c.len};}
  const c=pats[0];return{c,i:P.secStep%c.len};
}
function instOf(P,sm,e){return e.inst||P.S.inst[sm.name]||sm.def.inst;}
function stepAt(P,t){
  const S=P.S,ci=S.chordAt[P.secStep],ch=S.chords[ci],cstart=S.chordStart[P.secStep]===1,sc=P.sc;
  for(let si=0;si<P.stemOrder.length;si++){
    const sm=P.stemOrder[si],sel=sm.sel;
    if(!sel||sm.target<0.012)continue;
    const d=sm.def,sw=d.swing!==undefined?d.swing:P.N.swing,tt=t+(sw&&(P.step&1)?sw*P.sd:0),hu=d.human;
    for(let k=0;k<sel.length;k++){
      const e=sel[k];
      if(e.sustain){if(cstart)chordHold(P,sm,e,ch,S.chordLen[ci],tt);continue;}
      if(e.lanes){
        for(let li=0;li<e.lanes.length;li++){const ln=e.lanes[li],pi=patIdx(P,e,ln.pats),ev=pi.c.ev[pi.i];if(ev)laneHit(P,sm,ln.name,ev,tt+(P.rng()-0.5)*hu);}
        continue;
      }
      if(!e.pats.length)continue;
      const pi=patIdx(P,e,e.pats),ev=pi.c.ev[pi.i];if(!ev)continue;
      const inst=instOf(P,sm,e),vel=ev.v*e.vel*(1+(P.rng()-0.5)*0.1),dur=Math.max(0.04,ev.len*P.sd*d.gate*e.gate),ts=tt+(P.rng()-0.5)*hu;
      const nsh=(d.nightOct&&sc.night>0.5)?12*d.nightOct:0,pan=d.spread?((P.nc++&1)?1:-1)*d.spread*(0.5+0.5*P.rng()):0;
      if(ev.t==='c'){
        const vs=voicingOf(ch,d.reg,e.voices||d.voices);
        for(let j=0;j<vs.length;j++){const m=vs[j]+12*e.oct+nsh;emit(P,sm,inst,m,hzOf(m),ts+j*d.strum,dur,vel,'',pan);}
        continue;
      }
      let m;
      if(ev.t==='b'){m=atOrAbove(ch.bass!==null?ch.bass:ch.root,d.reg);}
      else if((e.ref||d.ref)==='scale'){const tb=atOrAbove(S.tonic,d.reg),sl=S.scale,i=ev.d-1,o=Math.floor(i/sl.length),kk=((i%sl.length)+sl.length)%sl.length;m=tb+sl[kk]+12*o+ev.acc;}
      else{const rb=atOrAbove(ch.root,d.reg),iv=ch.iv,i=ev.d-1,o=Math.floor(i/iv.length),kk=i%iv.length;m=rb+iv[kk]+12*o+ev.acc;}
      m+=12*(ev.oct+e.oct)+nsh;
      emit(P,sm,inst,m,hzOf(m),ts,dur,vel,'',pan);
    }
  }
}
function chordHold(P,sm,e,ch,steps,t){
  const d=sm.def,inst=instOf(P,sm,e),vs=voicingOf(ch,d.reg,e.voices||d.voices),dur=steps*P.sd,nsh=(d.nightOct&&P.sc.night>0.5)?12*d.nightOct:0;
  for(let j=0;j<vs.length;j++){const m=vs[j]+12*e.oct+nsh;emit(P,sm,inst,m,hzOf(m),t+j*d.strum,dur,e.vel*0.9,'',d.spread?((j&1)?1:-1)*d.spread*0.7:0);}
}
function flushQ(P,limit){
  const q=P.evq;
  while(q.length&&q[0].t<limit){
    const ev=q.shift(),sm=ev.sm||P.stem[ev.stem];if(!sm||sm.target<0.012)continue;
    build(P,sm,ev.inst||sm.def.inst,ev.midi,ev.f!==undefined?ev.f:hzOf(ev.midi),ev.t,ev.dur,ev.vel,ev.art||'',ev.pan||0);
  }
}
function nextSection(P){
  const N=P.N;P.bar=0;P.secStep=0;P.sec++;
  if(P.sec>=N.sections.length){
    if(N.loop&&!P.once){P.sec=Math.min(N.loopFrom,N.sections.length-1);P.loops++;}
    else{P.ended=true;P.endT=P.nextTime;P.sec=N.sections.length-1;return;}
  }
  P.S=N.sections[P.sec];
}
/* schedule every step whose time is before `limit` */
function run(P,limit,mk){
  let guard=0;
  while(!P.ended&&P.nextTime<limit&&guard++<6000){
    if(P.step===0)enterBar(P);
    stepAt(P,P.nextTime);
    P.nextTime+=P.sd;P.step++;P.secStep++;
    if(P.step>=P.S.spb){P.step=0;P.bar++;if(P.bar>=P.S.bars)nextSection(P);}
  }
  flushQ(P,P.ended?Infinity:(P.live&&mk!==undefined?mk:limit));
}

/* ------------------------------------------------------------------ live: players, cross-fades, director */
const LIVE={players:[],main:null,manual:false,held:false,manualK:null,cue:null,pending:null,fallbackOf:null,lastScene:0,lastDirector:0,last:0,tickT:null,dimUntil:0};
let DKEY=undefined;
const matchKey=()=>(typeof G!=='undefined'&&G&&typeof ui!=='undefined'&&ui.running&&!ui.demo)?G:null;
function liveOK(){return typeof AC!=='undefined'&&AC&&AC.state!=='closed';}
function silent(){return muted||(typeof SET!=='undefined'&&SET.music<0.005);}
function fadeCG(P,to,at,sec){
  const gs=[P.cg];for(const k in P.cgR)gs.push(P.cgR[k]);if(P.cgD)gs.push(P.cgD);
  for(const g of gs){const par=g.gain;par.cancelScheduledValues(at);par.setValueAtTime(par.value,at);if(sec>0)par.linearRampToValueAtTime(to,at+sec);else par.setValueAtTime(to,at);}
}
function killPlayer(P){
  if(P.dead)return;P.dead=true;
  try{P.cg.disconnect();}catch(e){}for(const k in P.cgR)try{P.cgR[k].disconnect();}catch(e){}if(P.cgD)try{P.cgD.disconnect();}catch(e){}
  for(const sm of P.stemOrder){try{sm.sg.disconnect();}catch(e){}if(sm.pn)try{sm.pn.disconnect();}catch(e){}if(sm.rs)try{sm.rs.disconnect();}catch(e){}if(sm.ds)try{sm.ds.disconnect();}catch(e){}}
  for(const r of P.rel)try{r.nb.disconnect();}catch(e){}P.rel.length=0;
}
function stopPlayer(P,fade){
  if(P.fading)return;P.fading=true;P.ended=true;const now=AC.currentTime;
  fadeCG(P,0,now,Math.max(0.02,fade));P.killT=now+Math.max(0.02,fade)+0.7+(P.sting?0:0);
}
function startPlayer(N,o){
  const A=audioA('music');if(!A)return null;
  A.p.pitch=1;A.p.fmul=1;
  const now=AC.currentTime;let t0=o.at!==undefined?o.at:now+0.06;if(t0<now+0.03)t0=now+0.03;
  A.s=(KIT.hash(N.id)^Math.imul(++SERIAL,0x9E3779B1))|0;
  const P=mkPlayer(A,N,{t0,fadeIn:o.fadeIn,sec:o.sec,vol:o.vol,sting:o.sting});
  P.once=!!o.once;
  applyLevels(P,sceneFor(P,t0),t0,true);
  for(const sm of P.stemOrder){sm.sg.gain.cancelScheduledValues(t0);sm.sg.gain.setValueAtTime(0,t0);sm.sg.gain.setTargetAtTime(sm.target,t0,o.fadeIn>0?Math.max(0.1,o.fadeIn*0.4):0.15);}
  LIVE.players.push(P);STAT.started++;
  return P;
}
function resolveCue(id){
  let N=norm(id);if(N&&N.ok)return{N,fb:false,id};
  /* no data (yet): the faction theme stands in, scene derived from the cue's mood */
  const vc=typeof MUSIC_CUES!=='undefined'?MUSIC_CUES[id]:null,fac=(vc&&vc.faction)||SC.t.faction||(typeof SET!=='undefined'&&SET.faction)||'meridian';
  N=norm('theme_'+fac)||norm('theme_meridian');if(!N||!N.ok)return null;
  STAT.fallbacks++;return{N,fb:true,id,mood:vc&&vc.mood};
}
function play(id,o){
  o=o||{};
  const vc=typeof MUSIC_CUES!=='undefined'?MUSIC_CUES[id]:null,dat=MUSIC_DATA[id];
  if((vc&&vc.sting)||(dat&&dat.sting&&!o.main))return stinger(id,o);
  const r=resolveCue(id);if(!r)return false;
  const fromDirector=!!o.director;
  if(!fromDirector){LIVE.manual=true;LIVE.held=false;LIVE.manualK=matchKey();}
  if(!liveOK()||AC.state==='suspended'&&!AC.currentTime){LIVE.pending={id,o};return true;}
  if(r.fb&&r.mood&&CUEMOOD[r.mood]&&!o.keepScene){const m=CUEMOOD[r.mood];setScene({intensity:m.i,night:m.n||0,snap:true});}
  if(isNum(o.intensity)||isNum(o.night)||isNum(o.era)||o.mood)setScene(Object.assign({snap:true},o.scene,{intensity:o.intensity,night:o.night,era:o.era,mood:o.mood}));
  else if(o.scene)setScene(Object.assign({snap:true},o.scene));
  const cur=LIVE.main;
  let sec=0;if(o.section!==undefined&&o.section!==null){sec=typeof o.section==='number'?o.section:r.N.sections.findIndex(s=>s.name===o.section);if(sec<0)sec=0;}
  if(cur&&!cur.fading&&cur.id===r.N.id&&o.section==null&&!o.restart){LIVE.cue=id;return true;}
  const xf=o.crossfade!==false&&cur&&!cur.fading,fade=isNum(o.fade)?o.fade:(xf?1.4:0.5);
  let at;
  if(cur&&!cur.fading&&o.at==='bar'&&cur.nextBarT-AC.currentTime<4.5&&cur.nextBarT>AC.currentTime+0.05)at=cur.nextBarT;
  const P=startPlayer(r.N,{at,fadeIn:fade,sec,vol:o.vol,once:!r.N.loop||!!o.once});
  if(!P)return false;
  P.cueId=id;P.fb=r.fb;P.manual=!fromDirector;
  if(cur&&!cur.fading){fadeCG(cur,0,P.t0,Math.max(0.05,fade));cur.fading=true;cur.ended=true;cur.killT=P.t0+Math.max(0.05,fade)+0.8;}
  LIVE.main=P;LIVE.cue=id;
  return true;
}
function stinger(id,o){
  const N=norm(id);if(!N||!N.ok)return false;
  if(!liveOK()||muted)return false;
  const P=startPlayer(N,{fadeIn:0,vol:o&&o.vol,sting:true,once:true});if(!P)return false;
  P.cueId=id;
  const dk=N.duck;if(dk>0)audioDuck('music',dk,Math.min(8000,N.loopLen*1000));
  return true;
}
function stop(fade){
  LIVE.pending=null;
  const f=isNum(fade)?fade:0.8;
  for(const P of LIVE.players)if(!P.fading&&!P.sting)stopPlayer(P,f);
  LIVE.main=null;LIVE.cue=null;LIVE.manual=false;LIVE.held=true;
}
function tickPlayers(now){
  const lim=now+LOOK;
  for(let i=LIVE.players.length-1;i>=0;i--){
    const P=LIVE.players[i];
    if(P.dead){LIVE.players.splice(i,1);continue;}
    if(!P.fading&&!P.ended&&!silent()){
      try{
        P.sc.int=SC.cur.int;
        run(P,lim,now+MAKE);
      }catch(e){STAT.errors++;STAT.lastError=P.id+': '+(e&&e.message||e);}
    }else if(!P.fading&&!P.ended&&silent()){
      /* muted: keep the musical position moving without building nodes */
      let g=0;while(P.nextTime<lim&&!P.ended&&g++<2000){if(P.step===0){const sc=sceneFor(P,P.nextTime);P.bpm=P.bpmT;P.sd=240/(P.bpm*P.N.grid);P.nextBarT=P.nextTime+P.S.spb*P.sd;}P.nextTime+=P.sd;P.step++;P.secStep++;if(P.step>=P.S.spb){P.step=0;P.bar++;if(P.bar>=P.S.bars)nextSection(P);}}
    }
    if(P.ended&&!P.fading&&P.endT&&now>P.endT+P.N.tail+1.5){P.fading=true;P.killT=now+0.05;}   // a finished non-looping cue
    for(let k=P.rel.length-1;k>=0;k--)if(P.rel[k].t<now){try{P.rel[k].nb.disconnect();}catch(e){}P.rel.splice(k,1);}
    if(P.fading&&now>P.killT){
      killPlayer(P);LIVE.players.splice(i,1);
      if(LIVE.main===P){LIVE.main=null;LIVE.cue=null;if(P.manual)LIVE.manual=false;}
    }
  }
  const a=audioA('music');if(a)a.out=a.dest;
}
/* the cue the director wants: the menu / attract mode play `title` (resolveCue stands the faction theme in until that cue has data), a match plays the player's faction theme */
function wantCue(inMatch){
  if(!inMatch)return'title';
  const f=SC.t.faction||(G.teams[0]&&G.teams[0].faction)||'meridian';return'theme_'+f;
}
/* Director: once per SCENEMS it turns the match state into a scene {faction,era,intensity,night} and publishes it through the public musicScene(); it also fires the stingers
   (era up, victory / defeat, hero ready, base under attack). Read-only on G / ui. It runs even before the audio context exists (the scene is just numbers). */
const DIR={era:1,over:null,k:null,hero:false,alert:-99,alarmT:-99};
function director(){
  if(typeof G==='undefined'||typeof ui==='undefined')return;
  const k=matchKey();
  if(k!==DIR.k){
    DIR.k=k;LIVE.held=false;
    if(LIVE.manual&&LIVE.manualK!==k){LIVE.manual=false;}
    DIR.over=null;DIR.alarmT=-99;
    if(k){const T0=G.teams[0];DIR.era=T0.era||1;DIR.hero=!!(T0.hero&&T0.hero.alive);DIR.alert=G.lastAlertT;}else DIR.era=1;
  }
  if(LIVE.manual||LIVE.held)return;
  const inMatch=!!k,T=SC.t;let it,night=0,era=2,fac=T.faction;
  if(!inMatch){it=0.38;}
  else{
    const T0=G.teams[0];era=cl(T0.era||1,1,3);night=cl(1-G.daylight,0,1);fac=T0.faction||fac;
    const since=G.time-G.fightT,fightK=since<=2?1:since<14?1-(since-2)/12:0,base=0.16+0.1*cl(G.time/1200,0,1);
    it=Math.max(base,0.92*fightK);if(G.time-G.alertT<20)it=Math.max(it,0.5);
    if(era>DIR.era)musicStinger('sting_era');
    DIR.era=era;
    if(G.over&&DIR.over!==G.over){DIR.over=G.over;musicStinger(G.over==='victory'?'sting_victory':'sting_defeat');}
    const H=T0.hero;if(H){if(H.alive&&!DIR.hero)musicStinger('sting_hero');DIR.hero=!!H.alive;}
    if(G.lastAlertT!==DIR.alert){DIR.alert=G.lastAlertT;if(!G.ais[0]&&G.time-DIR.alarmT>25){DIR.alarmT=G.time;musicStinger('sting_alarm');}}
    if(G.paused&&!G.over)musicDuck(0.4,700);
  }
  if(T.mood){const m=MOODS[T.mood];if(m){if(T.mood==='calm')it=Math.min(it,m.i+0.1);else it=Math.max(it,m.i);if(m.n!==undefined)night=Math.max(night,m.n);}}
  const sc={intensity:cl(it,0,1),night,era};if(fac)sc.faction=fac;
  musicScene(sc);
  const want=wantCue(inMatch),cur=LIVE.main;
  if(!cur||cur.fading||(cur.cueId!==want&&!cur.sting)){musicPlay(want,{director:true,crossfade:true,at:'bar',fade:cur?2.2:1.2,keepScene:true});}
}
function liveTick(){
  STAT.ticks++;
  try{
    const run_=liveOK()&&AC.state==='running',rt=typeof performance!=='undefined'?performance.now():0,dt=LIVE.last?Math.min(1,(rt-LIVE.last)/1000):0.1;LIVE.last=rt;
    if(run_&&LIVE.pending){const p=LIVE.pending;LIVE.pending=null;play(p.id,p.o);}
    smoothScene(dt);
    if(rt-LIVE.lastDirector>=SCENEMS){LIVE.lastDirector=rt;director();}
    if(run_)tickPlayers(AC.currentTime);
  }catch(e){STAT.errors++;STAT.lastError=String(e&&e.message||e);}
}
function ensureTimer(){if(!LIVE.tickT)LIVE.tickT=setInterval(liveTick,TICKMS);}

/* ------------------------------------------------------------------ offline rendering */
function sceneFn(spec){
  const kf=Array.isArray(spec.scene)?spec.scene.slice().sort((a,b)=>(a.t||0)-(b.t||0)):null;
  const base=(!kf&&spec.scene&&typeof spec.scene==='object')?spec.scene:{};
  const st={int:isNum(spec.intensity)?spec.intensity:(isNum(base.intensity)?base.intensity:0.75),night:isNum(spec.night)?spec.night:(isNum(base.night)?base.night:0),era:isNum(spec.era)?spec.era:(isNum(base.era)?base.era:2)};
  if(!kf){return null?null:{static:true,st};}
  const g=(k,d)=>{};
  return{static:false,fn:(t,out)=>{
    let a=kf[0],b=kf[kf.length-1];
    for(let i=0;i<kf.length;i++){if(kf[i].t<=t)a=kf[i];if(kf[i].t>t){b=kf[i];break;}b=kf[i];}
    const u=b.t>a.t?cl((t-a.t)/(b.t-a.t),0,1):1,gv=(o,k,d)=>isNum(o[k])?o[k]:(isNum(o[k==='int'?'intensity':k])?o[k==='int'?'intensity':k]:d);
    out.int=mixv(gv(a,'int',st.int),gv(b,'int',st.int),u);out.night=mixv(gv(a,'night',st.night),gv(b,'night',st.night),u);out.era=Math.round(mixv(gv(a,'era',st.era),gv(b,'era',st.era),u));return out;}};
}
function renderCue(spec,seconds,sr){
  const N=norm(spec.cue);if(!N||!N.ok)return Promise.reject(new Error('music: no cue data for "'+spec.cue+'"'+(N&&N.warn.length?' ('+N.warn[0]+')':'')));
  let sec0=0;if(spec.section!==undefined&&spec.section!==null){sec0=typeof spec.section==='number'?spec.section:N.sections.findIndex(s=>s.name===spec.section);if(sec0<0)sec0=0;}
  const sf=sceneFn(spec),dur=seconds>0?seconds:(N.loop?N.loopLen:N.loopLen)+(N.loop?3:N.tail+1);
  return audioOffline(dur,sr,(A,ctx)=>{
    A.s=(KIT.hash(N.id)^Math.imul(spec.seed|0,0x9E3779B1))|0;A.p.pitch=1;A.p.fmul=1;
    const P=mkPlayer(A,N,{t0:0,sec:sec0,vol:spec.vol,seed:spec.seed|0,budget:spec.budget,solo:spec.solo?[].concat(spec.solo):null,mute:spec.mute?[].concat(spec.mute):null,scn:sf.static?null:sf.fn});
    P.once=!N.loop;
    if(sf.static){P.sc.int=sf.st.int;P.sc.night=sf.st.night;P.sc.era=sf.st.era;}
    else sf.fn(0,P.sc);
    applyLevels(P,P.sc,0,true);
    run(P,dur+0.5);
    A.out=A.dest;
    LAST.id=N.id;LAST.dropped=P.dropped;LAST.peakEst=P.peakEst;LAST.peakSound=P.peakSound;LAST.notes=P.madeN;LAST.meanMade=P.madeN?+(P.madeSum/P.madeN).toFixed(2):0;LAST.madeHist=P.madeHist;LAST.scheduled=STAT.scheduled;LAST.byStem={};LAST.avgNodes={};for(const sm of P.stemOrder){LAST.byStem[sm.name]=sm.dropped||0;LAST.avgNodes[sm.name]=+((sm.nodeSec||0)/dur).toFixed(2);}
  },{master:true});
}
function renderMotif(spec,seconds,sr){
  const fn=MOTIF[spec.motif];if(typeof fn!=='function')return Promise.reject(new Error('music: motif "'+spec.motif+'" is not registered'));
  const key=spec.key||'D',mode=spec.mode||'dorian',tempo=spec.tempo||90,inst=spec.inst||null;
  let res;res=fn(key,mode,{inst:inst||'brass',oct:spec.oct|0,vel:spec.vel===undefined?1:spec.vel,bpm:tempo,tempo,beat:60/tempo,stem:'lead',era:2,night:0,intensity:0.7});
  const notes=Array.isArray(res)?res:(res&&res.notes)||[],use=inst||(res&&!Array.isArray(res)&&res.inst)||'brass';
  let beats=0;for(const nt of notes)beats=Math.max(beats,(+nt.b||0)+(+nt.d||0.5));
  const bars=Math.max(1,Math.ceil(beats/4)+0),id='__motif_'+spec.motif;
  MUSIC_DATA[id]={tempo,key,mode,loop:false,tail:2,dly:0,stems:{lead:{inst:use,reg:'C4',gain:1,rev:0.25,dly:0}},sections:[{name:'m',bars,chords:[key],play:{lead:[]},motifs:[{id:spec.motif,bar:0,stem:'lead',inst:inst||undefined,oct:spec.oct|0,vel:spec.vel,key,mode}]}]};
  const s=MUSIC_DATA[id].sections[0];s.play={};   // the stem must exist: declared through the motif entry
  delete NCACHE[id];
  return renderCue({cue:id,intensity:1,era:2,night:spec.night||0,seed:spec.seed},seconds>0?seconds:beats*60/tempo+2.5,sr);
}
function renderInst(spec,seconds,sr){
  const fn=INST[spec.inst];if(typeof fn!=='function')return Promise.reject(new Error('music: unknown instrument "'+spec.inst+'"'));
  const m=midiOf(spec.note||'C3'),dur=spec.dur||1,sec=seconds>0?seconds:dur+2;
  return audioOffline(sec,sr,(A,ctx)=>{
    A.s=KIT.hash(spec.inst)|0;const p=A.p;p.pitch=1;p.fmul=1;p.variant=0;p.pan=0;
    const nd={f:hzOf(m),midi:m,dur,vel:spec.vel===undefined?0.8:spec.vel,art:spec.art||'',key:pcOf(spec.key||'C'),pr:spec.pr||EMPTY,t:0,rng:A.rng,hzT:null};
    nd.hzT=(semi,oct)=>hzOf(12*(oct+1)+nd.key+semi);
    A.vg=nd.vel;A.dur=dur;
    const L=fn(nd);for(const l of L)KIT.layer(A,0.05,l,p);
  },{master:!!spec.master});
}
registerRenderer('cue',renderCue);registerRenderer('motif',renderMotif);registerRenderer('inst',renderInst);

/* ------------------------------------------------------------------ public API (the plain `function musicX` declarations below the closure call these; each name is declared exactly once) */
function apiPlay(cue,opts){try{ensureTimer();return play(String(cue),opts);}catch(e){STAT.errors++;STAT.lastError=String(e&&e.message||e);return false;}}
function apiStop(fade){try{stop(fade);}catch(e){STAT.errors++;STAT.lastError=String(e&&e.message||e);}}
function apiScene(sc){return setScene(sc);}
function apiStinger(cue){try{return stinger(String(cue));}catch(e){STAT.errors++;STAT.lastError=String(e&&e.message||e);return false;}}
function apiDuck(amount,ms){try{audioDuck('music',cl(+amount||0,0,0.95),Math.max(0,+ms||600));}catch(e){}}
function apiMood(m){return setScene({mood:m});}
function apiState(){const P=LIVE.main;return{cue:LIVE.cue,section:P?P.sec:0,manual:LIVE.manual,held:LIVE.held,scene:Object.assign({},SC.t)};}
function apiRestore(s){
  LIVE.held=false;LIVE.manual=false;
  if(!s)return;
  Object.assign(SC.t,s.scene||{});
  if(s.manual&&s.cue)play(s.cue,{fade:0.8,crossfade:true,section:s.section,keepScene:true});
}
function apiRegister(id,def){MUSIC_DATA[id]=def;delete NCACHE[id];const N=norm(id);return{ok:!!(N&&N.ok),warnings:N?N.warn.slice():['not an object']};}
function musicCheck(id){const N=norm(id);if(!N)return['no data for '+id];return N.warn.slice();}
Object.assign(MUSIC,{play:apiPlay,stop:apiStop,scene:apiScene,stinger:apiStinger,duck:apiDuck,mood:apiMood,state:apiState,restore:apiRestore,register:apiRegister,check:musicCheck,info:infoOf,
  norm,last:()=>JSON.parse(JSON.stringify(LAST)),warnings:()=>WARN.slice(),scenes:()=>({target:Object.assign({},SC.t),cur:Object.assign({},SC.cur)}),
  stats:()=>Object.assign({},STAT,{players:LIVE.players.map(p=>({id:p.id,cue:p.cueId,sec:p.sec,bar:p.bar,bpm:+p.bpm.toFixed(2),fading:p.fading,sting:p.sting,dropped:p.dropped,levels:Object.fromEntries(p.stemOrder.map(s=>[s.name,+s.target.toFixed(3)])),drops:Object.fromEntries(p.stemOrder.map(s=>[s.name,s.dropped||0]))})),
    manual:LIVE.manual,held:LIVE.held,cue:LIVE.cue,scene:Object.assign({},SC.t),cur:Object.assign({},SC.cur),warnings:WARN.length}),
  deg:(key,mode,deg,oct,acc)=>degMidi(pcOf(key),scaleFor(mode),deg,oct===undefined?4:oct,acc),scale:scaleFor,chord:parseChord,voicing:voicingOf,midi:midiOf,hz:n=>hzOf(midiOf(n)),pc:pcOf,SCALES,CHORDS:CQ,
  hzOf,compLane,compMel,tick:liveTick,budget:BUDGET,cap:()=>({budget:BUDGET,capMusic:AUD.capMusic}),lateInst:null});
audioOnReady(()=>{ensureTimer();});
ensureTimer();
return{musicPlay:apiPlay,musicStop:apiStop,musicScene:apiScene,musicStinger:apiStinger,musicDuck:apiDuck,musicMood:apiMood,musicState:apiState,musicRestore:apiRestore,musicRegister:apiRegister};
})();
function musicPlay(cue,opts){return MUSE.musicPlay(cue,opts);}
function musicStop(fade){MUSE.musicStop(fade);}
function musicScene(sc){return MUSE.musicScene(sc);}
function musicStinger(cue){return MUSE.musicStinger(cue);}
function musicDuck(amount,ms){MUSE.musicDuck(amount,ms);}
function musicMood(m){return MUSE.musicMood(m);}
function musicState(){return MUSE.musicState();}
function musicRestore(s){MUSE.musicRestore(s);}
function musicRegister(id,def){return MUSE.musicRegister(id,def);}
function musicInfo(id){return MUSIC.info(id);}
