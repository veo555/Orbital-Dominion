/* Loads only the headless data modules (core + vocabulary + story + campaign runtime) into a Node vm sandbox.
   Used by tools/validate_story.js and the campaign tests. No sim, no DOM. */
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function loadStory(dir){
  dir=dir||path.join(__dirname,'..','..','src','js');
  const files=fs.readdirSync(dir).filter(f=>/^(00|43|44)_/.test(f)).sort();
  const code=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
  const sandbox={window:{},document:{getElementById:()=>({})},localStorage:{getItem:()=>null,setItem:()=>{}},console,Math,JSON,Set,Map,Array,Object,Number,String,Uint8Array,Float32Array,Infinity,NaN,parseFloat,parseInt,isNaN};
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{filename:'story.js'});
  vm.runInContext('globalThis.__S={STORY,UDEF,BDEF,FACTIONS,FACTION_IDS,TECH,MUSIC_CUES,MOTIFS,UNIT_TYPES,BUILDING_TYPES,SFX_FACTIONS,SFX_UNIT_EVENTS,SFX_BUILDING_EVENTS,SFX_SKILLS,SFX_GLOBAL,CINE_SFX,SIDES,STORY_FACTIONS,VOICE_KEYS,CINE_KINDS,CINE_LIMITS,CINE_BG,CINE_EXPR,CINE_ACTOR_MODES,CINE_EASE,CINE_TRANS,CINE_FX,CINE_PROPS,LINE_STYLES,CMP,SIDE_REF,COND_OPS,ACTION_OPS,MOODS,MISSION_COUNT,ACT_COUNT,MW,MH,DIFF}',sandbox);
  return Object.assign({},sandbox.__S,{files});
};
