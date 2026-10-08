/* =========================================================================
   STORY (3c3/n) - ACT III MISSIONS (owner: act3). M7 The Choir Spire, M8 Patience, M9 The Closing.
   Data only: no functions, no double quotes inside text (single quotes only).
   Contract: docs/CAMPAIGN_SPEC.md section 3; vocabulary src/js/43_vocab.js; design and voices docs/story/BIBLE.md sections 5, 8 and 9.
   Radio lines (m07_r* ... m09_r*) live in 44_story_d_radio_act3.js. Briefings, debriefs and interludes live in 44_story_b_act3.js.
   Coordinates are tiles on the fixed 88x88 Basin, checked with the engine's own canPlace / canStand on each mission's seed.
   The Wake's AI is off in M7 and M9 (foe.ai false): the AI rebuilds generators and Exchanges on its own schedule, so every
   "destroy all of X" objective would be unreliable, and the Wake's waves are scripted instead. Strikes always carry an explicit side.
   ========================================================================= */
STORY.missions.push(
{id:"m07",act:3,n:7,title:"The Choir Spire",subtitle:"It is free.",place:"choirspire",
 synopsis:"Day eight. Lyra commits her whole fleet to storm the Wake's high ground at the Choir Spire, and gives the stolen Roll away for free. Idris comes to the gate.",
 briefing:"m07_brief",debrief:"m07_win",defeat:"defeat_a3",after:"i07",
 setup:{faction:"aurora",enemy:"obsidian",diff:"normal",seed:1107,
   start:{c:1500,e:600,era:3,hero:"start",units:[{type:"specter",n:4},{type:"rocketeer",n:2},{type:"juggernaut",n:2},{type:"mender",n:1}],buildings:[],supplyBonus:24},
   foe:{ai:false,
     start:{c:0,e:0,era:3,
       buildings:[
         {type:"turret",tx:69,ty:11},{type:"turret",tx:69,ty:15},{type:"turret",tx:56,ty:19},{type:"turret",tx:60,ty:21},
         {type:"garrison",tx:73,ty:8},{type:"garrison",tx:70,ty:17},
         {type:"generator",tx:76,ty:9},{type:"generator",tx:77,ty:14},{type:"generator",tx:73,ty:19}],
       units:[{type:"rifleman",n:6},{type:"reaver",n:3},{type:"raptor",n:2}]}},
   swarm:"off",daylight:"day"},
 objectives:[
   {id:"o_relays",kind:"primary",text:"Destroy the three Choir Relays",when:null,done:["count","building","enemy","generator","==",0],fail:null},
   {id:"o_hub",kind:"primary",text:"Destroy the Spire's Command Hub",when:null,done:["hubs","enemy","==",0],fail:null},
   {id:"o_lyra",kind:"bonus",text:"Keep Lyra alive",when:null,done:["all",["obj","o_relays","done"],["obj","o_hub","done"],["hero","alive"]],fail:["hero","dead"]},
   {id:"o_gate",kind:"hidden",text:"Reach the Spire gate before 14:00",when:null,done:["all",["time","<=",840],["heroNear",66,13,3]],fail:null}
 ],
 triggers:[
   {id:"m07_t1",once:true,when:["time",">=",0.2],do:[["mood","tension"]]},
   {id:"m07_t2",once:true,when:["time",">=",20],do:[["radio","m07_r1"]]},
   {id:"m07_t3",once:true,when:["time",">=",27],do:[["radio","m07_r2"]]},
   {id:"m07_t4",once:true,when:["time",">=",180],do:[["reveal",72,14,10],["radio","m07_r3"],["mood","battle"]]},
   {id:"m07_t5",once:true,when:["time",">=",300],do:[["radio","m07_r4"]]},
   {id:"m07_t6",once:true,when:["time",">=",360],do:[["spawn","enemy","raptor",3,"edge:E",{order:"attack"}]]},
   {id:"m07_t7",once:true,when:["count","building","enemy","generator","<=",2],do:[["radio","m07_r5"]]},
   {id:"m07_t8",once:true,optional:true,when:["time",">=",600],do:[["spawn","me","rifleman",6,[56,24],{order:"attack"}],["spawn","me","juggernaut",2,[56,24],{order:"attack"}],["radio","m07_r6"],["mood","battle"]]},
   {id:"m07_t9",once:true,when:["count","building","enemy","generator","<=",1],do:[["radio","m07_r7"]]},
   {id:"m07_t10",once:true,when:["obj","o_relays","done"],do:[["radio","m07_r8"]]},
   {id:"m07_t11",once:true,when:["obj","o_gate","done"],do:[["radio","m07_r9"]]},
   {id:"m07_t12",once:true,optional:true,when:["time",">=",720],do:[["spawn","enemy","rifleman",4,"edge:N",{order:"attack"}]]}
 ],
 win:["all",["obj","o_relays","done"],["obj","o_hub","done"]],
 lose:["hubs","me","==",0],
 noDefaultWin:true,
 stars:{par:900},
 unlocks:{next:"m08"},
 hints:[
   "The Spire is reached by the east ramp at (61-68, 11-14). Turrets flank its head at x 69.",
   "The three Choir Relays stand at (76,9), (77,14) and (73,19), around the Command Hub.",
   "The lower ramp at (56,24) is covered by two turrets. Idris's Rifles arrive there at 10:00.",
   "Lyra may fall and revive at the Hub, but the bonus objective will not forgive it."
 ]},
{id:"m08",act:3,n:8,title:"Patience",subtitle:"The load is the size of a wheel.",place:"tallow",
 synopsis:"Night eight. Kaz, three Reavers and two raptors escort Mags's Patience and the Founders' Coupling from the Stair across the ash of Tallow Landing to the Axis, while hunters watch the road.",
 briefing:"m08_brief",debrief:"m08_win",defeat:"defeat_a3",after:"i08",
 setup:{faction:"obsidian",enemy:"aurora",diff:"normal",seed:1108,
   start:{c:0,e:0,era:1,hero:"start",units:[{type:"reaver",n:3},{type:"raptor",n:2}],buildings:[],supplyBonus:12},
   restrict:{buildings:["hub","generator","depot","siphon","habitat","garrison","armory","forum","exchange","foundry","airfield","turret"],
     units:["hauler","rifleman","rocketeer","mender","howitzer","juggernaut","skiff","titan","freighter","bulwark","specter","crawler","spitter","brute"],
     maxEra:1},
   foe:{ai:false},
   swarm:"off",daylight:"night"},
 objectives:[
   {id:"o_escort",kind:"primary",text:"Escort Patience to the Axis",when:null,done:["all",["flag","tallowRested"],["unitsNear","me","worker",44,44,2,">=",1]],fail:["all",["flag","patience"],["count","unit","me","worker","<",7]]},
   {id:"o_rest",kind:"primary",text:"Rest Patience at Tallow Landing 20 s",when:null,done:["flag","tallowRested"],fail:null},
   {id:"o_kaz",kind:"primary",text:"Keep Kaz alive",when:null,done:["all",["obj","o_escort","done"],["hero","alive"]],fail:["hero","dead"]},
   {id:"o_bonus",kind:"bonus",text:"Lose no escort unit",when:null,done:["all",["obj","o_escort","done"],["count","unit","me","reaver",">=",3],["count","unit","me","raptor",">=",2]],fail:["any",["count","unit","me","reaver","<",3],["count","unit","me","raptor","<",2]]}
 ],
 triggers:[
   {id:"m08_t1",once:true,when:["time",">=",2],do:[["spawn","me","hauler",1,[22,74],{order:"hold"}],["flag","patience",true],["mood","tension"]]},
   {id:"m08_t2",once:true,when:["time",">=",20],do:[["radio","m08_r1"]]},
   {id:"m08_t3",once:false,when:["unitsNear","me","worker",14,50,4,">=",1],do:[["flag","tallowAt",true]]},
   {id:"m08_t4",once:false,when:["not",["unitsNear","me","worker",14,50,4,">=",1]],do:[["flag","tallowAt",false]]},
   {id:"m08_t5",once:true,when:["unitsNear","me","worker",14,50,4,">=",1],do:[["spawn","enemy","rifleman",3,[14,45],{order:"hold"}],["radio","m08_r2"],["mood","battle"]]},
   {id:"m08_t6",once:true,when:["after","tallowAt",4],do:[["radio","m08_r3"]]},
   {id:"m08_t7",once:true,when:["after","tallowAt",20],do:[["flag","tallowRested",true],["radio","m08_r4"]]},
   {id:"m08_t8",once:true,when:["all",["flag","tallowRested"],["not",["unitsNear","me","worker",14,50,9,">=",1]]],do:[["flag","left",true],["radio","m08_r5"]]},
   {id:"m08_t9",once:true,when:["after","left",3],do:[["radio","m08_r6"]]},
   {id:"m08_t10",once:true,when:["unitsNear","me","worker",29,37,8,">=",1],do:[["spawn","me","rifleman",4,[28,42]],["spawn","me","rocketeer",2,[28,42]],["spawn","enemy","skiff",2,[34,41],{order:"hold"}],["spawn","enemy","raptor",2,[34,41],{order:"hold"}],["radio","m08_r7"],["mood","tension"]]},
   {id:"m08_t11",once:true,when:["unitsNear","me","worker",37,41,6,">=",1],do:[["spawn","enemy","rifleman",3,[37,41],{order:"hold"}],["spawn","enemy","raptor",2,[37,41],{order:"hold"}],["strike",37,41,5,400,6,null,"me"],["flag","singularity",true],["radio","m08_r8"],["mood","dread"]]},
   {id:"m08_t12",once:true,when:["after","singularity",7],do:[["radio","m08_r9"]]},
   {id:"m08_t13",once:true,when:["all",["flag","tallowRested"],["unitsNear","me","worker",44,44,2,">=",1]],do:[["radio","m08_r10"]]}
 ],
 win:["all",["obj","o_escort","done"],["obj","o_kaz","done"]],
 lose:["any",["hero","dead"],["all",["flag","patience"],["count","unit","me","worker","<",7]]],
 noDefaultWin:true,
 stars:{par:240},
 unlocks:{next:"m09"},
 hints:[
   "Patience cannot fight. Keep her behind the Reavers and out of rifle range.",
   "Resting at Tallow Landing is required. Three riflemen wait five tiles north of it.",
   "Reavers and raptors cannot hit skiffs. Bastion's riflemen and rockets are the answer.",
   "The Singularity lands six seconds after the last ambush. Pull Patience back until then."
 ]},
{id:"m09",act:3,n:9,title:"The Closing",subtitle:"Nine nights.",place:"axis",
 synopsis:"Night nine to dawn. Idris breaks the Tithe Foci and the Axis garrison, Kaz's Host joins him, and the Closing waits for a Key-bearer to hold the Axis for one minute.",
 briefing:"m09_brief",debrief:"m09_win",defeat:"defeat_a3",after:"ending",
 setup:{faction:"meridian",enemy:"obsidian",diff:"normal",seed:1109,
   start:{c:1500,e:500,era:3,hero:"start",units:[{type:"rifleman",n:6},{type:"rocketeer",n:2},{type:"juggernaut",n:2}],buildings:[],supplyBonus:20},
   foe:{ai:false,
     start:{c:0,e:0,era:3,
       buildings:[
         {type:"exchange",tx:39,ty:51},{type:"exchange",tx:47,ty:35},{type:"exchange",tx:73,ty:37},
         {type:"garrison",tx:40,ty:40},{type:"garrison",tx:46,ty:40},{type:"garrison",tx:40,ty:46},{type:"garrison",tx:46,ty:46}]}},
   swarm:"off",daylight:"night"},
 objectives:[
   {id:"o_foci",kind:"primary",text:"Destroy the three Tithe Foci",when:null,done:["count","building","enemy","exchange","==",0],fail:["all",["time",">=",1446],["count","building","enemy","exchange",">=",1]]},
   {id:"o_garrison",kind:"primary",text:"Break the Axis garrison",when:null,done:["all",["count","building","enemy","garrison","==",0],["unitsNear","enemy","army",44,44,7,"==",0]],fail:null},
   {id:"o_hold",kind:"primary",text:"Hold Idris on the Axis for 60 s",when:null,done:["flag","holdDone"],fail:null},
   {id:"o_patience",kind:"primary",text:"Keep Patience alive",when:["flag","patience"],done:["all",["flag","holdDone"],["unitsNear","me","hauler",32,44,4,">=",1]],fail:["all",["flag","patience"],["unitsNear","me","hauler",32,44,4,"==",0]]},
   {id:"o_swift",kind:"bonus",text:"Break the three Foci by 16:00",when:null,done:["all",["time","<=",960],["count","building","enemy","exchange","==",0]],fail:["all",["time",">",960],["count","building","enemy","exchange",">=",1]]}
 ],
 triggers:[
   {id:"m09_t1",once:true,when:["time",">=",0.2],do:[["herolevel",4],["spawn","enemy","rifleman",6,[44,47],{order:"hold"}],["mood","dread"]]},
   {id:"m09_t2",once:true,when:["time",">=",20],do:[["radio","m09_r1"]]},
   {id:"m09_t3",once:true,when:["time",">=",180],do:[["spawn","enemy","rifleman",6,"edge:E",{order:"attack"}],["mood","battle"]]},
   {id:"m09_t4",once:true,when:["time",">=",240],do:[["ping",22,74,"bad"],["strike",22,74,6,300,5,null,"enemy"],["radio","m09_r2"]]},
   {id:"m09_t5",once:true,when:["time",">=",360],do:[["spawn","me","reaver",6,"base",{order:"idle"}],["radio","m09_r3"],["mood","tension"]]},
   {id:"m09_t6",once:true,when:["time",">=",480],do:[["ping",22,74,"bad"],["strike",22,74,6,300,5,null,"enemy"],["radio","m09_r14"]]},
   {id:"m09_t7",once:true,when:["time",">=",540],do:[["spawn","enemy","raptor",6,"edge:W",{order:"attack"}]]},
   {id:"m09_t8",once:true,when:["count","building","enemy","exchange","<=",2],do:[["radio","m09_r4"]]},
   {id:"m09_t9",once:true,when:["count","building","enemy","exchange","<=",0],do:[["radio","m09_r5"]]},
   {id:"m09_t10",once:true,when:["obj","o_garrison","done"],do:[["flag","patience",true],["spawn","me","hauler",1,[32,44],{order:"hold"}],["radio","m09_r6"],["mood","dread"]]},
   {id:"m09_t11",once:true,when:["after","patience",4],do:[["radio","m09_r7"]]},
   {id:"m09_t12",once:true,when:["after","patience",9],do:[["radio","m09_r8"]]},
   {id:"m09_t13",once:false,optional:true,when:["all",["flag","patience"],["heroNear",44,44,2]],do:[["flag","holdAt",true]]},
   {id:"m09_t14",once:false,when:["not",["heroNear",44,44,2]],do:[["flag","holdAt",false]]},
   {id:"m09_t15",once:true,optional:true,when:["flag","holdAt"],do:[["radio","m09_r9"],["radio","m09_r10"]]},
   {id:"m09_t16",once:true,optional:true,when:["after","holdAt",3],do:[["radio","m09_r11"]]},
   {id:"m09_t17",once:true,optional:true,when:["after","holdAt",15],do:[["spawn","enemy","raptor",5,[50,44],{order:"idle"}]]},
   {id:"m09_t18",once:true,optional:true,when:["after","holdAt",35],do:[["spawn","enemy","rifleman",6,[50,40],{order:"idle"}]]},
   {id:"m09_t19",once:true,optional:true,when:["after","holdAt",60],do:[["flag","holdDone",true],["flag","closing",true],["radio","m09_r12"],["strike",44,44,4,9999,3,null,"enemy"],["mood","dread"]]},
   {id:"m09_t20",once:true,optional:true,when:["time",">=",1380],do:[["radio","m09_r13"]]},
   {id:"m09_t21",once:true,optional:true,when:["all",["time",">=",1440],["count","building","enemy","exchange",">=",1]],do:[["strike",15,74,12,900,6,null,"enemy"]]},
   {id:"m09_t22",once:true,optional:true,when:["time",">=",720],do:[["spawn","enemy","reaver",5,"edge:E",{order:"attack"}],["radio","m09_r15"]]}
 ],
 win:["all",["flag","closing"],["hero","dead"]],
 lose:["hubs","me","==",0],
 noDefaultWin:true,
 stars:{par:1080},
 hints:[
   "The Foci stand at (39,51), (47,35) and (73,37). The four garrisons ring the Axis at its corners.",
   "The Tithe Pulse lands on the Stair at 4:00 and 8:00. Move units off (22,74) when the ping shows.",
   "Patience waits at (32,44), clear of the camp. Keep her within four tiles of that spot.",
   "Clear the three brutes and two spitters on the Axis before Idris holds (44,44) for a minute."
 ]}
);
