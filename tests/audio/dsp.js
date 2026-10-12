/* =========================================================================
   tests/audio/dsp.js — measurement library for the audio gates (docs/AUDIO_SPEC.md §6).

   UMD: loaded in Node by tests/audio/selftest.js and injected into the game page by tests/e2e/e2e_audio.py (window.ODA).
   Pure functions on Float32Array channels. It never touches the game: the page driver (tests/audio/page.js) does the rendering.
   Everything here is independent of the engine's own audioAnalyse/audioHash (the page driver cross-checks them against each other).

   Sections
     1  primitives (FFT, windows, mono mix)
     2  levels(): the §6.1/§6.2 measurements (finite, peak, active-window RMS, DC, first sample, tail)
     3  voiceFeatures(): the §6.4 distinctness vector (20 Bark-like bands, centroid, flatness, attack, decay, zcr, pitch slope + voiced fraction + duration)
     4  checkVoice(): checks 1-3 as a list of failures;  voiceBudget(): duration bounds per id pattern
     5  distinctness: z-normalisation, pairwise distance, group building (a)(b)(c)(d), tau calibration on cloned-voice controls
     6  music: programme loudness, dead air, tempo (onset-envelope autocorrelation), key (chroma x Krumhansl-Kessler), loop seam, theme distinctness, checkCue()
   ========================================================================= */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ODA=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const TAU=Math.PI*2;
const dbp=v=>v>0?10*Math.log10(v):-200;      // power -> dB
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const med=a=>{const s=Array.from(a).sort((x,y)=>x-y),n=s.length;return n?(n&1?s[n>>1]:(s[n/2-1]+s[n/2])/2):0;};

/* ---------------------------------------------------------------- 1. primitives */
const PLAN={};
function plan(n){
  let p=PLAN[n];if(p)return p;
  let lg=0;while((1<<lg)<n)lg++;if((1<<lg)!==n)throw new Error('fft size must be a power of two: '+n);
  const rev=new Uint32Array(n),cos=new Float64Array(n/2),sin=new Float64Array(n/2);
  for(let i=0;i<n;i++){let r=0;for(let b=0;b<lg;b++)if(i&(1<<b))r|=1<<(lg-1-b);rev[i]=r;}
  for(let i=0;i<n/2;i++){cos[i]=Math.cos(TAU*i/n);sin[i]=-Math.sin(TAU*i/n);}
  return PLAN[n]={rev,cos,sin};
}
/* in-place complex FFT (forward); inverse = conj trick in the callers */
function fft(re,im){
  const n=re.length,{rev,cos,sin}=plan(n);
  for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
  for(let size=2;size<=n;size<<=1){
    const half=size>>1,step=n/size;
    for(let i=0;i<n;i+=size)for(let k=0,w=0;k<half;k++,w+=step){
      const a=i+k,b=a+half,wr=cos[w],wi=sin[w],xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;
      re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;}
  }
}
const HANN={};
function hann(n){let w=HANN[n];if(w)return w;w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=0.5-0.5*Math.cos(TAU*(i+0.5)/n);return HANN[n]=w;}
function mono(ch){
  if(ch.length===1)return ch[0];
  const n=ch[0].length,o=new Float32Array(n),a=ch[0],b=ch[1];
  for(let i=0;i<n;i++)o[i]=0.5*(a[i]+b[i]);
  return o;
}
function slice(ch,t0,t1,sr){const a=Math.max(0,Math.round(t0*sr)),b=Math.min(ch[0].length,Math.round(t1*sr));return ch.map(c=>c.subarray(a,b));}
/* FNV-1a over 16-bit quantised samples (§6.3) - same algorithm as audioHash(ch) but written independently */
function hashQ(ch){
  let h=0x811C9DC5;
  for(let c=0;c<ch.length;c++){const d=ch[c];for(let i=0;i<d.length;i++){let v=d[i];v=v<-1?-1:v>1?1:v;const q=Math.round(v*32767)&0xFFFF;h^=q&255;h=Math.imul(h,16777619);h^=q>>8;h=Math.imul(h,16777619);}}
  return(h>>>0).toString(16).padStart(8,'0');
}

/* ---------------------------------------------------------------- 2. levels */
/* §8.6: active window = 10 ms frames within 40 dB of the loudest frame (first..last such frame); activeDb = RMS over it, both channels */
function levels(ch,sr){
  const nc=ch.length,n=ch[0].length,fr=Math.max(1,Math.round(sr*0.01)),nf=Math.floor(n/fr),lev=new Float64Array(nf+1);
  let pk=0,fin=true,sum=0,sq=0,first=0;
  for(let c=0;c<nc;c++){
    const d=ch[c];if(Math.abs(d[0])>first)first=Math.abs(d[0]);
    for(let i=0;i<n;i++){const v=d[i];if(!(v-v===0)){fin=false;continue;}const a=v<0?-v:v;if(a>pk)pk=a;sum+=v;sq+=v*v;lev[Math.min(nf,(i/fr)|0)]+=v*v;}
  }
  let mx=0;for(let i=0;i<nf;i++)if(lev[i]>mx)mx=lev[i];
  const thr=mx*1e-4;let a0=-1,a1=-1,as=0;
  for(let i=0;i<nf;i++)if(lev[i]>=thr&&lev[i]>0){if(a0<0)a0=i;a1=i;}
  if(a0>=0)for(let i=a0;i<=a1;i++)as+=lev[i];
  const act=a0<0?0:as/((a1-a0+1)*fr*nc),tn=Math.min(n,Math.round(sr*0.02));let ts=0;
  for(let c=0;c<nc;c++)for(let i=n-tn;i<n;i++)ts+=ch[c][i]*ch[c][i];
  return{finite:fin,peak:pk,rmsDb:dbp(sq/(n*nc)),activeDb:dbp(act),start:a0<0?0:a0*fr/sr,end:a0<0?0:(a1+1)*fr/sr,dc:Math.abs(sum/(n*nc)),first,tailDb:dbp(ts/(tn*nc)),dur:n/sr};
}

