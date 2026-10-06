#!/usr/bin/env node
/* Story / cinematic / campaign validator.
     node tools/validate_story.js            # report; exit 1 on errors
     node tools/validate_story.js --strict   # warnings fail too
     node tools/validate_story.js --json     # machine-readable result
     node tools/validate_story.js --stats    # also print runtime / word-count statistics
   Reads the data modules (00_core, 43_vocab, 44_story_*) exactly as the game loads them. Contract: docs/CAMPAIGN_SPEC.md, docs/CINEMATIC_SPEC.md. */
const path=require('path');
const loadStory=require(path.join(__dirname,'..','tests','sim','storylib.js'));
const argv=process.argv.slice(2),STRICT=argv.includes('--strict'),JSONOUT=argv.includes('--json'),STATS=argv.includes('--stats');
/* --story <file.js>: validate a story object exported by that module (module.exports=STORY or a function returning it) instead of src/js/44_story_*.js — used by the self-test */
const sf=argv.indexOf('--story');let STORY=null;
if(sf>=0){const m=require(path.resolve(argv[sf+1]));STORY=typeof m==='function'?m():m;}

function validate(STORY,V){
const errs=[],warns=[];
const E=(p,m)=>errs.push(p+': '+m),W=(p,m)=>warns.push(p+': '+m);
const isNum=x=>typeof x==='number'&&isFinite(x),isStr=x=>typeof x==='string'&&x.length>0,isArr=Array.isArray;
const inRange=(x,a,b)=>isNum(x)&&x>=a&&x<=b;
const HEX=/^#[0-9a-fA-F]{6}$/;
const MAXT=V.MW-1;

/* ------------------------------------------------------------- structure */
for(const k of['meta','world','characters','acts','missions','cine','radio','barks'])if(STORY[k]===undefined)E('STORY.'+k,'missing');
const chars=STORY.characters||{},cines=STORY.cine||{},radio=STORY.radio||{};
const charIds=Object.keys(chars);

/* ------------------------------------------------------------- characters */
function checkChar(id,c){
  const p='characters.'+id;
  if(c.id!==id)E(p,'id field "'+c.id+'" must equal its key');
  for(const f of['name','short','title','bio','want','flaw','arc','quote'])if(!isStr(c[f]))E(p,'missing text field '+f);
  if(!V.SIDES.includes(c.side))E(p,'side must be one of '+V.SIDES);
  if(!V.STORY_FACTIONS.includes(c.faction))E(p,'faction must be one of '+V.STORY_FACTIONS);
  if(!['hero','villain','lieutenant','ally','mentor','civilian','narrator','rival'].includes(c.role))E(p,'bad role '+c.role);
  if(c.hero&&!V.UDEF[c.hero])E(p,'hero unit "'+c.hero+'" does not exist');
  if(!V.MOTIFS.includes(c.motif))E(p,'motif must be one of '+V.MOTIFS);
  const v=c.voice||{};
  if(!inRange(v.pitch,V.VOICE_KEYS.pitch[0],V.VOICE_KEYS.pitch[1]))E(p,'voice.pitch out of range');
  if(!inRange(v.rate,V.VOICE_KEYS.rate[0],V.VOICE_KEYS.rate[1]))E(p,'voice.rate out of range');
  if(!V.VOICE_KEYS.timbre.includes(v.timbre))E(p,'voice.timbre must be one of '+V.VOICE_KEYS.timbre);
  if(!inRange(v.formant,0,1))E(p,'voice.formant out of range');
  if(!inRange(v.ttsPitch,V.VOICE_KEYS.ttsPitch[0],V.VOICE_KEYS.ttsPitch[1]))E(p,'voice.ttsPitch out of range');
  if(!inRange(v.ttsRate,V.VOICE_KEYS.ttsRate[0],V.VOICE_KEYS.ttsRate[1]))E(p,'voice.ttsRate out of range');
  const l=c.look||{};
  if(c.role!=='narrator'){
    if(!HEX.test(l.skin||''))E(p,'look.skin must be #rrggbb');
    if(!l.hair||!['short','long','shaved','crest','braid','hood','bald','bun','mane'].includes(l.hair.style)||!HEX.test(l.hair.color||''))E(p,'look.hair {style,color} invalid');
    if(!HEX.test(l.eyes||''))E(p,'look.eyes must be #rrggbb');
    if(!l.armor||!['plate','coat','robe','suit','rags','crown','hood'].includes(l.armor.style)||!HEX.test(l.armor.col||'')||!HEX.test(l.armor.trim||''))E(p,'look.armor {style,col,trim} invalid');
    if(!isArr(l.mark)||!l.mark.length||l.mark.some(m=>!['scar-l','tattoo','glow-eye','mask','visor','halo','cracks','none'].includes(m)))E(p,'look.mark must be a non-empty list from the vocabulary');
    if(!['lean','broad','slight','massive'].includes(l.build))E(p,'look.build invalid');
    if(!['young','adult','old'].includes(l.age))E(p,'look.age invalid');
    if(!['faction','none','crown','sun'].includes(l.emblem))E(p,'look.emblem invalid');
  }
  if(isStr(c.bio)&&c.bio.length>520)W(p,'bio is long ('+c.bio.length+' chars)');
}
for(const id of charIds)checkChar(id,chars[id]);
const need={idris:'hero_idris',kaz:'hero_kaz',lyra:'hero_lyra'};
for(const k in need){if(!chars[k])E('characters',k+' (playable hero) is required');else if(chars[k].hero!==need[k])E('characters.'+k,'hero must be "'+need[k]+'"');}
const villains=charIds.filter(i=>chars[i].role==='villain'),evil=charIds.filter(i=>chars[i].side==='evil'),good=charIds.filter(i=>chars[i].side==='good');
if(charIds.length<12)E('characters','need at least 12 characters (have '+charIds.length+')');
if(good.length<4)E('characters','need at least 4 good characters (have '+good.length+')');
if(evil.length<3)E('characters','need at least 3 evil characters (have '+evil.length+')');
if(!villains.length)E('characters','a main villain (role:"villain") is required');
if(!charIds.some(i=>chars[i].role==='lieutenant'&&chars[i].side==='evil'))E('characters','an evil lieutenant (role:"lieutenant", side:"evil") is required');
if(!charIds.some(i=>['civilian','ally'].includes(chars[i].role)&&chars[i].faction!=='none'&&/haul|worker|pilot|miner|everyman/i.test((chars[i].title||'')+' '+(chars[i].bio||''))))W('characters','no worker-class everyman found (title/bio should mention hauler/worker/pilot/miner)');
if(!charIds.some(i=>chars[i].role==='narrator'))E('characters','a narrator is required');
{const seen={};for(const i of charIds){const k=JSON.stringify(chars[i].look||{});if(seen[k])E('characters.'+i,'look identical to '+seen[k]+' — every character must be visually distinct');seen[k]=i;}}

/* ------------------------------------------------------------- cinematics */
const cineRefs=new Set();
function numRange(spec,x){const m=/^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(spec);return m?inRange(x,+m[1],+m[2]):true;}
function checkParams(p,params,spec,what){
  for(const k in params){
    if(k==='k')continue;const s=spec[k];
    if(s===undefined){E(p,what+' unknown param "'+k+'"');continue;}
    const x=params[k];
    if(isArr(s)){ for(const y of(isArr(x)?x:[x]))if(!s.includes(y))E(p,what+'.'+k+' = '+JSON.stringify(y)+' not in '+JSON.stringify(s)); }
    else if(s==='[x,y] 0..1'||/^\[x,y\]/.test(s)){ if(!(isArr(x)&&x.length===2&&x.every(n=>inRange(n,0,1))))E(p,what+'.'+k+' must be [x,y] in 0..1'); }
    else if(s==='[faction,faction]'){ if(!(isArr(x)&&x.length===2&&x.every(f=>V.FACTION_IDS.includes(f))))E(p,what+'.'+k+' must be [factionA,factionB]'); }
    else if(/^\[\{x,y,k\}\]/.test(s)){ if(!(isArr(x)&&x.every(m=>m&&inRange(m.x,0,1)&&inRange(m.y,0,1)&&['friendly','enemy','objective','danger'].includes(m.k))))E(p,what+'.'+k+' must be [{x,y,k}] with k in friendly|enemy|objective|danger'); }
    else if(s==='bool'){ if(typeof x!=='boolean')E(p,what+'.'+k+' must be boolean'); }
    else if(s==='#rrggbb'){ if(!HEX.test(x||''))E(p,what+'.'+k+' must be #rrggbb'); }
    else if(/^-?[\d.]+\.\.-?[\d.]+$/.test(s)){ if(!numRange(s,x))E(p,what+'.'+k+' = '+x+' outside '+s); }
  }
}
function checkCine(id,c){
  const P='cine.'+id;
  if(c.id!==id)E(P,'id must equal its key');
  if(!V.CINE_KINDS.includes(c.kind))E(P,'kind must be one of '+V.CINE_KINDS);
  if(!isStr(c.title))E(P,'title missing');
  if(!V.MUSIC_CUES[c.music])E(P,'music cue "'+c.music+'" is not in MUSIC_CUES');
  if(!isArr(c.scenes)||!c.scenes.length){E(P,'no scenes');return 0;}
  let total=0;const L=V.CINE_LIMITS,spokenBy={};
  c.scenes.forEach((s,si)=>{
    const p=P+'.scenes['+si+']'+(s.id?'('+s.id+')':'');
    if(!isNum(s.dur)||s.dur<L.sceneMin||s.dur>L.sceneMax){E(p,'dur must be '+L.sceneMin+'..'+L.sceneMax+' s');return;}
    total+=s.dur;
    if(!s.bg||!V.CINE_BG[s.bg.k])E(p,'bg.k must be one of '+Object.keys(V.CINE_BG));else checkParams(p+'.bg',s.bg,V.CINE_BG[s.bg.k],'bg');
    if(s.cam){for(const e of['from','to']){const z=s.cam[e];if(!z||!inRange(z.x,0,1)||!inRange(z.y,0,1)||!inRange(z.z,0.5,3)||(z.r!==undefined&&!inRange(z.r,-0.3,0.3)))E(p+'.cam.'+e,'needs x,y in 0..1, z in 0.5..3, r in ±0.3');}
      if(s.cam.ease&&!V.CINE_EASE.includes(s.cam.ease))E(p+'.cam','bad ease');}
    const actors=s.actors||[],present=new Set();
    actors.forEach((a,ai)=>{const q=p+'.actors['+ai+']';
      if(!chars[a.char])E(q,'unknown character "'+a.char+'"');else present.add(a.char);
      if(!isArr(a.at)||a.at.length!==2||!a.at.every(x=>inRange(x,-0.2,1.2)))E(q,'at must be [x,y] in -0.2..1.2');
      if(a.h!==undefined&&!inRange(a.h,0.2,1.3))E(q,'h must be 0.2..1.3');
      if(a.face&&!['l','r'].includes(a.face))E(q,'face must be l|r');
      if(a.expr&&!V.CINE_EXPR.includes(a.expr))E(q,'bad expr '+a.expr);
      if(a.mode&&!V.CINE_ACTOR_MODES.includes(a.mode))E(q,'bad mode '+a.mode);
      for(const t of['t0','t1'])if(a[t]!==undefined&&!inRange(a[t],0,s.dur))E(q,t+' outside the scene');
      if(a.move&&(!isArr(a.move.to)||a.move.to.length!==2))E(q,'move.to must be [x,y]');
    });
    (s.props||[]).forEach((pr,pi)=>{const q=p+'.props['+pi+']';
      if(!V.CINE_PROPS[pr.k]){E(q,'prop k must be one of '+Object.keys(V.CINE_PROPS));return;}
      const spec=Object.assign({},V.CINE_PROPS[pr.k]);
      for(const k in pr){if(['k','from','to','scale','rot','t0','t1','ease','at','a','col','z'].includes(k))continue;
        if(spec[k]===undefined)E(q,'unknown param "'+k+'" for '+pr.k);else if(isArr(spec[k])&&!spec[k].includes(pr[k]))E(q,k+' = '+pr[k]+' not allowed');}
      for(const e of['from','to','at'])if(pr[e]!==undefined&&(!isArr(pr[e])||pr[e].length!==2||!pr[e].every(x=>inRange(x,-1,2))))E(q,e+' must be [x,y] in -1..2');
      if(pr.ease&&!V.CINE_EASE.includes(pr.ease))E(q,'bad ease');
    });
    (s.fx||[]).forEach((f,fi)=>{const q=p+'.fx['+fi+']';if(!V.CINE_FX.includes(f.k))E(q,'fx k must be one of '+V.CINE_FX);
      if(f.t0!==undefined&&!inRange(f.t0,0,s.dur))E(q,'t0 outside the scene');if(f.t1!==undefined&&!inRange(f.t1,0,s.dur+0.01))E(q,'t1 outside the scene');});
    let prevEnd=-1,lines=s.lines||[];
    if(lines.length>L.linesPerSceneMax)W(p,'more than '+L.linesPerSceneMax+' lines in one scene');
    lines.slice().sort((a,b)=>a.t-b.t).forEach((ln,li)=>{const q=p+'.lines['+li+']';
      if(ln.who!=='narrator'&&!chars[ln.who])E(q,'unknown speaker "'+ln.who+'"');
      if(!isStr(ln.text))E(q,'text missing');else{
        if(ln.text.length>L.lineMax)E(q,'text is '+ln.text.length+' chars (max '+L.lineMax+')');
        const need=Math.max(1.2,ln.text.length/L.readCps);if(!isNum(ln.dur)||ln.dur<need-0.05)E(q,'dur '+ln.dur+' s is too short to read '+ln.text.length+' chars (need ≥ '+need.toFixed(1)+' s at '+L.readCps+' cps)');
        if(/\b(as you know|little did|suddenly,)\b/i.test(ln.text))W(q,'stock phrase — rewrite');
        if(ln.text!==ln.text.trim())W(q,'leading/trailing space');
        (spokenBy.__texts=spokenBy.__texts||[]).push(ln.text);}
      if(!isNum(ln.t)||ln.t<0)E(q,'t invalid');else if(ln.t+(ln.dur||0)>s.dur+0.05)E(q,'ends after the scene ('+(ln.t+ln.dur).toFixed(1)+' > '+s.dur+')');
      if(ln.t<prevEnd-0.01)E(q,'overlaps the previous line');prevEnd=ln.t+(ln.dur||0);
      if(ln.style&&!V.LINE_STYLES.includes(ln.style))E(q,'bad style');
      if(ln.expr&&!V.CINE_EXPR.includes(ln.expr))E(q,'bad expr');
      const st=ln.style||'normal';
      if(['normal','shout','whisper'].includes(st)&&ln.who!=='narrator'&&!present.has(ln.who))E(q,'"'+ln.who+'" speaks on camera but has no actor in this scene (use style radio/thought, or add the actor)');
      if(ln.who==='narrator'&&!['narration','thought'].includes(st)&&ln.style!==undefined)W(q,'narrator lines should use style "narration"');
    });
    (s.sfx||[]).forEach((x,xi)=>{const q=p+'.sfx['+xi+']';if(!V.CINE_SFX.includes(x.name))E(q,'sfx name must be one of '+V.CINE_SFX);if(!inRange(x.t,0,s.dur))E(q,'t outside the scene');});
    if(s.music){if(!V.MUSIC_CUES[s.music.cue])E(p+'.music','unknown cue '+s.music.cue);}
    if(s.title&&(!isStr(s.title.text)||!inRange(s.title.t0,0,s.dur)||!inRange(s.title.t1,0,s.dur+0.01)))E(p+'.title','needs text,t0,t1 inside the scene');
    if(s.trans){for(const e of['in','out'])if(s.trans[e]&&!V.CINE_TRANS.includes(s.trans[e]))E(p+'.trans.'+e,'bad transition');}
  });
  const lim=L.total[c.kind];
  if(lim&&(total<lim[0]||total>lim[1]))E(P,'total runtime '+total.toFixed(1)+' s outside '+lim[0]+'–'+lim[1]+' s for kind "'+c.kind+'"');
  c.__runtime=total;return total;
}
const cineIds=Object.keys(cines);
for(const id of cineIds)checkCine(id,cines[id]);
const kindCount=k=>cineIds.filter(i=>cines[i].kind===k).length;
if(kindCount('intro')!==1)E('cine','exactly one intro cinematic is required (have '+kindCount('intro')+')');
if(kindCount('interlude')<6)E('cine','at least 6 interludes are required (have '+kindCount('interlude')+')');
if(kindCount('ending')<1)E('cine','at least one ending is required');
if(kindCount('credits')<1)E('cine','a credits cinematic is required');
if(kindCount('defeat')<1)E('cine','at least one defeat cinematic is required');

/* ------------------------------------------------------------- radio */
const radioUsed=new Set();
for(const id in radio){const r=radio[id],p='radio.'+id;
  if(r.who!=='narrator'&&!chars[r.who])E(p,'unknown speaker '+r.who);
  if(!isStr(r.text)||r.text.length>140)E(p,'text missing or longer than 140 chars');
  if(r.style&&!V.LINE_STYLES.includes(r.style))E(p,'bad style');
  if(r.dur!==undefined&&(!isNum(r.dur)||r.dur<1.5||r.dur>9))E(p,'dur must be 1.5..9 s');
  if(isStr(r.text)&&r.dur!==undefined&&r.dur<Math.max(1.5,r.text.length/V.CINE_LIMITS.readCps)-0.05)E(p,'dur too short for the text');}

/* ------------------------------------------------------------- conditions / actions */
const sideOK=s=>V.SIDE_REF.includes(s),cmpOK=c=>V.CMP.includes(c),tileOK=x=>isNum(x)&&x>=0&&x<=MAXT;
function checkCond(p,c,ctx){
  if(!isArr(c)||!isStr(c[0])){E(p,'condition must be [op,...]');return;}
  const op=c[0],a=c.slice(1);
  if(!V.COND_OPS[op]){E(p,'unknown condition op "'+op+'"');return;}
  const bad=m=>E(p,op+': '+m+' (expected '+V.COND_OPS[op]+')');
  switch(op){
    case'all':case'any':if(!a.length)bad('needs conditions');a.forEach((x,i)=>checkCond(p+'.'+op+'['+i+']',x,ctx));break;
    case'not':if(a.length!==1)bad('one condition');else checkCond(p+'.not',a[0],ctx);break;
    case'time':if(!(cmpOK(a[0])&&isNum(a[1])))bad('bad args');break;
    case'flag':if(!isStr(a[0]))bad('bad args');else ctx.flagsRead.add(a[0]);break;
    case'after':if(!(isStr(a[0])&&isNum(a[1])))bad('bad args');else ctx.flagsRead.add(a[0]);break;
    case'count':if(!(['unit','building'].includes(a[0])&&sideOK(a[1])&&cmpOK(a[3])&&isNum(a[4])))bad('bad args');
      else{const t=a[2];const okT=a[0]==='unit'?(t==='*'||t==='army'||t==='worker'||V.UDEF[t]):(t==='*'||V.BDEF[t]);if(!okT)bad('unknown type '+t);}break;
    case'res':if(!(['c','e'].includes(a[0])&&cmpOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'era':case'supply':case'kills':case'lost':case'structs':case'hubs':if(!(sideOK(a[0])&&cmpOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'hero':if(!(['alive','dead'].includes(a[0])||(a[0]==='level'&&cmpOK(a[1])&&isNum(a[2]))))bad('bad args');break;
    case'heroNear':if(!(tileOK(a[0])&&tileOK(a[1])&&isNum(a[2])&&a[2]>0))bad('bad args');break;
    case'camps':case'trade':case'wave':if(!(cmpOK(a[0])&&isNum(a[1])))bad('bad args');break;
    case'unitsNear':if(!(sideOK(a[0])&&(a[1]==='*'||a[1]==='army'||a[1]==='worker'||V.UDEF[a[1]])&&tileOK(a[2])&&tileOK(a[3])&&isNum(a[4])&&cmpOK(a[5])&&isNum(a[6])))bad('bad args');break;
    case'built':if(!(V.BDEF[a[0]]&&cmpOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'trained':if(!(V.UDEF[a[0]]&&cmpOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'researched':if(!V.TECH[a[0]])bad('unknown tech');break;
    case'mined':if(!(['c','e'].includes(a[0])&&cmpOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'obj':if(!(isStr(a[0])&&['active','done','failed'].includes(a[1])))bad('bad args');else ctx.objRead.add(a[0]);break;
  }
}
function checkAction(p,x,ctx){
  if(!isArr(x)||!isStr(x[0])){E(p,'action must be [op,...]');return;}
  const op=x[0],a=x.slice(1);
  if(!V.ACTION_OPS[op]){E(p,'unknown action op "'+op+'"');return;}
  const bad=m=>E(p,op+': '+m+' (expected '+V.ACTION_OPS[op]+')');
  switch(op){
    case'radio':if(!radio[a[0]])bad('unknown radio line '+a[0]);else{radioUsed.add(a[0]);ctx.radioUsed.add(a[0]);}break;
    case'cine':if(!cines[a[0]])bad('unknown cinematic '+a[0]);else cineRefs.add(a[0]);break;
    case'obj':if(!(isStr(a[0])&&['show','done','fail'].includes(a[1])))bad('bad args');else ctx.objAct.add(a[0]);break;
    case'flag':if(!(isStr(a[0])&&typeof a[1]==='boolean'))bad('bad args');else if(a[1])ctx.flagsSet.add(a[0]);break;
    case'spawn':{const w=a[3];const wOK=w==='base'||(isArr(w)&&tileOK(w[0])&&tileOK(w[1]))||/^edge:[NESW]$/.test(w||'');
      if(!(sideOK(a[0])&&V.UDEF[a[1]]&&isNum(a[2])&&a[2]>=1&&a[2]<=40&&wOK))bad('bad args');
      if(a[4]&&!['attack','idle','hold'].includes(a[4].order))bad('opts.order');break;}
    case'give':case'take':if(!(['c','e'].includes(a[0])&&isNum(a[1])))bad('bad args');break;
    case'reveal':if(!(tileOK(a[0])&&tileOK(a[1])&&isNum(a[2])))bad('bad args');break;
    case'ping':if(!(tileOK(a[0])&&tileOK(a[1])&&['good','bad','info'].includes(a[2])))bad('bad args');break;
    case'aimod':if(!(a[0]&&typeof a[0]==='object'))bad('needs an object');break;
    case'strike':if(!(tileOK(a[0])&&tileOK(a[1])&&isNum(a[2])&&isNum(a[3])&&isNum(a[4])))bad('bad args');break;
    case'mood':if(!V.MOODS.includes(a[0]))bad('bad mood');break;
    case'win':break;
    case'lose':if(!isStr(a[0]))bad('needs a reason id');break;
    case'unlock':case'lock':{const k=a[0],id=a[1];if(!(['building','unit','era'].includes(k)&&(k==='building'?V.BDEF[id]:k==='unit'?V.UDEF[id]:[2,3].includes(id))))bad('bad args');break;}
    case'herolevel':if(!inRange(a[0],1,6))bad('level 1..6');break;
    case'heal':if(!(sideOK(a[0])&&tileOK(a[1])&&tileOK(a[2])&&isNum(a[3])))bad('bad args');break;
  }
}

/* ------------------------------------------------------------- missions */
const missions=STORY.missions||[],mById={};
if(missions.length!==V.MISSION_COUNT)E('missions','need exactly '+V.MISSION_COUNT+' missions (have '+missions.length+')');
if((STORY.acts||[]).length!==V.ACT_COUNT)E('acts','need exactly '+V.ACT_COUNT+' acts (have '+(STORY.acts||[]).length+')');
(STORY.acts||[]).forEach((a,i)=>{const p='acts['+i+']';if(!isStr(a.id)||!isStr(a.title)||!isStr(a.summary))E(p,'id,title,summary required');if(!isArr(a.missions)||a.missions.length!==V.MISSION_COUNT/V.ACT_COUNT)E(p,'must list '+(V.MISSION_COUNT/V.ACT_COUNT)+' missions');});
missions.forEach((m,mi)=>{
  const p='missions['+mi+']'+(m.id?'('+m.id+')':'');
  if(!isStr(m.id)||mById[m.id])E(p,'id missing or duplicated');mById[m.id]=m;
  if(m.n!==mi+1)E(p,'n must be '+(mi+1));
  if(m.act!==Math.floor(mi/(V.MISSION_COUNT/V.ACT_COUNT))+1)E(p,'act must be '+(Math.floor(mi/(V.MISSION_COUNT/V.ACT_COUNT))+1));
  for(const f of['title','subtitle','synopsis'])if(!isStr(m[f]))E(p,'missing '+f);
  if(isStr(m.synopsis)&&m.synopsis.length>260)W(p,'synopsis is long');
  for(const[k,kinds]of[['briefing',['briefing','interlude']],['debrief',['debrief']],['defeat',['defeat']],['after',['interlude','ending']]]){
    const id=m[k];if(id===null||id===undefined){if(k==='briefing'||k==='debrief')E(p,k+' cinematic is required');continue;}
    if(!cines[id])E(p,k+' → unknown cinematic '+id);else{cineRefs.add(id);if(!kinds.includes(cines[id].kind))E(p,k+' cinematic "'+id+'" has kind '+cines[id].kind+' (want '+kinds.join('|')+')');}}
  const s=m.setup||{};
  if(!V.FACTION_IDS.includes(s.faction))E(p+'.setup','faction invalid');if(!V.FACTION_IDS.includes(s.enemy))E(p+'.setup','enemy invalid');if(s.faction===s.enemy)E(p+'.setup','enemy must differ from faction');
  if(!V.DIFF[s.diff])E(p+'.setup','diff invalid');if(!Number.isInteger(s.seed))E(p+'.setup','seed must be an integer');
  const st=s.start||{};
  if(st.c!==undefined&&!inRange(st.c,0,5000))E(p+'.setup.start','c out of range');if(st.e!==undefined&&!inRange(st.e,0,5000))E(p+'.setup.start','e out of range');
  if(st.era!==undefined&&![1,2,3].includes(st.era))E(p+'.setup.start','era 1..3');if(st.hero&&!['none','available','start'].includes(st.hero))E(p+'.setup.start','hero none|available|start');
  for(const u of st.units||[])if(!V.UDEF[u.type]||!inRange(u.n,1,60))E(p+'.setup.start.units','bad entry '+JSON.stringify(u));
  for(const b of st.buildings||[])if(!V.BDEF[b.type]||!tileOK(b.tx)||!tileOK(b.ty))E(p+'.setup.start.buildings','bad entry '+JSON.stringify(b));
  const rs=s.restrict||{};for(const b of rs.buildings||[])if(!V.BDEF[b])E(p+'.setup.restrict','unknown building '+b);for(const u of rs.units||[])if(!V.UDEF[u])E(p+'.setup.restrict','unknown unit '+u);
  if(rs.maxEra!==undefined&&![1,2,3].includes(rs.maxEra))E(p+'.setup.restrict','maxEra 1..3');
  if(!['off','on'].includes(s.swarm))E(p+'.setup','swarm must be "off" or "on"');if(!['cycle','night','day'].includes(s.daylight||'cycle'))E(p+'.setup','daylight invalid');
  const en=s.foe||{};for(const u of(en.start||{}).units||[])if(!V.UDEF[u.type]||!inRange(u.n,1,60))E(p+'.setup.foe.start.units','bad entry '+JSON.stringify(u));
  if(en.mods&&typeof en.mods!=='object')E(p+'.setup.foe.mods','must be an object');if(s.enemy&&typeof s.enemy==='object')E(p+'.setup','enemy must be a faction id (the enemy config lives in setup.foe)');
  const ctx={flagsRead:new Set(),flagsSet:new Set(Object.keys(s.flags||{})),objRead:new Set(),objAct:new Set(),radioUsed:new Set()};
  const objIds=new Set();let prim=0,bonus=0;
  (m.objectives||[]).forEach((o,oi)=>{const q=p+'.objectives['+oi+']';
    if(!isStr(o.id)||objIds.has(o.id))E(q,'id missing or duplicated');objIds.add(o.id);
    if(!['primary','bonus','hidden'].includes(o.kind))E(q,'kind invalid');if(o.kind==='primary')prim++;if(o.kind==='bonus')bonus++;
    if(!isStr(o.text)||o.text.length>60)E(q,'text missing or longer than 60 chars');
    checkCond(q+'.done',o.done,ctx);if(o.when)checkCond(q+'.when',o.when,ctx);if(o.fail)checkCond(q+'.fail',o.fail,ctx);});
  if(prim<1||prim+bonus<2)E(p,'needs ≥ 1 primary objective and ≥ 2 objectives in total');
  const tIds=new Set();
  (m.triggers||[]).forEach((t,ti)=>{const q=p+'.triggers['+ti+']';
    if(!isStr(t.id)||tIds.has(t.id))E(q,'id missing or duplicated');tIds.add(t.id);
    checkCond(q+'.when',t.when,ctx);if(!isArr(t.do)||!t.do.length)E(q,'do must list actions');else t.do.forEach((x,xi)=>checkAction(q+'.do['+xi+']',x,ctx));
    if(t.delay!==undefined&&!isNum(t.delay))E(q,'delay must be a number');if(t.every!==undefined&&!isNum(t.every))E(q,'every must be a number');});
  checkCond(p+'.win',m.win,ctx);checkCond(p+'.lose',m.lose,ctx);
  for(const f of ctx.flagsRead)if(!ctx.flagsSet.has(f))E(p,'flag "'+f+'" is read but never set to true');
  for(const o of ctx.objRead)if(!objIds.has(o))E(p,'condition reads unknown objective '+o);for(const o of ctx.objAct)if(!objIds.has(o))E(p,'action targets unknown objective '+o);
  if(ctx.radioUsed.size<4)E(p,'needs ≥ 4 distinct radio lines in its triggers (has '+ctx.radioUsed.size+')');
  if(!m.stars||!isNum(m.stars.par)||m.stars.par<120)E(p,'stars.par (seconds) required');
  if(mi<missions.length-1){if(!m.unlocks||m.unlocks.next!==(missions[mi+1]||{}).id)E(p,'unlocks.next must be '+(missions[mi+1]||{}).id);}else if(m.unlocks&&m.unlocks.next)E(p,'the last mission unlocks nothing');
  if(!isArr(m.hints)||!m.hints.length)W(p,'no hints');
  if(m.place&&!(STORY.world.places||[]).some(x=>x.id===m.place))E(p,'place "'+m.place+'" is not in world.places');
});
/* act → mission lists agree with the missions array */
(STORY.acts||[]).forEach((a,i)=>{const want=missions.slice(i*3,i*3+3).map(m=>m.id);if(JSON.stringify(a.missions)!==JSON.stringify(want))E('acts['+i+']','missions list must be '+JSON.stringify(want));});

/* ------------------------------------------------------------- story-level checks */
const last=missions[missions.length-1];
if(last&&villains.length){const vf=chars[villains[0]].faction;if(!['neutral','none'].includes(vf)&&last.setup&&last.setup.enemy!==vf)W('missions['+(missions.length-1)+']','final mission enemy "'+last.setup.enemy+'" is not the villain\'s faction "'+vf+'"');}
const endings=cineIds.filter(i=>cines[i].kind==='ending');
for(const id of endings){const actors=new Set();for(const s of cines[id].scenes||[])for(const a of s.actors||[])actors.add(a.char);
  const must=['idris','kaz','lyra'].concat(villains.slice(0,1));const miss=must.filter(x=>!actors.has(x));if(miss.length)W('cine.'+id,'the ending does not show '+miss.join(', ')+' on screen (closure)');}
const intro=cineIds.find(i=>cines[i].kind==='intro');
if(intro){const a=new Set();for(const s of cines[intro].scenes||[])for(const x of s.actors||[])a.add(x.char);if(!villains.some(v=>a.has(v)))W('cine.'+intro,'the villain is not shown in the intro (establish the evil early)');
  const t=JSON.stringify(cines[intro].scenes||[]);if(!/"title":/.test(t))W('cine.'+intro,'no title card in the intro');}
for(const id of cineIds){const kind=cines[id].kind;if(['intro','ending','credits'].includes(kind))cineRefs.add(id);}
for(const id of cineIds)if(!cineRefs.has(id)&&cines[id].kind!=='defeat')W('cine.'+id,'is not referenced by any mission, trigger or kind-based slot');
for(const id of cineIds)if(cines[id].kind==='defeat'&&!missions.some(m=>m.defeat===id)&&kindCount('defeat')===1)cineRefs.add(id);
{const seen={};for(const id of cineIds)for(const t of(cines[id].scenes||[]).flatMap(s=>(s.lines||[]).map(l=>l.text)))if(t&&t.length>24){if(seen[t])W('cine.'+id,'line repeated verbatim from '+seen[t]+': "'+t.slice(0,48)+'…"');else seen[t]=id;}}
for(const id of charIds)if(chars[id].role!=='narrator'){
  const used=cineIds.some(c=>(cines[c].scenes||[]).some(s=>(s.actors||[]).some(a=>a.char===id)||(s.lines||[]).some(l=>l.who===id)))||Object.values(radio).some(r=>r.who===id);
  if(!used)W('characters.'+id,'never appears in a cinematic or radio line');}
for(const c of Object.keys(STORY.barks||{}))if(!chars[c])E('barks.'+c,'unknown character');


const stats={charIds,cineIds,cines,missions,good,evil,radio};
return{errs,warns,stats};
}
module.exports={validate,checkMaps:(S,V,e,w)=>checkMaps(S,V,e,w)};
/* ------------------------------------------------------------- map-aware checks (needs the simulation; CLI only) */
/* A scripted spawn/ping/building must sit on a walkable, unblocked tile of THAT mission's own map (seed). */
function checkMaps(STORY,V,extraErrs,extraWarns){
  const sim=require(path.join(__dirname,'..','tests','sim','simlib3.js'));
  for(const m of STORY.missions||[]){
    const s=m.setup||{};if(!Number.isInteger(s.seed)||!V.FACTION_IDS.includes(s.faction)||!V.FACTION_IDS.includes(s.enemy))continue;
    let L;try{L=sim();L.newGame({seed:s.seed,faction:s.faction,enemy:s.enemy,diff:'normal'});}catch(e){extraErrs.push('missions.'+m.id+': map generation threw '+e.message);continue;}
    const G=L.G,MW=L.MW,walk=(x,y)=>x>=0&&y>=0&&x<L.MW&&y<L.MH&&G.TT[y*MW+x]===0&&!G.blocked[y*MW+x];
    const near=(x,y)=>{for(let r=0;r<=2;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(walk(x+dx,y+dy))return true;return false;};
    const visit=(p,a,fn)=>{if(!Array.isArray(a))return;if(typeof a[0]==='string'&&(V.ACTION_OPS[a[0]]||V.COND_OPS[a[0]])){fn(p,a);for(const x of a.slice(1))if(Array.isArray(x))visit(p,x,fn);}};
    for(const t of m.triggers||[])for(const [ai,a] of (t.do||[]).entries()){
      const p='missions.'+m.id+'.triggers.'+t.id+'.do['+ai+']';
      if(a[0]==='spawn'&&Array.isArray(a[4])){if(!near(a[4][0],a[4][1]))extraErrs.push(p+': spawn tile ('+a[4]+') is not walkable/free on the seed-'+s.seed+' map (nearest 5x5 has no free tile)');}
      if(a[0]==='ping'&&!near(a[1],a[2]))extraWarns.push(p+': ping at ('+a[1]+','+a[2]+') is on rock/void');
    }
    for(const b of(s.start||{}).buildings||[]){if(!walk(b.tx,b.ty))extraErrs.push('missions.'+m.id+'.setup.start.buildings: '+b.type+' at ('+b.tx+','+b.ty+') is not on free ground');}
    const scan=(p,c)=>{if(!Array.isArray(c))return;if((c[0]==='heroNear'&&!near(c[1],c[2]))||(c[0]==='unitsNear'&&!near(c[3],c[4])))extraWarns.push(p+': '+c[0]+' centre is on rock/void');for(const x of c.slice(1))if(Array.isArray(x))scan(p,x);};
    for(const o of m.objectives||[]){scan('missions.'+m.id+'.objectives.'+o.id,o.done);scan('missions.'+m.id+'.objectives.'+o.id,o.when);}
    for(const t of m.triggers||[])scan('missions.'+m.id+'.triggers.'+t.id,t.when);scan('missions.'+m.id+'.win',m.win);
  }
}

/* ------------------------------------------------------------- CLI */
if(require.main===module){
const V=loadStory();if(STORY===null)STORY=V.STORY;
const R=validate(STORY,V),errs=R.errs,warns=R.warns,{charIds,cineIds,cines,missions,good,evil,radio}=R.stats;
if(!argv.includes('--no-maps')&&sf<0)checkMaps(STORY,V,errs,warns);
if(JSONOUT){console.log(JSON.stringify({errors:errs,warnings:warns,characters:charIds.length,cinematics:cineIds.length,missions:missions.length,radio:Object.keys(radio).length},null,1));}
else{
  if(STATS){
    const by={};for(const id of cineIds){const c=cines[id];(by[c.kind]=by[c.kind]||[]).push([id,Math.round(c.__runtime||0)]);}
    console.log('characters:',charIds.length,'(good '+good.length+', evil '+evil.length+')   missions:',missions.length,'  radio lines:',Object.keys(radio).length,'  cinematics:',cineIds.length);
    for(const k in by)console.log('  '+k.padEnd(10),by[k].map(x=>x[0]+' '+x[1]+'s').join(', '));
    let words=0,lines=0,secs=0;for(const id of cineIds){secs+=cines[id].__runtime||0;for(const s of cines[id].scenes||[])for(const l of s.lines||[]){lines++;words+=(l.text||'').split(/\s+/).length;}}
    for(const r of Object.values(radio)){lines++;words+=(r.text||'').split(/\s+/).length;}
    console.log('  total film runtime '+Math.round(secs)+' s, '+lines+' spoken lines, '+words+' words');}
  const gi=argv.indexOf('--grep'),gr=gi>=0?argv[gi+1]:null,keep=x=>!gr||x.includes(gr);   // --grep <substr>: only report findings whose path/message contains it (agents validate their own file)
  for(const w of warns.filter(keep))console.log('WARN  '+w);for(const e of errs.filter(keep))console.log('ERROR '+e);
  console.log('\n'+(errs.length?errs.length+' ERROR(S)':'0 errors')+', '+warns.length+' warning(s)'+(gr?'  (listing filtered by "'+gr+'"; counts are for the whole story)':''));
}
process.exit(errs.length||(STRICT&&warns.length)?1:0);
}
