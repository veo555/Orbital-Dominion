/* =========================================================================
   VOICE — character speech, barks and the announcer. Contract: docs/AUDIO_SPEC.md §5.   (UI/audio module: no sim state is read or written.)
   Public globals: speak(charId,text,{style,volume,onEnd,queue,duck,bark}) -> {dur,syllables,style,blips,tts,voice,queued}   speakStop()   bark(charId,key,opt)
                   voiceProfile(charId) (what the Sound Lab shows)   speakLevel() (0..1 envelope of the line being spoken, for lip-sync)   say(txt) (the announcer)
   Test hook (always present): AUD.voice = {speak,stop,bark,profile,say,level,words,syllables,count,plan,estimate,cur,queue,tts,tune}.
   Offline: audioRender({speech:charId,text,style,vol,seed?},seconds,sr)  (registered renderer 'speech').

   Two layers, both started by speak():
   (a) a SYNTHESIZED SPEECH-LIKE STREAM on the voice bus, one syllable per vowel group of the text (so it is audible where speechSynthesis has no voices,
       i.e. most Android WebViews). A deterministic PLAN (pure function of profile + text + style; seeded by (charId,style,text), never Math.random) lists
       envelope / pitch / formant / noise key-points per syllable; ONE persistent graph renders it:
         glottal oscillator(s) (custom harmonic tilt per timbre, vibrato, jitter) -> voicing gain -> 3 parallel band-pass formants (vowel from the letters,
         scaled by the character's vocal tract)  +  white noise -> aspiration gain -> same formants  +  noise -> frication band-pass (s sh f th, stop bursts)
         -> sum -> timbre/style filters (radio band + static crackle, whisper, shout, narration, thought) -> soft limiter -> voice bus.
       Prosody: statement falls, comma holds, question rises on the last accent, '!' lifts and widens; stressed syllables (first syllable, 'tion' rule,
       prefix rule, function words reduced) carry pitch accents, the last stressed one of a phrase is the nuclear accent; pauses by punctuation; cadence by profile.rate.
   (b) best-effort speechSynthesis: voice chosen per character by hashing the id over the available ENGLISH voices (local ones first, gender hint from ttsPitch,
       collisions avoided so different characters get different voices where the device has several), ttsPitch/ttsRate applied, async 'voiceschanged' handled,
       cancel/queue handled. When TTS is going to speak, the blip stream is mixed down (VOX_TTSMIX) so it is a murmur under the voice, not a second talker.
   Characters come from STORY.characters[id].voice {pitch,rate,timbre,formant,ttsPitch,ttsRate}; a hash of the id adds small offsets (+-1.4 st, tract +-4.5 %, tempo +-5 %,
   vibrato, intonation habit) so two characters with identical voice data still differ. Unknown ids get a default voice derived from the hash.
   Honest limits: nobody has listened to it. Quality is claimed only through tests/audio/voice_gate.py (level, pitch, formants, rate, determinism, prosody direction).
   ========================================================================= */
const VOX_F0=135,VOX_TEMPO=1.0,VOX_REL=0.14,VOX_TTSMIX=0.35,VOX_ASP=9,VOX_FK=1.0,VOX_BK=1.0,VOX_PRE=2.0,VOX_GAP=0.03,VOX_LEAD=0.03;
/* vowel formants F1..F3 (Hz, adult male, scaled by the character's tract factor) */
const VOX_VOW={a:[730,1090,2440],ae:[660,1720,2410],e:[530,1840,2480],ih:[390,1990,2550],i:[270,2290,3010],o:[570,840,2410],u:[300,870,2240],uh:[640,1190,2390],er:[490,1350,1690],ax:[500,1400,2500]};
/* vowel letter groups -> [start vowel, optional end vowel (diphthong glide)] */
const VOX_DIG={ai:['e','ih'],ay:['e','ih'],ee:['i'],ea:['i'],ie:['i'],ei:['e','ih'],ey:['e','ih'],oo:['u'],ou:['a','u'],ow:['o','u'],oa:['o'],oi:['o','ih'],oy:['o','ih'],au:['o'],aw:['o'],eu:['u'],ew:['u'],ue:['u'],ui:['u'],
  eau:['o'],eye:['a','ih'],aye:['e','ih'],iou:['uh'],ia:['i','a'],io:['i','o'],iu:['i','u'],ua:['u','a'],uo:['u','o'],eo:['i','o'],ae:['e'],oe:['o'],ye:['a','ih'],ya:['a']};
const VOX_V3=new Set(['eau','eye','aye','iou']);
/* consonants: c = class (stop fric aff asp nas liq gli), v = voiced; bf/bg burst freq/gain; ff/fg frication centre/gain; F = formant locus; pl = place */
const VOX_PH={p:{c:'stop',v:0,bf:900,bg:.55,pl:'l'},b:{c:'stop',v:1,bf:800,bg:.4,pl:'l'},t:{c:'stop',v:0,bf:4300,bg:.6,pl:'a'},d:{c:'stop',v:1,bf:3600,bg:.45,pl:'a'},k:{c:'stop',v:0,bf:2100,bg:.6,pl:'v'},g:{c:'stop',v:1,bf:1900,bg:.45,pl:'v'},
  f:{c:'fric',v:0,ff:3800,fg:.22,pl:'l'},v:{c:'fric',v:1,ff:3000,fg:.16,pl:'l'},th:{c:'fric',v:0,ff:4600,fg:.14,pl:'a'},s:{c:'fric',v:0,ff:6400,fg:.55,pl:'a'},z:{c:'fric',v:1,ff:6000,fg:.4,pl:'a'},sh:{c:'fric',v:0,ff:3000,fg:.55,pl:'a'},
  ch:{c:'aff',v:0,bf:3200,bg:.5,ff:3200,fg:.5,pl:'a'},j:{c:'aff',v:1,bf:3000,bg:.4,ff:3000,fg:.38,pl:'a'},h:{c:'asp',v:0},
  m:{c:'nas',v:1,F:[250,1100,2200]},n:{c:'nas',v:1,F:[250,1600,2600]},ng:{c:'nas',v:1,F:[250,1900,2500]},l:{c:'liq',v:1,F:[360,1300,2800]},r:{c:'liq',v:1,F:[420,1250,1600]},w:{c:'gli',v:1,F:[300,700,2200]},y:{c:'gli',v:1,F:[280,2200,3000]}};
