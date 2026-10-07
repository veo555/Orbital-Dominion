/* =========================================================================
   tests/audio/page.js — the in-page half of the audio gate. Injected by tests/e2e/e2e_audio.py after tests/audio/dsp.js (window.ODA) and controls.js (window.ODC).
   It renders with the game's own audioRender() (OfflineAudioContext, 44.1 kHz), measures with ODA (independent of the engine's analyser, cross-checked against it)
   and keeps compact records; the heavy sample arrays never leave the page.

   window.ODP
     setVocab(voc)                         {factions,units,buildings} from 43_vocab.js
     runVoices(ids,{seeds})                render + measure voices      -> number of records stored
     evaluateVoices(opt)                   checks 1-4 over everything stored: failures, duplicates, distinctness pairs, calibration
     runCue(id,o) / evaluateCues(...)      music cues (checks 5-8)
     controlVoices() / controlCues()       the mutation controls registered as real voices / a real 'cue' renderer, run through the same pipeline
     mutationProbe()                       a small fixed probe used against deliberately broken builds
   Purity: every render is built with Math.random / Date.now / performance.now stubbed to throw (the builders run synchronously inside audioRender), so a voice
   that uses them is reported as 'impure' (docs/AUDIO_SPEC.md §8.3 rule 1).
   ========================================================================= */
