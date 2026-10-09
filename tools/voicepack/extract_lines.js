#!/usr/bin/env node
/* tools/voicepack/extract_lines.js — OFFLINE step 1 of the optional voice-pack pipeline (docs/AUDIO_V4.md, tools/voicepack/README.md).
   Reads the story headlessly (tests/sim/storylib.js: no DOM, no network) and writes
     lines.json   every spoken line  {id, speaker, text, chars, priority, tier, kind, style, key}   (priority 1 = record first)
     voices.json  per character: suggested ElevenLabs voice-design text + voice settings + the synth voiceProfile (the runtime fallback)
     plan.json    which lines fit which month of the free quota (priority order, whole lines only)
   Sources (read gracefully, any of them may be missing): STORY.radio (map id -> {who,text,style}), STORY.dispatch (map or array of {id?,who,text,style} or {lines:[..]};
   T1 converts films to text dispatches), STORY.cine[*].scenes[*].lines (films, skipped when the film system is gone), STORY.barks[char][key][i].
   `key` is the runtime lookup key  <canonical speaker>|<fnv1a32 of the normalised text>  (84_voice.js voxPackKey): the game finds a recording by what is SPOKEN, so the
   pack keeps working when line ids are renamed and never plays a stale recording after the text changed.
   usage: node tools/voicepack/extract_lines.js [--out DIR] [--quota 10000] [--cpc 1] [--include-synth-only] [--story-dir DIR] [--quiet]
   Nothing here talks to the network. */
'use strict';
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf('--'+n);return i<0?d:(typeof d==='boolean'?true:args[i+1]);};
const OUT=path.resolve(opt('out',__dirname)),QUOTA=+opt('quota',10000),CPC=+opt('cpc',1),SYNTH_ONLY=opt('include-synth-only',false),QUIET=opt('quiet',false);
const loadStory=require(path.join(__dirname,'..','..','tests','sim','storylib.js'));
const L=loadStory(opt('story-dir',undefined)),STORY=L.STORY||{};

