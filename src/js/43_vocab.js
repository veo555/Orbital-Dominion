/* =========================================================================
   VOCABULARY — the one contract between the story data (44_*), the campaign runtime (45_*),
   the cinematic engine (64–66), the audio engine (80–85) and the validator (tools/validate_story.js).
   Pure data, no DOM/audio: loaded by the Node harness (tests/sim/storylib.js, simlib3.js).
   RULE: entries may be ADDED by the module that implements them; never renamed or removed once story data uses them.
   Every id listed here must be implemented by its owning engine (tests assert this in both directions).
   ========================================================================= */

/* ---------------------------- music cues (owner: 82/83_music) ---------------------------- */
/* Each cue is a self-contained piece the music engine can start, loop or play once.
   `loop:true` cues repeat until stopped; `len` is a nominal length in seconds used by the cinematic validator.
   Cinematics reference these ids only. */
const MUSIC_CUES={
  /* faction anthems — also the in-match adaptive themes */
  theme_meridian:{loop:true,len:64,mood:'heroic',faction:'meridian'},
  theme_obsidian:{loop:true,len:56,mood:'aggressive',faction:'obsidian'},
  theme_aurora:{loop:true,len:64,mood:'ethereal',faction:'aurora'},
  /* campaign cues */
  title:{loop:true,len:48,mood:'epic'},
  intro:{loop:false,len:78,mood:'epic'},
  hope:{loop:true,len:40,mood:'warm'},
  mystery:{loop:true,len:40,mood:'uneasy'},
  tension:{loop:true,len:32,mood:'tense'},
  dread:{loop:true,len:40,mood:'dark'},
  villain:{loop:true,len:40,mood:'menacing'},
  march:{loop:true,len:40,mood:'resolute'},
  battle:{loop:true,len:40,mood:'driving'},
  tragedy:{loop:false,len:36,mood:'sorrow'},
  betrayal:{loop:false,len:30,mood:'shock'},
  reunion:{loop:false,len:36,mood:'tender'},
  dawn:{loop:false,len:40,mood:'relief'},
  finale:{loop:false,len:90,mood:'triumph'},
  credits:{loop:false,len:75,mood:'reflective'},
  /* short stings (non-looping, 2–8 s) */
  sting_victory:{loop:false,len:8,mood:'triumph',sting:true},
  sting_defeat:{loop:false,len:8,mood:'sorrow',sting:true},
  sting_era:{loop:false,len:5,mood:'rise',sting:true},
  sting_hero:{loop:false,len:4,mood:'heroic',sting:true},
  sting_alarm:{loop:false,len:3,mood:'tense',sting:true},
  sting_reveal:{loop:false,len:4,mood:'shock',sting:true},
  sting_evil:{loop:false,len:5,mood:'menacing',sting:true}
};
/* leitmotifs: short melodic signatures, 2–6 s, that the score weaves into cues and plays when a character is introduced */
const MOTIFS=['idris','kaz','lyra','villain','worker','colony','array','hope'];

/* ------------------------------ sound effects (owner: 80/81_sfx) ------------------------------ */
/* sfx(name,x,y,who): `who` = entity / {type,faction}. Events that depend on the unit take the unit's own voice (type × faction). */
const UNIT_TYPES=['hauler','rifleman','raptor','rocketeer','mender','howitzer','juggernaut','skiff','titan','freighter','bulwark','reaver','specter','crawler','spitter','brute','hero_idris','hero_kaz','hero_lyra'];
const BUILDING_TYPES=['hub','generator','depot','siphon','habitat','garrison','armory','forum','exchange','foundry','airfield','turret'];
const SFX_FACTIONS=['meridian','obsidian','aurora','wild'];   // 'wild' = creeps / neutral
const SFX_UNIT_EVENTS=['select','ack','fire','melee','die','ready','hit'];          // per unit type; `fire` falls back to `melee` for melee units
const SFX_BUILDING_EVENTS=['place','done','die','fire'];                                // per building type (`fire`: hub and turret only)
const SFX_SKILLS=['barrage','orbital','shock','rampage','veil','sing','banner','bloodlust','regen'];   // hero_* skills (skill:<id>)
const SFX_GLOBAL=['click','err','tab','cancel','toast','coin','mine','deliver','trade','train','done','place','level','era','win','lose','alert','alertBase','supply','research','hero','heroFall','heroRevive','siege','cloak','heal','stim',
  'ack','select','shoot','bolt','rocket','shell','acid','melee','boom','boomBig'];   // legacy names stay valid: they resolve through the unit-aware dispatcher
/* names usable inside a cinematic scene's `sfx:[{t,name}]` (non-positional, cinematic bus) */
const CINE_SFX=['whoosh','impact','boom','explosion','alarm','comms','door','engine','laser','rumble','glitch','heartbeat','chime','thunder','stinger','crowd','wind','powerup','powerdown','click','warp','siren','static','gong'];

/* ------------------------------- characters / voices ------------------------------- */
const SIDES=['good','evil','gray'];
const STORY_FACTIONS=['meridian','obsidian','aurora','neutral','none'];
/* voice descriptor used by 84_voice: how a character's speech blips and TTS are shaped */
const VOICE_KEYS={pitch:[0.5,1.6],rate:[0.8,1.3],timbre:['soft','bright','rough','smooth','hollow','metal'],formant:[0,1],ttsPitch:[0.4,1.8],ttsRate:[0.7,1.4]};

