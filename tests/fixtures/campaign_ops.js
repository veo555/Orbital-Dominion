/* Campaign RUNTIME fixtures: one compact mission per op family (waves, strikes, restrictions + unlocks, flags / after-timers, objective states, stars,
   blocking cinematics, AI tuning, malformed data ...). Hand-written for tests/sim/campaign.js; tile coordinates are valid for the seed-1101/1103 maps
   (player main hub tile (11,72), enemy (73,12); `node tools/map_preview.js 1101` prints the map). Usage:
     const F=require('./campaign_ops.js')();   F.missions.waves   F.base('id',{triggers:[...]})   F.install(A)   // A = simlib3 instance: puts the fixture cinematics/radio into STORY
   Every call returns fresh deep objects (tests may mutate them). Missions run with `foe.ai:false` unless they test the AI, so they are fast and fully scripted. */
module.exports=function makeOps(){
  const clone=o=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
  const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const merge=(a,b)=>{const r=clone(a);for(const k of Object.keys(b||{}))r[k]=isObj(b[k])&&isObj(r[k])?merge(r[k],b[k]):clone(b[k]);return r;};
  const setup=over=>merge({faction:'meridian',enemy:'obsidian',diff:'normal',seed:1101,
    start:{c:500,e:0,era:1,hero:'available',units:[],buildings:[]},restrict:{},foe:{start:{},ai:false,mods:{}},swarm:'off',daylight:'cycle'},over||{});
  /* a mission skeleton: win when flag "done" is set, 60 s par, one primary + one bonus objective */
  const base=(id,over)=>{
    const m={id,act:1,n:1,title:'Ops '+id,subtitle:'fixture',place:'p1',synopsis:'campaign_ops fixture mission',briefing:'ops_cine',debrief:'ops_cine',defeat:null,after:null,
      setup:setup(),
      objectives:[{id:'p1',kind:'primary',text:'Primary objective',when:null,done:['flag','done'],fail:null},{id:'b1',kind:'bonus',text:'Bonus objective',when:null,done:['flag','bonus'],fail:null}],
      triggers:[],win:['flag','done'],lose:null,stars:{par:60},unlocks:{next:null},hints:[]};
    over=over||{};for(const k of Object.keys(over))m[k]=k==='setup'?setup(over.setup):clone(over[k]);
    return m;};
  const missions={
    /* start state: every `setup` field at once (aurora vs meridian, hard, night, swarm on, hero at start, extra units/buildings, supply bonus, enemy AI tuned) */
    setup:()=>base('ops_setup',{setup:{faction:'aurora',enemy:'meridian',diff:'hard',seed:1103,
      start:{c:777,e:123,era:2,hero:'start',units:[{type:'rifleman',n:5},{type:'raptor',n:2},{type:'hauler',n:2}],buildings:[{type:'turret',tx:16,ty:72}],supplyBonus:20},
      restrict:{buildings:['foundry'],units:['titan'],maxEra:2},
      foe:{start:{c:50,e:60,era:2,units:[{type:'rifleman',n:3}],buildings:[{type:'turret',tx:68,ty:16}]},ai:true,mods:{waveMult:2,intervalMult:0.5,firstWave:100,hero:false,air:false}},
      swarm:'on',daylight:'night',flags:{prebuilt:true}}}),
    /* restrictions: hero 'none', locked buildings / units / era; an `unlock` trigger at 20 s, a `lock` and a hero unlock on flags */
    restrict:()=>base('ops_restrict',{setup:{start:{hero:'none'},restrict:{buildings:['garrison','turret'],units:['rocketeer'],maxEra:1}},
      triggers:[{id:'t_unlock',when:['time','>=',20],do:[['unlock','building','garrison'],['unlock','unit','rocketeer'],['unlock','era',2]]},
        {id:'t_relock',when:['flag','relock'],do:[['lock','building','garrison'],['lock','era',2]]},
        {id:'t_hero',when:['flag','herook'],do:[['unlock','unit','hero_idris']]}]}),
    /* scripted waves (no enemy AI): arrivals from edges, positions, base, with the three orders */
    waves:()=>base('ops_waves',{triggers:[
      {id:'w1',when:['time','>=',5],do:[['spawn','enemy','raptor',3,'edge:N',{order:'attack'}]]},
      {id:'w2',when:['time','>=',6],do:[['spawn','enemy','rifleman',2,[30,40],{order:'hold'}]]},
      {id:'w3',when:['time','>=',7],do:[['spawn','me','rifleman',4,'base']]},
      {id:'w4',when:['time','>=',8],do:[['spawn','enemy','hauler',2,'base']]},
      {id:'w5',when:['time','>=',9],do:[['spawn','enemy','skiff',2,'edge:E',{order:'attack'}]]},
      {id:'w6',when:['time','>=',10],do:[['spawn','me','mender',1,'edge:S',{order:'idle'}]]}]}),
    /* delayed strikes: an enemy strike (default side), a friendly one, and a zero-delay one; the test plants units/buildings inside the circles first */
    strikes:()=>base('ops_strikes',{triggers:[
      {id:'s1',when:['time','>=',2],do:[['strike',34,50,3,500,4,'alert']]},
      {id:'s2',when:['time','>=',2],do:[['strike',38,50,3,400,1,'boom','me']]},
      {id:'s3',when:['time','>=',2],do:[['strike',20,30,2,100,0]]}]}),
    /* once / every / delay / after / latching */
    timers:()=>base('ops_timers',{triggers:[
      {id:'once',when:['time','>=',2],do:[['flag','a',true]]},
      {id:'every',once:false,every:5,when:['time','>=',1],do:[['mood','tension']]},
      {id:'delay',when:['time','>=',3],delay:4,do:[['flag','delayed',true]]},
      {id:'pulse_on',when:['time','>=',3],do:[['flag','pulse',true]]},
      {id:'pulse_off',when:['time','>=',3.4],do:[['flag','pulse',false]]},
      {id:'latched',when:['flag','pulse'],delay:2,do:[['flag','latched_fired',true]]},
      {id:'f_set',when:['time','>=',2],do:[['flag','f',true]]},
      {id:'afterf',when:['after','f',3],do:[['flag','after_fired',true]]},
      {id:'repeat',once:false,when:['flag','go'],do:[['mood','calm']]}]}),
    /* objective states: hidden until `when`, bonus fail, secret objective, conditions on other objectives */
    objectives:()=>base('ops_objectives',{objectives:[
      {id:'p1',kind:'primary',text:'Primary one',when:null,done:['flag','p1done'],fail:null},
      {id:'p2',kind:'primary',text:'Primary two (appears later)',when:['flag','show2'],done:['flag','p2done'],fail:null},
      {id:'b1',kind:'bonus',text:'Bonus with a fail condition',when:null,done:['flag','b1done'],fail:['flag','b1fail']},
      {id:'b2',kind:'bonus',text:'Bonus on resources',when:null,done:['res','c','>=',1500],fail:null},
      {id:'h1',kind:'hidden',text:'Secret objective',when:null,done:['flag','h1done'],fail:null},
      {id:'chain',kind:'bonus',text:'Needs p1',when:['obj','p1','done'],done:['flag','chaindone'],fail:null}],
      win:['all',['obj','p1','done'],['obj','p2','done']]}),
    /* a primary objective that can fail (=> defeat) */
    objFail:()=>base('ops_objfail',{objectives:[{id:'p1',kind:'primary',text:'Keep it alive',when:null,done:['flag','done'],fail:['flag','p1fail']},{id:'b1',kind:'bonus',text:'Bonus',when:null,done:['flag','bonus'],fail:null}]}),
    /* blocking cinematics: two in one trigger, more actions after them, a later trigger that must wait */
    cine:()=>base('ops_cine_m',{triggers:[
      {id:'c1',when:['time','>=',2],do:[['cine','ops_cine'],['cine','ops_cine2'],['radio','r1'],['flag','after_cine',true]]},
      {id:'c2',when:['time','>=',3],do:[['flag','t3',true]]},
      {id:'badcine',when:['time','>=',1],do:[['cine','no_such_cine'],['flag','after_badcine',true]]}]}),
    /* the enemy AI is on and tuned by `aimod` (absolute, not cumulative) */
    aimod:()=>base('ops_aimod',{setup:{foe:{ai:true,mods:{waveMult:0.05,firstWave:1},start:{units:[{type:'rifleman',n:3}]}}},
      triggers:[{id:'a1',when:['time','>=',5],do:[['aimod',{waveMult:3,intervalMult:2,firstWave:50,hero:false,air:false}]]},
        {id:'a2',when:['time','>=',10],do:[['aimod',{waveMult:1,intervalMult:1}]]},
        {id:'a3',when:['time','>=',12],do:[['aimod',{bogus:1,waveMult:'x'}]]}]}),
    /* a mission that changes nothing: used to prove the campaign layer is inert (compared with a plain newGame) */
    plain:()=>base('ops_plain',{setup:{foe:{ai:true,mods:{}}},objectives:[{id:'p1',kind:'primary',text:'Never',when:null,done:['flag','never'],fail:null},{id:'b1',kind:'bonus',text:'Never',when:null,done:['flag','never'],fail:null}],
      triggers:[],win:null,lose:null}),
    /* malformed data of every kind: nothing may throw; each problem is logged once; the valid trigger at the end still fires */
    malformed:()=>({id:'ops_bad',setup:{faction:'meridian',enemy:'obsidian',diff:'ultra',seed:1101,start:{c:'lots',era:9,hero:'maybe',units:[{type:'nope',n:3},{type:'rifleman',n:-1},'x',{type:'hero_idris',n:1}],buildings:[{type:'nope',tx:1,ty:1},{type:'turret',tx:500,ty:2},{type:'turret',tx:11,ty:72}],supplyBonus:'x'},
        restrict:{buildings:['nope'],units:[7],maxEra:5},foe:{ai:true,mods:{waveMult:'x',weird:1}},swarm:'maybe',daylight:'dusk'},
      objectives:[{kind:'primary',text:'no id'},{id:'o1',kind:'weird',text:'bad kind',when:null,done:['flag','never'],fail:null},{id:'o1',kind:'bonus',text:'dup',when:null,done:['flag','never'],fail:null},
        {id:'o2',kind:'primary',text:'bad cond',when:null,done:['bogus',1],fail:['count','unit','me','army','~',1]},7],
      triggers:[
        {id:'u1',when:['bogus',1],do:[['flag','x',true]]},
        {id:'u2',when:['count','unit','nobody','army','>=',1],do:[['flag','x',true]]},
        {id:'u3',when:['count','unit','me','blorp','>=',1],do:[['flag','x',true]]},
        {id:'u4',when:['res','c','~',1],do:[['flag','x',true]]},
        {id:'u5',when:['res','c','>=','many'],do:[['flag','x',true]]},
        {id:'u6',when:['time','>='],do:[['flag','x',true]]},
        {id:'u7',when:['not'],do:[['flag','x',true]]},
        {id:'u8',when:['obj','missing','done'],do:[['flag','x',true]]},
        {id:'u9',when:['hero','sleeping'],do:[['flag','x',true]]},
        {id:'u10',when:['heroNear',500,2,3],do:[['flag','x',true]]},
        {id:'u11',when:['researched','magic'],do:[['flag','x',true]]},
        {id:'u12',when:['built','castle','>=',1],do:[['flag','x',true]]},
        {id:'u13',when:'time',do:[['flag','x',true]]},
        {id:'u14',do:[['flag','x',true]]},
        {id:'u15',when:['time','>=',0],do:'nope'},
        {id:'u16',when:['time','>=',0],do:[['bogus'],['spawn','nobody','rifleman',1,'base'],['spawn','me','nope',1,'base'],['spawn','me','rifleman',0,'base'],['spawn','me','rifleman',1,'moon'],['spawn','me','rifleman',1,[999,1]],
          ['spawn','me','rifleman',1,'base',{order:'dance'}],['spawn','me','crawler',1,'base'],['spawn','me','hero_kaz',1,'base'],['give','x',5],['give','c',-5],['take','c','a'],['reveal',1,1],['ping',1,1,'loud'],['strike',1,1],['mood','glad'],
          ['lose'],['unlock','planet','x'],['unlock','era',7],['lock','unit','nope'],['herolevel',99],['heal','me',1,1],['aimod',5],['obj','nope','show'],['obj','p1','explode'],['flag','x'],['flag',5,true],['radio'],['cine'],null,7,[],[5]]},
        {id:'ok',when:['time','>=',1],do:[['flag','survived',true]]}],
      win:['nonsense'],lose:7,stars:{par:'soon'}}),
  };
  const story={
    cine:{ops_cine:{id:'ops_cine',kind:'briefing',title:'Ops cine',music:'tension',scenes:[]},ops_cine2:{id:'ops_cine2',kind:'briefing',title:'Ops cine 2',music:'tension',scenes:[]}},
    radio:{r1:{who:'idris',text:'Ops radio line one.',style:'radio',dur:3},r2:{who:'idris',text:'Ops radio line two.',style:'radio',dur:3}}};
  const install=A=>{Object.assign(A.STORY.cine,clone(story.cine));Object.assign(A.STORY.radio,clone(story.radio));};
  return{base,setup,merge,clone,missions:new Proxy(missions,{get:(t,k)=>typeof t[k]==='function'?t[k]():t[k]}),install,story};
};