const VOX_ONSET=new Set(['pr','pl','tr','br','bl','cr','cl','kr','kl','dr','fr','fl','gr','gl','sp','st','sk','sl','sm','sn','sw','tw','kw','thr','shr']);
const VOX_FUNC=new Set('the a an of to in on at by for from with and or but as is are was were be been it its i you he she we they me him her us them my your his our their this that these those do does did can could will would shall should may might must am into out up off over than then if so'.split(' '));
const VOX_ABBR=new Set(['mr','mrs','ms','dr','st','vs','sgt','col','gen','lt','cpt','capt']);
const VOX_PREF=/^(a|be|de|re|ex|dis|to|en|em|mis|ob|un|in|im)$/;
/* intonation per phrase type (semitones): s0/s1 declination start/end, acc stress accent, nuc nuclear accent, nucEnd movement over the nuclear syllable (- fall, + rise) */
const VOX_CON={p:{s0:1.6,s1:-3.2,acc:2.0,nuc:3.4,nucEnd:-4.2},c:{s0:1.6,s1:-0.2,acc:2.0,nuc:2.4,nucEnd:0.8},s:{s0:1.6,s1:-1.2,acc:2.0,nuc:2.6,nucEnd:-1.0},q:{s0:0.6,s1:-1.4,acc:1.8,nuc:2.0,nucEnd:4.5},
  x:{s0:3.0,s1:-1.5,acc:3.0,nuc:4.8,nucEnd:-3.5},ell:{s0:1.2,s1:-2.6,acc:1.6,nuc:2.2,nucEnd:-2.5},d:{s0:1.4,s1:0.2,acc:2.0,nuc:2.4,nucEnd:0.5}};
const VOX_PAUSE={c:.20,s:.27,p:.38,q:.40,x:.36,ell:.52,d:.20};
/* speaking styles. rate/st (semitones)/range (pitch movement)/gain (level trim)/tts* (speechSynthesis shaping)/lp (cutoff multiplier)/rev (reverb send)/voiced (share of the voiced source) */
const VOX_STY={
  normal:{rate:1,st:0,range:1,gain:1,ttsRate:1,ttsPitch:1,ttsVol:1,lp:1,voiced:1,asp:1},
  radio:{rate:1.05,st:0,range:.9,gain:1.15,ttsRate:1.06,ttsPitch:.96,ttsVol:.9,lp:1,voiced:1,asp:1,band:[380,3200],drive:.9,crackle:1},
  whisper:{rate:.88,st:-1,range:.6,gain:1.0,ttsRate:.88,ttsPitch:1,ttsVol:.35,lp:.8,voiced:.06,asp:2.2},
  shout:{rate:1.07,st:2,range:1.35,gain:1.35,ttsRate:1.1,ttsPitch:1.15,ttsVol:1,lp:1.5,voiced:1,asp:1,hs:5,drive:.5},
  narration:{rate:.86,st:-1,range:.7,gain:1.0,ttsRate:.88,ttsPitch:.92,ttsVol:1,lp:.8,voiced:1,asp:1,rev:{room:'hall',amt:.14},warm:1},
  thought:{rate:.92,st:0,range:.65,gain:1.1,ttsRate:.9,ttsPitch:.95,ttsVol:.5,lp:.7,voiced:.55,asp:1.2,rev:{room:'air',amt:.32}}};
/* timbres: harm = glottal spectrum key, lp = lowpass, breath = aspiration floor, Q/G = formant resonance / gain, att = voicing attack, vib = vibrato depth factor, jit = jitter (cents), sub = sub-harmonic level,
   drv = waveshaper drive, rm = ring-mod depth, pk = [Hz,Q,dB] peaking filter, hs = high-shelf dB, trim = level trim (calibrated by tests/audio/voice_gate.py), rng = pitch-range factor */
const VOX_TIM={
  smooth:{harm:'s',lp:4300,breath:.025,Q:[5,7,9],G:[1,.7,.4],att:.016,vib:1,jit:0,sub:0,drv:0,rm:0,trim:1,rng:1},
  soft:{harm:'o',lp:2500,breath:.06,Q:[4,6,8],G:[1,.55,.22],att:.028,vib:1.2,jit:0,sub:0,drv:0,rm:0,trim:1,rng:.9},
  bright:{harm:'b',lp:7500,breath:.03,Q:[6,8,10],G:[.85,.9,.75],att:.009,vib:.6,jit:0,sub:0,drv:0,rm:0,hs:5,trim:1,rng:1.15},
  rough:{harm:'r',lp:3800,breath:.09,Q:[5,7,9],G:[1,.8,.5],att:.011,vib:.25,jit:34,sub:.4,drv:.28,rm:0,trim:1,rng:1.1},
  hollow:{harm:'h',lp:3200,breath:.04,Q:[10,13,15],G:[1,.5,.3],att:.02,vib:.8,jit:0,sub:0,drv:0,rm:0,pk:[1150,3,-8],trim:1,rng:.85},
  metal:{harm:'m',lp:5200,breath:.01,Q:[6,8,10],G:[1,.8,.55],att:.01,vib:0,jit:0,sub:0,drv:.15,rm:1,trim:1,rng:.3}};
const VOX_HARM=(function(){const mk=(tilt,odd)=>{const h=[];for(let n=1;n<=48;n++)h.push(odd&&n%2===0?0:Math.pow(n,-tilt));return h;};
  return{s:mk(1.5),o:mk(2.1),b:mk(1.0),r:mk(1.25),h:mk(1.4,true),m:mk(1.0)};})();
const VOX_STYLES=Object.keys(VOX_STY);
function voxStyle(s){return VOX_STY[s]?s:(s==='whispers'||s==='low'?'whisper':s==='loud'||s==='yell'?'shout':s==='narrator'?'narration':'normal');}
const voxU=(h,k)=>(Math.imul(h^Math.imul(k+1,0x9E3779B1),0x85EBCA6B)>>>0)/4294967296;