/* ----------------------------------- cinematics (owner: 64–66_cine) ---------------------------------- */
const CINE_KINDS=['intro','interlude','ending','credits','briefing','debrief','defeat'];
const CINE_LIMITS={sceneMin:1.5,sceneMax:16,total:{intro:[55,95],interlude:[16,48],ending:[70,130],credits:[20,90],briefing:[8,40],debrief:[6,30],defeat:[8,30]},lineMax:150,readCps:19,linesPerSceneMax:5};
const CINE_BG={
  space:{nebula:['blue','red','teal','violet','gold','none'],density:'0..1',drift:'-1..1'},
  planet:{planet:['azure','ember','verdant','ice','ashen','violet'],rings:'bool',phase:'0..1',size:'0.3..2.5',moons:'0..3',atmosphere:'bool',nebula:['blue','red','teal','violet','gold','none']},
  orbit:{planet:['azure','ember','verdant','ice','ashen','violet'],limb:['bottom','left','right','top'],station:'bool',ships:'0..6',glow:'0..1'},
  surface:{biome:['dust','crystal','ash','green','ice'],time:['day','dusk','night','dawn'],features:['hub','generators','crystals','geyser','wreck','dunes','cliffs','towers','banners','tents']},
  base:{faction:['meridian','obsidian','aurora'],time:['day','dusk','night','dawn'],state:['calm','siege','ruined','celebration']},
  bridge:{faction:['meridian','obsidian','aurora','neutral'],alert:'bool',view:['space','planet','none','array']},
  hall:{style:['meridian','obsidian','aurora','forbidden'],light:['cold','warm','blood']},
  battlefield:{biome:['dust','crystal','ash','green','ice'],time:['day','dusk','night','dawn'],intensity:'0..1',sides:'[faction,faction]'},
  ruins:{biome:['dust','crystal','ash','green','ice'],time:['day','dusk','night','dawn']},
  array:{state:['dormant','charging','firing','broken'],planet:['azure','ember','verdant','ice','ashen','violet']},
  void:{tint:'#rrggbb',glow:'0..1'},
  map:{focus:'[x,y] 0..1',marks:'[{x,y,k}] k=friendly|enemy|objective|danger',faction:['meridian','obsidian','aurora','neutral']}
};
const CINE_EXPR=['neutral','talk','angry','smirk','sad','shock','smile','determined','laugh','scared','cold','weary'];
const CINE_ACTOR_MODES=['bust','silhouette','shadow','hologram'];
const CINE_EASE=['lin','in','out','inout'];
const CINE_TRANS=['cut','fade','flash','wipe','glitch','iris'];
const CINE_FX=['stars','dust','embers','rain','snow','lightning','beam','explosion','flare','rings','scan','glitch','shake','vignette','heat','pulse','sparks','smoke','comets'];
const CINE_PROPS={ship:{cls:['dropship','frigate','carrier','shuttle','wreck'],faction:['meridian','obsidian','aurora']},unit:{type:UNIT_TYPES,faction:['meridian','obsidian','aurora']},building:{type:BUILDING_TYPES,faction:['meridian','obsidian','aurora']},
  planet:{planet:['azure','ember','verdant','ice','ashen','violet']},moon:{},station:{},beacon:{},crystal:{},array:{},banner:{faction:['meridian','obsidian','aurora']},holo:{shape:['planet','ring','cross','skull','crown','map','sigil']},crowd:{faction:['meridian','obsidian','aurora']}};
const LINE_STYLES=['normal','radio','whisper','shout','narration','thought'];

/* ------------------------------------ campaign (owner: 45_campaign) ----------------------------------- */
const CMP=['<','<=','==','>=','>','!='];
const SIDE_REF=['me','enemy'];
/* condition ops: arrays [op, ...args]. Tile coordinates are in tiles (0..87), radii in tiles. */
const COND_OPS={
  all:'...conds',any:'...conds',not:'cond',
  time:'cmp,seconds  (mission clock)',
  flag:'name',after:'flag,seconds  (seconds since the flag was set)',
  count:'kind(unit|building),side,type|"*"|"army"|"worker",cmp,n',
  res:'c|e,cmp,n',era:'side,cmp,n',supply:'side,cmp,n',
  hero:'alive|dead|level,cmp?,n?',heroNear:'tx,ty,r',
  kills:'side,cmp,n',lost:'side,cmp,n',structs:'side,cmp,n',
  camps:'cmp,n  (creep camps cleared)',unitsNear:'side,type|"*",tx,ty,r,cmp,n',
  built:'buildingType,cmp,n',trained:'unitType,cmp,n',researched:'techId',
  hubs:'side,cmp,n',mined:'c|e,cmp,n',trade:'cmp,n',
  obj:'id,state(active|done|failed)',wave:'cmp,n'
};
const ACTION_OPS={
  radio:'lineId',cine:'cineId  (blocking: pauses the sim)',obj:'id,show|done|fail',flag:'name,bool',
  spawn:'side,type,n,where(base|[tx,ty]|edge:N|edge:E|edge:S|edge:W),opts?{order:attack|idle|hold}',
  give:'c|e,n',take:'c|e,n',reveal:'tx,ty,r',ping:'tx,ty,good|bad|info',aimod:'{waveMult,intervalMult,firstWave,hero,air}',
  strike:'tx,ty,r,dmg,delaySec,sfx?',mood:'calm|tension|battle|dread|victory',win:'',lose:'reasonId',
  unlock:'building|unit|era,id',lock:'building|unit|era,id',herolevel:'n',heal:'side,tx,ty,r'
};
const MOODS=['calm','tension','battle','dread','victory'];
const MISSION_COUNT=9,ACT_COUNT=3;
const CAMP_SAVEKEY='orbital_dominion_v3_campaign';
