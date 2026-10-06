/* Mutation self-test for tools/validate_story.js (CLAUDE.md rule 15: a check that cannot fail is worthless).
   1. the generated fixture must validate with ZERO errors;  2. each deliberate corruption below must be caught with the expected message. */
const path=require('path');
const {validate}=require(path.join(__dirname,'..','..','tools','validate_story.js'));
const loadStory=require(path.join(__dirname,'..','sim','storylib.js'));
const mk=require(path.join(__dirname,'..','fixtures','story_min.js'));
const V=loadStory();
let fails=0;const ok=(c,m)=>{console.log((c?'ok    ':'FAIL  ')+m);if(!c)fails++;};
const base=validate(mk(),V);
ok(base.errs.length===0,'fixture story validates with 0 errors'+(base.errs.length?' — '+base.errs.slice(0,3).join(' | '):''));
const firstScene=(S,id)=>S.cine[id||'intro'].scenes[0];
const M=[
  ['missing hero idris',S=>{delete S.characters.idris;},'idris (playable hero) is required'],
  ['wrong hero unit',S=>{S.characters.kaz.hero='hero_lyra';},'hero must be "hero_kaz"'],
  ['no narrator',S=>{delete S.characters.narrator;},'a narrator is required'],
  ['no villain',S=>{for(const c of Object.values(S.characters))if(c.role==='villain')c.role='ally';},'main villain'],
  ['identical looks',S=>{S.characters.pip.look=JSON.parse(JSON.stringify(S.characters.ada.look));},'visually distinct'],
  ['bad motif',S=>{S.characters.pip.motif='nope';},'motif must be one of'],
  ['bad voice pitch',S=>{S.characters.pip.voice.pitch=9;},'voice.pitch out of range'],
  ['line too short to read',S=>{firstScene(S).lines[0].dur=0.3;},'too short to read'],
  ['line past scene end',S=>{const l=firstScene(S).lines[0];l.t=firstScene(S).dur;},'ends after the scene'],
  ['overlapping lines',S=>{const s=firstScene(S);s.lines.push({who:'idris',text:'A second line at the same time.',t:1,dur:3,style:'radio'});},'overlaps the previous line'],
  ['unknown speaker',S=>{firstScene(S).lines[0].who='nobody';},'unknown speaker'],
  ['speaker without actor',S=>{firstScene(S).lines[0].who='tov';},'has no actor in this scene'],
  ['line over 150 chars',S=>{firstScene(S).lines[0].text='x'.repeat(160);},'chars (max'],
  ['unknown bg kind',S=>{firstScene(S).bg={k:'swamp'};},'bg.k must be one of'],
  ['bg enum violation',S=>{firstScene(S).bg={k:'planet',planet:'plaid'};},'not in'],
  ['bg numeric range',S=>{firstScene(S).bg={k:'space',density:3};},'outside 0..1'],
  ['unknown fx',S=>{firstScene(S).fx=[{k:'confetti',t0:0,t1:2}];},'fx k must be one of'],
  ['unknown prop param',S=>{firstScene(S).props=[{k:'planet',planet:'azure',colour:'red'}];},'unknown param'],
  ['bad prop enum',S=>{firstScene(S).props=[{k:'ship',cls:'ufo',faction:'meridian'}];},'not allowed'],
  ['scene too long',S=>{firstScene(S).dur=40;},'dur must be'],
  ['intro too short',S=>{S.cine.intro.scenes=S.cine.intro.scenes.slice(0,2);},'total runtime'],
  ['unknown music cue',S=>{S.cine.intro.music='kazoo';},'not in MUSIC_CUES'],
  ['unknown sfx',S=>{firstScene(S).sfx=[{t:0.1,name:'boing'}];},'sfx name must be one of'],
  ['unknown transition',S=>{firstScene(S).trans={in:'spin'};},'bad transition'],
  ['camera out of range',S=>{firstScene(S).cam.to.z=9;},'z in 0.5..3'],
  ['actor off-scene time',S=>{firstScene(S).actors[0].t1=99;},'outside the scene'],
  ['no intro',S=>{S.cine.intro.kind='interlude';},'exactly one intro'],
  ['no credits',S=>{S.cine.credits.kind='interlude';},'credits cinematic is required'],
  ['no defeat film',S=>{S.cine.defeat.kind='interlude';},'defeat cinematic is required'],
  ['mission count',S=>{S.missions.pop();S.acts[2].missions.pop();},'need exactly 9 missions'],
  ['enemy == faction',S=>{S.missions[0].setup.enemy=S.missions[0].setup.faction;},'enemy must differ'],
  ['enemy as object',S=>{S.missions[0].setup.enemy={ai:true};},'enemy must be a faction id'],
  ['bad seed',S=>{S.missions[0].setup.seed=1.5;},'seed must be an integer'],
  ['unknown unit in start',S=>{S.missions[0].setup.start.units=[{type:'dragon',n:2}];},'bad entry'],
  ['restrict unknown building',S=>{S.missions[0].setup.restrict.buildings=['moonbase'];},'unknown building'],
  ['briefing wrong kind',S=>{S.missions[0].briefing='i1';S.missions[0].briefing='m01_win';},'has kind debrief'],
  ['unknown cinematic ref',S=>{S.missions[0].triggers[0].do.push(['cine','missing']);},'unknown cinematic'],
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
console.log(fails?('\n'+fails+' SELF-TEST(S) FAILED'):'\nVALIDATOR SELF-TEST PASSED ('+M.length+' mutations)');
process.exit(fails?1:0);