/* ------------------------------------------------------------------ text -> words -> syllables (pure) */
/* consonant letters -> phoneme tokens ('sh' 'ch' 'th' 'ng' are single tokens; silent gh, kn-, wr-, ck, ph, qu handled). `after` = the letter that follows the cluster (soft c) */
function voxPhon(s,init,after){
  const o=[];let i=0;
  while(i<s.length){
    const c=s[i],d=s.substr(i,2),e=s.substr(i,3),nx=i+1<s.length?s[i+1]:(after||'');
    if(e==='tch'){o.push('ch');i+=3;continue;}
    if(d==='sh'||d==='ch'||d==='th'||d==='ng'){o.push(d);i+=2;continue;}
    if(d==='ph'){o.push('f');i+=2;continue;}
    if(d==='wh'){o.push('w');i+=2;continue;}
    if(d==='ck'){o.push('k');i+=2;continue;}
    if(d==='gh'){if(init&&i===0)o.push('g');i+=2;continue;}
    if(d==='kn'&&init&&i===0){o.push('n');i+=2;continue;}
    if(d==='wr'&&init&&i===0){o.push('r');i+=2;continue;}
    if(d==='qu'){o.push('k','w');i+=2;continue;}
    if(c==='c'){o.push(/[eiy]/.test(nx)?'s':'k');i++;continue;}
    if(c==='x'){o.push('k','s');i++;continue;}
    if(c==='q'){o.push('k');i++;continue;}
    if(VOX_PH[c])o.push(c);
    i++;
  }
  return o;
}
function voxIsV(w,i){
  const c=w[i];
  if(c==='a'||c==='e'||c==='i'||c==='o'||c==='u')return !(c==='u'&&i>0&&w[i-1]==='q');
  return c==='y'&&i>0;
}
const DIGW={0:['z','i'],1:['w','uh'],2:['t','u'],3:['th','i'],4:['f','o'],5:['f','a'],6:['s','ih'],7:['s','e'],8:['e'],9:['n','a']};
/* one lowercase a-z word -> [{on:[tokens],nu:'ea',co:[tokens],long:bool,vw:null|[vowels],txt:'first syllable letters'}] */
function voxSylWord(word){
  const w=String(word).toLowerCase().replace(/[^a-z]/g,''),n=w.length,g=[];
  if(!n)return[];
  for(let i=0;i<n;){
    if(!voxIsV(w,i)){i++;continue;}
    let j=i;while(j<n&&voxIsV(w,j))j++;
    for(let a=i;a<j;){
      const rest=j-a;let take=1;
      if(rest>=3&&VOX_V3.has(w.substr(a,3)))take=3;else if(rest>=2&&VOX_DIG[w.substr(a,2)])take=2;
      g.push([a,a+take]);a+=take;
    }
    i=j;
  }
  if(!g.length){return[{on:voxPhon(w,true,''),nu:'',co:[],long:false,vw:['ax'],txt:w}];}   // hmm, mr, psst: one reduced syllable
  let magic=false;
  if(g.length>=2){   // silent final e (make, there, holds-less) and the -ed / -es endings; keep consonant+le (table, people)
    const L=g[g.length-1],s0=L[0];
    if(w.slice(L[0],L[1])==='e'){
      const pc=w[s0-1];
      if(L[1]===n){if(!(pc==='l'&&s0>=2&&!voxIsV(w,s0-2))){g.pop();magic=true;}}
      else if(L[1]===n-1&&w[n-1]==='d'){if(pc!=='t'&&pc!=='d')g.pop();}
      else if(L[1]===n-1&&w[n-1]==='s'){if(!'sxzc'.includes(pc)&&!(pc==='h'&&'sc'.includes(w[s0-2]||''))&&pc!=='g')g.pop();}
    }
  }
  const S=[];
  for(let k=0;k<g.length;k++){
    const a=g[k][0],b=g[k][1],pe=k?g[k-1][1]:0;
    const sy={on:[],nu:w.slice(a,b),co:[],long:false,vw:null,txt:w.slice(0,g[0][1])};
    if(k===0)sy.on=voxPhon(w.slice(0,a),true,w[a]);
    else{
      const t=voxPhon(w.slice(pe,a),false,w[a]);let on=t,co=[];
      if(t.length===2){if(!VOX_ONSET.has(t[0]+t[1])){co=[t[0]];on=[t[1]];}}
      else if(t.length>=3){co=[t[0]];on=t.slice(1).slice(-2);}
      S[k-1].co=co;sy.on=on;
    }
    S.push(sy);
  }
  const last=S[S.length-1],tail=voxPhon(w.slice(g[g.length-1][1]),false,'');
  last.co=tail.length>2?tail.slice(0,2):tail;
  if(magic){const ce=w.slice(g[g.length-1][1],n-1);if(ce.length===1||/^(th|sh|ch)$/.test(ce))last.long=true;}
  return S;
}
/* text -> [{txt,syl,caps,em,pause}] ; pause = null | c s p q x ell d (class of the punctuation after the word) */
function voxWords(text){
  let s=String(text==null?'':text);
  try{s=s.normalize('NFD').replace(/[̀-ͯ]/g,'');}catch(e){}
  s=s.replace(/[‘’ʼ]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'... ').replace(/[—–]|\s-\s|--+/g,' — ').replace(/[*_~`#]/g,'');
  const out=[];
  for(const tok of s.split(/\s+/)){
    if(!tok)continue;
    if(tok==='—'){if(out.length&&!out[out.length-1].pause)out[out.length-1].pause='d';continue;}
    let core=tok.replace(/^[^A-Za-z0-9]+/,''),pause=null;
    const tm=/([.!?,;:]+)[^A-Za-z0-9]*$/.exec(core);
    if(tm){const p=tm[1];pause=p.indexOf('?')>=0?'q':p.indexOf('!')>=0?'x':/\.{2,}/.test(p)?'ell':p.indexOf('.')>=0?'p':p.indexOf(',')>=0?'c':'s';}
    core=core.replace(/[^A-Za-z0-9]+$/,'');
    if(!core)continue;
    if(pause==='p'&&VOX_ABBR.has(core.toLowerCase()))pause=null;
    const parts=core.split(/[-\/_]+|—/).map(x=>x.replace(/'/g,'')).filter(Boolean),base=out.length;
    for(let pi=0;pi<parts.length;pi++){
      const part=parts[pi],syl=[];
      for(const run of part.match(/[A-Za-z]+|[0-9]+/g)||[]){
        if(/^[0-9]/.test(run)){for(const dch of run.slice(0,6)){const d=DIGW[dch];syl.push({on:d.length>1?[d[0]]:[],nu:'#',co:[],long:false,vw:[d[d.length-1]],txt:dch});if(dch==='7')syl.push({on:['v'],nu:'#',co:['n'],long:false,vw:['ax'],txt:''});}}
        else for(const sy of voxSylWord(run))syl.push(sy);
      }
      if(!syl.length)continue;
      const caps=part.length>=2&&/[A-Z]/.test(part)&&part===part.toUpperCase()&&!/[0-9]/.test(part);
      out.push({txt:part,syl,caps,em:caps,pause:pi===parts.length-1?pause:null});
    }
    if(out.length===base&&pause&&out.length)out[out.length-1].pause=out[out.length-1].pause||pause;
  }
  return out;
}
function voxStressIdx(sy,w){
  const n=sy.length;if(n<2)return 0;
  if(/(tion|sion|cian)$/.test(w))return n-2;
  if(n>=3&&/(ic|ical|ity|ify|ious|eous|ial|ian)$/.test(w))return n-2;
  if(n===2&&VOX_PREF.test(sy[0].txt))return 1;
  return 0;
}
function voxCount(text){let n=0;for(const w of voxWords(text))n+=w.syl.length;return n;}
/* nucleus letters -> [start,end?] vowel keys. st = stress 0..3, wn = syllables in the word */
function voxVowel(sy,st,wn){
  if(sy.vw)return sy.vw;
  const nu=sy.nu;if(!nu)return['ax'];
  const d=VOX_DIG[nu];if(d)return d;
  const L=nu[0],open=!sy.co.length;
  if(st===0&&L!=='i'&&L!=='y')return['ax'];
  if(sy.long||(open&&st>=2&&wn>1))return{a:['e','ih'],e:['i'],i:['a','ih'],o:['o','u'],u:['u'],y:['a','ih']}[L]||['ax'];
  if(open&&wn===1&&L==='o')return['o','u'];
  return{a:['ae'],e:['e'],i:['ih'],o:['a'],u:['uh'],y:['ih']}[L]||['ax'];
}

/* ------------------------------------------------------------------ voice profile of a character */
function voxRaw(id){
  const ch=typeof STORY!=='undefined'&&STORY&&STORY.characters?STORY.characters[id]:null;
  return{ch,v:(ch&&ch.voice)||null};
}
function voiceProfile(charId){
  const id=charId==null||charId===''?'~':String(charId),R=voxRaw(id),v=R.v||{},VK=typeof VOICE_KEYS!=='undefined'?VOICE_KEYS:null;
  const num=(k,d)=>{let x=typeof v[k]==='number'&&isFinite(v[k])?v[k]:d;if(VK&&VK[k])x=clamp(x,VK[k][0],VK[k][1]);return x;};
  const tim=VOX_TIM[v.timbre]?v.timbre:'smooth',TM=VOX_TIM[tim],h=KIT.hash(id+'#voice');
  const pitch=num('pitch',1),rate=num('rate',1),formant=num('formant',.5),stDelta=(voxU(h,1)*2-1)*1.4;
  const P={id,found:!!R.ch,name:R.ch?(R.ch.name||id):id,timbre:tim,pitch,formant,rate:rate*(1+(voxU(h,3)*2-1)*.05),ttsPitch:num('ttsPitch',1),ttsRate:num('ttsRate',1),
    f0:VOX_F0*pitch*Math.pow(2,stDelta/12),tract:(0.82+0.4*formant)*(1+(voxU(h,2)*2-1)*.045),habit:0.85+0.3*voxU(h,4),range:TM.rng,
    vibHz:4.8+1.2*voxU(h,5),vibCents:(10+14*voxU(h,6))*TM.vib,jit:TM.jit,Q:TM.Q,G:TM.G,lp:TM.lp,breath:TM.breath,att:TM.att,sub:TM.sub,drv:TM.drv,rm:TM.rm,harm:TM.harm,trim:TM.trim,seed:h};
  P.rmF=P.f0*0.62;
  return P;
}
/* ------------------------------------------------------------------ the plan (pure, deterministic) */
function voxPlan(P,text,styleName){
  styleName=voxStyle(styleName);
  const SY=VOX_STY[styleName],words=voxWords(text),R=mulberry32(KIT.hash(P.id+'|'+styleName+'|'+text));
  const rate=clamp(P.rate*SY.rate,0.55,2.2),inv=VOX_TEMPO/rate,rg=P.range*SY.range*P.habit,base=P.f0*Math.pow(2,SY.st/12);
  const CH=['gv','ga','gf','fq','F1','F2','F3'],ch={gv:[],ga:[],gf:[],fq:[],F1:[],F2:[],F3:[],f0:[],gc:[]},cur={gv:0,ga:0,gf:0,fq:5000,F1:500,F2:1500,F3:2500},syl=[];
  let t=VOX_LEAD;
  const pt=(k,tm,v)=>{const a=ch[k],l=a.length;if(l&&tm<a[l-1][0])tm=a[l-1][0];a.push([tm,v]);};
  for(const k of CH)pt(k,0,cur[k]);
  /* one segment of d seconds: every channel moves to its level within `tr` and then ramps to its `k1` end level; unlisted channels hold */
  function seg(d,o){
    const tr=o.tr;
    for(const k of CH){
      let a=typeof tr==='number'?tr:(tr&&tr[k]!==undefined?tr[k]:0.008);a=Math.min(a,d*0.9);
      const v=o[k]===undefined?cur[k]:o[k],v1=o[k+'1']===undefined?v:o[k+'1'];
      pt(k,t+a,v);pt(k,t+d,v1);cur[k]=v1;
    }
    t+=d;
  }
  const Fof=(vk,tm)=>VOX_VOW[vk].map(f=>Math.min(f*tm,9000));
  function locus(ph,F){const pl=ph.pl;if(pl==='l')return[F[0]*.8,F[1]*.8,F[2]*.97];if(pl==='a')return[F[0]*.8,F[1]*.5+900,F[2]];if(pl==='v')return[F[0]*.9,F[1]*1.12,F[2]*.95];return F;}
  function cons(tk,pos,amp,F,fin){
    const ph=VOX_PH[tk];if(!ph)return;
    const k=inv*(pos==='co'?0.8:1),LC=locus(ph,F);
    if(ph.c==='stop'||ph.c==='aff'){
      seg((pos==='on'?.042:.034)*k*(ph.c==='aff'?.8:1),{gv:ph.v?amp*.2:0,ga:0,gf:0,F1:LC[0],F2:LC[1],F3:LC[2],tr:.006});
      if(pos==='on'||fin){
        seg(.003,{gf:ph.bg*VOX_BK,fq:ph.bf,tr:.001});
        if(ph.c==='aff')seg(.06*k,{gf:ph.fg*VOX_FK,gf1:ph.fg*VOX_FK*.5,fq:ph.ff,gv:ph.v?amp*.35:0,tr:.004});
        else seg(.013*k,{gf:0,ga:ph.v?0:.5*amp,gv:ph.v?amp*.6:0,fq:ph.bf,tr:.004});
      }
    }else if(ph.c==='fric')seg(.07*k,{gv:ph.v?amp*.35:0,ga:0,gf:ph.fg*VOX_FK,gf1:ph.fg*VOX_FK*.6,fq:ph.ff,F1:LC[0],F2:LC[1],F3:LC[2],tr:.012});
    else if(ph.c==='asp')seg(.05*k,{gv:0,ga:.6*amp,gf:0,F1:F[0],F2:F[1],F3:F[2],tr:.01});
    else if(ph.c==='nas')seg(.055*k,{gv:amp*.55,ga:0,gf:0,F1:ph.F[0],F2:ph.F[1],F3:ph.F[2],tr:.01});
    else seg(.05*k,{gv:amp*.75,ga:0,gf:0,F1:ph.F[0],F2:ph.F[1],F3:ph.F[2],tr:.01});
  }
  /* stress + phrases */
  for(const w of words){
    const n=w.syl.length;
    if(n===1)w.syl[0].st=VOX_FUNC.has(w.txt.toLowerCase())&&!w.caps?0:2;
    else{const pi=voxStressIdx(w.syl,w.txt.toLowerCase());for(let i=0;i<n;i++)w.syl[i].st=i===pi?2:(n>=3&&i===n-1&&pi!==n-1?1:0);}
    if(w.em)for(const s of w.syl)s.st=Math.max(s.st,1);
  }
  const phrases=[];let pc=[];
  for(const w of words){pc.push(w);if(w.pause){phrases.push({w:pc,type:w.pause});pc=[];}}
  if(pc.length)phrases.push({w:pc,type:'p'});
  let wi=0;
  phrases.forEach((ph,pi)=>{
    const list=[];ph.w.forEach((w,k)=>{w.syl.forEach((s,i)=>list.push({s,w,k,i}));});
    const n=list.length;let nuc=-1;
    for(let i=n-1;i>=0;i--)if(list[i].s.st>=2){nuc=i;break;}
    if(nuc<0)nuc=n-1;
    const T=VOX_CON[ph.type];
    for(let i=0;i<n;i++){
      const{s,w,k}=list[i],wn=w.syl.length,lastW=list[i].i===wn-1,firstW=list[i].i===0,lastP=i===n-1,prog=n>1?i/(n-1):0;
      const vk=voxVowel(s,s.st,wn),tm=P.tract*(1+(R()-.5)*.04),Fa=Fof(vk[0],tm),Fb=Fof(vk[vk.length-1],tm);
      const amp=[.55,.82,1,1.1][s.st]*(1-.16*prog)*(1+(R()-.5)*.12)*(w.em?1.18:1);
      /* pitch (semitones re base) */
      let st=T.s0+(T.s1-T.s0)*prog,stEnd,bump=s.st>=2?1.2:.3;
      if(i===nuc)st+=T.nuc*(w.em?1.3:1);else if(s.st>=2)st+=T.acc;else if(s.st===1)st+=.3;else st-=1.0;
      if(w.em)st+=2.2;
      stEnd=st-.5;
      if(i===nuc)stEnd=st+T.nucEnd;
      if(ph.type==='q'&&i>nuc&&n-1>nuc){const q=4*(i-nuc)/(n-1-nuc);st+=q;stEnd=st+1.2;}
      if(ph.type==='c'&&lastP)stEnd+=.8;
      st+=(R()*2-1)*.35;
      const fz=x=>base*Math.pow(2,x*rg/12);
      /* durations */
      const dv=[.065,.085,.105,.12][s.st]*inv*(lastP?1.45:lastW?1.12:1)*(w.em?1.2:1)*(vk.length>1?1.18:1);
      /* onset */
      const on=s.on.length>2?[s.on[0],s.on[s.on.length-1]]:s.on;
      for(const tk of on)cons(tk,'on',amp,Fa,false);
      if(!on.length&&!firstW)seg(.012*inv,{gv:amp*.35,ga:0,gf:0,tr:.006});   // vowel-vowel boundary inside a word: a small dip keeps the syllables apart
      const tv0=t;
      if(!ch.f0.length)pt('f0',0,fz(st-1));
      pt('f0',tv0,fz(st-(s.st>=2?1.5:.6)));pt('f0',tv0+dv*.35,fz(st+bump));pt('f0',tv0+dv,fz(stEnd));
      seg(dv*.55,{gv:amp,gv1:amp,ga:P.breath*amp*VOX_ASP*(SY.asp),F1:Fa[0],F2:Fa[1],F3:Fa[2],gf:0,tr:{gv:P.att,ga:P.att,F1:.03,F2:.03,F3:.03}});
      seg(dv*.45,{gv:amp,gv1:amp*.72,F1:Fb[0],F2:Fb[1],F3:Fb[2],tr:{F1:dv*.4,F2:dv*.4,F3:dv*.4}});
      const tv1=t;
      /* coda: one token inside a word, up to two at its end */
      const co=lastW?s.co:s.co.slice(0,1);
      co.forEach((tk,ci)=>{
        const F=tk==='r'?[Fb[0],Fb[1],1700]:Fb;
        cons(tk,'co',amp*.8,F,lastW&&ci===co.length-1);
      });
      syl.push({i:syl.length,t0:tv0,t1:tv1,st:s.st,nuc:i===nuc,vw:vk.join('>'),f0:[fz(st-.6),fz(st+bump),fz(stEnd)],amp,word:wi,txt:w.txt,ph:pi});
      if(lastW){wi++;if(!lastP)seg(VOX_GAP*inv,{gv:0,ga:0,gf:0,tr:.008});}   // word gap (voicing drops to zero between words, only dips inside a word)
    }
    /* phrase-final pause (not after the very last phrase) */
    if(pi<phrases.length-1)seg(VOX_PAUSE[ph.type]*(0.6+0.4*inv),{gv:0,ga:0,gf:0,tr:.012});
  });
  seg(0.03,{gv:0,ga:0,gf:0,tr:.012});
  /* radio: static crackle (seeded) + squelch at both ends */
  if(SY.crackle){
    const Rc=mulberry32(KIT.hash(P.id+'|crackle|'+text)),end=t;let tt=0.05;
    const burst=(tm,a,d)=>{pt('gc',tm,.012);pt('gc',tm+.001,.012+a);pt('gc',tm+.001+d,.012);};
    pt('gc',0,.012);burst(0.004,.5,.03);
    while(tt<end){burst(tt,.04+Rc()*.22,.002+Rc()*.012);tt+=.06+Rc()*.22;}
    burst(end,.5,.04);pt('gc',end+.07,0);t=end+.07;
  }
  return{id:P.id,text,style:styleName,dur:t,ch,syl,words:words.length,phrases:phrases.length,rate,cps:text.length/Math.max(t,0.01)};
}
function voxEstimate(text,o){o=o||{};const P=voiceProfile(o.char||'~');if(o.rate)P.rate=o.rate;return voxPlan(P,text,o.style).dur;}

/* ------------------------------------------------------------------ the graph (one per line; live or offline) */
let VOX_LIMC=null;
function voxLimCurve(){if(VOX_LIMC)return VOX_LIMC;const n=2049,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=0.92*Math.tanh(x/0.92);}return VOX_LIMC=c;}
const VOX_DRV=new Map();
function voxDriveCurve(d){const k=Math.round(d*20);let c=VOX_DRV.get(k);if(c)return c;const n=1025,g=1+k*0.12,th=Math.tanh(g);c=new Float32Array(n);for(let i=0;i<n;i++)c[i]=Math.tanh((i/(n-1)*2-1)*g)/th;VOX_DRV.set(k,c);return c;}
function voxBuild(A,T0,plan,P,style,vol){
  const x=A.ctx,SY=VOX_STY[style]||VOX_STY.normal,TM=VOX_TIM[P.timbre]||VOX_TIM.smooth,ch=plan.ch,T1=T0+plan.dur+VOX_REL,R=mulberry32(KIT.hash(P.id+'|g|'+plan.text.length+style)),srcs=[];
  const G=v=>{const g=x.createGain();g.gain.value=v;return g;};
  const start=(s,off)=>{KIT.go(A,s,T0,T1,off);srcs.push(s);};
  const sched=(par,pts,mode,mul,floor)=>{
    par.setValueAtTime(Math.max(floor,pts[0][1]*mul),T0);
    for(let i=0;i<pts.length;i++){const v=Math.max(floor,pts[i][1]*mul);if(mode==='exp')par.exponentialRampToValueAtTime(v,T0+pts[i][0]);else par.linearRampToValueAtTime(v,T0+pts[i][0]);}
  };
  const add2=(a,b)=>{const s=G(1);a.connect(s);b.connect(s);return s;};   // 2-input adders only: offline renders stay bit-exact (80_audio.js §8.7)
  /* glottal source */
  const o1=x.createOscillator();o1.setPeriodicWave(KIT.wave(A,{harm:VOX_HARM[P.harm]}));sched(o1.frequency,ch.f0,'exp',1,20);
  let voiced=o1,o2=null,detune=null;
  if(P.sub>0){o2=x.createOscillator();o2.type='square';sched(o2.frequency,ch.f0,'exp',.5,10);const g2=G(P.sub);o2.connect(g2);const g1=G(1);o1.connect(g1);voiced=add2(g1,g2);}
  if(P.vibCents>0&&P.jit>0){const l1=x.createOscillator(),l2=x.createOscillator(),a1=G(P.vibCents),a2=G(P.jit);l1.frequency.value=P.vibHz;l2.type='triangle';l2.frequency.value=37+P.vibHz*2;l1.connect(a1);l2.connect(a2);detune=add2(a1,a2);start(l1);start(l2);}
  else if(P.vibCents>0){const l1=x.createOscillator(),a1=G(P.vibCents);l1.frequency.value=P.vibHz;l1.connect(a1);detune=a1;start(l1);}
  else if(P.jit>0){const l2=x.createOscillator(),a2=G(P.jit);l2.type='triangle';l2.frequency.value=41;l2.connect(a2);detune=a2;start(l2);}
  if(detune){detune.connect(o1.detune);if(o2)detune.connect(o2.detune);}
  const gv=G(0);voiced.connect(gv);sched(gv.gain,ch.gv,'lin',SY.voiced,0);
  /* noise: aspiration through the formants, frication through its own band-pass */
  const ns=x.createBufferSource();ns.buffer=KIT.noiseBuf(A,'white');ns.loop=true;
  const ga=G(0);ns.connect(ga);sched(ga.gain,ch.ga,'lin',1,0);
  const fb=x.createBiquadFilter();fb.type='bandpass';fb.Q.value=1;sched(fb.frequency,ch.fq,'exp',1,200);ns.connect(fb);
  const gf=G(0);fb.connect(gf);sched(gf.gain,ch.gf,'lin',1,0);
  const fg=[];
  for(let k=0;k<3;k++){
    const b=x.createBiquadFilter();b.type='bandpass';b.Q.value=P.Q[k]*(SY.voiced<.5?.8:1);sched(b.frequency,ch['F'+(k+1)],'lin',1,60);
    gv.connect(b);ga.connect(b);const g=G(P.G[k]);b.connect(g);fg.push(g);
  }
  let sum=add2(add2(fg[0],fg[1]),fg[2]);sum=add2(sum,gf);
  let ns2=null;
  if(ch.gc.length>1){ns2=x.createBufferSource();ns2.buffer=KIT.noiseBuf(A,'white');ns2.loop=true;const cb=x.createBiquadFilter();cb.type='bandpass';cb.frequency.value=2600;cb.Q.value=.6;const cg=G(0);ns2.connect(cb);cb.connect(cg);sched(cg.gain,ch.gc,'lin',1,0);sum=add2(sum,cg);}
  /* timbre / style filters */
  let n=sum;const lnk=nd=>{n.connect(nd);n=nd;return nd;};
  const flt=(type,f,q,g)=>{const b=x.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(g!==undefined)b.gain.value=g;return lnk(b);};
  lnk(G(VOX_PRE));
  flt('lowpass',Math.min(P.lp*SY.lp,x.sampleRate*.45),.707);
  if(TM.pk)flt('peaking',TM.pk[0],TM.pk[1],TM.pk[2]);
  if(TM.hs||SY.hs)flt('highshelf',3000,.707,(TM.hs||0)+(SY.hs||0));
  if(SY.warm)flt('lowshelf',240,.707,4);
  if(P.rm>0){n=KIT.ring(A,T0,{f:P.rmF,depth:.9*P.rm,type:'sine'},T1,n);}
  const drv=Math.max(P.drv,SY.drive||0);if(drv>0){const w=x.createWaveShaper();w.curve=voxDriveCurve(drv);w.oversample='2x';lnk(w);}
  if(SY.band){flt('highpass',SY.band[0],.8);flt('highpass',SY.band[0],.8);flt('lowpass',SY.band[1],.8);flt('lowpass',SY.band[1],.8);}
  const gm=G(vol*P.trim*SY.gain);lnk(gm);
  gm.gain.setValueAtTime(vol*P.trim*SY.gain,Math.max(T0,T1-0.05));gm.gain.linearRampToValueAtTime(0,T1);
  const lim=x.createWaveShaper();lim.curve=voxLimCurve();lnk(lim);
  let rg=null;if(SY.rev){rg=G(SY.rev.amt);lim.connect(rg);rg.connect(KIT.rev(A,SY.rev.room));}
  lim.connect(A.out);
  /* sources last (everything is wired); offsets from the seeded rng so offline renders are reproducible */
  start(o1);if(o2)start(o2);start(ns,R()*2.4);if(ns2)start(ns2,R()*2.4);
  return{T0,T1,srcs,gm,lim,rg,done:false,
    stop(){const now=x.currentTime;try{gm.gain.cancelScheduledValues(now);gm.gain.setValueAtTime(gm.gain.value,now);gm.gain.linearRampToValueAtTime(0,now+0.05);}catch(e){}for(const s of srcs){try{s.stop(now+0.08);}catch(e){}}},
    cleanup(){if(this.done)return;this.done=true;try{lim.disconnect();}catch(e){}if(rg){try{rg.disconnect();}catch(e){}}}};
}
registerRenderer('speech',function(spec,seconds,sr){
  const P=voiceProfile(spec.speech),style=voxStyle(spec.style),text=String(spec.text==null?'':spec.text),plan=voxPlan(P,text,style);
  return audioOffline(seconds||Math.min(40,plan.dur+VOX_REL+0.6),sr||44100,(A)=>{voxBuild(A,0.02,plan,P,style,spec.vol!==undefined?spec.vol:1);},{master:spec.master});
});

/* ------------------------------------------------------------------ speechSynthesis (best effort) */
const VOX_TTS={voices:[],hooked:false,assign:null,sig:'',extra:{}};
const VOX_FEM=/female|woman|samantha|karen|zira|susan|victoria|moira|tessa|fiona|allison|\bava\b|serena|hazel|heather|catherine|kate\b|libby|sonia|\baria\b|jenny|emma|\bamy\b|joanna|salli|kimberly|\bivy\b|nicole|raveena|veena|zoe\b|ellen|helena|laura|linda|michelle|sara\b/i;
const VOX_MAL=/\bmale\b|\bman\b|daniel|\balex\b|david|\bmark\b|george|\bfred\b|\btom\b|james|ralph|oliver|\bryan\b|\bguy\b|brian|matthew|joey|justin|russell|geraint|thomas|aaron|rishi|arthur|gordon|richard|\bsean\b|\bpaul\b|\bjohn\b/i;
let voxAnn=null,voxSayLast=0;const voxSayMap={};
function voxTtsOk(){return typeof speechSynthesis!=='undefined'&&!!speechSynthesis&&typeof SpeechSynthesisUtterance!=='undefined';}
function voxTtsRefresh(){if(!voxTtsOk())return;let v=[];try{v=speechSynthesis.getVoices()||[];}catch(e){}VOX_TTS.voices=Array.prototype.slice.call(v);VOX_TTS.assign=null;voxAnn=null;}
function voxTtsInit(){
  if(!voxTtsOk())return;
  if(!VOX_TTS.hooked){VOX_TTS.hooked=true;try{speechSynthesis.addEventListener('voiceschanged',voxTtsRefresh);}catch(e){try{speechSynthesis.onvoiceschanged=voxTtsRefresh;}catch(e2){}}voxTtsRefresh();}
  else if(!VOX_TTS.voices.length)voxTtsRefresh();   // Chrome fills the list asynchronously: keep asking until it is not empty
}
const voxVid=v=>String(v.voiceURI||v.name||'');
function voxTtsAssign(){
  voxTtsInit();
  const vs=VOX_TTS.voices.filter(v=>v&&/^en([-_]|$)/i.test(v.lang||'')).sort((a,b)=>voxVid(a)<voxVid(b)?-1:1);
  const ids=Object.keys(typeof STORY!=='undefined'&&STORY&&STORY.characters?STORY.characters:{});
  for(const k in VOX_TTS.extra)if(ids.indexOf(k)<0)ids.push(k);
  ids.sort();
  const sig=vs.map(voxVid).join('|')+'#'+ids.join(',');
  if(VOX_TTS.assign&&VOX_TTS.sig===sig)return VOX_TTS.assign;
  const loc=vs.filter(v=>v.localService),pool=loc.length?loc:vs;   // local voices first: network voices phone home, the game does not
  const F=pool.filter(v=>VOX_FEM.test(v.name||'')),M=pool.filter(v=>!VOX_FEM.test(v.name||'')&&VOX_MAL.test(v.name||'')),used={},map={};
  for(const id of ids){
    const tp=voiceProfile(id).ttsPitch,want=tp>=1.12?'f':tp<=0.9?'m':'a',pl=want==='f'&&F.length?F:(want==='m'&&M.length?M:pool);
    if(!pl.length){map[id]=null;continue;}
    let i=KIT.hash(id+'#tts')%pl.length,k=0;
    while(k<pl.length&&used[voxVid(pl[i])]){i=(i+1)%pl.length;k++;}
    map[id]=pl[i];used[voxVid(pl[i])]=1;
  }
  VOX_TTS.assign=map;VOX_TTS.sig=sig;return map;
}
function voxTtsVoice(id){
  if(!voxTtsOk())return null;
  let m=voxTtsAssign();
  if(!(id in m)){VOX_TTS.extra[id]=1;m=voxTtsAssign();}
  return m[id]||null;
}
function voxTtsText(t){return String(t).replace(/[*_~`#]/g,'').replace(/\s*[—–]\s*/g,', ').replace(/\.{2,}|…/g,'.');}
function voxTtsStart(P,text,SY,vol,done){
  if(!SET.voice||muted||!voxTtsOk()||vol<=0)return null;
  const v=voxTtsVoice(P.id);if(!v)return null;
  let u;try{u=new SpeechSynthesisUtterance(voxTtsText(text));}catch(e){return null;}
  u.voice=v;u.lang=v.lang||'en-US';u.pitch=clamp(P.ttsPitch*SY.ttsPitch,0.1,2);u.rate=clamp(P.ttsRate*SY.ttsRate,0.5,2);
  u.volume=clamp(vol*SY.ttsVol*(SET.voiceVol===undefined?0.9:SET.voiceVol),0,1);
  u.onend=done;u.onerror=done;
  try{speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){return null;}
  return{u,voice:v.name};
}

/* ------------------------------------------------------------------ speak / stop / queue */
let VOXCUR=null;const VOXQ=[];
function voxCheck(cur){if(cur===VOXCUR&&cur.blipDone&&cur.ttsDone)voxFinish('end');}
function voxFinish(reason){
  const cur=VOXCUR;if(!cur)return;
  VOXCUR=null;clearTimeout(cur.timer);clearTimeout(cur.guard);cur.dead=true;
  if(cur.h){if(reason==='end')setTimeout(()=>cur.h.cleanup(),500);else{cur.h.stop();setTimeout(()=>cur.h.cleanup(),250);}}
  if(cur.tts&&!cur.ttsDone&&reason!=='end'){try{speechSynthesis.cancel();}catch(e){}}
  if(typeof cur.opts.onEnd==='function'){try{cur.opts.onEnd({dur:cur.plan.dur,reason,interrupted:reason!=='end'});}catch(e){}}
  if(reason==='end'&&VOXQ.length){const q=VOXQ.shift();speak(q.charId,q.text,q.opts);}
}
function speakStop(){
  VOXQ.length=0;
  if(VOXCUR)voxFinish('stop');
  else if(voxTtsOk()){try{if(speechSynthesis.speaking||speechSynthesis.pending)speechSynthesis.cancel();}catch(e){}}
}
function speak(charId,text,opts){
  opts=opts||{};
  const style=voxStyle(opts.style),txt=String(text==null?'':text).replace(/\s+/g,' ').trim().slice(0,600),P=voiceProfile(charId),plan=voxPlan(P,txt,style);
  const res={dur:plan.dur,syllables:plan.syl.length,style,blips:false,tts:false,voice:null,queued:false,skipped:false};
  if(!txt||!plan.syl.length){if(typeof opts.onEnd==='function')setTimeout(()=>{try{opts.onEnd({dur:0,reason:'end',interrupted:false});}catch(e){}},0);res.dur=0;return res;}
  if(VOXCUR){
    if(opts.bark){res.skipped=true;return res;}
    if(opts.queue){VOXQ.push({charId,text:txt,opts});res.queued=true;return res;}
    voxFinish('interrupt');
  }
  const C=AUD.counters,cur=VOXCUR={id:P.id,plan,style,opts,h:null,tts:null,t0:0,blipDone:false,ttsDone:true,dead:false,timer:0,guard:0,bark:!!opts.bark};
  C.speaks=(C.speaks||0)+1;if(opts.bark)C.barks=(C.barks||0)+1;
  const vol=clamp(opts.volume===undefined?1:+opts.volume,0,2),SY=VOX_STY[style];
  const tt=voxTtsStart(P,txt,SY,vol,()=>{if(!cur.ttsDone){cur.ttsDone=true;voxCheck(cur);}});
  if(tt){
    cur.tts=tt;cur.ttsDone=false;res.tts=true;res.voice=tt.voice;
    const est=txt.length/(14*clamp(P.ttsRate*SY.ttsRate,.5,2))+.5;
    cur.guard=setTimeout(()=>{cur.ttsDone=true;voxCheck(cur);},Math.max(plan.dur,est)*1700+1000);
  }
  if(typeof AC!=='undefined'&&AC&&!muted&&AC.state==='running'&&vol>0){
    const A=audioA('voice');
    if(A){try{cur.h=voxBuild(A,AC.currentTime+0.03,plan,P,style,vol*(tt?VOX_TTSMIX:1));cur.t0=cur.h.T0;res.blips=true;}catch(e){C.errors++;AUD.lastError='speech: '+(e&&e.message||e);}}
  }
  if(!opts.bark&&opts.duck!==false)audioDuck('music',0.45,(plan.dur+0.5)*1000);
  cur.timer=setTimeout(()=>{cur.blipDone=true;voxCheck(cur);},(plan.dur+0.1)*1000);
  return res;
}
/* 0..1 envelope of the line being spoken right now (the voicing gain of the plan at the context clock); 0 when nothing is spoken */
function speakLevel(){
  const c=VOXCUR;if(!c||!c.h||typeof AC==='undefined'||!AC)return 0;
  const tt=AC.currentTime-c.t0,a=c.plan.ch.gv;if(tt<0||!a.length)return 0;
  let lo=0,hi=a.length-1;if(tt>=a[hi][0])return 0;
  while(hi-lo>1){const m=(lo+hi)>>1;if(a[m][0]<=tt)lo=m;else hi=m;}
  const d=a[hi][0]-a[lo][0],f=d>0?(tt-a[lo][0])/d:0;
  return clamp((a[lo][1]+(a[hi][1]-a[lo][1])*f)/1.1,0,1);
}

/* ------------------------------------------------------------------ barks */
const VOX_BK={};let voxBarkLast=0;
function bark(charId,key,opt){
  opt=opt||{};
  const S=typeof STORY!=='undefined'?STORY:null,list=S&&S.barks&&S.barks[charId]&&S.barks[charId][key];
  if(!Array.isArray(list)||!list.length)return null;
  const now=performance.now(),st=VOX_BK[charId+'|'+key]||(VOX_BK[charId+'|'+key]={bag:[],last:-1,r:mulberry32(KIT.hash(charId+'|'+key+'|bark')),at:0});
  if(muted||VOXCUR||now-voxBarkLast<(opt.globalGap===undefined?1500:opt.globalGap)||now-st.at<(opt.cooldown===undefined?5000:opt.cooldown))return null;
  if(!st.bag.length){   // shuffled bag: every line once before any repeats, and never the same line twice in a row
    const b=list.map((x,i)=>i);for(let i=b.length-1;i>0;i--){const j=Math.floor(st.r()*(i+1));const q=b[i];b[i]=b[j];b[j]=q;}
    if(b.length>1&&b[b.length-1]===st.last){const q=b[0];b[0]=b[b.length-1];b[b.length-1]=q;}
    st.bag=b;
  }
  const ix=st.bag.pop(),ln=list[ix],text=typeof ln==='string'?ln:(ln&&ln.text)||'';
  if(!text)return null;
  const r=speak(charId,text,{style:opt.style||'normal',volume:opt.volume===undefined?.5:opt.volume,bark:true,duck:false,onEnd:opt.onEnd});
  if(r.skipped)return null;
  st.last=ix;st.at=now;voxBarkLast=now;
  return{text,key,line:ix,dur:r.dur,blips:r.blips,tts:r.tts};
}

/* ------------------------------------------------------------------ the announcer (moved here from 80_audio.js; same behaviour and rate limits) */
function voxAnnPick(){try{const vs=speechSynthesis.getVoices();voxAnn=vs.find(v=>/en[-_]US/i.test(v.lang)&&/Google|Samantha|Daniel|Alex/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null;}catch(e){}}
function say(txt){
  if(!SET.voice||muted||!AC||ui.demo||typeof speechSynthesis==='undefined')return;
  if(VOXCUR)return;   // a character is speaking: the announcer waits (and must not cancel the line)
  const now=performance.now();if(now-voxSayLast<2200||(voxSayMap[txt]&&now-voxSayMap[txt]<9000))return;voxSayLast=now;voxSayMap[txt]=now;
  try{
    voxTtsInit();if(!voxAnn)voxAnnPick();const u=new SpeechSynthesisUtterance(txt);if(voxAnn)u.voice=voxAnn;u.rate=1.05;u.pitch=0.75;
    u.volume=clamp(SET.voiceVol===undefined?0.9:SET.voiceVol,0,1);speechSynthesis.cancel();speechSynthesis.speak(u);AUD.counters.says++;
    audioDuck('music',0.4,400+txt.length*65);
  }catch(e){}
}
AUD.voice={speak,stop:speakStop,bark,profile:voiceProfile,say,level:speakLevel,words:voxWords,syllables:voxSylWord,count:voxCount,plan:voxPlan,estimate:voxEstimate,styles:VOX_STYLES,
  cur:()=>VOXCUR,queue:()=>VOXQ.length,tts:{voice:voxTtsVoice,assign:voxTtsAssign,refresh:voxTtsRefresh,voices:()=>VOX_TTS.voices.slice()},
  tune:{F0:VOX_F0,TTSMIX:VOX_TTSMIX,TIM:VOX_TIM,STY:VOX_STY,CON:VOX_CON,PAUSE:VOX_PAUSE}};