/* FNV-1a over UTF-16 code units: identical to KIT.hash in 80_audio.js (pack.py implements the same function) */
function fnv(s){let h=0x811C9DC5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
const norm=t=>String(t==null?'':t).replace(/\s+/g,' ').trim();
const chars=STORY.characters||{};
const narrator=Object.keys(chars).find(k=>chars[k].role==='narrator')||'narrator';
function canon(id){if(id==='narrator')return narrator;if(chars[id])return id;for(const k in chars)if(chars[k].hero===id)return k;return id;}

/* characters whose lines are never recorded unless --include-synth-only: the Overseer is a rule-based machine; its flat synthesized voice is the design */
const SYNTH_ONLY_CHARS=new Set(['overseer']);
const HEROES=new Set(Object.keys(chars).filter(k=>chars[k].role==='hero'||chars[k].role==='villain'||chars[k].role==='narrator'));

/* ElevenLabs voice DESIGN suggestions. Text prompts for "Voice Design" (create a voice from a description, then note its voice_id in voice_ids.json).
   Settings follow the public API fields (stability, similarity_boost, style, speed, use_speaker_boost); values are starting points, tune by ear.
   Nothing here was auditioned. */
const DESIGN={
  idris:{d:'Male, late forties, American-neutral baritone. Calm, weighty command voice of a career officer; clipped, unhurried, rarely raises his voice; dry warmth underneath.',s:{stability:.62,similarity_boost:.8,style:.25,speed:.95}},
  kaz:{d:'Male, around forty, low gravelly bass-baritone with a slight rasp. Blunt warlord, slow deliberate delivery, quiet menace and a stubborn kind of honesty.',s:{stability:.5,similarity_boost:.8,style:.4,speed:.93}},
  lyra:{d:'Female, mid forties, bright quick mezzo. Witty and nervous, humour rises when she is afraid; fast, expressive, slightly breathy at emotional moments.',s:{stability:.38,similarity_boost:.75,style:.45,speed:1.08}},
  ostrander:{d:'Female, early sixties, soft low alto. Gentle, exact, grief-hollowed; polite almost to the point of tenderness while saying terrible things. Very slow, controlled, never loud.',s:{stability:.7,similarity_boost:.8,style:.2,speed:.88}},
  marr:{d:'Male, thirty-something, hollow even tenor. Formal adjutant diction, careful and slightly cold; a restrained voice that hides strain.',s:{stability:.6,similarity_boost:.75,style:.2,speed:.97}},
  mags:{d:'Female, early sixties, gravelly working-class alto. Brisk, practical hauler pilot; dry humour, no patience for ceremony, quick clipped delivery.',s:{stability:.5,similarity_boost:.75,style:.35,speed:1.1}},
  ione:{d:'Female, seventies, warm clear mezzo. Storyteller narrator, exact and kind, measured pace with soft pauses; like reading aloud to a room by lamplight.',s:{stability:.7,similarity_boost:.8,style:.15,speed:.9}},
  thane:{d:'Male, early sixties, smooth silver-tongued tenor-baritone. Politician cadence, reasonable and soothing, fond of the word prudent.',s:{stability:.55,similarity_boost:.75,style:.3,speed:1.02}},
  oru:{d:'Female, late forties, charming mid-range voice. Trader patter, quick and friendly with a smile in the voice, honest about exactly one thing.',s:{stability:.45,similarity_boost:.75,style:.4,speed:1.12}},
  brio:{d:'Male, mid twenties, bright light tenor. Dry-humoured surveyor, quick and casual, sardonic understatement.',s:{stability:.4,similarity_boost:.75,style:.4,speed:1.12}},
  crake:{d:'Male, late fifties, dry hollow baritone. Courteous, bloodless accountant; precise consonants, no warmth, never hurried.',s:{stability:.7,similarity_boost:.8,style:.1,speed:.93}},
  dax:{d:'Male, early fifties, rough gruff mid-baritone. Retired sergeant, barking short sentences with tired humour.',s:{stability:.5,similarity_boost:.75,style:.35,speed:1.1}},
  anselm:{d:'Male, mid thirties, soft gentle tenor. Calm, slightly bewildered engineer waking up after thirty years; kind, quiet.',s:{stability:.6,similarity_boost:.75,style:.2,speed:.97}},
  pim:{d:'Girl, about eleven, high bright voice. Earnest, curious, quick; not babyish.',s:{stability:.45,similarity_boost:.75,style:.35,speed:1.08}},
  tilda:{d:'Female, mid fifties, rough warm alto. Tallow-chandler, steady and motherly, plain speech.',s:{stability:.55,similarity_boost:.75,style:.25,speed:.95}},
  overseer:{d:'(synthesized by design) Flat machine status voice. Not recommended for recording: the game keeps its rule-based synthesized voice for the Overseer.',s:{stability:.9,similarity_boost:.8,style:0,speed:1}}
};
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function designFor(id,c){
  if(DESIGN[id])return DESIGN[id];
  const v=(c&&c.voice)||{},tp=v.ttsPitch||1;   // unknown / future characters: derive a generic description from the synth profile
  return{d:`${tp>=1.12?'Female or young':tp<=.9?'Male, low':'Adult'} voice, ${v.timbre||'neutral'} timbre, ${v.rate>1.1?'quick':v.rate<.92?'slow':'even'} delivery.`,s:{stability:.55,similarity_boost:.75,style:.3,speed:clamp(v.rate||1,.8,1.2)}};
}

const lines=[],seen=new Map();
function add(kind,id,who,text,style,order){
  text=norm(text);if(!text)return;who=canon(who||'narrator');
  const key=who+'|'+fnv(text);
  if(seen.has(key)){seen.get(key).alias.push(id);return;}   // one recording serves every identical line
  const hero=HEROES.has(who);
  /* tier: 1 hero/villain/narrator story beats (cinematics, dispatches) · 2 hero radio · 3 other radio / dispatch · 4 other cinematic lines · 5 barks */
  let tier=kind==='bark'?5:(kind==='radio'?(hero?2:3):(hero?1:4));
  if(kind==='dispatch'&&!hero)tier=3;
  const rec={id,speaker:who,text,chars:text.length,priority:0,tier,kind,style:style||'normal',key,alias:[],order};
  rec.synthOnly=SYNTH_ONLY_CHARS.has(who);
  seen.set(key,rec);lines.push(rec);
}
let ord=0;
const D=STORY.dispatch;
if(D){const it=Array.isArray(D)?D.map((x,i)=>[x&&x.id||('d'+i),x]):Object.entries(D);
  for(const[id,x]of it){
    if(x&&Array.isArray(x.lines))x.lines.forEach((l,i)=>add('dispatch','dispatch:'+id+':'+i,l.who||x.who,l.text,l.style||x.style,ord++));
    else if(x)add('dispatch','dispatch:'+id,x.who||x.speaker,x.text,x.style,ord++);}}
for(const[fid,f]of Object.entries(STORY.cine||{}))for(const s of(f.scenes||[]))for(const[i,l]of(s.lines||[]).entries())add('cine',`cine:${fid}:${s.id||''}:${i}`,l.who,l.text,l.style,ord++);
for(const[id,r]of Object.entries(STORY.radio||{}))add('radio','radio:'+id,r.who,r.text,r.style,ord++);
for(const[ch,ks]of Object.entries(STORY.barks||{}))for(const[k,arr]of Object.entries(ks))(arr||[]).forEach((l,i)=>add('bark',`bark:${ch}:${k}:${i}`,ch,typeof l==='string'?l:l.text,'normal',ord++));

const eligible=lines.filter(l=>SYNTH_ONLY||!l.synthOnly);
eligible.sort((a,b)=>a.tier-b.tier||a.order-b.order);
eligible.forEach((l,i)=>l.priority=i+1);
const skipped=lines.filter(l=>!eligible.includes(l));
/* plan: fill each month with whole lines in priority order, never exceeding the quota; a line longer than the quota alone is reported */
const months=[];let cur={month:1,credits:0,chars:0,lines:0,ids:[]};
for(const l of eligible){
  const cost=Math.ceil(l.chars*CPC);
  if(cost>QUOTA){l.unfit=true;continue;}
  if(cur.credits+cost>QUOTA){months.push(cur);cur={month:cur.month+1,credits:0,chars:0,lines:0,ids:[]};}
  cur.credits+=cost;cur.chars+=l.chars;cur.lines++;cur.ids.push(l.id);l.month=cur.month;
}
if(cur.lines)months.push(cur);
const total=eligible.reduce((s,l)=>s+l.chars,0);
const byTier={};for(const l of eligible){const t=byTier[l.tier]||(byTier[l.tier]={lines:0,chars:0});t.lines++;t.chars+=l.chars;}
const speakers=[...new Set(lines.map(l=>l.speaker))].sort();
const voices={_note:'Suggested ElevenLabs voice DESIGN prompts and settings per character, plus the game\'s own synthesized voiceProfile (the runtime fallback). Create each voice in your own ElevenLabs account, then put its voice_id in voice_ids.json ({"idris":"<voice_id>",...}). Nothing here has been auditioned.',
  model_id:'eleven_multilingual_v2',model_note:'Model ids change: check the current list in your account before rendering.',characters:{}};
for(const id of Object.keys(chars).sort()){
  const c=chars[id],dz=designFor(id,c);
  voices.characters[id]={name:c.name,role:c.role,elevenlabs:{description:dz.d,settings:Object.assign({use_speaker_boost:true},dz.s)},synthOnly:SYNTH_ONLY_CHARS.has(id),voiceProfile:c.voice||null};
}
for(const sp of speakers)if(!voices.characters[sp]){const dz=designFor(sp,null);voices.characters[sp]={name:sp,role:'unknown',elevenlabs:{description:dz.d,settings:Object.assign({use_speaker_boost:true},dz.s)},synthOnly:false,voiceProfile:null};}
const out={generated_by:'tools/voicepack/extract_lines.js',count:lines.length,lines:eligible.concat(skipped.map(s=>Object.assign(s,{priority:0})))};
const plan={quota_credits_per_month:QUOTA,credits_per_char:CPC,note:'Free plan ~10,000 credits/month and NO commercial licence (docs/AUDIO_V4.md, tools/voicepack/README.md). Verify current limits before relying on this.',
  eligible_lines:eligible.length,eligible_chars:total,total_credits:Math.ceil(total*CPC),months_needed:months.length,by_tier:byTier,synth_only_skipped:skipped.length,unfit:eligible.filter(l=>l.unfit).map(l=>l.id),months:months.map(m=>({month:m.month,credits:m.credits,chars:m.chars,lines:m.lines,first:m.ids[0],last:m.ids[m.ids.length-1]}))};
fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(path.join(OUT,'lines.json'),JSON.stringify(out,null,1)+'\n');
fs.writeFileSync(path.join(OUT,'voices.json'),JSON.stringify(voices,null,1)+'\n');
fs.writeFileSync(path.join(OUT,'plan.json'),JSON.stringify(plan,null,1)+'\n');
if(!QUIET){
  console.log(`lines: ${lines.length} unique (${eligible.length} recordable, ${skipped.length} synth-only skipped), ${total} characters = ${Math.ceil(total*CPC)} credits at ${CPC} credit/char`);
  for(const t of Object.keys(byTier).sort())console.log(`  tier ${t}: ${byTier[t].lines} lines, ${byTier[t].chars} chars`);
  console.log(`plan: ${months.length} month(s) of the ${QUOTA}-credit free quota`+months.map(m=>`\n  month ${m.month}: ${m.lines} lines, ${m.credits} credits`).join(''));
  console.log('wrote lines.json voices.json plan.json to '+OUT);
}
