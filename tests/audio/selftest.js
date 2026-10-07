#!/usr/bin/env node
/* =========================================================================
   tests/audio/selftest.js — does the audio MEASUREMENT code measure, and does every check reject what it must?   node tests/audio/selftest.js   (about 40 s, no browser)

   Part of the audio gate (tests/e2e/e2e_audio.py runs it first). Two kinds of assertion:
     TRUTH      signals with a known answer (a 1 kHz sine, a 5 oct/s sweep, a 20 ms attack, a 100 BPM click+pad loop in D minor ...) must be measured correctly
     CONTROLS   docs/AUDIO_SPEC.md §6: "every metric test has a mutation control (silence, clipped square, white noise, duplicated voice) that must be rejected".
                Each control is pushed through the REAL check function and must be rejected for the RIGHT reason (the expected failure code), while the clean
                signals next to it must pass (a gate that rejects everything is as useless as one that rejects nothing).
   ========================================================================= */
'use strict';
const O=require('./dsp.js'),C=require('./controls.js');
const SR=44100;let fails=0;const T0=Date.now();
const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;};
const near=(a,b,tol)=>Math.abs(a-b)<=tol;
const codes=l=>l.map(f=>f.code);

/* ------------------------------------------------------------------ TRUTH: levels / features */
{
  const s=O.levels(C.stereo(C.sine(440,0.5,0.5)),SR);
  ok(near(s.peak,0.5,1e-3)&&near(s.activeDb,-9.09,0.06)&&s.dc<1e-6&&s.finite,`levels: a 0.5 sine measures peak ${s.peak.toFixed(3)}, active RMS ${s.activeDb.toFixed(2)} dBFS (expected -9.09), DC ${s.dc.toExponential(1)}`);
  const x=new Float32Array(Math.round(1.2*SR));x.set(C.sine(300,0.1,0.1),Math.round(0.2*SR));
  const w=O.levels(C.stereo(x),SR);
  ok(near(w.activeDb,-23.0,0.5)&&near(w.start,0.2,0.011)&&near(w.end,0.3,0.011),`levels: the active window ignores silence around a 0.1 s burst: ${w.start.toFixed(2)}-${w.end.toFixed(2)} s, ${w.activeDb.toFixed(1)} dBFS (expected 0.2-0.3 s, -23.0)`);
  const f=O.voiceFeatures(C.stereo(C.sine(1000,0.5,0.5)),SR);
  ok(near(f.centroidHz,1000,20)&&f.v.indexOf(Math.max(...f.v.slice(0,20)))===8&&f.voiced>0.9&&Math.abs(f.pitchSlope)<0.05&&f.flatnessDb<-40,`features: a 1 kHz sine has centroid ${f.centroidHz.toFixed(0)} Hz, its energy in Bark band 8 (920-1080 Hz), voiced ${f.voiced.toFixed(2)}, pitch slope ${f.pitchSlope.toFixed(3)}, flatness ${f.flatnessDb.toFixed(0)} dB`);
  const up=O.voiceFeatures(C.stereo(C.blip(400,800,0.3,{glide:0.3,dec:3,amp:0.5})),SR),dn=O.voiceFeatures(C.stereo(C.blip(1000,250,0.4,{glide:0.4,dec:4,amp:0.5})),SR);
  ok(near(up.pitchSlope,3.33,0.6)&&dn.pitchSlope<-3.5&&dn.pitchSlope>-6.5,`features: pitch-contour slope has the right sign and size: 400->800 Hz in 0.3 s = ${up.pitchSlope.toFixed(2)} oct/s (3.33), 1000->250 Hz in 0.4 s = ${dn.pitchSlope.toFixed(2)} (-5)`);
  const nz=O.voiceFeatures(C.stereo(C.whiteNoise(0.3,-20,1)),SR);
  ok(nz.voiced<0.2&&nz.flatnessDb>-6&&nz.centroidHz>6000,`features: white noise is unvoiced (${nz.voiced.toFixed(2)}), flat (${nz.flatnessDb.toFixed(1)} dB) and bright (centroid ${nz.centroidHz.toFixed(0)} Hz)`);
  const at=O.voiceFeatures(C.stereo(C.blip(500,null,0.5,{attackMs:20,dec:0.2,amp:0.5})),SR);
  ok(near(at.attackMs,16,3.5)&&near(at.decayMs,68,12),`features: attack time of a 20 ms ramp = ${at.attackMs.toFixed(1)} ms (10->90 % = 16), -20 dB decay = ${at.decayMs.toFixed(0)} ms (68)`);
  const lo=O.voiceFeatures(C.stereo(C.sine(200,0.4,0.5)),SR),hi=O.voiceFeatures(C.stereo(C.sine(3000,0.4,0.5)),SR);
  ok(O.dist(O.zproj(lo.v,{mean:lo.v.map(()=>0),sd:O.FEATURE_FLOOR}),O.zproj(hi.v,{mean:lo.v.map(()=>0),sd:O.FEATURE_FLOOR}))>10,'features: a 200 Hz and a 3 kHz sine are far apart in feature space');
  const h1=O.hashQ(C.stereo(C.sine(440,0.1,0.5))),h2=O.hashQ(C.stereo(C.sine(440,0.1,0.5))),h3=O.hashQ(C.stereo(C.sine(441,0.1,0.5)));
  ok(h1===h2&&h1!==h3&&/^[0-9a-f]{8}$/.test(h1),`hash: equal for equal samples (${h1}), different for a 1 Hz detune (${h3})`);
}

