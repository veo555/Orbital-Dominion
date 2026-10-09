/* Mutation self-test for tools/validate_story.js (CLAUDE.md rule 15: a check that cannot fail is worthless).
   1. the generated fixture must validate with ZERO errors;  2. each deliberate corruption below must be caught with the expected message. */
const path=require('path');
const {validate,checkMaps}=require(path.join(__dirname,'..','..','tools','validate_story.js'));
const loadStory=require(path.join(__dirname,'..','sim','storylib.js'));
const mk=require(path.join(__dirname,'..','fixtures','story_min.js'));
const V=loadStory();
let fails=0;const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;};
const base=validate(mk(),V);
ok(base.errs.length===0,'fixture story validates with 0 errors'+(base.errs.length?' — '+base.errs.slice(0,3).join(' | '):''));
const firstLine=(S,id)=>S.dispatch[id||'intro'].lines.find(l=>l.style!=='heading');
const M=[
  ['missing hero idris',S=>{delete S.characters.idris;},'idris (playable hero) is required'],
  ['wrong hero unit',S=>{S.characters.kaz.hero='hero_lyra';},'hero must be "hero_kaz"'],
  ['no narrator',S=>{delete S.characters.narrator;},'a narrator is required'],
  ['no villain',S=>{for(const c of Object.values(S.characters))if(c.role==='villain')c.role='ally';},'main villain'],
  ['identical looks',S=>{S.characters.pip.look=JSON.parse(JSON.stringify(S.characters.ada.look));},'visually distinct'],
  ['bad motif',S=>{S.characters.pip.motif='nope';},'motif must be one of'],
  ['bad voice pitch',S=>{S.characters.pip.voice.pitch=9;},'voice.pitch out of range'],
  ['unknown speaker',S=>{firstLine(S).who='nobody';},'unknown speaker'],
  ['line over 150 chars',S=>{firstLine(S).text='x'.repeat(151);},'chars (max'],
  ['line without text',S=>{delete firstLine(S).text;},'text missing'],
  ['bad line style',S=>{firstLine(S).style='sing';},'bad style'],
  ['missing line style',S=>{delete firstLine(S).style;},'bad style'],
  ['bad portrait expression',S=>{firstLine(S).expr='grin';},'bad expr'],
  ['heading spoken by a character',S=>{S.dispatch.intro.lines[0].who='idris';},'heading must be spoken by "narrator"'],
  ['dispatch without lines',S=>{S.dispatch.i1.lines=[];},'no lines'],
  ['dispatch of headings only',S=>{S.dispatch.i1.lines=[{who:'narrator',text:'NIGHT 1',style:'heading'}];},'at least one spoken line'],
  ['too many lines',S=>{const d=S.dispatch.i1;while(d.lines.length<45)d.lines.push({who:'narrator',text:'Line '+d.lines.length+' of the long dispatch.',style:'narration'});},'more than 40 lines'],
  ['dispatch id differs from its key',S=>{S.dispatch.i1.id='i9';},'id must equal its key'],
  ['bad dispatch kind',S=>{S.dispatch.i1.kind='film';},'kind must be one of'],
  ['dispatch without title',S=>{delete S.dispatch.i1.title;},'title missing'],
  ['unknown mood cue',S=>{S.dispatch.intro.mood='kazoo';},'not in MUSIC_CUES'],
  ['a briefing too few',S=>{S.dispatch.m09_brief.kind='interlude';},'briefings are required'],
  ['a debrief too many',S=>{S.dispatch.i1.kind='debrief';},'debriefs are required'],
  ['too few interludes',S=>{for(const id of['i1','i2','i3'])S.dispatch[id].kind='defeat';},'at least 6 interludes'],
  ['no intro',S=>{S.dispatch.intro.kind='interlude';},'exactly one intro'],
  ['no credits',S=>{S.dispatch.credits.kind='interlude';},'credits dispatch is required'],
  ['no ending',S=>{S.dispatch.ending.kind='interlude';},'at least one ending is required'],
  ['no defeat dispatch',S=>{S.dispatch.defeat.kind='interlude';},'defeat dispatch is required'],
  ['old film shape rejected',S=>{delete S.dispatch.i1.lines;S.dispatch.i1.scenes=[{id:'s',dur:5,lines:[]}];},'no lines'],
  ['mission count',S=>{S.missions.pop();S.acts[2].missions.pop();},'need exactly 9 missions'],
  ['enemy == faction',S=>{S.missions[0].setup.enemy=S.missions[0].setup.faction;},'enemy must differ'],
  ['enemy as object',S=>{S.missions[0].setup.enemy={ai:true};},'enemy must be a faction id'],
  ['bad seed',S=>{S.missions[0].setup.seed=1.5;},'seed must be an integer'],
  ['unknown unit in start',S=>{S.missions[0].setup.start.units=[{type:'dragon',n:2}];},'bad entry'],
  ['restrict unknown building',S=>{S.missions[0].setup.restrict.buildings=['moonbase'];},'unknown building'],
  ['briefing wrong kind',S=>{S.missions[0].briefing='m01_win';},'has kind debrief'],
  ['unknown dispatch ref',S=>{S.missions[0].triggers[0].do.push(['dispatch','missing']);},'unknown dispatch'],
  ['old cine action op',S=>{S.missions[0].triggers[0].do.push(['cine','i1']);},'unknown action op'],
  ['mission without briefing',S=>{S.missions[0].briefing=null;},'briefing dispatch is required'],
  ['mission points at a missing debrief',S=>{S.missions[0].debrief='nope';},'unknown dispatch nope'],
  ['unknown condition op',S=>{S.missions[0].win=['teleport'];},'unknown condition op'],
  ['bad condition args',S=>{S.missions[0].win=['structs','enemy','~=',0];},'structs: bad args'],
  ['flag never set',S=>{S.missions[0].triggers[1].when=['flag','ghost'];},'never set'],
  ['unknown radio line',S=>{S.missions[0].triggers[0].do[0]=['radio','nope'];},'unknown radio line'],
  ['too few radio lines',S=>{S.missions[0].triggers=S.missions[0].triggers.slice(0,1);},'distinct radio lines'],
  ['unknown objective ref',S=>{S.missions[0].triggers[2].do.push(['obj','o99','done']);},'unknown objective'],
  ['tile off the map',S=>{S.missions[0].triggers[1].do.push(['ping',200,5,'bad']);},'ping: bad args'],
  ['spawn bad where',S=>{S.missions[0].triggers[1].do[1]=['spawn','enemy','raptor',3,'edge:X'];},'spawn: bad args'],
  ['unknown action op',S=>{S.missions[0].triggers[0].do.push(['explode']);},'unknown action op'],
  ['objective text too long',S=>{S.missions[0].objectives[0].text='y'.repeat(70);},'longer than 60'],
  ['no objectives',S=>{S.missions[0].objectives=[];},'primary objective'],
  ['duplicate objective id',S=>{S.missions[0].objectives[1].id='o1';},'duplicated'],
  ['radio text too long',S=>{S.radio.r11.text='z'.repeat(150);},'longer than 140'],
  ['radio dur too short',S=>{S.radio.r11.text='A reasonably long radio line that needs time.';S.radio.r11.dur=1.5;},'dur too short'],
  ['act list mismatch',S=>{S.acts[0].missions=['m01','m02','m09'];},'missions list must be'],
  ['unlock chain broken',S=>{S.missions[0].unlocks.next='m05';},'unlocks.next must be'],
  ['missing par',S=>{delete S.missions[0].stars;},'stars.par'],
  ['bark for nobody',S=>{S.barks.ghost={select:['hi']};},'unknown character'],
  ['mission place unknown',S=>{S.missions[0].place='nowhere';},'is not in world.places']
];
for(const[name,fn,want]of M){
  const S=mk();fn(S);let r;try{r=validate(S,V);}catch(e){ok(false,'mutation "'+name+'" threw '+e.message);continue;}
  const hit=r.errs.some(e=>e.includes(want));
  ok(hit,'mutation "'+name+'" is caught ('+(hit?want:'wanted "'+want+'", got: '+(r.errs.slice(0,2).join(' | ')||'no errors'))+')');
}