(function(){
'use strict';
const SR=44100,ODA=window.ODA,ODC=window.ODC,ODP=window.ODP={store:new Map(),cues:new Map(),vocab:null};
const AUD=()=>window.__RTS.AUD;
const banned=n=>function(){throw new Error(n+' used while rendering');};
/* build an offline render with the non-deterministic APIs stubbed; the promise is awaited AFTER the stubs are restored */
function rs(spec,sec){
  const mr=Math.random,dn=Date.now,pn=performance.now;let p,err=null;
  Math.random=banned('Math.random');Date.now=banned('Date.now');performance.now=banned('performance.now');
  try{p=AUD().render(spec,sec||0,SR);}catch(e){err=e;}finally{Math.random=mr;Date.now=dn;performance.now=pn;}
  if(err)return Promise.reject(err);
  return p;
}
const msg=e=>String(e&&e.message||e);
const isPure=m=>/used while rendering/.test(m);
ODP.rs=rs;
ODP.setVocab=v=>{ODP.vocab=v;};
ODP.info=()=>{const m={};for(const v of AUD().voices({info:true}))m[v.id]=v;return m;};
ODP.reset=()=>{ODP.store.clear();ODP.cues.clear();};

/* ---------------------------------------------------------------- voices */
async function voiceRec(id,info,o){
  const rec={id,cls:info.cls,dur:info.dur,tail:info.tail,fallback:!!info.fallback,bus:info.bus,hashes:[]};
  try{
    const r1=await rs({sfx:id,seed:0});
    rec.lv=ODA.levels(r1.channels,SR);rec.hashA=ODA.hashQ(r1.channels);rec.hashes.push(rec.hashA);
    const e=AUD().analyse(r1.channels,SR);                       // cross-check: two independent implementations of the same §8.6 definition must agree
    rec.engine={act:e.activeDb,peak:e.peak,dc:e.dc,hash:AUD().hash(r1.channels)};
    rec.feat=ODA.voiceFeatures(r1.channels,SR,rec.lv).v;
    const r2=await rs({sfx:id,seed:0});rec.hashB=ODA.hashQ(r2.channels);
    rec.seedFeats=[];
    for(const s of(o&&o.seeds)||[]){const r=await rs({sfx:id,seed:s});rec.hashes.push(ODA.hashQ(r.channels));if(o.features)rec.seedFeats.push(ODA.voiceFeatures(r.channels,SR).v);}
  }catch(e){const m=msg(e);if(isPure(m))rec.impure=m;else rec.error=m;}
  return rec;
}
ODP.voiceRec=voiceRec;
ODP.runVoices=async function(ids,o){
  const info=ODP.info();o=o||{};const vset=new Set(o.variationIds||[]),pset=new Set(o.panelIds||[]);
  for(const id of ids){
    if(!info[id]){ODP.store.set(id,{id,error:'not registered'});continue;}
    const wantSeeds=vset.has(id)?[1,2]:[];
    const feat=pset.has(id);
    const rec=await voiceRec(id,info[id],{seeds:feat?[1,2,3,4,5]:wantSeeds,features:feat});
    rec.wantVariation=wantSeeds.length>0;rec.panel=!!feat;
    ODP.store.set(id,rec);
  }
  return ODP.store.size;
};
/* checks 1-3 per voice + engine cross-check + machine-gun check */
function perVoice(rec,classDb){
  const fails=ODA.checkVoice(rec,{classDb});
  if(rec.lv&&rec.engine){
    const e=rec.engine,l=rec.lv;
    if(Math.abs(e.act-l.activeDb)>0.01&&!(e.act<-100&&l.activeDb<-100))fails.push({code:'measure',msg:'the engine analyser says '+e.act.toFixed(3)+' dB, the gate says '+l.activeDb.toFixed(3)+' dB'});
    if(Math.abs(e.peak-l.peak)>1e-6)fails.push({code:'measure',msg:'peak disagreement '+e.peak+' vs '+l.peak});
    if(e.hash!==rec.hashA)fails.push({code:'measure',msg:'engine hash '+e.hash+' vs gate hash '+rec.hashA});
  }
  if(rec.wantVariation&&rec.hashes.length>=3&&rec.hashes.every(h=>h===rec.hashes[0]))fails.push({code:'variation',msg:'seeds 0,1,2 render identically: a repeated sound would machine-gun (use vary / variants)'});
  return fails;
}
ODP.evaluateVoices=function(opt){
  opt=opt||{};const classDb=AUD().classes?Object.fromEntries(Object.entries(AUD().classes()).map(([k,v])=>[k,v.db])):ODA.CLASS_DB;
  const recs=Array.from(ODP.store.values()),fails=[],out={n:recs.length,classTableAgrees:true};
  for(const k in ODA.CLASS_DB)if(classDb[k]!==ODA.CLASS_DB[k])out.classTableAgrees=false;
  for(const r of recs)for(const f of perVoice(r,ODA.CLASS_DB))fails.push({id:r.id,code:f.code,msg:f.msg});
  // identical renders under different ids = clones
  const byHash={};for(const r of recs)if(r.hashA&&!r.error&&!r.impure)(byHash[r.hashA]=byHash[r.hashA]||[]).push(r.id);
  out.duplicates=Object.values(byHash).filter(a=>a.length>1);
  // identical DEFINITIONS under different ids (a copy-paste clone renders differently per id because the seed derives from the id, so the hash cannot see it); gain is trimmed per voice, so it is ignored
  const byDef={};
  for(const r of recs){let v=null;try{v=AUD().resolve(r.id);}catch(e){}if(!v||v.id!==r.id)continue;
    const key=JSON.stringify([v.dur,v.cls,v.layers||String(v.fn),v.vary,v.variants,v.seq,v.gap,v.poly,v.prio,v.range,v.duck]);(byDef[key]=byDef[key]||[]).push(r.id);}
  out.defClones=Object.values(byDef).filter(a=>a.length>1);
  // distinctness
  const withF=recs.filter(r=>r.feat),vecs=withF.map(r=>r.feat);out.nfeat=vecs.length;
  if(vecs.length>=4){
    const zn=ODA.znorm(vecs),Z={},cls={};for(const r of withF){Z[r.id]=ODA.zproj(r.feat,zn);cls[r.id]=r.cls;}
    const groups=ODA.distinctGroups(withF.map(r=>r.id),ODP.vocab,{cls});out.groups=groups.map(g=>({rule:g.rule,key:g.key,n:g.ids.length}));
    out.pairs=ODA.weakPairs(groups,Z,ODA.TAU_Z);out.npairs=groups.reduce((s,g)=>s+g.ids.length*(g.ids.length-1)/2,0);
    // calibration on the panel (other seeds = the game's own variation)
    const panel=withF.filter(r=>r.seedFeats&&r.seedFeats.length);
    const cs=ODA.cloneStats(panel.map(r=>({ref:r.feat,vars:r.seedFeats})),withF.map(r=>r.feat),zn);
    out.cal=ODA.calibrate(cs.intra,cs.inter);out.cal.panel=panel.length;
    // the designated control pair: one panel voice and its seed-1 render must be "the same sound", the duplicate must be rejected
    if(panel.length){const p=panel[0],z0=ODA.zproj(p.feat,zn),z1=ODA.zproj(p.seedFeats[0],zn);out.controlPair={id:p.id,d:ODA.dist(z0,z1),dup:ODA.dist(z0,z0)};}
    out.Z=opt.keepZ?Z:undefined;
  }
  out.fails=fails;
  return out;
};

/* ---------------------------------------------------------------- music */
/* the declared tempo / key / mode / loop length of a cue: the music module has to make them reachable (docs: tests/e2e/e2e_audio.py header). Tried in order:
   __RTS.musicInfo(id), __RTS.MUSIC_DATA[id], __RTS.MUSIC_CUE_DATA[id], __RTS.CUES[id]; accepts {tempo|bpm,key,mode,beats,loopLen,len,sections:[{bars}]} */
ODP.declared=function(id){
  const R=window.__RTS,tries=[()=>R.musicInfo&&R.musicInfo(id),()=>R.MUSIC_DATA&&R.MUSIC_DATA[id],()=>R.MUSIC_CUE_DATA&&R.MUSIC_CUE_DATA[id],()=>R.CUES&&R.CUES[id]];
  for(const t of tries){
    let v=null;try{v=t();}catch(e){}
    if(v&&typeof v==='object'){
      const tempo=v.tempo||v.bpm,beats=v.beats||4;let loopLen=v.loopLen||null;
      if(!loopLen&&Array.isArray(v.sections)&&tempo){const bars=v.sections.reduce((s,x)=>s+(+x.bars||0),0);if(bars>0)loopLen=bars*beats*60/tempo;}
      return{tempo,key:v.key,mode:v.mode,beats,loopLen,len:v.len,tempoRange:v.tempoRange};
    }
  }
  return null;
};
ODP.runCue=async function(id,o){
  const rec={id,loop:!!o.loop,sting:!!o.sting,declared:o.declared||{},len:o.len};
  try{
    const r1=await rs({cue:id},o.window);
    const a=ODA.analyseCue(r1.channels,SR,{window:o.window});
    Object.assign(rec,a);rec.hashA=a.hash;
    const r2=await rs({cue:id},o.window);rec.hashB=ODA.hashQ(r2.channels.map(c=>c.subarray(0,Math.min(c.length,Math.round(o.window*SR)))));
    if(o.loop&&o.loopLen){const r3=await rs({cue:id},o.loopLen+0.6);rec.seam=ODA.seamOf(r3.channels,SR,o.loopLen);}
  }catch(e){const m=msg(e);if(isPure(m))rec.impure=m;else rec.error=m;}
  ODP.cues.set(id,rec);return {id,error:rec.error,impure:rec.impure,bpm:rec.tempo&&rec.tempo.bpm};
};
ODP.evaluateCues=function(opt){
  opt=opt||{};const recs=Array.from(ODP.cues.values()),fails=[],items=[];
  for(const r of recs){
    if(r.error||r.impure||!r.pg){fails.push({id:r.id,code:r.impure?'impure':'render',msg:r.impure||r.error||'not rendered'});continue;}
    const c=ODA.checkCue(r);for(const f of c.fails)fails.push({id:r.id,code:f.code,msg:f.msg});
    items.push({id:r.id,keyMatch:c.keyMatch,declared:r.declared,key:r.key.name,tonicDeclared:r.declared&&r.declared.key});
  }
  const out={n:recs.length,fails,keyItems:items,keyPop:ODA.keyPopulation(items)};
  const rendered=recs.filter(r=>r.pg&&r.key);
  const themes=rendered.filter(r=>/^theme_/.test(r.id));
  if(themes.length>=2&&rendered.length>=4){const t=ODA.themeDistinct(themes,rendered,opt.themeTau||1.5);out.themes={bad:t.bad,ds:t.ds};}
  out.table=rendered.map(r=>({id:r.id,loop:r.loop,sting:r.sting,rms:+(r.sting?r.pg.activeDb:r.pg.rmsDb).toFixed(1),crest:+r.pg.crestDb.toFixed(1),bpm:+r.tempo.bpm.toFixed(1),declTempo:r.declared&&r.declared.tempo,key:r.key.name,declKey:r.declared&&r.declared.key,mode:r.declared&&r.declared.mode,
    deadAir:+r.pg.deadAir.toFixed(2),seam:r.seam&&!r.seam.short?+r.seam.step.toFixed(1):null,density:+r.tempo.density.toFixed(2)}));
  return out;
};

/* ---------------------------------------------------------------- controls registered as REAL voices / a REAL cue renderer */
const ctl={voices:{},installed:false};
ODP.installControls=function(){
  const A=AUD(),K=A.KIT;if(ctl.installed)return;ctl.installed=true;
  const osc=(f,o)=>Object.assign({k:'osc',type:'triangle',f,env:{d:0.2}},o||{});
  const reg=(id,def,meta,expect)=>{A.registerVoice(id,def,meta);ctl.voices[id]={expect};};
  const tuned=(id,def,cls,expect)=>{   // set the gain so the active window sits on the class target, like a content author would
    A.registerVoice(id,def);return A.render({sfx:id,seed:0},0,SR).then(r=>{const a=ODA.levels(r.channels,SR);def.gain=Math.pow(10,(ODA.CLASS_DB[cls]-a.activeDb)/20);A.registerVoice(id,def);ctl.voices[id]={expect};});
  };
  ctl.ready=Promise.all([
    tuned('ctl.ok.fire',{dur:0.25,cls:'fire',layers:[osc(660,{pitch:{from:700,to:420,t:0.15},env:{d:0.18}}),{k:'noise',color:'white',dur:0.04,env:{d:0.03},gain:0.3,filter:{type:'hp',f0:3000}}]},'fire',[]),
    tuned('ctl.diff.fire',{dur:0.3,cls:'fire',layers:[{k:'fm',f:180,ratio:1.4,idx:4,env:{d:0.28},pitch:{from:180,to:90,t:0.25}},{k:'noise',color:'brown',dur:0.28,env:{a:0.05,d:0.2},filter:{type:'lp',f0:500}}]},'fire',[]),
    tuned('ctl.clone.a',{dur:0.25,cls:'fire',layers:[osc(900,{type:'sawtooth',filter:{type:'lp',f0:2500},env:{d:0.2}}),{k:'noise',color:'pink',dur:0.1,env:{d:0.08},gain:0.5,filter:{type:'bp',f0:1500,q:2}}]},'fire',[]),
    tuned('ctl.clone.b',{dur:0.25,cls:'fire',layers:[osc(900,{type:'sawtooth',filter:{type:'lp',f0:2500},env:{d:0.2}}),{k:'noise',color:'pink',dur:0.1,env:{d:0.08},gain:0.5,filter:{type:'bp',f0:1500,q:2}}]},'fire',[]),
  ]).then(()=>{
    reg('ctl.silent',{dur:0.2,cls:'fire',layers:[osc(440,{gain:0})]},null,['silent']);
    reg('ctl.clip',{dur:0.2,cls:'fire',layers:[{k:'osc',type:'square',f:220,gain:3,env:{a:0.01,s:1,d:0.01,r:0.02}}]},null,['peak']);
    reg('ctl.loud',{dur:0.2,cls:'fire',layers:[{k:'noise',color:'white',gain:1,env:{a:0.01,s:1,d:0.01,r:0.02}}]},null,['level']);
    reg('ctl.quiet',{dur:0.2,cls:'fire',layers:[osc(440,{gain:0.004,env:{a:0.01,s:1,d:0.01,r:0.02}})]},null,['level']);
    reg('ctl.dc',(Ax,t,p)=>{const c=Ax.ctx.createConstantSource(),g=Ax.ctx.createGain();c.offset.value=0.5;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.15*Ax.vg,t+0.005);g.gain.setValueAtTime(0.15*Ax.vg,t+0.2);g.gain.linearRampToValueAtTime(0,t+0.21);c.connect(g);g.connect(Ax.out);K.go(Ax,c,t,t+0.22);
      K.layer(Ax,t,osc(440,{gain:0.05}),p);},{dur:0.2,cls:'fire',variants:1},['dc']);
    reg('ctl.click',(Ax,t,p)=>{const b=Ax.ctx.createBuffer(1,Math.round(0.1*SR),SR),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=0.5*Math.sin(2*Math.PI*300*i/SR+Math.PI/2)*(i>d.length-400?(d.length-i)/400:1);
      const s=Ax.ctx.createBufferSource(),g=Ax.ctx.createGain();s.buffer=b;g.gain.value=Ax.vg;s.connect(g);g.connect(Ax.out);K.go(Ax,s,t,t+0.12);},{dur:0.1,cls:'fire',variants:1},['first']);
    let n=0;reg('ctl.nondet',(Ax,t,p)=>{n++;K.layer(Ax,t,osc(300+n*13,{gain:0.2,env:{d:0.2}}),p);},{dur:0.2,cls:'fire',variants:1},['determinism']);
    reg('ctl.impure',(Ax,t,p)=>{K.layer(Ax,t,osc(300+Math.random()*50,{gain:0.2,env:{d:0.2}}),p);},{dur:0.2,cls:'fire',variants:1},['impure']);
    reg('ctl.long',{dur:7,cls:'fire',layers:[osc(300,{gain:0.2,dur:7,env:{d:6.5}})]},null,['duration']);
    reg('rifleman.fire.meridian',{dur:0.8,cls:'fire',layers:[osc(300,{gain:0.2,dur:0.8,env:{d:0.7}})]},null,['budget']);       // 0.8 s fire voice breaks "fire <= 0.35 s"
    reg('ctl.novary.select',{dur:0.2,cls:'ui',vary:{},variants:1,layers:[osc(500,{gain:0.2,env:{d:0.15}})]},null,['variation']);
  });
};
/* run every installed control through the same pipeline (records -> perVoice) */
ODP.controlVoices=async function(){
  ODP.installControls();await ctl.ready;
  const info=ODP.info(),out=[];
  for(const id of Object.keys(ctl.voices)){
    const want=ctl.voices[id].expect,seeds=id==='ctl.novary.select'?[1,2]:[];
    const rec=await voiceRec(id,info[id],{seeds});rec.wantVariation=id==='ctl.novary.select';
    // 'ctl.impure' / 'ctl.nondet' are only built once per render, so the second render differs; rifleman.fire.meridian keeps its real id for the budget rule
    const got=perVoice(rec,ODA.CLASS_DB).map(f=>f.code);
    out.push({id,expect:want,got,lv:rec.lv&&{act:+rec.lv.activeDb.toFixed(1),peak:+rec.lv.peak.toFixed(2)}});
  }
  const res={voices:out};
  // distinctness controls: a duplicated voice, and a clearly different one, among 20 ordinary voices that give the z-normalisation a corpus
  const base=Object.values(info).filter(v=>v.fallback).slice(0,20).map(v=>v.id),ids=base.concat(['ctl.ok.fire','ctl.diff.fire','ctl.clone.a','ctl.clone.b']),recs={};
  for(const id of ids)recs[id]=await voiceRec(id,info[id],{});
  const vecs=ids.map(i=>recs[i].feat),zn=ODA.znorm(vecs),Z={};for(const i of ids)Z[i]=ODA.zproj(recs[i].feat,zn);
  const pairs=ODA.weakPairs([{rule:'ctl',key:'clone',ids:['ctl.clone.a','ctl.clone.b']},{rule:'ctl',key:'different',ids:['ctl.ok.fire','ctl.diff.fire']}],Z,ODA.TAU_Z);
  res.distinct={cloneRejected:pairs.some(p=>p.a==='ctl.clone.a'&&p.b==='ctl.clone.b'),differentAccepted:!pairs.some(p=>p.a==='ctl.ok.fire'),dClone:ODA.dist(Z['ctl.clone.a'],Z['ctl.clone.b']),dDiff:ODA.dist(Z['ctl.ok.fire'],Z['ctl.diff.fire'])};
  ODP.reset();for(const id of ids)ODP.store.set(id,recs[id]);
  const ev=ODP.evaluateVoices();ODP.reset();
  res.defCloneCaught=ev.defClones.some(g=>g.indexOf('ctl.clone.a')>=0&&g.indexOf('ctl.clone.b')>=0)&&!ev.defClones.some(g=>g.indexOf('ctl.ok.fire')>=0||g.indexOf('ctl.diff.fire')>=0);
  return res;
};
/* a REAL 'cue' renderer for the control music: the synthesised signals of controls.js played through an AudioBufferSource inside audioOffline */
const CUE={};
ODP.installCues=function(){
  const A=AUD();
  const mc=ODC.musicControls({bpm:100,tonic:2,mode:'minor',bars:8});
  for(const k of Object.keys(mc))CUE['ctl_'+k]=mc[k];
  A.registerRenderer('cue',(spec,sec,sr)=>{
    const c=CUE[spec.cue];if(!c)return Promise.reject(new Error('no cue '+spec.cue));
    const n=Math.round((sec||c.ch[0].length/c.sr)*sr);
    return A.offline(n/sr,sr,(Ax,ctx)=>{const b=ctx.createBuffer(2,n,sr);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch),s=c.ch[ch];for(let i=0;i<n;i++)d[i]=s[i%s.length];}
      const s=ctx.createBufferSource();s.buffer=b;s.connect(Ax.out);A.KIT.go(Ax,s,0,n/sr);});
  });
  return mc;
};
ODP.controlCues=async function(){
  const mc=ODP.installCues(),out=[];ODP.cues.clear();
  for(const k of Object.keys(mc)){
    const c=mc[k],id='ctl_'+k;
    await ODP.runCue(id,{window:16,loop:true,loopLen:c.loopLen,declared:Object.assign({mode:'minor'},c.declared),len:c.loopLen*2});
    const r=ODP.cues.get(id),res=r.pg?ODA.checkCue(r):{fails:[{code:'render',msg:r.error||r.impure}],keyMatch:null};
    out.push({id,expect:c.expect,keyMismatch:!!c.keyMismatch,got:res.fails.map(f=>f.code),keyMatch:res.keyMatch,bpm:r.tempo&&+r.tempo.bpm.toFixed(1),key:r.key&&r.key.name,seam:r.seam&&+r.seam.step.toFixed(1)});
  }
  return out;
};

/* ---------------------------------------------------------------- a small fixed probe for the build-mutation runs */
ODP.mutationProbe=async function(){
  const info=ODP.info(),ids=Object.values(info).filter(v=>v.fallback&&v.bus!=='music').slice(0,16).map(v=>v.id),recs=[];
  for(const id of ids)recs.push(await voiceRec(id,info[id],{seeds:[1,2]}));
  const codes={},zn=ODA.znorm(recs.filter(r=>r.feat).map(r=>r.feat)),Z={};
  for(const r of recs){for(const f of perVoice(r,ODA.CLASS_DB))codes[f.code]=(codes[f.code]||0)+1;if(r.feat)Z[r.id]=ODA.zproj(r.feat,zn);}
  const weak=ODA.weakPairs([{rule:'p',key:'probe',ids:ids.filter(i=>Z[i])}],Z,ODA.TAU_Z);
  const dups={};for(const r of recs)if(r.hashA)(dups[r.hashA]=dups[r.hashA]||[]).push(r.id);
  return{n:recs.length,codes,weakPairs:weak.length,pairs:ids.length*(ids.length-1)/2,duplicateHashes:Object.values(dups).filter(a=>a.length>1).length};
};
})();
