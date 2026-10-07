/* =========================================================================
   tests/audio/controls.js — control signals for the audio gates (docs/AUDIO_SPEC.md §6 "Controls: every metric test has a mutation control
   (silence, clipped square, white noise, duplicated voice) that must be rejected").

   Pure JS, UMD (Node: tests/audio/selftest.js; browser: window.ODC).
     * single-sound controls  - silence, clipped square, white noise, DC offset, NaN, click at start, cut-off tail, over-long sound
     * a plain additive synthesiser for MUSIC with a known tempo / key / mode / loop length, plus broken variants
       (wrong tempo, wrong key, dead air, loop-seam level step, loop-seam click, noise, silence, clipped square)
   A gate that cannot fail is worthless (CLAUDE.md rule 15): selftest.js feeds each of these to the real check functions and demands the right rejection.
   ========================================================================= */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ODC=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const SR=44100;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const stereo=x=>[x,Float32Array.from(x)];
const N=(sec,sr)=>Math.max(1,Math.round(sec*(sr||SR)));
const gainDb=db=>Math.pow(10,db/20);
function rmsOf(x){let s=0;for(let i=0;i<x.length;i++)s+=x[i]*x[i];return Math.sqrt(s/x.length);}
function scaleToRms(x,db){const r=rmsOf(x)||1,g=gainDb(db)/r;for(let i=0;i<x.length;i++)x[i]*=g;return x;}

/* ----------------------------------------------------------------- single sounds */
function silence(sec,sr){return stereo(new Float32Array(N(sec,sr)));}
function sine(f,sec,amp,sr,fadeMs){
  sr=sr||SR;const n=N(sec,sr),x=new Float32Array(n),fa=Math.round((fadeMs===undefined?5:fadeMs)*sr/1000);
  for(let i=0;i<n;i++){let e=1;if(fa>0){if(i<fa)e=i/fa;else if(i>n-fa)e=(n-i)/fa;}x[i]=(amp===undefined?0.5:amp)*e*Math.sin(2*Math.PI*f*i/sr);}
  return x;
}
function squareClipped(f,sec,amp,sr){const n=N(sec,sr||SR),x=new Float32Array(n);for(let i=0;i<n;i++){const s=Math.sin(2*Math.PI*f*i/(sr||SR))>=0?1:-1;x[i]=Math.max(-1,Math.min(1,s*(amp===undefined?1.5:amp)));}return x;}
function whiteNoise(sec,db,seed,sr){const r=mulberry32(seed||1),n=N(sec,sr||SR),x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=r()*2-1;return scaleToRms(x,db);}
/* a decaying pitched blip: attack ms, exponential decay to -60 dB over `dec` s, optional pitch glide f0 -> f1 (exponential) */
function blip(f0,f1,sec,o,sr){
  o=o||{};sr=sr||SR;const n=N(sec,sr),x=new Float32Array(n),a=Math.max(2,o.attackMs||3)*sr/1000,dec=o.dec||sec*0.6,amp=o.amp===undefined?0.5:o.amp;let ph=0;
  for(let i=0;i<n;i++){const t=i/sr,f=f1&&f1!==f0?f0*Math.pow(f1/f0,Math.min(1,t/(o.glide||sec))):f0;ph+=2*Math.PI*f/sr;
    const e=(i<a?i/a:1)*Math.exp(-6.9*t/dec),h=o.harm||[1];let v=0;for(let k=0;k<h.length;k++)v+=h[k]*Math.sin(ph*(k+1));x[i]=amp*e*v;}
  const fade=Math.round(0.004*sr);for(let i=0;i<fade&&i<n;i++)x[n-1-i]*=i/fade;
  return x;
}
function noiseBurst(sec,o,sr){
  o=o||{};sr=sr||SR;const n=N(sec,sr),r=mulberry32(o.seed||7),x=new Float32Array(n),dec=o.dec||sec*0.4,a=Math.max(2,o.attackMs||2)*sr/1000;let lp=0,hp=0,prev=0;
  const ca=Math.exp(-2*Math.PI*(o.lp||6000)/sr),ch=Math.exp(-2*Math.PI*(o.hp||0)/sr);
  for(let i=0;i<n;i++){const w=r()*2-1;lp=(1-ca)*w+ca*lp;let y=lp;if(o.hp){hp=(1-ch)*y+ch*hp;y=y-hp;}x[i]=(o.amp===undefined?0.5:o.amp)*y*(i<a?i/a:1)*Math.exp(-6.9*(i/sr)/dec);}
  const fade=Math.round(0.004*sr);for(let i=0;i<fade&&i<n;i++)x[n-1-i]*=i/fade;void prev;
  return x;
}
/* the single-sound controls: each must be rejected by checkVoice with the listed code */
function voiceControls(){
  const c={};
  c.silence={ch:silence(0.3),cls:'fire',expect:'silent'};
  c.clippedSquare={ch:stereo(squareClipped(220,0.3,1.5)),cls:'fire',expect:'peak'};
  c.whiteNoiseLoud={ch:stereo(whiteNoise(0.3,-6,3)),cls:'fire',expect:'level'};          // far above the -22 dBFS fire class
  c.tooQuiet={ch:stereo(sine(440,0.3,0.002)),cls:'fire',expect:'level'};                   // about -57 dBFS
  c.dc={ch:stereo(sine(440,0.3,0.2,SR).map(v=>v+0.05)),cls:'fire',expect:'dc'};
  c.nan={ch:(()=>{const x=sine(440,0.3,0.1);x[1000]=NaN;return stereo(x);})(),cls:'fire',expect:'finite'};
  c.clickStart={ch:stereo(sine(440,0.3,0.1,SR,0).map((v,i)=>i<1?0.6:v)),cls:'fire',expect:'first'};
  c.cutTail={ch:stereo(sine(440,0.3,0.1,SR,0)),cls:'fire',expect:'tail'};               // no fade: the last 20 ms are still at full level
  c.tooLong={ch:stereo(blip(300,null,7,{dec:3,amp:0.3})),cls:'fire',expect:'duration'};
  return c;
}