/* ------------------------------------------------------------------ CONTROLS: per-voice checks (§6.1-6.3) */
function rec(id,cls,ch,o){o=o||{};const lv=O.levels(ch,SR),dur=o.dur!==undefined?o.dur:ch[0].length/SR;return Object.assign({id,cls,dur,tail:o.tail||0,lv,hashA:O.hashQ(ch),hashB:O.hashQ(ch)},o);}
function cleanVoice(db,cls,sec){
  const x=C.blip(660,330,sec||0.2,{dec:(sec||0.2)*0.4,glide:0.1,amp:0.5,harm:[1,0.4]});
  const fade=Math.round(0.01*SR);for(let i=0;i<fade;i++)x[x.length-1-i]*=i/fade;
  const lv=O.levels(C.stereo(x),SR),g=Math.pow(10,(db-lv.activeDb)/20);for(let i=0;i<x.length;i++)x[i]*=g;return C.stereo(x);
}
function sustained(db,sec){const x=C.sine(440,sec,0.5,SR,10),lv=O.levels(C.stereo(x),SR),g=Math.pow(10,(db-lv.activeDb)/20);for(let i=0;i<x.length;i++)x[i]*=g;return C.stereo(x);}
{
  const good=rec('ctl.clean.fire',  'fire',cleanVoice(-22,'fire',0.25),{dur:0.25});
  ok(O.checkVoice(good).length===0,'checks 1-3 accept a clean fire voice (level -22 dBFS, fades in and out, deterministic): '+JSON.stringify(O.checkVoice(good)));
  const cc=C.voiceControls();
  for(const k of Object.keys(cc)){
    const c=cc[k],r=rec('ctl.'+k,c.cls,c.ch,{dur:c.expect==='duration'?1:undefined}),got=codes(O.checkVoice(r));
    ok(got.indexOf(c.expect)>=0,`control "${k}" is rejected as '${c.expect}' (got: ${got.join(',')||'nothing - NOT CAUGHT'})`);
  }
  const nd=Object.assign({},good,{hashB:'deadbeef'}),im=Object.assign({},good,{impure:'Math.random used while rendering'});
  ok(codes(O.checkVoice(nd)).indexOf('determinism')>=0,"control: two renders with different hashes are rejected as 'determinism'");
  ok(codes(O.checkVoice(im)).indexOf('impure')>=0,"control: a builder that touches Math.random/Date/performance.now is rejected as 'impure'");
  const lng=Object.assign({},good,{id:'rifleman.fire.obsidian',dur:0.6}),sel=Object.assign({},good,{id:'rifleman.select.aurora',dur:0.9,cls:'ui'});
  ok(codes(O.checkVoice(lng)).indexOf('budget')>=0&&codes(O.checkVoice(sel)).indexOf('budget')>=0,"control: a fire voice of 0.6 s and a select voice of 0.9 s break the duration budget (fire <= 0.35 s, select/ack <= 0.6 s)");
  const clsOk=['ui','fire','impact','boom','voice','alert','cine','music','amb'].every(k=>{const r=rec('ctl.cls.'+k,k,cleanVoice(O.CLASS_DB[k]+0.3,k,0.2),{dur:0.2});return O.checkVoice(r).filter(f=>f.code==='level').length===0&&O.checkVoice(Object.assign({},r,{lv:Object.assign({},r.lv,{activeDb:O.CLASS_DB[k]+4.5})})).some(f=>f.code==='level');});
  ok(clsOk,'class windows: every class accepts its target +0.3 dB and rejects +4.5 dB (ui -26, fire -22, impact -18, boom -14, voice -20, alert -17, cine -18, music -20, amb -30)');
  const noTail=rec('ctl.tail','fire',sustained(-22,0.25),{dur:0.1,tail:0});
  ok(codes(O.checkVoice(noTail)).indexOf('duration')>=0,"control: a 0.25 s sound that declares dur 0.1 s is rejected as 'duration'");
}

