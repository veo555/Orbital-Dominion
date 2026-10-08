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
    return{id,dur:pl.dur,words:pl.words,phrases:pl.phrases,rate:pl.rate,cps:pl.cps,style:pl.style,
      syl:pl.syl.map(s=>({t0:s.t0,t1:s.t1,st:s.st,nuc:s.nuc,f0:s.f0,amp:s.amp,txt:s.txt,ph:s.ph}))};
  },
  syl(words){const o={};for(const w of words)o[w]=AUD().voice.syllables(w).length;return o;},
  profile(id){const p=AUD().voice.profile(id);return JSON.parse(JSON.stringify(p));}
};
})();
