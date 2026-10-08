/* tests/audio/voice_page.js - the in-page half of tests/audio/voice_gate.py (injected after the game has booted with window.__TEST='live').
   window.VG
     render(spec, sec)        -> {sr, n, b64 (float32 channel 0), hash, ana}   offline render through the game's own audioRender(); Math.random / Date.now / performance.now are stubbed
                                 to THROW while the graph is being built, so a voice that used them would fail the render (docs/AUDIO_SPEC.md 8.3 rule 1)
     fixtures(src)            merges the fixture characters (tests/fixtures/story_min.js, ids prefixed 'fx_') into __RTS.STORY.characters; returns their ids
     plan(charId, text, style)  -> compact plan summary (dur, syllables, per-syllable f0 start/peak/end, phrase types, words)
     syl(words)               -> {word: syllable count}
   Nothing here touches the sim. */
(function(){
'use strict';
const SR=44100,AUD=()=>window.__RTS.AUD;
const banned=n=>function(){throw new Error(n+' used while rendering');};
function rsync(spec,sec){
  const mr=Math.random,dn=Date.now,pn=performance.now;let p,err=null;
  Math.random=banned('Math.random');Date.now=banned('Date.now');performance.now=banned('performance.now');
  try{p=AUD().render(spec,sec||0,SR);}catch(e){err=e;}finally{Math.random=mr;Date.now=dn;performance.now=pn;}
  if(err)return Promise.reject(err);
  return p;
}
function b64(f32){const u=new Uint8Array(f32.buffer,f32.byteOffset,f32.byteLength);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
const VG=window.VG={
  async render(spec,sec){
    const t0=performance.now();
    const r=await rsync(spec,sec),L=r.channels[0],ana=AUD().analyse(r.channels,r.sampleRate);
    return{sr:r.sampleRate,n:L.length,b64:b64(L),hash:AUD().hash(r.channels),hashExact:AUD().hash(r.channels,true),ana,ms:performance.now()-t0,stereoSame:(function(){const R=r.channels[1];if(!R)return true;for(let i=0;i<L.length;i++)if(L[i]!==R[i])return false;return true;})()};
  },
  fixtures(src){
    const m={exports:{}};new Function('module',src)(m);const F=m.exports(),ids=[],C=window.__RTS.STORY.characters;
    for(const id in F.characters){const c=JSON.parse(JSON.stringify(F.characters[id]));c.id='fx_'+id;C['fx_'+id]=c;ids.push('fx_'+id);}
    return ids;
  },
  plan(id,text,style){
    const V=AUD().voice,P=V.profile(id),pl=V.plan(P,text,style);
    /* the planned silences (phrase pauses): intervals >= 0.1 s inside the line where voicing, aspiration and frication gains are all zero */
    const ev=(a,t)=>{if(!a.length)return 0;if(t<=a[0][0])return a[0][1];for(let i=1;i<a.length;i++)if(t<=a[i][0]){const d=a[i][0]-a[i-1][0];return d>0?a[i-1][1]+(a[i][1]-a[i-1][1])*(t-a[i-1][0])/d:a[i][1];}return a[a.length-1][1];};
    const sil=[];let s0=null;
    for(let t=0;t<=pl.dur;t+=0.005){const q=ev(pl.ch.gv,t)<0.003&&ev(pl.ch.ga,t)<0.003&&ev(pl.ch.gf,t)<0.003;if(q&&s0===null)s0=t;if(!q&&s0!==null){if(t-s0>=0.1&&s0>0.05)sil.push([s0,t]);s0=null;}}
    return{id,dur:pl.dur,words:pl.words,phrases:pl.phrases,rate:pl.rate,cps:pl.cps,style:pl.style,sil,
      syl:pl.syl.map(s=>({t0:s.t0,t1:s.t1,st:s.st,nuc:s.nuc,f0:s.f0,amp:s.amp,txt:s.txt,ph:s.ph}))};
  },
  syl(words){const o={};for(const w of words)o[w]=AUD().voice.syllables(w).length;return o;},
  profile(id){const p=AUD().voice.profile(id);return JSON.parse(JSON.stringify(p));},
  /* probe characters: a character with exactly this voice record (the sweeps change ONE field at a time) */
  addChar(id,voice,extra){window.__RTS.STORY.characters[id]=Object.assign({id,name:id,short:id,role:'ally',voice:Object.assign({pitch:1,rate:1,timbre:'smooth',formant:.5,ttsPitch:1,ttsRate:1},voice)},extra||{});return id;},
  words(text){return AUD().voice.words(text).map(w=>({txt:w.txt,syl:w.syl.length,pause:w.pause,caps:w.caps}));},
  count(text){return AUD().voice.count(text);},
  estimate(text,o){return AUD().voice.estimate(text,o);},
  chars(){return Object.keys(window.__RTS.STORY.characters);},
  canon(id){return AUD().voice.canon(id);}
};
})();
