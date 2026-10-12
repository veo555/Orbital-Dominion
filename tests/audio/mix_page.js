/* =========================================================================
   tests/audio/mix_page.js — the in-page half of tests/e2e/e2e_audio_mix.py (docs/AUDIO_V4.md). Needs window.ODA (dsp.js), window.ODL (bs1770.js) and the game with __TEST.
   Everything is rendered offline and deterministically with the game's own audioRender / audioMixdown; the sample arrays never leave the page.

     ODM.measure(channels, sr)       one clip -> {dur, peakDb, tpDb, activeDb, lufsI, lufsM, crest, centroid, harsh, sub, dc, decay, lead, tailDb}
     ODM.classTable(opt)             every registered voice, grouped by loudness class -> per-class summary (mean/min/max of each metric) + the outliers
     ODM.cueTable(ids, seconds, o)   music cues -> programme LUFS / LRA / crest / centroid / peak / DC / dead air, + intensity and night sweeps
     ODM.scenarios(chain)            the mix scenarios of the gate rendered through master chain 'v3' or 'v4':
                                       calm / battle / burst500 / alertOver (music ducking under an alert) -> LUFS, true peak, clipping, music level under an alert
   ========================================================================= */
(function(){
'use strict';
const SR=44100,ODA=window.ODA,ODL=window.ODL,ODM=window.ODM={};
const AUD=()=>window.__RTS.AUD,db=v=>20*Math.log10(Math.max(v,1e-9));
function rng(seed){let s=seed|0;return function(){s=(s+0x6D2B79F5)|0;let t=Math.imul(s^s>>>15,s|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

ODM.measure=function(ch,sr,o){
  o=o||{};sr=sr||SR;
  const lv=ODA.levels(ch,sr),n=ch[0].length,mono=ODA.mono(ch),L=ODL.loudness(ch,sr,{tp:o.tp!==false});
  // spectral centroid + 2-5 kHz share + sub share over the active window
  const s0=Math.max(0,Math.round(lv.start*sr)),s1=Math.min(n,Math.max(s0+256,Math.round(lv.end*sr)));
  const sp=ODA.avgSpectrum(mono,s0,s1),N=sp.N,P=sp.P;let tot=0,cen=0,h=0,sb=0;
  for(let k=1;k<=N/2;k++){const f=k*sr/N,p=P[k];tot+=p;cen+=p*f;if(f>=2000&&f<5000)h+=p;if(f<120)sb+=p;}
  // decay: time from the loudest 10 ms frame to the last frame within 50 dB of it; lead: time to the loudest frame
  const fr=Math.round(sr*0.01),nf=Math.floor(n/fr),e=new Float64Array(nf);let mx=0,mi=0;
  for(let i=0;i<nf;i++){let s=0;for(let c=0;c<ch.length;c++){const d=ch[c];for(let k=i*fr;k<(i+1)*fr;k++)s+=d[k]*d[k];}e[i]=s;if(s>mx){mx=s;mi=i;}}
  let last=mi;for(let i=mi;i<nf;i++)if(e[i]>mx*1e-5)last=i;
  return{dur:n/sr,peakDb:L.samplePeakDb,tpDb:L.truePeakDb,activeDb:lv.activeDb,lufsI:L.lufsI,lufsM:L.lufsM,lufsS:L.lufsS,lra:L.lra,crest:L.samplePeakDb-lv.activeDb,
    centroid:tot>0?cen/tot:0,harsh:tot>0?10*Math.log10(Math.max(h/tot,1e-12)):-120,sub:tot>0?10*Math.log10(Math.max(sb/tot,1e-12)):-120,dc:lv.dc,decay:(last-mi)*0.01,lead:mi*0.01,tailDb:lv.tailDb,finite:lv.finite};
};
const stat=(a,k)=>{const v=a.map(x=>x[k]).filter(x=>isFinite(x)).sort((x,y)=>x-y),n=v.length;if(!n)return null;const q=p=>v[Math.min(n-1,Math.floor(p*n))];return{n,mean:v.reduce((s,x)=>s+x,0)/n,min:v[0],p10:q(0.1),med:q(0.5),p90:q(0.9),max:v[n-1]};};
const KEYS=['activeDb','lufsM','peakDb','tpDb','crest','centroid','harsh','sub','decay','dc'];

/* ---------------------------------------------------------------- per class table over every registered voice */
ODM.classTable=async function(opt){
  opt=opt||{};
  const info=AUD().voices({info:true}).filter(v=>!opt.prefix||v.id.startsWith(opt.prefix)),byCls={},recs=[];
  for(const v of info){
    const r=await AUD().render({sfx:v.id,seed:0},0,SR),m=ODM.measure(r.channels,SR,{tp:true});m.id=v.id;m.cls=v.cls;recs.push(m);(byCls[v.cls]=byCls[v.cls]||[]).push(m);
  }
  const out={};
  for(const c in byCls){const a=byCls[c];out[c]={n:a.length};for(const k of KEYS)out[c][k]=stat(a,k);}
  recs.sort((a,b)=>b.tpDb-a.tpDb);
  return{classes:out,hottest:recs.slice(0,8).map(r=>({id:r.id,cls:r.cls,tpDb:+r.tpDb.toFixed(2),peakDb:+r.peakDb.toFixed(2)})),
    harshest:recs.slice().sort((a,b)=>b.harsh-a.harsh).slice(0,8).map(r=>({id:r.id,cls:r.cls,harsh:+r.harsh.toFixed(1),centroid:Math.round(r.centroid)})),
    longest:recs.slice().sort((a,b)=>b.decay-a.decay).slice(0,6).map(r=>({id:r.id,cls:r.cls,decay:+r.decay.toFixed(2)})),n:recs.length,
    nonfinite:recs.filter(r=>!r.finite).map(r=>r.id)};
};

/* ---------------------------------------------------------------- music */
ODM.cueTable=async function(ids,seconds,o){
  o=o||{};const out=[];
  for(const id of ids){
    const spec={cue:id,intensity:o.intensity===undefined?0.75:o.intensity,night:o.night||0,era:o.era||2,seed:0};
    const r=await AUD().render(spec,seconds,SR),m=ODM.measure(r.channels,SR,{tp:true});
    // dead air: longest run of 100 ms frames below -50 dB re the cue's loudest frame (not the tail)
    const fr=Math.round(SR*0.1),nf=Math.floor(r.channels[0].length/fr);let mx=0;const e=[];
    for(let i=0;i<nf;i++){let s=0;for(let k=i*fr;k<(i+1)*fr;k++)s+=r.channels[0][k]*r.channels[0][k]+r.channels[1][k]*r.channels[1][k];e.push(s);if(s>mx)mx=s;}
    let run=0,best=0;for(let i=0;i<e.length;i++){if(e[i]<mx*1e-5){run++;if(run>best)best=run;}else run=0;}
    m.id=id;m.dead=best*0.1;out.push(m);
  }
  return out;
};

/* ---------------------------------------------------------------- the mix scenarios */
let POOL=null;
async function pool(){
  if(POOL)return POOL;
  const info=AUD().voices({info:true}),pick=(cls,re,n)=>{const a=info.filter(v=>v.cls===cls&&(!re||re.test(v.id))).map(v=>v.id).sort();const r=[];const step=Math.max(1,Math.floor(a.length/n));for(let i=0;i<a.length&&r.length<n;i+=step)r.push(a[i]);return r;};
  const P={fire:pick('fire',/\.fire\./,24),impact:pick('impact',null,12),boom:pick('boom',null,16),ui:pick('ui',null,6),alert:pick('alert',null,3)};
  for(const k in P){P[k]=await Promise.all(P[k].map(async id=>({id,ch:(await AUD().render({sfx:id,seed:1},0,SR)).channels})));}
  return POOL=P;
}
const musicCache={};
async function music(id,sec,int){const k=id+'|'+sec+'|'+int;return musicCache[k]||(musicCache[k]=(await AUD().render({cue:id,intensity:int,era:2,night:0,seed:0},sec,SR)).channels);}
/* the engine's own rule for an alert-class sound (CLS.alert.duck 0.35, ms = dur+0.4 s): the music bus dips under it */
function alertDuckEvents(t,dur){return[{bus:'music',t,amount:0.35,ms:(dur+0.4)*1000}];}

ODM.scenarios=async function(chain,o){
  o=o||{};const P=await pool(),R=rng(7),res={},T=o.seconds||14;
  const mus=async int=>({channels:await music(o.cue||'theme_meridian',T,int),at:0,bus:'music',gain:1});
  const mix=async(tracks,ducks)=>AUD().mixdown(tracks,T,SR,{chain,ducks:ducks||[]});
  const pickOf=a=>a[Math.floor(R()*a.length)];
  const ev=(cls,t,g,pan)=>{const p=pickOf(P[cls]);return{channels:p.ch,at:t,bus:cls==='ui'||cls==='alert'?'ui':'sfx',gain:g,pan};};
  const sc=(m,extra)=>Object.assign({lufsI:m.lufsI,lufsM:m.lufsM,lufsS:m.lufsS,lra:m.lra,tpDb:m.tpDb,peakDb:m.peakDb,crest:m.crest,centroid:m.centroid,dc:m.dc,harsh:m.harsh,finite:m.finite,
    clipped:0},extra||{});
  const clips=ch=>{let n=0;for(const c of ch)for(let i=0;i<c.length;i++)if(Math.abs(c[i])>=0.999)n++;return n;};
  // calm: quiet music + a few clicks
  {const tr=[await mus(0.25)];for(let i=0;i<5;i++)tr.push(ev('ui',2+i*2.1,1,0));const m=await mix(tr);res.calm=sc(ODM.measure(m.channels,SR),{clipped:clips(m.channels)});}
  // battle: music at 0.9 + ~14 fire/s, impacts, booms every ~1.2 s
  {const tr=[await mus(0.9)];for(let t=1;t<T-2;t+=1/14)tr.push(ev('fire',t+R()*0.03,0.5+R()*0.5,(R()*2-1)*0.7));for(let t=1.5;t<T-2;t+=0.5+R())tr.push(ev('impact',t,0.8,(R()*2-1)*0.6));for(let t=2;t<T-2;t+=1.2+R()*0.8)tr.push(ev('boom',t,0.9,(R()*2-1)*0.6));
    const m=await mix(tr);res.battle=sc(ODM.measure(m.channels,SR),{clipped:clips(m.channels),calls:tr.length-1});}
  // burst: 500 sfx calls inside 3 s (the CLAUDE.md dense-battle worst case; the live engine would merge/cap most of them - here every one sounds)
  {const tr=[await mus(0.9)];for(let i=0;i<500;i++){const r=R(),cls=r<0.62?'fire':r<0.82?'impact':r<0.97?'boom':'alert';tr.push(ev(cls,4+R()*3,0.4+R()*0.6,(R()*2-1)*0.8));}
    const m=await mix(tr);res.burst500=sc(ODM.measure(m.channels,SR),{clipped:clips(m.channels),calls:tr.length-1});}
  // an alert over a battle: music ducks under the sound (sfx-driven ducking); compare the alert's loudness with the background in the same window
  {const sp=P.alert[0],sd=sp.ch[0].length/SR,t0=4,bg=[await mus(0.9)];for(let t=1;t<T-2;t+=1/10)bg.push(ev('fire',t+R()*0.03,0.5+R()*0.5,(R()*2-1)*0.7));for(let t=2;t<T-2;t+=1.5+R())bg.push(ev('boom',t,0.9,(R()*2-1)*0.6));
    const duck=alertDuckEvents(t0,sd),fg={channels:sp.ch,at:t0,bus:'ui',gain:1},withV=await mix(bg.concat([fg]),duck),bgOnly=await mix(bg,duck),vOnly=await mix([fg],[]);
    const w=ch=>ch.map(c=>c.subarray(Math.round(t0*SR),Math.round((t0+sd)*SR)));
    const lv=ch=>ODL.loudness(ch,SR,{tp:false}).lufsI;
    const mDuck=await mix([bg[0]],duck),mFree=await mix([bg[0]],[]);
    const vL=lv(w(vOnly.channels)),bgL=lv(w(bgOnly.channels)),bgPre=lv(w(mFree.channels)),mDuckL=lv(w(mDuck.channels));
    res.alertOver=sc(ODM.measure(withV.channels,SR),{alertLufs:vL,bgUnderAlert:bgL,bgBeforeAlert:bgPre,snr:vL-bgL,snrMusic:vL-mDuckL,duckDb:mDuckL-bgPre,alertDur:sd,clipped:clips(withV.channels)});}
  return res;
};

/* ---------------------------------------------------------------- static transfer curve of a master chain: a 1 kHz sine at several levels, steady-state RMS gain (dB) */
ODM.transfer=async function(chain,levels){
  const out=[];
  for(const lvl of levels||[-50,-36,-24,-18,-12,-6,-3,0]){
    const n=SR*3,x=new Float32Array(n),a=Math.pow(10,lvl/20);for(let i=0;i<n;i++)x[i]=a*Math.sin(2*Math.PI*1000*i/SR);
    const m=await AUD().mixdown([{channels:[x,x],at:0,bus:'sfx',gain:1}],3,SR,{chain,vol:{sfx:1}});
    let s=0,c=0;for(let i=SR*2;i<n;i++){s+=m.channels[0][i]*m.channels[0][i];c++;}
    out.push({in:lvl,gain:10*Math.log10(s/c*2)-lvl});
  }
  return out;
};

/* ---------------------------------------------------------------- reverb rooms: wet/dry energy of a noise click with send rev:1 (what the engine test measures for plate/hall/air), plus the -60 dB decay time */
ODM.rooms=async function(names){
  const e=(c,a,b)=>{let s=0;for(let i=Math.round(a*SR);i<Math.min(c.length,Math.round(b*SR));i++)s+=c[i]*c[i];return s;};
  const nz=send=>({dur:0.02,cls:'fire',vary:{},layers:[{k:'noise',color:'white',gain:0.5,env:{a:0.002,d:0.01},dur:0.02,send}]});
  const dry=(await AUD().render({voice:nz(undefined),seed:0},0.2,SR)).channels,out={};
  for(const room of names){
    const w=(await AUD().render({voice:nz({rev:1,room}),seed:0},5,SR)).channels[0];
    const tot=e(w,0.03,5);let t60=0;{const win=Math.round(0.02*SR);let mx=0;for(let i=0;i<w.length-win;i+=win){let s=0;for(let k=0;k<win;k++)s+=w[i+k]*w[i+k];if(s>mx)mx=s;if(s>mx*1e-6)t60=(i+win)/SR;}}
    out[room]={diffDb:db(Math.sqrt(tot))-db(Math.sqrt(e(dry[0],0,0.2))),t60};
  }
  return out;
};
/* distance: the same voice near and far (x,y give pan, volume and the far factor from the camera) -> centroid, level, tail energy */
ODM.distance=async function(id){
  const R=window.__RTS,cam=R.cam,z=cam.z||1,cx=cam.x+R.VW/z/2||0,cy=cam.y+R.VH/z/2||0;
  const out={};
  for(const[k,f]of[['near',0],['mid',0.5],['far',1]]){
    const r=await AUD().render({sfx:id,seed:2,far:f,pan:0},0,SR),m=ODM.measure(r.channels,SR,{tp:false});
    const n=r.channels[0].length,e=(a,b)=>{let s=0;for(let i=Math.round(a*SR);i<Math.min(n,Math.round(b*SR));i++)s+=r.channels[0][i]**2;return s;};
    out[k]={centroid:m.centroid,activeDb:m.activeDb,decay:m.decay,tailShare:10*Math.log10((e(0.25,3)+1e-12)/(e(0,0.25)+1e-12))};
  }
  return out;
};

/* variation: spectral centroid of 30 consecutive instances (seeds 1..30) of one voice; control = the same voice with variation switched off */
ODM.variation=async function(id){
  const cen=async(spec)=>{const r=await AUD().render(spec,0,SR);return ODM.measure(r.channels,SR,{tp:false}).centroid;};
  const a=[];for(let s=1;s<=30;s++)a.push(await cen({sfx:id,seed:s}));
  const info=AUD().voices({info:true}).find(v=>v.id===id);
  return{centroids:a};
};

/* ---------------------------------------------------------------- ducking envelope, read back from the live engine functions (tests the same code the game runs) */
ODM.duckProbe=async function(){
  const tr=[{channels:[new Float32Array(SR*6).fill(0.2),new Float32Array(SR*6).fill(0.2)],at:0,bus:'music',gain:1}];
  const m=await AUD().mixdown(tr,6,SR,{chain:'v4',ducks:[{bus:'music',t:2,amount:0.5,ms:1000}],vol:{music:1}});
  const at=t=>Math.abs(m.channels[0][Math.round(t*SR)]);
  return{before:at(1.9),during:at(2.5),after:at(5.5),mid:at(3.5),n:m.channels[0].length};
};
})();