/* map-aware check: a spawn on rock must be reported, a spawn on the player's own start plateau must not */
{
  const sim=require(path.join(__dirname,'..','sim','simlib3.js'))();sim.newGame({seed:1101,faction:'meridian',enemy:'obsidian',diff:'normal'});
  const G=sim.G;let rock=null,floor=null;const allRock=(x,y)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(G.TT[(y+dy)*sim.MW+x+dx]!==1)return false;return true;};
  for(let y=10;y<80&&!(rock&&floor);y++)for(let x=10;x<80;x++){const t=G.TT[y*sim.MW+x],b=G.blocked[y*sim.MW+x];if(!rock&&allRock(x,y))rock=[x,y];if(t===0&&!b&&!floor&&Math.hypot(x-44,y-44)<12)floor=[x,y];}
  const run=(tile)=>{const S=mk();S.missions[0].setup.seed=1101;S.missions[0].setup.faction='meridian';S.missions[0].setup.enemy='obsidian';S.missions[0].triggers[1].do[1]=['spawn','enemy','raptor',3,tile];const e=[],w=[];checkMaps({missions:[S.missions[0]]},V,e,w);return e;};
  ok(rock&&floor,'found a rock tile and a free tile on the seed-1101 map ('+rock+' / '+floor+')');
  ok(run(rock).some(m=>m.includes('not walkable')),'map check: a spawn deep inside rock is reported');
  ok(run(floor).length===0,'map check: a spawn on open ground is accepted');
}

console.log(fails?('\n'+fails+' SELF-TEST(S) FAILED'):'\nVALIDATOR SELF-TEST PASSED ('+M.length+' mutations)');
process.exit(fails?1:0);
