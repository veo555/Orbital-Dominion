/* =========================================================================
   tests/audio/bs1770.js — ITU-R BS.1770-4 / EBU R128 loudness measurement, in plain JS (works in Node and in the page: window.ODL).
   Independent of the game code. Verified three ways by tests/audio/bs1770_test.js:
     (1) analytic known answers (a 997 Hz sine at -20 dBFS in both channels is -20.0 LUFS; in one channel -23.0 LUFS; K-weighting gain at 100 Hz / 1 kHz / 10 kHz),
     (2) a gating case (silence + tone: the absolute and relative gates must exclude the silence),
     (3) agreement with ffmpeg's `ebur128` filter (a second, independent implementation) on a synthetic programme.
   API
     ODL.kweight(x, sr)                  -> Float64Array  (pre-filter high shelf + RLB high-pass, any sample rate: coefficients are derived by bilinear transform)
     ODL.loudness(channels, sr, opt)     -> {lufsI, lufsM:max momentary(400 ms), lufsS:max short-term(3 s), lra, truePeakDb, samplePeakDb, blocks}
         channels: array of Float32Array/Float64Array (1 = mono, 2 = L R; weights 1.0 each).  opt.tp=false skips the true-peak oversampling.
     ODL.truePeak(channels, sr)          -> linear true peak (4x oversampled, 48-tap polyphase windowed-sinc; the BS.1770-4 Annex 2 method)
   LUFS here are of the FULL signal (gated integrated loudness). For short sound effects the gate may leave no block: lufsI is then the un-gated mean of the 400 ms blocks
   (flag `ungated:true`), and clips shorter than 400 ms are zero-padded to one block (so a 100 ms click measures ~6 dB lower than its active level — report `activeDb` too).
   ========================================================================= */
