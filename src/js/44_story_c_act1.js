/* =========================================================================
   STORY (3/n) - ACT I MISSIONS (owner: act1). M1 Lamp Night, M2 The Waking Fund, M3 The Axis.
   Data only: no functions, no double quotes inside text (single quotes only).
   Contract: docs/CAMPAIGN_SPEC.md section 3; vocabulary src/js/43_vocab.js; design and voices docs/story/BIBLE.md section 8.
   Radio lines (m01_r1 ... m03_r12) live in 44_story_d_radio_act1.js. Briefings, debriefs and interludes live in 44_story_b_act1.js.
   Coordinates are tiles on the fixed 88x88 Basin. Strikes carry an explicit side ('me' = friendly support, never hits the player).
   ========================================================================= */
STORY.missions.push(
{id:"m01",act:1,n:1,title:"Lamp Night",subtitle:"Hold the lamps.",place:"brasswatch",
 synopsis:"Night one on Brasswatch Heights. The Wake climbs the Ashen Stair under banners that read 9000, and the Marshal's answer is the Key.",
 briefing:"m01_brief",debrief:"m01_win",defeat:"defeat_a1",after:"i01",
 setup:{faction:"meridian",enemy:"obsidian",diff:"normal",seed:1101,
   start:{c:400,e:100,era:1,hero:"none",units:[],buildings:[],supplyBonus:0},
   restrict:{buildings:["forum","exchange","foundry","airfield"],units:["titan"],maxEra:1},
   foe:{ai:true,mods:{waveMult:0.5,intervalMult:1.5,firstWave:150,hero:false,air:false}},
   swarm:"off",daylight:"night"},
 objectives:[
   {id:"o_hold",kind:"primary",text:"Hold Brasswatch Heights until dawn",when:null,done:["time",">=",720],fail:null},
   {id:"o_hub",kind:"primary",text:"Keep the Command Hub standing",when:null,done:["all",["time",">=",720],["hubs","me",">=",1]],fail:["hubs","me","==",0]},
   {id:"o_haul",kind:"bonus",text:"Keep five Haulers alive",when:null,done:["all",["time",">=",720],["count","unit","me","hauler",">=",5]],fail:["count","unit","me","hauler","<",5]},
   {id:"o_raid",kind:"bonus",text:"Break the Reaver raid on the Stair",when:["flag","raid"],done:["all",["flag","raid"],["time",">=",330],["unitsNear","enemy","reaver",22,74,14,"==",0]],fail:null}
 ],
 triggers:[
   {id:"m01_t1",once:true,when:["time",">=",10],do:[["radio","m01_r1"],["mood","tension"]]},
   {id:"m01_t2",once:true,when:["time",">=",40],do:[["radio","m01_r2"]]},
   {id:"m01_t3",once:true,when:["time",">=",60],do:[["spawn","me","hauler",3,"edge:S"],["give","c",150],["radio","m01_r3"]]},
   {id:"m01_t4",once:true,when:["time",">=",150],do:[["spawn","enemy","raptor",5,"edge:E",{order:"attack"}],["radio","m01_r4"],["mood","battle"]]},
   {id:"m01_t5",once:true,when:["time",">=",240],do:[["unlock","unit","hero_idris"],["herolevel",4],["radio","m01_r5"]]},
   {id:"m01_t6",once:true,when:["time",">=",300],do:[["flag","raid",true],["spawn","enemy","reaver",8,[30,72],{order:"attack"}],["radio","m01_r6"],["mood","dread"]]},
   {id:"m01_t7",once:true,when:["all",["flag","raid"],["time",">=",390]],do:[["radio","m01_r7"]]},
   {id:"m01_t8",once:true,when:["time",">=",505],do:[["ping",22,74,"info"]]},
   {id:"m01_t9",once:true,when:["time",">=",507],do:[["radio","m01_r8"]]},
   {id:"m01_t10",once:true,when:["time",">=",510],do:[["strike",22,74,8,240,3,null,"me"],["radio","m01_r9"]]},
   {id:"m01_t11",once:true,when:["time",">=",513],do:[["radio","m01_r10"]]},
   {id:"m01_t12",once:true,when:["time",">=",520],do:[["radio","m01_r11"]]},
   {id:"m01_t13",once:true,when:["time",">=",600],do:[["radio","m01_r12"]]},
   {id:"m01_t14",once:true,when:["time",">=",660],do:[["radio","m01_r13"]]},
   {id:"m01_t15",once:true,when:["time",">=",719],do:[["radio","m01_r14"],["mood","victory"]]}
 ],
 win:["all",["time",">=",720],["hubs","me",">=",1]],
 lose:["hubs","me","==",0],
 noDefaultWin:true,
 stars:{par:780},
 unlocks:{next:"m02"},
 hints:[
   "A Garrison trains Riflemen and Raptors. Turrets need a Garrison first.",
   "Ether comes from geyser patches, under an Ether Siphon.",
   "Idris can be trained at the Hub from 4:00 (250 crystals, 100 ether).",
   "The Lantern's Strike at 8:30 never harms your own units or buildings."
 ]},
{id:"m02",act:1,n:2,title:"The Waking Fund",subtitle:"Everything has a price.",place:"kestrelpost",
 synopsis:"Days two and three. Lyra needs crystals mined, routes opened and a Corps embargo broken, and the price of each is posted in teal chalk.",
 briefing:"m02_brief",debrief:"m02_win",defeat:"defeat_a1",after:"i02",
 setup:{faction:"aurora",enemy:"meridian",diff:"normal",seed:1102,
   start:{c:300,e:0,era:1,hero:"available",units:[],buildings:[],supplyBonus:0},
   restrict:{maxEra:1},
   foe:{ai:true,mods:{waveMult:0.3,intervalMult:1,firstWave:600,hero:true,air:false}},
   swarm:"on",daylight:"cycle"},
 objectives:[
   {id:"o_mine",kind:"primary",text:"Mine 3,000 crystals",when:null,done:["mined","c",">=",3000],fail:null},
   {id:"o_trade",kind:"primary",text:"Earn 1,200 crystals by trade",when:null,done:["trade",">=",1200],fail:null},
   {id:"o_hubs",kind:"primary",text:"Build two more Command Hubs",when:null,done:["hubs","me",">=",3],fail:null},
   {id:"o_lost",kind:"bonus",text:"Lose fewer than ten units or structures",when:null,done:["all",["obj","o_mine","done"],["obj","o_trade","done"],["obj","o_hubs","done"],["lost","me","<",10]],fail:["lost","me",">=",10]}
 ],
 triggers:[
   {id:"m02_t1",once:true,when:["time",">=",30],do:[["radio","m02_r1"]]},
   {id:"m02_t2",once:true,when:["time",">=",120],do:[["radio","m02_r2"]]},
   {id:"m02_t3",once:true,when:["time",">=",180],do:[["spawn","me","hauler",2,"edge:S"],["give","c",200],["radio","m02_r3"]]},
   {id:"m02_t4",once:true,when:["mined","c",">=",1500],do:[["unlock","era",2],["radio","m02_r4"]]},
   {id:"m02_t5",once:true,when:["time",">=",360],do:[["flag","embargo",true],["spawn","enemy","rifleman",4,"edge:N",{order:"attack"}],["radio","m02_r5"],["mood","tension"]]},
   {id:"m02_t6",once:true,when:["all",["flag","embargo"],["time",">=",364]],do:[["radio","m02_r6"]]},
   {id:"m02_t7",once:true,when:["time",">=",540],do:[["radio","m02_r7"]]},
   {id:"m02_t8",once:true,when:["time",">=",544],do:[["radio","m02_r8"]]},
   {id:"m02_t9",once:true,when:["trade",">=",600],do:[["radio","m02_r9"]]},
   {id:"m02_t10",once:true,when:["time",">=",660],do:[["spawn","enemy","rocketeer",2,"edge:E",{order:"attack"}],["radio","m02_r10"]]},
   {id:"m02_t11",once:true,when:["trade",">=",1200],do:[["flag","routes",true],["aimod",{intervalMult:20,firstWave:99999}],["radio","m02_r11"]]},
   {id:"m02_t12",once:true,when:["after","routes",3],do:[["radio","m02_r12"]]},
   {id:"m02_t13",once:true,when:["time",">=",270],do:[["radio","m02_r13"]]},
   {id:"m02_t14",once:true,when:["time",">=",450],do:[["radio","m02_r14"]]}
 ],
 win:["all",["obj","o_mine","done"],["obj","o_trade","done"],["obj","o_hubs","done"]],
 lose:["time",">=",99999],
 noDefaultWin:true,
 stars:{par:1200},
 unlocks:{next:"m03"},
 hints:[
   "Freighters earn only when they reach a post. Clear the camps on their lane first.",
   "Era II costs 300 crystals and 100 ether. The Exchange needs it, then Freighters.",
   "Command Hubs at Expansion #2 (30,72) and #4 (14,50) count toward the Hub objective."
 ]},
{id:"m03",act:1,n:3,title:"The Axis",subtitle:"Nobody signs a door.",place:"axis",
 synopsis:"Day four. Brio's beacons lead the Marshal through five creep camps to the Axis, where a Founders' text is read aloud and a trusted adjutant chooses a side.",
 briefing:"m03_brief",debrief:"m03_win",defeat:"defeat_a1",after:"i03",
 setup:{faction:"meridian",enemy:"obsidian",diff:"normal",seed:1103,
   start:{c:500,e:0,era:1,hero:"start",units:[{type:"rifleman",n:6},{type:"rocketeer",n:3},{type:"mender",n:1},{type:"howitzer",n:2}],buildings:[{type:"hub",tx:28,ty:70}],supplyBonus:10},
   foe:{ai:true,mods:{waveMult:0.05,intervalMult:20,firstWave:99999,hero:false}},
   swarm:"off",daylight:"day"},
 objectives:[
   {id:"o_camps",kind:"primary",text:"Clear five creep camps",when:null,done:["camps",">=",5],fail:null},
   {id:"o_hold",kind:"primary",text:"Hold the Axis for two minutes",when:["flag","axisOpen"],done:["all",["after","ambush",120],["count","unit","me","army",">=",1]],fail:null},
   {id:"o_hero",kind:"bonus",text:"Keep Idris alive",when:null,done:["all",["obj","o_hold","done"],["hero","alive"]],fail:["hero","dead"]},
   {id:"o_lost",kind:"bonus",text:"Lose no more than six units or structures",when:null,done:["all",["obj","o_hold","done"],["lost","me","<=",6]],fail:["lost","me",">=",7]}
 ],
 triggers:[
   {id:"m03_t0",once:true,when:["time",">=",1],do:[["herolevel",5]]},
   {id:"m03_t1",once:true,when:["time",">=",20],do:[["ping",30,38,"info"],["radio","m03_r1"]]},
   {id:"m03_t2",once:true,when:["camps",">=",1],do:[["reveal",41,30,16],["radio","m03_r2"]]},
   {id:"m03_t3",once:true,when:["camps",">=",2],do:[["reveal",30,22,16],["radio","m03_r3"]]},
   {id:"m03_t4",once:true,when:["camps",">=",3],do:[["reveal",22,43,16],["spawn","me","rifleman",6,[33,71]],["radio","m03_r4"]]},
   {id:"m03_t5",once:true,when:["camps",">=",4],do:[["reveal",44,44,12],["radio","m03_r5"],["mood","dread"]]},
   {id:"m03_t6",once:true,when:["camps",">=",5],do:[["flag","axisOpen",true],["radio","m03_r6"]]},
   {id:"m03_t7",once:true,when:["after","axisOpen",3],do:[["radio","m03_r7"]]},
   {id:"m03_t8",once:true,when:["after","axisOpen",8],do:[["radio","m03_r8"]]},
   {id:"m03_t9",once:true,when:["after","axisOpen",12],do:[["radio","m03_r9"]]},
   {id:"m03_t10",once:true,when:["after","axisOpen",24],do:[["flag","ambush",true],["spawn","enemy","reaver",8,"edge:N",{order:"attack"}],["spawn","enemy","raptor",8,"edge:E",{order:"attack"}],["aimod",{waveMult:2,intervalMult:0.6,firstWave:1,hero:true}],["mood","battle"],["radio","m03_r10"]]},
   {id:"m03_t11",once:true,when:["after","ambush",90],do:[["radio","m03_r11"]]},
   {id:"m03_t12",once:true,when:["after","ambush",110],do:[["radio","m03_r12"]]}
 ],
 win:["all",["after","ambush",120],["count","unit","me","army",">=",1]],
 lose:["time",">=",99999],
 noDefaultWin:true,
 stars:{par:900},
 unlocks:{next:"m04"},
 hints:[
   "Each cleared camp reveals the next on the map. The Axis camp is the strongest: leave it for last.",
   "Ancient Brutes hit hard in the ring. Keep the howitzers behind the riflemen.",
   "Idris holds the Axis only while one of your units stands within eight tiles of it."
 ]}
);