/* ---------------------------------------------------------------- 3. voice features (§6.4) */
const BARK_EDGES=[20,100,200,300,400,510,630,770,920,1080,1270,1480,1720,2000,2320,2700,3150,3700,4400,5300,16000];   // 20 Bark-like bands (the last merges Bark 20-24)
const NB=BARK_EDGES.length-1;
const FEATURE_NAMES=[];for(let i=0;i<NB;i++)FEATURE_NAMES.push('b'+i);
FEATURE_NAMES.push('centroid','flatness','attack','decay','zcr','pitchSlope','voiced','duration');
/* normalisation floors (about one just-noticeable step of each feature): z = (x-mean)/max(sd,floor), so a tight corpus does not blow noise up */
const FEATURE_FLOOR=[];for(let i=0;i<NB;i++)FEATURE_FLOOR.push(3);
FEATURE_FLOOR.push(0.12,3,0.08,0.08,0.1,0.25,0.15,0.08);

/* long-term average power spectrum of x[s0,s1) (Hann frames, 50 % overlap; short sounds: one zero-padded frame) */
function avgSpectrum(x,s0,s1){
  const len=Math.max(1,s1-s0);let N=1024;while(N<len&&N<4096)N<<=1;
  const re=new Float64Array(N),im=new Float64Array(N),P=new Float64Array(N/2+1),hop=N>>1,nfr=len<=N?1:Math.floor((len-N)/hop)+1;
  for(let f=0;f<nfr;f++){
    const st=s0+f*hop,m=Math.min(N,s1-st),w=hann(m);
    for(let i=0;i<N;i++){re[i]=i<m?x[st+i]*w[i]:0;im[i]=0;}
    fft(re,im);for(let k=0;k<=N/2;k++)P[k]+=re[k]*re[k]+im[k]*im[k];
  }
  return{P,N};
}
/* 20 band energies in dB relative to the total, with a SPREADING function: every spectral bin feeds all bands with a Gaussian weight (sigma 0.8 band) around the band centres in log-frequency,
   so a partial that moves a few percent in pitch moves its energy smoothly between bands instead of jumping 40 dB across a band edge (measured: this halves the distance a tonal voice
   has to its own other-seed renders); floor -60 dB */