(function(root){
'use strict';
function biquadShelf(sr){   // BS.1770 stage 1: high shelf, f0 = 1681.97 Hz, G = +3.9998 dB, Q = 0.7072
  const G=3.999843853973347,Q=0.7071752369554196,f0=1681.9744509555319,K=Math.tan(Math.PI*f0/sr),Vh=Math.pow(10,G/20),Vb=Math.pow(Vh,0.4996667741545416);
  const a0=1+K/Q+K*K;
  return{b:[(Vh+Vb*K/Q+K*K)/a0,2*(K*K-Vh)/a0,(Vh-Vb*K/Q+K*K)/a0],a:[1,2*(K*K-1)/a0,(1-K/Q+K*K)/a0]};
}
function biquadHP(sr){      // stage 2: RLB high-pass, f0 = 38.135 Hz, Q = 0.5003
  const Q=0.5003270373238773,f0=38.13547087602444,K=Math.tan(Math.PI*f0/sr),a0=1+K/Q+K*K;
  return{b:[1,-2,1],a:[1,2*(K*K-1)/a0,(1-K/Q+K*K)/a0]};
}
function filt(x,c){   // direct form II transposed, float64
  const y=new Float64Array(x.length),b=c.b,a=c.a;let z1=0,z2=0;
  for(let i=0;i<x.length;i++){const v=x[i],o=b[0]*v+z1;z1=b[1]*v-a[1]*o+z2;z2=b[2]*v-a[2]*o;y[i]=o;}
  return y;
}
function kweight(x,sr){return filt(filt(x,biquadShelf(sr)),biquadHP(sr));}
/* gain (dB) of the K-weighting at f Hz (for the known-answer test) */
function kGainDb(f,sr){
  const w=2*Math.PI*f/sr,ev=(c)=>{const re=c.b[0]+c.b[1]*Math.cos(w)+c.b[2]*Math.cos(2*w),im=-(c.b[1]*Math.sin(w)+c.b[2]*Math.sin(2*w)),dr=c.a[0]+c.a[1]*Math.cos(w)+c.a[2]*Math.cos(2*w),di=-(c.a[1]*Math.sin(w)+c.a[2]*Math.sin(2*w));return Math.hypot(re,im)/Math.hypot(dr,di);};
  return 20*Math.log10(ev(biquadShelf(sr))*ev(biquadHP(sr)));
}
/* true peak: 4x oversampling with a 48-tap Kaiser-windowed sinc, split in 4 phases */
const TP_TAPS=48,TP_OS=4;let TP_H=null;
function tpKernel(){
  if(TP_H)return TP_H;
  const N=TP_TAPS,H=[];
  const i0=b=>{let s=1,t=1;for(let k=1;k<30;k++){t*=(b/2/k)*(b/2/k);s+=t;}return s;};
  const beta=8,den=i0(beta);
  for(let ph=0;ph<TP_OS;ph++){
    const h=new Float64Array(N/TP_OS*1);   // 12 taps per phase
    for(let k=0;k<h.length;k++){
      const n=(k-h.length/2+1)-ph/TP_OS,w=Math.min(1,Math.abs(n)/(h.length/2)),win=i0(beta*Math.sqrt(Math.max(0,1-w*w)))/den;
      h[k]=(Math.abs(n)<1e-9?1:Math.sin(Math.PI*n)/(Math.PI*n))*win;
    }
    let s=0;for(const v of h)s+=v;for(let k=0;k<h.length;k++)h[k]/=s;   // unity DC gain per phase
    H.push(h);
  }
  return TP_H=H;
}
function truePeak(chs){
  const H=tpKernel(),T=H[0].length;let pk=0;
  for(const x of chs){
    const n=x.length;
    for(let i=0;i<n;i++){const a=Math.abs(x[i]);if(a>pk)pk=a;}
    for(let i=0;i<n;i++){
      for(let ph=1;ph<TP_OS;ph++){   // phase 0 is the sample itself
        const h=H[ph];let s=0;
        for(let k=0;k<T;k++){const j=i+k-(T/2-1);if(j>=0&&j<n)s+=h[k]*x[j];}
        const a=Math.abs(s);if(a>pk)pk=a;
      }
    }
  }
  return pk;
}
function loudness(chs,sr,opt){
  opt=opt||{};
  const nc=chs.length,n=chs[0].length,W=chs.map((x,i)=>{const w=kweight(x,sr);const q=new Float64Array(n);for(let k=0;k<n;k++)q[k]=w[k]*w[k];return q;});
  const blk=Math.round(0.4*sr),hop=Math.round(0.1*sr),sh=Math.round(3*sr);
  // zero-pad to one block for short clips
  const total=Math.max(n,blk),cs=[];   // prefix sums of mean-square (sum over channels) per sample
  const ps=new Float64Array(total+1);
  for(let i=0;i<total;i++){let s=0;if(i<n)for(let c=0;c<nc;c++)s+=W[c][i];ps[i+1]=ps[i]+s;}
  const lufs=ms=>ms>0?-0.691+10*Math.log10(ms):-Infinity;
  const blocks=[];
  for(let st=0;st+blk<=total;st+=hop)blocks.push((ps[st+blk]-ps[st])/blk);
  if(!blocks.length)blocks.push(ps[total]/total);
  const lb=blocks.map(lufs);
  let mom=-Infinity;for(const v of lb)if(v>mom)mom=v;
  // absolute gate -70 LUFS, relative gate -10 LU below the abs-gated mean
  const abs=blocks.filter((m,i)=>lb[i]>-70);
  let integ,ungated=false;
  if(!abs.length){integ=lufs(blocks.reduce((a,b)=>a+b,0)/blocks.length);ungated=true;}
  else{
    const mean=abs.reduce((a,b)=>a+b,0)/abs.length,gate=lufs(mean)-10;
    const g=blocks.filter((m,i)=>lb[i]>-70&&lb[i]>gate);
    integ=lufs(g.reduce((a,b)=>a+b,0)/Math.max(1,g.length));
  }
  // short-term (3 s) max + loudness range
  const stv=[];for(let st=0;st+sh<=total;st+=Math.round(sr)){stv.push(lufs((ps[st+sh]-ps[st])/sh));}
  let shortMax=stv.length?Math.max.apply(null,stv):mom;
  let lra=0;
  if(stv.length>2){const a=stv.filter(v=>v>-70);if(a.length>2){const mean=a.reduce((s,v)=>s+Math.pow(10,v/10),0)/a.length,g=10*Math.log10(mean)-20,b=a.filter(v=>v>g).sort((x,y)=>x-y);if(b.length>1)lra=b[Math.min(b.length-1,Math.floor(b.length*0.95))]-b[Math.floor(b.length*0.1)];}}
  let sp=0;for(const x of chs)for(let i=0;i<x.length;i++){const a=Math.abs(x[i]);if(a>sp)sp=a;}
  const tp=opt.tp===false?sp:truePeak(chs);
  return{lufsI:integ,ungated,lufsM:mom,lufsS:shortMax,lra,truePeakDb:20*Math.log10(Math.max(tp,1e-12)),samplePeakDb:20*Math.log10(Math.max(sp,1e-12)),blocks:blocks.length};
}
const API={kweight,kGainDb,truePeak,loudness};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ODL=API;
})(typeof window!=='undefined'?window:globalThis);
