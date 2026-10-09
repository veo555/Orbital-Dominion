/* =========================================================================
   VOCABULARY — the one contract between the story data (44_*), the campaign runtime (45_*),
   the portrait painter (64), the campaign UI (76), the audio engine (80–85) and the validator (tools/validate_story.js).
   Pure data, no DOM/audio: loaded by the Node harness (tests/sim/storylib.js, simlib3.js).
   RULE: entries may be ADDED by the module that implements them; never renamed or removed once story data uses them.
   Every id listed here must be implemented by its owning engine (tests assert this in both directions).
   ========================================================================= */

/* ---------------------------- music cues (owner: 82/83_music) ---------------------------- */
/* Each cue is a self-contained piece the music engine can start, loop or play once.
   `loop:true` cues repeat until stopped; `len` is a nominal length in seconds.
   Dispatches reference these ids only (STORY.dispatch[id].mood). */
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
/* non-positional effects on the 'cine' bus (80/81 audio engine; kept for the Sound Lab, no story data uses them any more) */
const CINE_SFX=['whoosh','impact','boom','explosion','alarm','comms','door','engine','laser','rumble','glitch','heartbeat','chime','thunder','stinger','crowd','wind','powerup','powerdown','click','warp','siren','static','gong'];

/* ------------------------------- characters / voices ------------------------------- */
const SIDES=['good','evil','gray'];
const STORY_FACTIONS=['meridian','obsidian','aurora','neutral','none'];
/* voice descriptor used by 84_voice: how a character's speech blips and TTS are shaped */
const VOICE_KEYS={pitch:[0.5,1.6],rate:[0.8,1.3],timbre:['soft','bright','rough','smooth','hollow','metal'],formant:[0,1],ttsPitch:[0.4,1.8],ttsRate:[0.7,1.4]};

/* ----------------------------------- dispatches (owner: 76_campaign_ui, data in 44_story_b_dispatch_*) ---------------------------------- */
/* A dispatch is a static text card: STORY.dispatch[id]={id,kind,title,mood?,lines:[{who,text,style,expr?}]}. 'heading' lines are datelines / chapter cards. */
const DISPATCH_KINDS=['intro','interlude','ending','credits','briefing','debrief','defeat'];
const DISPATCH_LIMITS={lineMax:150,linesMax:40};
const PORTRAIT_EXPR=['neutral','talk','angry','smirk','sad','shock','smile','determined','laugh','scared','cold','weary'];
const PORTRAIT_MODES=['bust','silhouette','shadow','hologram'];
const LINE_STYLES=['normal','radio','whisper','shout','narration','thought','heading'];

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
  radio:'lineId',dispatch:'dispatchId  (blocking: pauses the sim until the card is closed)',obj:'id,show|done|fail',flag:'name,bool',
  spawn:'side,type,n,where(base|[tx,ty]|edge:N|edge:E|edge:S|edge:W),opts?{order:attack|idle|hold}',
  give:'c|e,n',take:'c|e,n',reveal:'tx,ty,r',ping:'tx,ty,good|bad|info',aimod:'{waveMult,intervalMult,firstWave,hero,air}',
  strike:'tx,ty,r,dmg,delaySec,sfx?',mood:'calm|tension|battle|dread|victory',win:'',lose:'reasonId',
  unlock:'building|unit|era,id',lock:'building|unit|era,id',herolevel:'n',heal:'side,tx,ty,r'
};
const MOODS=['calm','tension','battle','dread','victory'];
const MISSION_COUNT=9,ACT_COUNT=3;
const CAMP_SAVEKEY='orbital_dominion_v3_campaign';