const BAND_SIGMA=0.8,BAND_FLOOR=-60,WCACHE={};
function bandWeights(N,sr){
  const key=N+'@'+sr;let W=WCACHE[key];if(W)return W;
  const nb=N/2+1;W=new Float32Array(NB*nb);
  for(let k=1;k<nb;k++){
    const f=k*sr/N;if(f<BARK_EDGES[0]||f>=BARK_EDGES[NB])continue;
    let b=0;while(f>=BARK_EDGES[b+1])b++;
    const u=b+Math.log(f/BARK_EDGES[b])/Math.log(BARK_EDGES[b+1]/BARK_EDGES[b]);
    for(let j=0;j<NB;j++){const d=u-(j+0.5);W[j*nb+k]=Math.exp(-d*d/(2*BAND_SIGMA*BAND_SIGMA));}
  }
  return WCACHE[key]=W;
}
function bandsOf(P,N,sr){
  const nb=N/2+1,W=bandWeights(N,sr),E=new Float64Array(NB);let tot=0;
  for(let j=0;j<NB;j++){let e=0;const o=j*nb;for(let k=1;k<nb;k++)e+=P[k]*W[o+k];E[j]=e;tot+=e;}
  const o=[];for(let j=0;j<NB;j++)o.push(Math.max(BAND_FLOOR,dbp((E[j]+1e-30)/(tot+1e-30))));
  return o;
}
/* McLeod pitch method on frames of W samples: returns the pitch contour slope (octaves/s) and the voiced fraction */
function pitchContour(x,s0,s1,sr,maxFrames){
  const len=s1-s0,W=len>=2048?2048:len>=1024?1024:0;
  if(!W)return{slope:0,voiced:0,n:0,f0:[],t:[]};
  const hop=Math.max(W>>2,Math.ceil((len-W)/Math.max(1,maxFrames||90))),re=new Float64Array(2*W),im=new Float64Array(2*W),nsdf=new Float64Array(W);
  const lagLo=Math.max(2,Math.floor(sr/3000)),lagHi=Math.min(W-2,Math.floor(sr/50)),frames=[];
  let maxE=0;
  for(let st=s0;st+W<=s1;st+=hop){
    let e=0;for(let i=0;i<W;i++){const v=x[st+i];re[i]=v;im[i]=0;e+=v*v;}
    for(let i=W;i<2*W;i++){re[i]=0;im[i]=0;}
    frames.push({st,e:e/W,f:0,c:0});if(e/W>maxE)maxE=e/W;
    if(e<1e-12)continue;
    fft(re,im);for(let k=0;k<2*W;k++){re[k]=re[k]*re[k]+im[k]*im[k];im[k]=0;}
    fft(re,im);                                   // |X|^2 is real & even, so the forward FFT of it is its autocorrelation (x2W)
    let m=0;for(let i=0;i<W;i++)m+=2*x[st+i]*x[st+i];
    for(let l=0;l<W;l++){nsdf[l]=m>1e-20?2*(re[l]/(2*W))/m:0;m-=x[st+l]*x[st+l]+x[st+W-1-l]*x[st+W-1-l];}   // re[l] = 2W * autocorrelation[l]
    // key maxima: highest sample of every positive lobe that follows a negative zero crossing
    let l=1;while(l<lagHi&&nsdf[l]>0)l++;                   // skip the lobe around lag 0
    const lobes=[];let best=0;
    while(l<lagHi){
      while(l<lagHi&&nsdf[l]<=0)l++;
      let pk=l,pv=-1;while(l<lagHi&&nsdf[l]>0){if(nsdf[l]>pv){pv=nsdf[l];pk=l;}l++;}
      if(pv>0&&pk>=lagLo){lobes.push([pk,pv]);if(pv>best)best=pv;}
    }
    if(!lobes.length)continue;
    let pick=null;for(const lo of lobes)if(lo[1]>=0.9*best){pick=lo;break;}
    const fr=frames[frames.length-1],k=pick[0],a=nsdf[k-1],b=nsdf[k],c=nsdf[k+1],den=a-2*b+c,sh=den<0?0.5*(a-c)/den:0;
    fr.f=sr/(k+sh);fr.c=pick[1];
  }
  const live=frames.filter(f=>f.e>=maxE*1e-4);                // frames within 40 dB of the loudest
  const voiced=live.filter(f=>f.f>0&&f.c>=0.85);
  const v=live.length?voiced.length/live.length:0;
  let lf=voiced.map(f=>Math.log2(f.f));
  if(lf.length>=3)lf=lf.map((_,i)=>med([lf[Math.max(0,i-1)],lf[i],lf[Math.min(lf.length-1,i+1)]]));   // 3-tap median: removes isolated octave errors
  const tt=voiced.map(f=>(f.st+W/2-s0)/sr);let slope=0;
  if(lf.length>=4){let mt=0,my=0;for(let i=0;i<lf.length;i++){mt+=tt[i];my+=lf[i];}mt/=lf.length;my/=lf.length;let sxy=0,sxx=0;for(let i=0;i<lf.length;i++){sxy+=(tt[i]-mt)*(lf[i]-my);sxx+=(tt[i]-mt)*(tt[i]-mt);}slope=sxx>0?sxy/sxx:0;}
  return{slope:clamp(slope,-8,8),voiced:v,n:voiced.length,f0:voiced.map(f=>f.f),t:tt};
}
/* the §6.4 feature vector (FEATURE_NAMES) of a rendered voice; lv = levels(ch,sr) */
function voiceFeatures(ch,sr,lv){
  lv=lv||levels(ch,sr);
  const x=mono(ch),n=x.length;
  let s0=Math.max(0,Math.floor(lv.start*sr)),s1=Math.min(n,Math.max(s0+64,Math.ceil(lv.end*sr)));
  const{P,N}=avgSpectrum(x,s0,s1),b=bandsOf(P,N,sr);
  // centroid + flatness
  let sw=0,sp=0,mx=0;for(let k=1;k<=N/2;k++){const f=k*sr/N;if(f>=50&&f<=16000){sw+=f*P[k];sp+=P[k];if(P[k]>mx)mx=P[k];}}
  const cen=sp>0?sw/sp:1000;
  let lg=0,ar=0,cnt=0;const fl=mx*1e-9+1e-30;for(let k=1;k<=N/2;k++){const f=k*sr/N;if(f>=100&&f<=16000){lg+=Math.log(P[k]+fl);ar+=P[k]+fl;cnt++;}}
  const flat=cnt?Math.max(-90,10*Math.log10(Math.exp(lg/cnt)/(ar/cnt))):-90;
  // amplitude envelope: 2 ms RMS windows, 1 ms hop
  const h=Math.max(1,Math.round(sr*0.001)),env=[];
  for(let i=s0;i<s1;i+=h){let s=0,m=Math.min(2*h,s1-i);for(let j=0;j<m;j++)s+=x[i+j]*x[i+j];env.push(Math.sqrt(s/m));}
  let pk=0,kp=0;for(let i=0;i<env.length;i++)if(env[i]>pk){pk=env[i];kp=i;}
  let k10=0,k90=0,kEnd=kp;
  for(let i=0;i<env.length;i++)if(env[i]>=0.1*pk){k10=i;break;}
  for(let i=0;i<env.length;i++)if(env[i]>=0.9*pk){k90=i;break;}
  for(let i=env.length-1;i>=kp;i--)if(env[i]>=0.1*pk){kEnd=i;break;}
  const atk=Math.log10(Math.max(1,(k90-k10)+1)),dec=Math.log10(Math.max(1,(kEnd-kp)+1));
  // zero crossings per second
  let zc=0;for(let i=s0+1;i<s1;i++)if((x[i-1]<0)!==(x[i]<0))zc++;
  const zcr=Math.log10(1+zc/Math.max(0.005,(s1-s0)/sr));
  const pc=pitchContour(x,s0,Math.min(s1,s0+Math.round(1.5*sr)),sr,90);
  const dur=Math.log10(Math.max(0.01,(s1-s0)/sr));
  const v=b.concat([Math.log2(cen),flat,atk,dec,zcr,pc.slope,pc.voiced,dur]);
  return{v,centroidHz:cen,pitchSlope:pc.slope,voiced:pc.voiced,attackMs:Math.pow(10,atk),decayMs:Math.pow(10,dec),flatnessDb:flat};
}

