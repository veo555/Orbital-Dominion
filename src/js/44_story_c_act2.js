/* =========================================================================
   STORY (3c/n) - ACT II MISSIONS (owner: act2). M4 Ember Census, M5 Glass Market, M6 The Third Bell.
   Data only: no functions, no double quotes inside text (single quotes only).
   Contract: docs/CAMPAIGN_SPEC.md section 3; vocabulary src/js/43_vocab.js; design and voices docs/story/BIBLE.md sections 5, 8 and 9.
   Radio lines (m04_r* ... m06_r*) live in 44_story_d_radio_act2.js. Briefings, debriefs and interludes live in 44_story_b_act2.js.
   Coordinates are tiles on the fixed 88x88 Basin, checked with the engine's own canPlace / canStand on each mission's seed.
   Strikes always carry an explicit side as the 8th element ('me' = friendly support, never hits the player).
   ========================================================================= */
STORY.missions.push(
{id:"m04",act:2,n:4,title:"Ember Census",subtitle:"A levy at Tallow Landing.",place:"cinderrise",
 synopsis:"Day five on Cinder Rise. The Wake races the Council to Era III, the age the Tithe Foci need. The Reckoner calls the Habitat town at Tallow Landing a levy, and asks for it to be cleared.",
 briefing:"m04_brief",debrief:"m04_win",defeat:"defeat_a2",after:"i04",
 setup:{faction:"obsidian",enemy:"meridian",diff:"normal",seed:1104,
   start:{c:600,e:100,era:1,hero:"available",units:[],buildings:[],supplyBonus:0},
   restrict:{maxEra:3},
   foe:{ai:true,
     start:{c:500,e:0,era:1,buildings:[
       {type:"habitat",tx:7,ty:44},{type:"habitat",tx:6,ty:47},{type:"habitat",tx:9,ty:50},{type:"habitat",tx:6,ty:52},
       {type:"habitat",tx:10,ty:53},{type:"habitat",tx:9,ty:56},{type:"habitat",tx:13,ty:57},{type:"habitat",tx:16,ty:56}]},
     mods:{waveMult:0.5,intervalMult:1.5,firstWave:600,hero:false,air:false}},
   swarm:"off",daylight:"day"},
 objectives:[
   {id:"o_era",kind:"primary",text:"Reach Era III before the Council",when:null,done:["era","me",">=",3],fail:["era","enemy",">=",3]},
   {id:"o_burn",kind:"primary",text:"Burn the levy camp at Tallow Landing",when:null,done:["count","building","enemy","habitat","<=",3],fail:null},
   {id:"o_hold",kind:"primary",text:"Hold Cinder Rise",when:null,done:["all",["obj","o_era","done"],["obj","o_burn","done"]],fail:["hubs","me","<",1]},
   {id:"o_haul",kind:"bonus",text:"Lose no Hauler",when:null,done:["all",["obj","o_era","done"],["obj","o_burn","done"],["count","unit","me","hauler",">=",6]],fail:["count","unit","me","hauler","<",6]}
 ],
 triggers:[
   {id:"m04_t1",once:true,when:["time",">=",20],do:[["radio","m04_r1"],["ping",14,50,"bad"],["mood","tension"]]},
   {id:"m04_t2",once:true,when:["time",">=",90],do:[["radio","m04_r2"]]},
   {id:"m04_t3",once:true,when:["time",">=",300],do:[["spawn","enemy","rifleman",4,"edge:N",{order:"attack"}],["spawn","enemy","rocketeer",2,"edge:E",{order:"attack"}],["radio","m04_r3"],["mood","battle"]]},
   {id:"m04_t4",once:true,when:["time",">=",310],do:[["radio","m04_r4"]]},
   {id:"m04_t5",once:true,when:["time",">=",420],do:[["ping",27,46,"info"],["radio","m04_r5"]]},
   {id:"m04_t6",once:true,when:["time",">=",540],do:[["spawn","enemy","rifleman",4,"edge:N",{order:"attack"}],["spawn","enemy","rocketeer",2,"edge:N",{order:"attack"}],["spawn","enemy","juggernaut",1,"edge:E",{order:"attack"}],["spawn","enemy","rifleman",2,"edge:E",{order:"attack"}],["radio","m04_r6"],["mood","dread"]]},
   {id:"m04_t7",once:true,when:["era","me",">=",2],do:[["radio","m04_r7"]]},
   {id:"m04_t8",once:true,when:["era","enemy",">=",2],do:[["radio","m04_r8"]]},
   {id:"m04_t9",once:true,when:["count","building","enemy","habitat","<=",7],do:[["flag","tallowHit",true],["radio","m04_r9"]]},
   {id:"m04_t10",once:true,when:["after","tallowHit",7],do:[["radio","m04_r10"]]},
   {id:"m04_t11",once:true,when:["obj","o_burn","done"],do:[["radio","m04_r11"]]},
   {id:"m04_t12",once:true,when:["era","me",">=",3],do:[["radio","m04_r12"],["mood","tension"]]},
   {id:"m04_t13",once:true,optional:true,when:["era","enemy",">=",3],do:[["radio","m04_r13"]]},
   {id:"m04_t14",once:true,when:["all",["time",">=",780],["era","enemy","<",3]],do:[["spawn","enemy","rifleman",5,"edge:N",{order:"attack"}],["spawn","enemy","rocketeer",2,"edge:N",{order:"attack"}],["spawn","enemy","juggernaut",1,"edge:E",{order:"attack"}],["spawn","enemy","rifleman",3,"edge:E",{order:"attack"}],["radio","m04_r14"]]},
   {id:"m04_t15",once:true,optional:true,when:["count","unit","me","hauler","<",6],do:[["radio","m04_r15"]]}
 ],
 win:["all",["obj","o_era","done"],["obj","o_burn","done"]],
 lose:["hubs","me","==",0],
 noDefaultWin:true,
 stars:{par:900},
 unlocks:{next:"m05"},
 hints:[
   "Era II needs a finished Garrison. Era III needs an Armory, then 500 crystals and 300 ether.",
   "Ether comes from geysers under Siphons. Era III alone needs 300, so start the siphons early.",
   "Five of the eight Habitats at Tallow Landing are enough. The census counts three left standing.",
   "The Council's waves march from the north and east edges on Cinder Rise. Hold the ridge."
 ]},
{id:"m05",act:2,n:5,title:"Glass Market",subtitle:"Do not break the Veil.",place:"glassmarket",
 synopsis:"Night six. Lyra and six Specters creep through the Wake's census camp in the old Glass Market to copy the Tithe Roll, and find a warning she sold herself.",
 briefing:"m05_brief",debrief:"m05_win",defeat:"defeat_a1",after:"i05",
 setup:{faction:"aurora",enemy:"obsidian",diff:"normal",seed:1105,
   start:{c:0,e:0,era:1,hero:"start",units:[{type:"specter",n:6}],buildings:[],supplyBonus:12},
   restrict:{buildings:["hub","generator","depot","siphon","habitat","garrison","armory","forum","exchange","foundry","airfield","turret"],
     units:["hauler","rifleman","raptor","rocketeer","mender","howitzer","juggernaut","skiff","titan","freighter","bulwark","reaver","specter","crawler","spitter","brute"],
     maxEra:1},
   foe:{ai:false,
     start:{c:0,e:0,era:1,buildings:[
       {type:"garrison",tx:27,ty:9},{type:"depot",tx:31,ty:9},
       {type:"habitat",tx:26,ty:13},{type:"habitat",tx:30,ty:13},{type:"habitat",tx:33,ty:12}]}},
   swarm:"off",daylight:"night"},
 objectives:[
   {id:"o_copy",kind:"primary",text:"Copy the Roll at the Census Hall",when:null,done:["after","atMarket",30],fail:null},
   {id:"o_archive",kind:"hidden",text:"Find the Syndicate archive",when:null,done:["unitsNear","me","hero_lyra",28,18,2,">=",1],fail:null},
   {id:"o_extract",kind:"primary",text:"Extract Lyra to Wick Post",when:["obj","o_copy","done"],done:["all",["obj","o_copy","done"],["unitsNear","me","hero_lyra",13,34,3,">=",1]],fail:null},
   {id:"o_quiet",kind:"bonus",text:"Raise no alarm",when:null,done:["all",["obj","o_copy","done"],["obj","o_extract","done"],["not",["flag","alarm"]]],fail:["flag","alarm"]}
 ],
 triggers:[
   {id:"m05_t1",once:true,when:["time",">=",0.2],do:[["herolevel",3],["spawn","enemy","rifleman",4,[22,17],{order:"hold"}],["spawn","enemy","rocketeer",2,[22,17],{order:"hold"}],["spawn","enemy","rifleman",2,[20,17],{order:"hold"}],["spawn","enemy","rifleman",2,[28,18],{order:"hold"}],["spawn","enemy","rifleman",2,[16,46],{order:"hold"}],["mood","dread"]]},
   {id:"m05_t2",once:true,when:["time",">=",20],do:[["radio","m05_r1"]]},
   {id:"m05_t3",once:true,when:["any",["time",">=",180],["unitsNear","me","hero_lyra",24,15,20,">=",1]],do:[["radio","m05_r2"]]},
   {id:"m05_t4",once:true,when:["unitsNear","me","hero_lyra",24,15,14,">=",1],do:[["radio","m05_r3"]]},
   {id:"m05_t5",once:false,when:["unitsNear","me","hero_lyra",24,15,3,">=",1],do:[["flag","atMarket",true]]},
   {id:"m05_t6",once:false,when:["not",["unitsNear","me","hero_lyra",24,15,3,">=",1]],do:[["flag","atMarket",false]]},
   {id:"m05_t7",once:true,when:["after","atMarket",8],do:[["radio","m05_r5"]]},
   {id:"m05_t8",once:true,when:["after","atMarket",18],do:[["radio","m05_r6"]]},
   {id:"m05_t9",once:true,when:["obj","o_archive","done"],do:[["radio","m05_r4"]]},
   {id:"m05_t10",once:true,when:["all",["time",">=",60],["unitsNear","enemy","*",24,15,9,"==",0]],do:[["radio","m05_r11"]]},
   {id:"m05_t11",once:true,when:["all",["unitsNear","me","hero_lyra",14,50,4,">=",1],["unitsNear","enemy","*",14,50,8,">=",1]],do:[["flag","alarm",true],["spawn","enemy","raptor",6,[14,50],{order:"hold"}]]},
   {id:"m05_t12",once:true,when:["all",["unitsNear","me","hero_lyra",20,17,4,">=",1],["unitsNear","enemy","*",20,17,8,">=",1]],do:[["flag","alarm",true],["spawn","enemy","raptor",6,[20,17],{order:"hold"}]]},
   {id:"m05_t13",once:true,when:["all",["unitsNear","me","hero_lyra",24,15,4,">=",1],["unitsNear","enemy","*",24,15,8,">=",1]],do:[["flag","alarm",true],["spawn","enemy","raptor",6,[24,15],{order:"hold"}]]},
   {id:"m05_t14",once:true,when:["flag","alarm"],do:[["radio","m05_r7"],["radio","m05_r8"]]},
   {id:"m05_t15",once:true,when:["obj","o_extract","done"],do:[["flag","extracted",true],["radio","m05_r9"],["radio","m05_r10"]]},
   {id:"m05_t16",once:true,when:["time",">=",50],do:[["radio","m05_r12"]]}
 ],
 win:["all",["flag","extracted"],["obj","o_copy","done"]],
 lose:["hero","dead"],
 noDefaultWin:true,
 noDefaultLose:true,
 stars:{par:900},
 unlocks:{next:"m06"},
 hints:[
   "Learn Phase Veil on Lyra's panel. It cloaks her for 8 to 12 seconds and breaks when she attacks.",
   "Specters are cloaked, so the pickets never see them. Kill the pickets quietly, group by group.",
   "A tripwire is live only while a picket within eight tiles still stands. Clear the pickets first.",
   "Thirty seconds within three tiles of the Glass Market post copies the Roll. Do not leave the circle."
 ]},
{id:"m06",act:2,n:6,title:"The Third Bell",subtitle:"Class Nine will hold the ring.",place:"axis",
 synopsis:"Night seven at the Axis. Bells fall on Meridian's posts for the Reckoner. The third is aimed at the ring where the Host and the Deferred's wagons are standing.",
 briefing:"m06_brief",debrief:"m06_win",defeat:"defeat_a2",after:"i06",
 setup:{faction:"obsidian",enemy:"meridian",diff:"normal",seed:1106,
   start:{c:1000,e:300,era:2,hero:"start",units:[],buildings:[],supplyBonus:40},
   restrict:{maxEra:3},
   foe:{ai:true,
     start:{c:600,e:200,era:2,buildings:[
       {type:"hub",tx:38,ty:50},{type:"hub",tx:46,ty:34},
       {type:"turret",tx:49,ty:43},{type:"turret",tx:43,ty:38},{type:"turret",tx:43,ty:49}]},
     mods:{waveMult:0.5,intervalMult:1.5,firstWave:99999,hero:true,air:false}},
   swarm:"off",daylight:"night"},
 objectives:[
   {id:"o_hold",kind:"primary",text:"Hold the Axis against Meridian",when:null,done:["all",["time",">=",660],["unitsNear","me","army",44,44,10,">=",1]],fail:["all",["time",">=",660],["unitsNear","me","army",44,44,10,"==",0]]},
   {id:"o_pull",kind:"primary",text:"Pull the Host out of the ring",when:null,done:["all",["time",">=",720],["unitsNear","me","army",44,44,14,"==",0]],fail:["all",["time",">=",725],["unitsNear","me","army",44,44,14,">=",1]]},
   {id:"o_kaz",kind:"primary",text:"Keep Kaz alive",when:null,done:["all",["flag","bellFell"],["hero","alive"]],fail:["hero","dead"]},
   {id:"o_wagons",kind:"bonus",text:"Evacuate Crake's wagons",when:null,done:["all",["time",">=",720],["unitsNear","me","hauler",44,44,14,"==",0],["count","unit","me","hauler",">=",9]],fail:["all",["time",">=",515],["count","unit","me","hauler","<",9]]}
 ],
 triggers:[
   {id:"m06_t1",once:true,when:["time",">=",0.2],do:[["spawn","me","reaver",8,[41,47],{order:"hold"}],["spawn","me","raptor",4,[41,47],{order:"hold"}],["spawn","me","rocketeer",4,[41,47],{order:"hold"}],["spawn","me","howitzer",2,[41,47],{order:"hold"}],["spawn","enemy","rifleman",3,[34,41],{order:"hold"}],["mood","tension"]]},
   {id:"m06_t2",once:true,when:["time",">=",20],do:[["radio","m06_r1"]]},
   {id:"m06_t3",once:true,when:["time",">=",40],do:[["radio","m06_r12"]]},
   {id:"m06_t4",once:true,when:["time",">=",240],do:[["ping",40,52,"bad"],["strike",40,52,10,900,4,null,"me"],["radio","m06_r2"],["mood","battle"]]},
   {id:"m06_t5",once:true,when:["time",">=",300],do:[["radio","m06_r3"]]},
   {id:"m06_t6",once:true,when:["time",">=",480],do:[["ping",48,36,"bad"],["strike",48,36,10,900,4,null,"me"],["radio","m06_r4"]]},
   {id:"m06_t7",once:true,when:["time",">=",510],do:[["spawn","me","hauler",3,[44,47],{order:"hold"}],["radio","m06_r5"],["mood","dread"]]},
   {id:"m06_t8",once:true,when:["time",">=",660],do:[["ping",44,44,"bad"],["radio","m06_r6"]]},
   {id:"m06_t9",once:true,when:["time",">=",680],do:[["radio","m06_r7"]]},
   {id:"m06_t10",once:true,when:["time",">=",684],do:[["radio","m06_r8"]]},
   {id:"m06_t11",once:true,when:["time",">=",700],do:[["radio","m06_r9"]]},
   {id:"m06_t12",once:true,when:["time",">=",703],do:[["radio","m06_r10"]]},
   {id:"m06_t13",once:true,when:["time",">=",720],do:[["strike",44,44,14,900,5,null,"enemy"]]},
   {id:"m06_t14",once:true,when:["time",">=",725],do:[["radio","m06_r11"]]},
   {id:"m06_t15",once:true,when:["time",">=",726],do:[["flag","bellFell",true],["mood","victory"]]}
 ],
 win:["all",["flag","bellFell"],["hero","alive"]],
 lose:["hero","dead"],
 noDefaultWin:true,
 stars:{par:900},
 unlocks:{next:"m07"},
 hints:[
   "Four turrets and some riflemen guard the Axis. Clear them with the Host, then hold the ring.",
   "The Third Bell lands at 12:05 on your units inside 14 tiles of the Axis. It spares Meridian.",
   "Pull the Host out before the Bell lands. Crake's wagons are Haulers: bring them out too."
 ]}
);