/* ------------------------------------------------------------------ CONTROLS: distinctness (§6.4) */
{
  // twelve different archetypes x (4 other seeds: the class's own pitch/filter/gain variation, and deliberate +-3 % pitch / -1 dB clones)
  const arche=[
    ()=>C.blip(1200,300,0.18,{glide:0.12,dec:0.12,harm:[1,0.5]}),()=>C.noiseBurst(0.3,{lp:900,dec:0.2}),()=>C.blip(90,45,0.4,{glide:0.3,dec:0.3}),()=>C.blip(880,880,0.3,{dec:0.25,harm:[1,0,0.5,0,0.3]}),
    ()=>C.noiseBurst(0.12,{hp:5000,lp:12000,dec:0.06}),()=>C.blip(300,600,0.25,{glide:0.2,dec:0.2,harm:[1,0.8,0.6,0.4]}),()=>C.blip(2000,2400,0.4,{dec:0.35}),()=>C.noiseBurst(0.9,{lp:300,dec:0.7,attackMs:40}),
    ()=>C.blip(500,100,0.5,{glide:0.4,dec:0.4,harm:[1,0.3]}),()=>C.blip(150,150,0.6,{dec:0.5,attackMs:60,harm:[1,0.6,0.4]}),()=>C.noiseBurst(0.5,{lp:3000,hp:1000,dec:0.4}),()=>C.blip(3500,1500,0.15,{glide:0.1,dec:0.1}),
  ];
  const variants=(mk,k)=>{const out=[];for(const pm of[0.97,1.03,0.95,1.05]){const g=pm;const x=mk();
      // resample by pm (pitch) and a +-1 dB gain: the 'same voice as the game plays it'
      const n=Math.floor(x.length/g),y=new Float32Array(n);for(let i=0;i<n;i++){const p=i*g,a=Math.floor(p),f=p-a;y[i]=((x[a]||0)*(1-f)+(x[a+1]||0)*f)*(k%2?0.89:1.0);}out.push(y);}return out;};
  const featOf=x=>O.voiceFeatures(C.stereo(x),SR).v;
  const refs=arche.map(mk=>featOf(mk())),clones=arche.map((mk,k)=>({ref:featOf(mk()),vars:variants(mk,k).map(featOf)}));
  const all=refs.concat(...clones.map(c=>c.vars)),zn=O.znorm(all),cs=O.cloneStats(clones,refs,zn),cal=O.calibrate(cs.intra,cs.inter);
  ok(cal.ok,`calibration: tau = ${cal.tau} (z units) vs the median clone distance ${cal.medIntra.toFixed(2)} (P90 ${cal.p90Intra.toFixed(2)}) and the median nearest different archetype ${cal.medInter.toFixed(2)}: tau rejects the typical clone (>= 1.5 x ${cal.medIntra.toFixed(2)}) and stays passable (<= ${cal.medInter.toFixed(2)})`);
  const Z={};refs.forEach((v,i)=>Z['a'+i]=O.zproj(v,zn));clones.forEach((c,i)=>c.vars.forEach((v,j)=>Z['a'+i+'c'+j]=O.zproj(v,zn)));
  const groups=[{rule:'a',key:'different',ids:refs.map((_,i)=>'a'+i)}];
  ok(O.weakPairs(groups,Z,cal.tau).length===0,'distinctness: twelve different archetypes are pairwise >= tau (the check does not reject everything): '+JSON.stringify(O.weakPairs(groups,Z,cal.tau).map(w=>w.a+'/'+w.b+' '+w.d.toFixed(2))));
  const dup=Object.assign({},Z);dup.dupe=Z.a3.slice();
  const wp=O.weakPairs([{rule:'a',key:'dup',ids:['a3','dupe']}],dup,cal.tau);
  ok(wp.length===1&&wp[0].d<1e-9,'control: an exactly DUPLICATED voice is rejected (distance 0 < tau)');
  let caught=0;for(let i=0;i<arche.length;i++)for(let j=0;j<4;j++){if(O.weakPairs([{rule:'b',key:'c',ids:['a'+i,'a'+i+'c'+j]}],Z,cal.tau).length)caught++;}
  ok(caught>=0.7*48,`control: deliberately CLONED voices (same sound, +-3-5 % pitch and duration, -1 dB) are rejected against their original: ${caught}/48 (>= 70 %; a clone shifted by 5 % can legitimately cross into another Bark band)`);
  let gainCaught=0;for(let i=0;i<arche.length;i++){const g=C.stereo(arche[i]().map(v=>v*0.5)),zg=O.zproj(O.voiceFeatures(g,SR).v,zn);if(O.dist(zg,Z['a'+i])<cal.tau)gainCaught++;}
  ok(gainCaught===12,`control: the same twelve sounds 6 dB quieter are all rejected as clones (${gainCaught}/12): the features are level-independent, the level is gated separately`);
  const grp=O.distinctGroups(['rifleman.ack.meridian','raptor.ack.meridian','rifleman.ack.obsidian','raptor.ack.obsidian','hub.done.meridian','hub.done.obsidian','hub.done.aurora','skill.barrage','skill.orbital','skill.shock','ui.click','global.click','global.err','cine.boom','cine.gong','crawler.melee.wild'],
    {factions:['meridian','obsidian','aurora','wild'],units:['rifleman','raptor','crawler'],buildings:['hub']},{cls:{'ui.click':'ui','global.click':'ui','global.err':'ui'}});
  const sig=grp.map(g=>g.rule+':'+g.key+'='+g.ids.length).sort().join(' | ');
  ok(sig.indexOf('a:ack|meridian=2')>=0&&sig.indexOf('a:ack|obsidian=2')>=0&&sig.indexOf('b:unit|rifleman|ack=2')>=0&&sig.indexOf('b:building|hub|done=3')>=0&&sig.indexOf('c:skills=3')>=0&&sig.indexOf('d:ui/global ui=2')>=0&&sig.indexOf('d:cinematic=2')>=0&&grp.length===8,'groups: (a) same event+faction across unit types, (b) faction variants, (c) skills, (d) UI (ui.click shadows global.click) and cinematic voices: '+sig);
}

