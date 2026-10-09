/* tests/audio/bs1770_test.js — node tests/audio/bs1770_test.js
   Proves the loudness meter (tests/audio/bs1770.js) before anything is measured with it: analytic known answers, gating, true peak, an ffmpeg `ebur128` cross-check,
   and three mutation controls (a meter without K-weighting, without gating, without oversampling must each FAIL a known answer). */
'use strict';
const L=require('./bs1770.js'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
let fails=0;const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;};
const near=(a,b,t)=>Math.abs(a-b)<=t;
const SR=48000;
const sine=(f,db,sec,sr)=>{sr=sr||SR;const n=Math.round(sec*sr),x=new Float32Array(n),a=Math.pow(10,db/20);for(let i=0;i<n;i++)x[i]=a*Math.sin(2*Math.PI*f*i/sr);return x;};
const zeros=n=>new Float32Array(n);

/* 1. known answers (BS.1770-4 / EBU Tech 3341 test signals) */
let m=L.loudness([sine(997,-20,6),sine(997,-20,6)],SR);
ok(near(m.lufsI,-20.0,0.15),`997 Hz, -20 dBFS in both channels = ${m.lufsI.toFixed(2)} LUFS (expect -20.0 +-0.15)`);
m=L.loudness([sine(997,-20,6),zeros(6*SR)],SR);
ok(near(m.lufsI,-23.0,0.15),`997 Hz, -20 dBFS in ONE channel = ${m.lufsI.toFixed(2)} LUFS (expect -23.0 +-0.15)`);
m=L.loudness([sine(997,-23,20),sine(997,-23,20)],SR);
ok(near(m.lufsI,-23.0,0.1)&&near(m.lufsS,-23,0.15)&&near(m.lufsM,-23,0.15),`EBU 3341 case 1 (stereo -23 dBFS 997 Hz): I ${m.lufsI.toFixed(2)} S ${m.lufsS.toFixed(2)} M ${m.lufsM.toFixed(2)} = -23.0`);
const g=[100,1000,10000].map(f=>L.kGainDb(f,SR));
ok(near(g[0],-1.13,0.2)&&near(g[1],0.70,0.1)&&near(g[2],4.0,0.3),`K-weighting gain at 100 Hz / 1 kHz / 10 kHz = ${g.map(v=>v.toFixed(2)).join(' / ')} dB (expect about -1.1 / +0.7 / +4.0: RLB high-pass + the +4 dB shelf; the ffmpeg cross-check below validates the whole cascade)`);
const m44=L.loudness([sine(997,-20,6,44100),sine(997,-20,6,44100)],44100);
ok(near(m44.lufsI,-20.0,0.15),`the same at 44.1 kHz = ${m44.lufsI.toFixed(2)} LUFS (coefficients are derived per sample rate)`);

/* 2. gating: 3 s of silence + 3 s tone must read the tone, not the average */
const gx=new Float32Array(12*SR);gx.set(sine(997,-20,6),6*SR);
m=L.loudness([gx,gx],SR);
ok(near(m.lufsI,-20.0,0.2),`6 s silence + 6 s of -20 dBFS tone = ${m.lufsI.toFixed(2)} LUFS (gates exclude the silence; an ungated mean would read -23)`);
const q=new Float32Array(20*SR);q.set(sine(997,-20,5),0);q.set(sine(997,-45,15),5*SR);   // relative gate: the quiet part is 25 LU down -> excluded
m=L.loudness([q,q],SR);
ok(near(m.lufsI,-20.0,0.2),`loud 5 s + very quiet 15 s: the -10 LU relative gate excludes the quiet part (${m.lufsI.toFixed(2)} LUFS)`);

/* 3. true peak: a sine at fs/4 sampled 45 degrees off the crest has a sample peak 3 dB under the true peak */
{const n=SR,x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=Math.sin(2*Math.PI*(SR/4)*i/SR+Math.PI/4);
 const sp=20*Math.log10(Math.max.apply(null,Array.from(x).map(Math.abs))),tp=20*Math.log10(L.truePeak([x]));
 ok(near(sp,-3.01,0.05)&&near(tp,0,0.35),`fs/4 sine at 45 deg: sample peak ${sp.toFixed(2)} dBFS, true peak ${tp.toFixed(2)} dBTP (expect -3.01 / 0.0)`);}