/* ---------------------------------------------------------------- 4. per-voice checks (§6.1-§6.3) */
const CLASS_DB={ui:-26,fire:-22,impact:-18,boom:-14,alert:-17,music:-20,amb:-30};
/* declared duration bounds by id pattern (the craft rules the content agents were given: fire <= 0.35 s, select/ack <= 0.6 s, booms <= 2.5 s) */
function voiceBudget(id,cls){
  const seg=id.split('.'),ev=seg.length>=3?seg[1]:'';let max=Infinity,why='';
  if(ev==='fire'){max=0.35;why='fire <= 0.35 s';}
  else if(ev==='select'||ev==='ack'){max=0.6;why='select/ack <= 0.6 s';}
  if(cls==='boom'&&2.5<max){max=2.5;why='boom <= 2.5 s';}
  return{max,why};
}
const LIMITS={peak:0.98,dc:0.01,first:0.05,tailDb:-60,silentDb:-60,levelTol:4,maxRender:6};
/* rec: {id,cls,dur,tail,fallback,lv,hashA,hashB,error,impure}; returns [{code,msg}] */
function checkVoice(rec,o){
  o=o||{};const out=[],f=(code,msg)=>out.push({code,msg}),L=Object.assign({},LIMITS,o.limits),cdb=o.classDb||CLASS_DB;
  if(rec.impure&&!rec.lv){f('impure',String(rec.impure));return out;}
  if(rec.error||!rec.lv){f('render',String(rec.error||'not rendered'));return out;}
  const a=rec.lv;
  if(!a.finite)f('finite','NaN/Inf samples');
  if(a.peak>L.peak)f('peak','peak '+a.peak.toFixed(3)+' > '+L.peak);
  if(!(a.activeDb>=L.silentDb))f('silent','active RMS '+a.activeDb.toFixed(1)+' dBFS (< '+L.silentDb+')');
  if(a.dc>=L.dc)f('dc','|DC| '+a.dc.toFixed(4));
  if(a.first>=L.first)f('first','first sample '+a.first.toFixed(3)+' (click at start)');
  if(a.tailDb>L.tailDb)f('tail','last 20 ms at '+a.tailDb.toFixed(1)+' dBFS (cut off: click at end)');
  const tgt=cdb[rec.cls];
  if(tgt===undefined)f('class','unknown class '+rec.cls);
  else if(a.activeDb>=L.silentDb&&Math.abs(a.activeDb-tgt)>L.levelTol)f('level','level '+a.activeDb.toFixed(1)+' dBFS vs '+rec.cls+' target '+tgt+' ('+(a.activeDb-tgt>0?'+':'')+(a.activeDb-tgt).toFixed(1)+' dB, window +-'+L.levelTol+')');
  const bound=rec.dur+rec.tail;
  if(bound>L.maxRender)f('duration','declared dur+tail '+bound.toFixed(2)+' s > '+L.maxRender+' s render bound');
  if(a.end>bound+0.05)f('duration','audible for '+a.end.toFixed(2)+' s but declares dur+tail = '+bound.toFixed(2)+' s');
  const bu=voiceBudget(rec.id,rec.cls);
  if(rec.dur>bu.max)f('budget','declared dur '+rec.dur.toFixed(2)+' s exceeds the rule "'+bu.why+'"');
  if(rec.hashA!==rec.hashB)f('determinism','two renders with the same seed differ ('+rec.hashA+' vs '+rec.hashB+')');
  if(rec.impure)f('impure',String(rec.impure));
  return out;
}

/* ---------------------------------------------------------------- 5. distinctness */
function znorm(vecs,floors){
  floors=floors||FEATURE_FLOOR;
  const d=vecs[0].length,n=vecs.length,mean=new Array(d).fill(0),sd=new Array(d).fill(0);
  for(const v of vecs)for(let i=0;i<d;i++)mean[i]+=v[i]/n;
  for(const v of vecs)for(let i=0;i<d;i++)sd[i]+=(v[i]-mean[i])*(v[i]-mean[i])/n;
  for(let i=0;i<d;i++)sd[i]=Math.max(Math.sqrt(sd[i]),floors[i]||1e-6);
  return{mean,sd};
}
const zproj=(v,zn)=>v.map((x,i)=>(x-zn.mean[i])/zn.sd[i]);
function dist(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;}return Math.sqrt(s);}
/* split a voice id into {type,event,faction}; skills are skill.<id>, globals global.<name> / ui.<name> */
function parseId(id,voc){
  const s=id.split('.');
  if(s[0]==='skill')return{kind:'skill',name:s.slice(1).join('.')};
  if(s[0]==='ui'||s[0]==='global')return{kind:'global',name:s.slice(1).join('.')};
  if(s.length===3&&voc.factions.indexOf(s[2])>=0){
    if(voc.units.indexOf(s[0])>=0)return{kind:'unit',type:s[0],event:s[1],faction:s[2]};
    if(voc.buildings.indexOf(s[0])>=0)return{kind:'building',type:s[0],event:s[1],faction:s[2]};
  }
  return{kind:'other'};
}
/* the groups whose members must be pairwise distinct:
   (a) every pair of unit types with the same event and faction   (b) the faction variants of one unit/building and event
   (c) the nine skills                                            (d) the UI/global voices of one class (a name is served by ui.<name>, else global.<name>)
   opt.cls: id -> class (groups (d) by class) */