/* ------------------------------------------------------------------ TRUTH + CONTROLS: music (§6.5-6.8) */
{
  const prog=[0,5,3,4,0,5,4,0];let n=0,good=0;const miss=[];
  const t0=Date.now();
  for(const bpm of[70,84,92,100,110,120,128,140,150,170]){
    const m=C.synthMusic({bpm,tonic:2,mode:'minor',sec:16,bars:8,kick:n%2?'half':'beat'});n++;
    const t=O.tempoOf(O.mono(m.ch),SR),mm=O.tempoMatch(t.bpm,bpm);if(mm.ok)good++;else miss.push(bpm+'->'+t.bpm.toFixed(1));
  }
  ok(good===10,`tempo: 10 synthetic cues from 70 to 170 BPM measure within 3 % (or a clean 2x/0.5x): ${good}/10 ${miss.join(' ')}  (${((Date.now()-t0)/1000).toFixed(0)} s)`);
  ok(O.tempoMatch(125,100).ok===false&&O.tempoMatch(200.5,100).ok&&O.tempoMatch(50.8,100).ok&&O.tempoMatch(102.9,100).ok&&!O.tempoMatch(104,100).ok&&!O.tempoMatch(150,100).ok,'tempoMatch: +-3 % or a clean 2x / 0.5x; 125 and 150 against 100 are rejected');
  let kOk=0,kN=0;const kMiss=[];
  for(const mode of['major','minor','dorian']){for(let tonic=0;tonic<12;tonic+=1){
    const m=C.synthMusic({bpm:100,tonic,mode,sec:12,bars:8,kick:'none'}),k=O.keyOf(O.chromaOf(O.mono(m.ch),SR));kN++;if(k.tonic===tonic)kOk++;else kMiss.push(mode+' '+O.PCN[tonic]+'->'+k.name);}}
  ok(kOk>=34,`key: Krumhansl-Kessler on chroma finds the tonic of 36 synthetic cues (12 tonics x major/minor/dorian): ${kOk}/${kN} ${kMiss.join(' ')}`);
  const mc=C.musicControls({bpm:100,tonic:2,mode:'minor',bars:8});
  const ana=k=>{const c=mc[k],a=O.analyseCue(c.ch,c.sr,{window:16,loopLen:c.loopLen});
    return Object.assign({id:'ctl_'+k,loop:true,sting:false,declared:Object.assign({mode:'minor'},c.declared),hashA:a.hash,hashB:a.hash},a);};
  const R={};for(const k of Object.keys(mc)){R[k]=ana(k);}
  const g=O.checkCue(R.good);
  ok(g.fails.length===0&&g.keyMatch===true,'checks 5-7 accept a clean 8-bar loop at 100 BPM in D minor (loudness -20, tempo, key, seam, no dead air): '+JSON.stringify(g.fails)+' keyMatch '+g.keyMatch+' tempo '+R.good.tempo.bpm.toFixed(1)+' seam '+R.good.seam.step.toFixed(2)+' dB');
  for(const k of Object.keys(mc)){if(k==='good')continue;const c=mc[k],r=O.checkCue(R[k]),got=codes(r.fails);
    if(c.keyMismatch)ok(r.keyMatch===false,`control "${k}": music in ${O.PCN[(2+4)%12]} major against a declared D is measured as ${R[k].key.name} -> key mismatch ${r.keyMatch===false?'caught':'NOT CAUGHT'}`);
    else ok(c.expect.every(e=>got.indexOf(e)>=0),`control "${k}" is rejected as [${c.expect.join(',')}] (got: ${got.join(',')||'nothing - NOT CAUGHT'})`);}
  const nd=Object.assign({},R.good,{hashB:'00000000'});
  ok(codes(O.checkCue(nd).fails).indexOf('determinism')>=0,"control: two cue renders with different hashes are rejected as 'determinism'");
  const pop=O.keyPopulation([{id:'a',keyMatch:true},{id:'b',keyMatch:true},{id:'c',keyMatch:true},{id:'d',keyMatch:true},{id:'e',keyMatch:false,declared:{mode:'phrygian'}}]);
  const pop2=O.keyPopulation([{id:'a',keyMatch:true},{id:'b',keyMatch:true},{id:'c',keyMatch:true},{id:'d',keyMatch:true},{id:'e',keyMatch:false,declared:{mode:'minor'}}]);
  const pop3=O.keyPopulation([{id:'a',keyMatch:true},{id:'b',keyMatch:false,declared:{mode:'dorian'}},{id:'c',keyMatch:false,declared:{mode:'atonal'}}]);
  ok(pop.pass&&!pop2.pass&&!pop3.pass,`key population: 4/5 with the miss declared phrygian passes; the same miss declared minor fails (${pop2.undeclared}); 1/3 fails the 80 % rule`);
  // themes: three different keys/tempos are distinct, a duplicated theme is not
  const th=[{tonic:2,mode:'minor',bpm:96},{tonic:4,mode:'phrygian',bpm:126},{tonic:6,mode:'lydian',bpm:84}].map((t,i)=>{const m=C.synthMusic({bpm:t.bpm,tonic:t.tonic,mode:t.mode,sec:12,bars:8});const a=O.analyseCue(m.ch,m.sr,{window:12});return Object.assign({id:'theme'+i},a);});
  const dd=O.themeDistinct(th,th.concat(Object.values(R).slice(0,3)),1.5),dup=O.themeDistinct([th[0],Object.assign({},th[0],{id:'clone'}),th[2]],th,1.5);
  ok(dd.bad.length===0&&dup.bad.length===1,`themes: D minor 96 / E phrygian 126 / F# lydian 84 BPM are pairwise >= 1.5 apart (${dd.ds.map(d=>d.d.toFixed(1))}); a duplicated theme is rejected`);
}

console.log(`${fails?'FAILED':'ALL OK'} (audio measurement self-test, ${((Date.now()-T0)/1000).toFixed(0)} s, ${fails} failures)`);
process.exit(fails?1:0);