/* 4. cross-check against ffmpeg's ebur128 on a synthetic programme (two independent implementations of the same standard) */
function ffcheck(){
  const sr=48000,n=sr*14,l=new Float32Array(n),r=new Float32Array(n);let s=12345;const rnd=()=>{s=(Math.imul(s,1664525)+1013904223)|0;return(s>>>0)/4294967296*2-1;};
  for(let i=0;i<n;i++){const t=i/sr,env=0.5+0.5*Math.sin(2*Math.PI*0.3*t),v=0.12*env*Math.sin(2*Math.PI*220*t)+0.05*Math.sin(2*Math.PI*3100*t)*(t>5?1:0.2)+0.03*rnd()*(t>8?1:0);l[i]=v;r[i]=0.8*v+0.02*rnd();}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bs1770-')),f=path.join(dir,'p.wav'),b=Buffer.alloc(44+n*4);
  b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);
  const ql=new Float32Array(n),qr=new Float32Array(n);   // measure exactly what is written (16-bit quantised)
  for(let i=0;i<n;i++){const a=Math.max(-32768,Math.min(32767,Math.round(l[i]*32768))),c=Math.max(-32768,Math.min(32767,Math.round(r[i]*32768)));b.writeInt16LE(a,44+i*4);b.writeInt16LE(c,46+i*4);ql[i]=a/32768;qr[i]=c/32768;}
  fs.writeFileSync(f,b);
  const res=cp.spawnSync('ffmpeg',['-nostats','-i',f,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8'});
  fs.rmSync(dir,{recursive:true,force:true});
  if(res.error||!/Integrated loudness/.test(res.stderr))return null;
  const tail=res.stderr.slice(res.stderr.lastIndexOf('Summary:')),get=re=>{const mm=tail.match(re);return mm?parseFloat(mm[1]):NaN;};
  return{ref:{I:get(/I:\s+(-?[\d.]+) LUFS/),LRA:get(/LRA:\s+(-?[\d.]+) LU/),TP:get(/Peak:\s+(-?[\d.]+) dBFS/)},mine:L.loudness([ql,qr],sr)};
}
const ff=ffcheck();
if(!ff)console.log('note  ffmpeg not available: the independent cross-check was skipped');
else{
  ok(near(ff.mine.lufsI,ff.ref.I,0.1),`integrated loudness: this meter ${ff.mine.lufsI.toFixed(2)} vs ffmpeg ebur128 ${ff.ref.I.toFixed(1)} LUFS (tolerance 0.1 LU)`);
  ok(near(ff.mine.truePeakDb,ff.ref.TP,0.3),`true peak: this meter ${ff.mine.truePeakDb.toFixed(2)} vs ffmpeg ${ff.ref.TP.toFixed(1)} dBTP (tolerance 0.3 dB)`);
  ok(near(ff.mine.lra,ff.ref.LRA,1.5),`loudness range: this meter ${ff.mine.lra.toFixed(1)} vs ffmpeg ${ff.ref.LRA.toFixed(1)} LU (tolerance 1.5 LU: different percentile interpolation)`);
}

/* 5. mutation controls: a broken meter must fail the known answers (rule 15) */
{const x=sine(100,-20,6),y=sine(10000,-20,6);
 const real=L.loudness([x,x],SR).lufsI,realH=L.loudness([y,y],SR).lufsI;
 ok(realH-real>3.8,`control: the real meter reads a 10 kHz tone ${ (realH-real).toFixed(2) } LU louder than a 100 Hz tone of equal level (K-weighting shelf)`);
 // mutation 1: no weighting -> both equal
 const unweighted=s=>{let a=0;for(const v of s)a+=v*v;return-0.691+10*Math.log10(2*a/s.length);};
 ok(!(unweighted(y)-unweighted(x)>3.8),'mutation "K-weighting removed" is caught (equal-level tones would read equal)');
 // mutation 2: no gating
 const mean=(()=>{const a=L.kweight(gx,SR);let s=0;for(const v of a)s+=v*v;return-0.691+10*Math.log10(2*s/a.length);})();
 ok(!near(mean,-20,0.5),`mutation "gating removed" is caught: the un-gated mean of the silence+tone case reads ${mean.toFixed(1)} LUFS, not -20`);
 // mutation 3: no oversampling
 const x2=new Float32Array(SR);for(let i=0;i<SR;i++)x2[i]=Math.sin(2*Math.PI*(SR/4)*i/SR+Math.PI/4);
 const sp=20*Math.log10(Math.max.apply(null,Array.from(x2).map(Math.abs)));
 ok(!near(sp,0,0.35),`mutation "no oversampling" is caught: the sample peak reads ${sp.toFixed(2)} dB where the true peak is 0 dB`);}
console.log(fails?`FAILED (${fails})`:'ALL OK');
process.exit(fails?1:0);