function distinctGroups(ids,voc,opt){
  const groups=[],cls=(opt&&opt.cls)||{},P=ids.map(id=>[id,parseId(id,voc)]);
  const by=f=>{const m={};for(const[id,p]of P){const key=f(p);if(key)(m[key]=m[key]||[]).push(id);}return m;};
  const a=by(p=>p.kind==='unit'?p.event+'|'+p.faction:null);
  for(const k in a)if(a[k].length>1)groups.push({rule:'a',key:k,ids:a[k]});
  const b=by(p=>p.kind==='unit'||p.kind==='building'?p.kind+'|'+p.type+'|'+p.event:null);
  for(const k in b)if(b[k].length>1)groups.push({rule:'b',key:k,ids:b[k]});
  const c=P.filter(([,p])=>p.kind==='skill').map(([id])=>id);if(c.length>1)groups.push({rule:'c',key:'skills',ids:c});
  const served={};for(const[id,p]of P)if(p.kind==='global'&&(id.indexOf('ui.')===0||!served[p.name]))served[p.name]=id;
  const gc={};for(const nm in served){const cl=cls[served[nm]]||'';(gc[cl]=gc[cl]||[]).push(served[nm]);}
  for(const cl in gc)if(gc[cl].length>1)groups.push({rule:'d',key:'ui/global '+cl,ids:gc[cl]});
  return groups;
}
/* pairs closer than tau; Z maps id -> z-vector */
function weakPairs(groups,Z,tau){
  const bad=[];
  for(const g of groups){
    const ids=g.ids.filter(id=>Z[id]);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const d=dist(Z[ids[i]],Z[ids[j]]);if(d<tau)bad.push({rule:g.rule,key:g.key,a:ids[i],b:ids[j],d});}
  }
  return bad;
}
/* tau (z units): two voices closer than this are "the same sound". Fixed at 1.0 and VALIDATED against data on every run (calibrate): on the 61 original game voices rendered with 6 seeds
   (the game's own pitch/filter/gain variation = the in-game "clone"), the median distance of a voice to its other-seed renders was 0.47 (P90 1.5) while the median nearest OTHER voice was 3.0 (P10 1.9).
   calibrate() recomputes both from the corpus being tested and demands  1.5 x median(clone distance) <= tau <= median(nearest other voice):
   tau rejects the typical clone and the gate stays passable for typical distinct voices. */
const TAU_Z=1.0;
const qtile=(a,p)=>{const s=Array.from(a).sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:NaN;};
/* cloneSets: [{ref:feat,vars:[feat...]}] (a voice and its other-seed / pitch-shifted renders); refVecs: one reference feature per distinct voice; zn from znorm() */
function cloneStats(cloneSets,refVecs,zn){
  const intra=[],inter=[],Z=refVecs.map(v=>zproj(v,zn));
  for(const cs of cloneSets){const r=zproj(cs.ref,zn);for(const v of cs.vars)intra.push(dist(r,zproj(v,zn)));}
  for(let i=0;i<Z.length;i++){let m=Infinity;for(let j=0;j<Z.length;j++)if(j!==i)m=Math.min(m,dist(Z[i],Z[j]));inter.push(m);}
  return{intra,inter};
}
function calibrate(intra,inter,tau){
  tau=tau===undefined?TAU_Z:tau;
  const medIntra=qtile(intra,0.5),p90Intra=qtile(intra,0.9),medInter=qtile(inter,0.5),p10Inter=qtile(inter,0.1);
  const rejectsClones=tau>=1.5*medIntra,passable=tau<=medInter;
  return{tau,medIntra,p90Intra,medInter,p10Inter,rejectsClones,passable,ok:rejectsClones&&passable,n:{intra:intra.length,inter:inter.length}};
}