/* ----------------------------------------------------------------- music synthesiser */
const MODES={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],phrygian:[0,1,3,5,7,8,10],lydian:[0,2,4,6,7,9,11],mixolydian:[0,2,4,5,7,9,10]};
const mhz=m=>440*Math.pow(2,(m-69)/12);
/* o: {sr,bpm,tonic (pc 0..11),mode,bars,sec (output length),seed,loop:'wrap'|'cut',levelDb,prog:[scale degree per bar],kick:'beat'|'half'|'none',arp:bool,pad:bool,swing}
   loop 'wrap': one loop of `bars` bars rendered circularly (notes that run past the end wrap onto the start) and tiled -> a seamless loop of exactly bars*4*60/bpm s.
   loop 'cut':  the same, but notes are truncated at the loop end -> a click and a level step at the seam. */
function synthMusic(o){
  o=Object.assign({sr:SR,bpm:100,tonic:2,mode:'minor',bars:8,sec:null,seed:1,loop:'wrap',levelDb:-20,prog:[0,5,3,4,0,5,4,0],kick:'beat',arp:true,pad:true,swing:0},o);
  const sr=o.sr,beat=60/o.bpm,barSec=4*beat,loopSec=o.bars*barSec,Ln=Math.round(loopSec*sr),sc=MODES[o.mode]||MODES.minor,rnd=mulberry32(o.seed);
  const L=new Float64Array(Ln),R=new Float64Array(Ln),wrap=o.loop!=='cut';
  const put=(buf,t,x,pan)=>{const s0=Math.round(t*sr);for(let i=0;i<x.length;i++){let k=s0+i;if(k>=Ln){if(!wrap)break;k%=Ln;}buf[k]+=x[i]*pan;}};
  const tone=(f,dur,amp,harm,att,rel)=>{const n=Math.round((dur+rel)*sr),x=new Float64Array(n);for(let i=0;i<n;i++){const t=i/sr;let e=Math.min(1,t/att);if(t>dur)e*=Math.max(0,1-(t-dur)/rel);let v=0;for(let h=0;h<harm.length;h++){const fh=f*(h+1);if(fh<sr*0.45)v+=harm[h]*Math.sin(2*Math.PI*fh*t);}x[i]=amp*e*v;}return x;};
  const pluck=(f,dur,amp)=>{const n=Math.round(dur*sr),x=new Float64Array(n);for(let i=0;i<n;i++){const t=i/sr,e=Math.min(1,t/0.003)*Math.exp(-5*t/dur);x[i]=amp*e*(Math.sin(2*Math.PI*f*t)+0.4*Math.sin(4*Math.PI*f*t)+0.2*Math.sin(6*Math.PI*f*t));}return x;};
  const kick=amp=>{const n=Math.round(0.22*sr),x=new Float64Array(n);let ph=0;for(let i=0;i<n;i++){const t=i/sr,f=45+75*Math.exp(-t*28);ph+=2*Math.PI*f/sr;x[i]=amp*Math.min(1,t/0.002)*Math.exp(-t*16)*Math.sin(ph);}return x;};
  const snare=amp=>{const n=Math.round(0.16*sr),x=new Float64Array(n);for(let i=0;i<n;i++){const t=i/sr;x[i]=amp*Math.min(1,t/0.002)*Math.exp(-t*24)*((rnd()*2-1)*0.7+0.3*Math.sin(2*Math.PI*190*t));}return x;};
  const hat=amp=>{const n=Math.round(0.045*sr),x=new Float64Array(n);let p=0;for(let i=0;i<n;i++){const t=i/sr,w=rnd()*2-1;x[i]=amp*Math.min(1,t/0.001)*Math.exp(-t*90)*(w-p);p=w;}return x;};
  for(let b=0;b<o.bars;b++){
    const deg=o.prog[b%o.prog.length],t0=b*barSec,root=60+o.tonic;      // tonic in octave 4 (C4 = 60)
    const note=d=>{const oct=Math.floor(d/7),idx=((d%7)+7)%7;return root+sc[idx]+12*oct;};
    const tri=[note(deg),note(deg+2),note(deg+4)];
    if(o.pad)for(const m of tri){put(L,t0,tone(mhz(m-12),barSec*0.95,0.10,[1,0.5,0.3,0.2],0.08,0.25),1);put(R,t0,tone(mhz(m-12)*1.002,barSec*0.95,0.10,[1,0.5,0.3,0.2],0.08,0.25),1);}
    const bass=tone(mhz(note(deg)-24),barSec*0.45,0.35,[1,0.45,0.2],0.01,0.12);put(L,t0,bass,1);put(R,t0,bass,1);put(L,t0+2*beat,bass,1);put(R,t0+2*beat,bass,1);
    if(o.arp)for(let k=0;k<8;k++){const m=tri[[0,1,2,1][k%4]]+12,tt=t0+k*beat/2+(k%2?o.swing*beat/6:0),x=pluck(mhz(m),beat*0.9,0.16);put(L,tt,x,0.8);put(R,tt,x,1.0);}
    for(let k=0;k<4;k++){
      if(o.kick==='beat'||(o.kick==='half'&&k%2===0)){const x=kick(0.6);put(L,t0+k*beat,x,1);put(R,t0+k*beat,x,1);}
      if(o.kick!=='none'&&k%2===1){const x=snare(0.3);put(L,t0+k*beat,x,1);put(R,t0+k*beat,x,1);}
    }
    if(o.kick!=='none')for(let k=0;k<8;k++){const x=hat(0.18);put(L,t0+k*beat/2,x,0.9);put(R,t0+k*beat/2,x,1.0);}
  }
  const sec=o.sec||loopSec,n=Math.round(sec*sr),oL=new Float32Array(n),oR=new Float32Array(n);
  for(let i=0;i<n;i++){oL[i]=L[i%Ln];oR[i]=R[i%Ln];}
  const g=gainDb(o.levelDb)/Math.sqrt((rmsOf(oL)**2+rmsOf(oR)**2)/2||1);for(let i=0;i<n;i++){oL[i]*=g;oR[i]*=g;}
  return{ch:[oL,oR],sr,loopSec,beat,bpm:o.bpm,tonic:o.tonic,mode:o.mode};
}
/* the broken variants of a good cue. base = synthMusic(...) with a declared bpm/tonic; each returns {ch,sr,expect:[codes],declared:{tempo,key}} */
function musicControls(opts){
  opts=Object.assign({bpm:100,tonic:2,mode:'minor',bars:8,sec:null},opts);
  const decl={tempo:opts.bpm,key:'D'};const out={};
  const good=synthMusic(Object.assign({},opts,{sec:opts.bars*4*60/opts.bpm*2}));
  out.good={ch:good.ch,sr:good.sr,loopLen:good.loopSec,declared:decl,expect:[]};
  out.silence={ch:silence(good.loopSec*2),sr:SR,loopLen:good.loopSec,declared:decl,expect:['silent']};
  out.noise={ch:stereo(whiteNoise(good.loopSec*2,-20,5)),sr:SR,loopLen:good.loopSec,declared:decl,expect:['tempo']};
  out.clippedSquare={ch:stereo(squareClipped(110,good.loopSec*2,1.6)),sr:SR,loopLen:good.loopSec,declared:decl,expect:['peak','crest','loudness']};
  const wt=synthMusic(Object.assign({},opts,{bpm:opts.bpm*1.25,sec:good.loopSec*2}));
  out.wrongTempo={ch:wt.ch,sr:SR,loopLen:good.loopSec,declared:decl,expect:['tempo']};
  const wk=synthMusic(Object.assign({},opts,{tonic:(opts.tonic+4)%12,mode:'major',sec:good.loopSec*2}));
  out.wrongKey={ch:wk.ch,sr:SR,loopLen:good.loopSec,declared:decl,expect:[],keyMismatch:true};
  const n=good.ch[0].length,gap=Math.round(3*SR),a=Math.round(good.loopSec*0.3*SR);
  out.deadAir={ch:good.ch.map(c=>{const o=Float32Array.from(c);for(let i=a;i<Math.min(n,a+gap);i++)o[i]=0;return o;}),sr:SR,loopLen:good.loopSec,declared:decl,expect:['deadair']};
  const step=good.ch.map(c=>{const o=Float32Array.from(c),s=Math.round(good.loopSec*SR),q=Math.round(0.6*SR);for(let i=s;i<Math.min(n,s+q);i++)o[i]*=0.2;return o;});
  out.seamStep={ch:step,sr:SR,loopLen:good.loopSec,declared:decl,expect:['seam']};
  const cut=synthMusic(Object.assign({},opts,{loop:'cut',sec:good.loopSec*2,kick:'none',arp:false}));
  out.seamClick={ch:cut.ch,sr:SR,loopLen:good.loopSec,declared:decl,expect:['click']};
  return out;
}

return{SR,mulberry32,stereo,silence,sine,squareClipped,whiteNoise,blip,noiseBurst,rmsOf,scaleToRms,gainDb,voiceControls,synthMusic,musicControls,MODES};
});