/* ---------------------------------------------------------------- 6. music */
/* programme loudness / crest / dead air of a rendered cue */
function programme(ch,sr){
  const lv=levels(ch,sr),n=ch[0].length,nc=ch.length,fr=Math.round(sr*0.05),nf=Math.floor(n/fr);
  let run=0,longest=0,runStart=0,at=0;const rmsFrames=[];
  for(let k=0;k<nf;k++){let s=0;for(let c=0;c<nc;c++){const d=ch[c];for(let i=k*fr;i<(k+1)*fr;i++)s+=d[i]*d[i];}const ms=s/(fr*nc);rmsFrames.push(ms);
    if(dbp(ms)<-60){if(run===0)runStart=k;run++;if(run>longest){longest=run;at=runStart;}}else run=0;}
  const peakDb=lv.peak>0?20*Math.log10(lv.peak):-200;
  return{finite:lv.finite,peak:lv.peak,rmsDb:lv.rmsDb,activeDb:lv.activeDb,crestDb:peakDb-lv.rmsDb,dc:lv.dc,deadAir:longest*0.05,deadAirAt:at*0.05,dur:lv.dur,rmsFrames};
}
/* onset-strength envelope: log-compressed spectral flux (N=1024, hop=256), local mean removed */
function onsetEnvelope(x,sr){
  const N=1024,hop=256,nb=N/2,w=hann(N),re=new Float64Array(N),im=new Float64Array(N);
  let prev=new Float64Array(nb),cur=new Float64Array(nb);const o=[];
  const kmax=Math.min(nb,Math.floor(10000*N/sr));
  for(let st=0;st+N<=x.length;st+=hop){
    for(let i=0;i<N;i++){re[i]=x[st+i]*w[i];im[i]=0;}
    fft(re,im);let fl=0;
    for(let k=1;k<kmax;k++){cur[k]=Math.log(1+60*Math.sqrt(re[k]*re[k]+im[k]*im[k])/N*2);const d=cur[k]-prev[k];if(d>0)fl+=d;}
    o.push(fl);const t=prev;prev=cur;cur=t;
  }
  const fps=sr/hop,half=Math.max(2,Math.round(fps*0.25)),n=o.length,e=new Float64Array(n);
  let run=0;const cs=new Float64Array(n+1);for(let i=0;i<n;i++)cs[i+1]=cs[i]+o[i];
  for(let i=0;i<n;i++){const a=Math.max(0,i-half),b=Math.min(n,i+half+1);run=(cs[b]-cs[a])/(b-a);e[i]=Math.max(0,o[i]-run);}
  return{env:e,fps};
}
/* tempo from the autocorrelation of the onset envelope: comb score over multiples of the beat lag, mild prior around 110 BPM */
function tempoOf(x,sr,opt){
  opt=opt||{};const{env,fps}=onsetEnvelope(x,sr),n=env.length;
  if(n<fps*3)return{bpm:0,conf:0,density:0,peaks:0};
  let M=1;while(M<n*2)M<<=1;
  const re=new Float64Array(M),im=new Float64Array(M);for(let i=0;i<n;i++)re[i]=env[i];
  fft(re,im);for(let k=0;k<M;k++){re[k]=re[k]*re[k]+im[k]*im[k];im[k]=0;}fft(re,im);
  const r=new Float64Array(n);for(let l=0;l<n;l++)r[l]=re[l]/(n-l)*n;const r0=r[0]||1;for(let l=0;l<n;l++)r[l]/=r0;
  const at=l=>{if(l<0||l>=n-1)return 0;const i=Math.floor(l),f=l-i;return r[i]*(1-f)+r[i+1]*f;};
  const lo=opt.lo||40,hi=opt.hi||240,W=[1,0.6,0.4,0.3],scores=[],bpms=[];
  for(let b=lo;b<=hi;b+=0.25){
    const L=60/b*fps;let s=0,ws=0;for(let m=1;m<=4;m++){if(m*L>=n-2)break;s+=W[m-1]*at(m*L);ws+=W[m-1];}
    const prior=Math.exp(-0.5*Math.pow(Math.log2(b/110)/1.0,2));
    bpms.push(b);scores.push(ws?s/ws*prior:0);
  }
  let bi=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[bi])bi=i;
  let bpm=bpms[bi];
  if(bi>0&&bi<scores.length-1){const a=scores[bi-1],b=scores[bi],c=scores[bi+1],den=a-2*b+c;if(den<0)bpm+=0.25*0.5*(a-c)/den;}
  const sorted=Array.from(scores).sort((p,q)=>p-q),median=sorted[sorted.length>>1];
  // onset density: peaks of the onset envelope above a fraction of its robust maximum
  let mxe=0;for(let i=0;i<n;i++)if(env[i]>mxe)mxe=env[i];
  let pk=0;const th=mxe*0.2,gap=Math.round(fps*0.06);let last=-gap;
  for(let i=1;i<n-1;i++)if(env[i]>th&&env[i]>=env[i-1]&&env[i]>env[i+1]&&i-last>=gap){pk++;last=i;}
  return{bpm,conf:median>1e-9?scores[bi]/median:scores[bi]*1e9,peak:scores[bi],density:pk/(n/fps),scoreAt:b=>{const i=Math.round((b-lo)/0.25);return i>=0&&i<scores.length?scores[i]:0;}};
}
/* is `est` the declared tempo within tol, or a clean 2x / 1/2x of it? */
function tempoMatch(est,decl,tol){
  tol=tol||0.03;for(const m of[1,2,0.5])if(Math.abs(est/(decl*m)-1)<=tol)return{ok:true,mult:m};
  return{ok:false,mult:0};
}
/* 12-bin chroma from long-window spectral peaks (N=16384, hop=8192) between 60 Hz and 2.1 kHz, soft-assigned between neighbouring pitch classes */
function chromaOf(x,sr){
  const N=16384,hop=8192,w=hann(N),re=new Float64Array(N),im=new Float64Array(N),c=new Float64Array(12),mag=new Float64Array(N/2+1);
  const k0=Math.max(2,Math.floor(60*N/sr)),k1=Math.min(N/2-2,Math.ceil(2100*N/sr));
  let frames=0;
  for(let st=0;st+N<=x.length||(frames===0&&st===0);st+=hop){
    const m=Math.min(N,x.length-st);for(let i=0;i<N;i++){re[i]=i<m?x[st+i]*w[i]:0;im[i]=0;}
    fft(re,im);let mx=0;for(let k=k0-1;k<=k1+1;k++){mag[k]=Math.sqrt(re[k]*re[k]+im[k]*im[k]);if(mag[k]>mx)mx=mag[k];}
    if(mx<=0)continue;frames++;
    for(let k=k0;k<=k1;k++){
      if(mag[k]<0.03*mx||mag[k]<mag[k-1]||mag[k]<=mag[k+1])continue;
      const a=Math.log(mag[k-1]+1e-30),b=Math.log(mag[k]+1e-30),cc=Math.log(mag[k+1]+1e-30),den=a-2*b+cc,sh=den<0?0.5*(a-cc)/den:0,f=(k+sh)*sr/N;
      const midi=69+12*Math.log2(f/440),pf=((midi%12)+12)%12,i0=Math.floor(pf),fr=pf-i0,v=Math.pow(mag[k]/mx,0.7);
      c[i0]+=(1-fr)*v;c[(i0+1)%12]+=fr*v;
    }
    if(x.length<N)break;
  }
  let s=0;for(let i=0;i<12;i++)s+=c[i];
  return Array.from(c).map(v=>s>0?v/s:0);
}
const KK_MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],KK_MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const PCN=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pcOf=name=>{const m=/^([A-Ga-g])([#b]?)/.exec(name||'');if(!m)return -1;const b={c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0);return(b+12)%12;};
function pearson(a,b){let ma=0,mb=0;for(let i=0;i<a.length;i++){ma+=a[i];mb+=b[i];}ma/=a.length;mb/=a.length;let sab=0,saa=0,sbb=0;for(let i=0;i<a.length;i++){sab+=(a[i]-ma)*(b[i]-mb);saa+=(a[i]-ma)*(a[i]-ma);sbb+=(b[i]-mb)*(b[i]-mb);}return saa>0&&sbb>0?sab/Math.sqrt(saa*sbb):0;}
/* best Krumhansl-Kessler key of a chroma vector: {tonic:0..11, mode:'major'|'minor', r, name, ranked} */
function keyOf(chroma){
  const res=[];
  for(let t=0;t<12;t++){
    const rot=i=>chroma[(t+i)%12];const v=[];for(let i=0;i<12;i++)v.push(rot(i));
    res.push({tonic:t,mode:'major',r:pearson(v,KK_MAJ)});res.push({tonic:t,mode:'minor',r:pearson(v,KK_MIN)});
  }
  res.sort((a,b)=>b.r-a.r);const b=res[0];
  return{tonic:b.tonic,mode:b.mode,r:b.r,name:PCN[b.tonic]+(b.mode==='minor'?'m':''),ranked:res.slice(0,3).map(k=>PCN[k.tonic]+(k.mode==='minor'?'m':'')+':'+k.r.toFixed(2))};
}
/* loop seam: `ch` holds >= one loop plus a second pass; L = loop length (s).
   step = |RMS(last 0.25 s of pass 1) - RMS(first 0.25 s of pass 2)| in dB; click = the sample jump at the seam against the local sample-to-sample change */
function seamOf(ch,sr,L){
  const x=mono(ch),n=x.length,s=Math.round(L*sr),q=Math.round(0.25*sr);
  if(s+q>n||s-q<0)return{step:Infinity,click:Infinity,jump:0,pre:-200,post:-200,short:true};
  const rms=(a,b)=>{let t=0;for(let i=a;i<b;i++)t+=x[i]*x[i];return t/(b-a);};
  const pre=dbp(rms(s-q,s)),post=dbp(rms(s,s+q));
  // click = prediction residual |x[i+1]-2x[i]+x[i-1]| at the seam (about the jump size at a discontinuity, tiny for any smooth tone) against its P99 in the surrounding +-200 ms
  const res=i=>Math.abs(x[i+1]-2*x[i]+x[i-1]),d=[],w=Math.round(0.2*sr),g=Math.round(0.005*sr);
  for(let i=s-w;i<s-g;i++)d.push(res(i));for(let i=s+g;i<s+w&&i<n-1;i++)d.push(res(i));
  d.sort((a,b)=>a-b);const p99=d[Math.floor(d.length*0.99)]||0;
  let mj=0;for(let i=s-3;i<=s+2;i++)mj=Math.max(mj,res(i));
  return{step:Math.abs(pre-post),pre,post,jump:mj,p99,click:mj/Math.max(p99,1e-6)};
}
const MUSIC_LIMITS={loudLo:-26,loudHi:-14,crestLo:6,crestHi:26,deadAir:1.5,tempoTol:0.03,seamStep:6,clickRatio:10,clickMin:0.005,peak:0.98};
const MODAL=['dorian','phrygian','lydian','mixolydian','locrian','modal','atonal','chromatic'];
/* rec: {id,loop,sting,declared:{tempo,key,mode},pg:programme(),tempo:tempoOf(),key:keyOf(),seam:seamOf()|null,hashA,hashB,error}
   returns {fails:[{code,msg}], keyMatch:bool|null} - the key check is population level (>= 80 %), so it is reported separately */
function checkCue(rec,o){
  const L=Object.assign({},MUSIC_LIMITS,o&&o.limits),fails=[],f=(code,msg)=>fails.push({code,msg});
  if(rec.error){f('render',String(rec.error));return{fails,keyMatch:null};}
  const p=rec.pg;
  if(!p.finite)f('finite','NaN/Inf samples');
  if(p.peak>L.peak)f('peak','peak '+p.peak.toFixed(3)+' > '+L.peak);
  const loud=rec.sting?p.activeDb:p.rmsDb;
  if(!(loud>-60))f('silent','programme RMS '+loud.toFixed(1)+' dBFS');
  else if(loud<L.loudLo||loud>L.loudHi)f('loudness','programme loudness '+loud.toFixed(1)+' dBFS outside '+L.loudLo+'..'+L.loudHi+(rec.sting?' (active window)':''));
  if(loud>-60&&(p.crestDb<L.crestLo||p.crestDb>L.crestHi))f('crest','crest factor '+p.crestDb.toFixed(1)+' dB outside '+L.crestLo+'..'+L.crestHi);
  if((rec.loop||!rec.sting)&&p.deadAir>L.deadAir)f('deadair','dead air of '+p.deadAir.toFixed(2)+' s at '+p.deadAirAt.toFixed(1)+' s (> '+L.deadAir+')');
  if(Math.abs(p.dc)>0.01)f('dc','DC '+p.dc.toFixed(4));
  let keyMatch=null;
  const d=rec.declared||{};
  if(d.tempo&&!rec.sting){
    const m=tempoMatch(rec.tempo.bpm,d.tempo,L.tempoTol);
    if(!m.ok)f('tempo','tempo measures '+rec.tempo.bpm.toFixed(1)+' BPM, declared '+d.tempo+' (not within '+(L.tempoTol*100)+' % nor a clean 2x/0.5x)');
  }else if(!rec.sting&&!d.tempo)f('tempo','no declared tempo is reachable for this cue (the music module must expose it, see tests/audio/page.js declaredCue())');
  if(d.key&&!rec.sting){const tp=pcOf(d.key);keyMatch=rec.key.tonic===tp;}
  if(rec.loop){
    if(!rec.seam||rec.seam.short)f('seam','no second pass was rendered (loop cue shorter than 2 loops of audio)');
    else{
      if(rec.seam.step>=L.seamStep)f('seam','loop seam energy steps by '+rec.seam.step.toFixed(1)+' dB ('+rec.seam.pre.toFixed(1)+' -> '+rec.seam.post.toFixed(1)+' dBFS), limit '+L.seamStep);
      if(rec.seam.click>=L.clickRatio&&rec.seam.jump>=L.clickMin)f('click','click at the loop seam: discontinuity '+rec.seam.jump.toFixed(4)+' = '+rec.seam.click.toFixed(0)+'x the local curvature');
    }
  }
  if(rec.hashA!==rec.hashB)f('determinism','two renders differ ('+rec.hashA+' vs '+rec.hashB+')');
  if(rec.impure)f('impure',String(rec.impure));
  return{fails,keyMatch};
}
/* population check of the key measurement (§6.6): >= 80 % of the cues must measure as their declared tonic, and every miss must be a cue declared modal / atonal.
   items: [{id,keyMatch (true|false|null = no declared key),declared:{mode}}] */
function keyPopulation(items){
  const rated=items.filter(i=>i.keyMatch!==null&&i.keyMatch!==undefined),ok=rated.filter(i=>i.keyMatch).length,bad=rated.filter(i=>!i.keyMatch);
  const modal=i=>MODAL.indexOf(String((i.declared&&i.declared.mode)||'').toLowerCase())>=0;
  const undeclared=bad.filter(i=>!modal(i)),rate=rated.length?ok/rated.length:0;
  return{n:rated.length,ok,rate,bad:bad.map(i=>i.id),undeclared:undeclared.map(i=>i.id),pass:rated.length>0&&rate>=0.8&&undeclared.length===0};
}
/* theme distinctness: [chroma(12), log2 centroid, onset density] z-normalised over all cues, pairwise distance >= tau */
function themeVector(rec){return rec.key.chroma.concat([Math.log2(rec.centroidHz||1000),rec.tempo.density]);}
const THEME_FLOOR=[0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.02,0.12,0.3];
function themeDistinct(themes,all,tau){
  const zn=znorm(all.map(themeVector),THEME_FLOOR),Z=themes.map(r=>zproj(themeVector(r),zn)),bad=[],ds=[];
  for(let i=0;i<themes.length;i++)for(let j=i+1;j<themes.length;j++){const d=dist(Z[i],Z[j]);ds.push({a:themes[i].id,b:themes[j].id,d});if(d<tau)bad.push({a:themes[i].id,b:themes[j].id,d});}
  return{bad,ds};
}
/* one full analysis of a rendered cue (all of §6.5-6.7 measurements except the second-render hash); ch may be longer than the analysed window */
function analyseCue(ch,sr,o){
  o=o||{};const win=Math.min(ch[0].length,Math.round((o.window||24)*sr)),w=ch.map(c=>c.subarray(0,win)),x=mono(w);
  const pg=programme(w,sr),tempo=tempoOf(x,sr),chroma=chromaOf(x,sr),key=keyOf(chroma);key.chroma=chroma;
  const sp=avgSpectrum(x,0,Math.min(x.length,65536)),cen=(()=>{let a=0,b=0;for(let k=1;k<=sp.N/2;k++){const f=k*sr/sp.N;if(f>=50&&f<=16000){a+=f*sp.P[k];b+=sp.P[k];}}return b>0?a/b:1000;})();
  const out={pg:Object.assign({},pg,{rmsFrames:undefined}),tempo:{bpm:tempo.bpm,conf:tempo.conf,density:tempo.density,peak:tempo.peak},key,centroidHz:cen,hash:hashQ(w)};
  if(o.loopLen&&ch[0].length>=Math.round((o.loopLen+0.3)*sr))out.seam=seamOf(ch,sr,o.loopLen);
  return out;
}

return{fft,mono,slice,hashQ,levels,avgSpectrum,pitchContour,voiceFeatures,FEATURE_NAMES,FEATURE_FLOOR,BARK_EDGES,CLASS_DB,LIMITS,voiceBudget,checkVoice,
  znorm,zproj,dist,parseId,distinctGroups,weakPairs,cloneStats,calibrate,TAU_Z,qtile,
  programme,onsetEnvelope,tempoOf,tempoMatch,chromaOf,keyOf,pcOf,PCN,seamOf,MUSIC_LIMITS,MODAL,checkCue,keyPopulation,themeVector,themeDistinct,analyseCue,med,dbp};
});
