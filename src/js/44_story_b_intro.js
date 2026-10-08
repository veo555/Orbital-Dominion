/* =========================================================================
   STORY (2/n, intro owner) - THE LANTERN TITHE. Cinematics: intro, credits, defeat_a1..a3.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions, no imports. Contract: docs/CINEMATIC_SPEC.md, src/js/43_vocab.js.
   Voice guides and chronology: docs/story/BIBLE.md (sections 2, 4, 6, 9, 10).
   Production notes (for whoever tunes this file):
   - Narrator lines (who:'narrator') are Ione, unnamed. The `ione` actor appears only in the credits, on her own last line.
   - Ostrander: silhouette with NO ring in Year 9; a thin gold `holo` ring PROP behind her head on every Year 31 hologram / shadow (never a look mark).
     Her scenes use a locked camera because props parallax at 1.15 and actors at 0.35; the ring sits at head height = actor y - 0.12 * h.
   - Crate 9-17 plant: a Hauler crosses the Year 9 doorway under a brass wheel (a small brass `station` prop). Nobody mentions it.
   - The worker whistle is two `chime` sfx (CINE_SFX has no pitch control); the lower second note is a request for the audio engine.
   - Music: the `intro` cue is sectioned (A planet-rise, B colony theme, C villain reveal, D war, E title hit) and runs the whole film. Only stings
     are layered per scene (`sting_reveal` when the dark arrives, `sting_evil` on 'Nine thousand.'); stings never replace the running cue.
   - Warm light = a lamp lit for the absent; green light = a Cradle that is alive (first seen in Year 0, last seen on Ione's 'Here.').
   ========================================================================= */
Object.assign(STORY.cine,{

/* ============================================================================================================================
   INTRO  (about 84 s)  Question: who pays for the light?  Turn: Year 9, someone signed for the dark.  Button: 'Nine thousand.' / title hit.
   ============================================================================================================================ */
intro:{
  id:"intro",kind:"intro",title:"The Lantern Tithe",music:"intro",letterbox:true,seed:31,
  scenes:[

    /* 1. A lamp flame in the void resolves into the violet Lantern. (0-7.5) */
    {id:"lamp",dur:7.5,
      bg:{k:"void",tint:"#0b0716",glow:.2},
      cam:{from:{x:.5,y:.53,z:1.8,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"inout"},
      props:[
        {k:"beacon",at:[.5,.54],scale:.2,col:"#ffb35c",t0:.2,t1:4.7},
        {k:"station",at:[.5,.52],scale:.75,col:"#b79cff",t0:4.3,t1:7.5}
      ],
      fx:[
        {k:"stars",t0:0,t1:7.5,a:.7},
        {k:"pulse",t0:.3,t1:4.6,x:.5,y:.54,col:"#ffb35c",a:.5,r:.6},
        {k:"flare",t0:4.0,t1:5.6,x:.5,y:.52,col:"#d6c4ff",a:.8},
        {k:"pulse",t0:4.8,t1:7.5,x:.5,y:.52,col:"#a98bff",a:.45}
      ],
      lines:[{who:"narrator",text:"Every lamp on Orison is lit for someone who isn't here.",t:1.3,dur:3.6,style:"narration"}],
      sfx:[{t:.2,name:"rumble"},{t:4.3,name:"chime"}],
      trans:{in:"fade",out:"fade",len:.6}},

    /* 2a. Year 0. Three arks arrive over the ringed planet. (7.5-14) */
    {id:"arks",dur:6.6,
      bg:{k:"planet",planet:"violet",rings:true,phase:.55,size:1.2,moons:1,atmosphere:true,nebula:"violet"},
      cam:{from:{x:.42,y:.5,z:1.0,r:0},to:{x:.55,y:.52,z:1.15,r:.02},ease:"inout"},
      props:[
        {k:"ship",cls:"carrier",faction:"meridian",from:[-.2,.22],to:[.26,.28],scale:1.0,t0:.5,t1:6.0,ease:"out"},
        {k:"ship",cls:"carrier",faction:"aurora",from:[-.3,.5],to:[.2,.5],scale:.9,t0:1.0,t1:6.3,ease:"out"},
        {k:"ship",cls:"carrier",faction:"aurora",col:"#b79cff",from:[-.4,.74],to:[.3,.72],scale:1.15,t0:1.5,t1:6.6,ease:"out"}
      ],
      fx:[{k:"stars",t0:0,t1:6.6,a:.6},{k:"comets",t0:1.0,t1:6.0,a:.35}],
      title:{text:"YEAR 0",t0:.5,t1:3.1},
      lines:[{who:"narrator",text:"Forty thousand came. The soil would feed thirty-one.",t:3.2,dur:3.4,style:"narration"}],
      sfx:[{t:.6,name:"whoosh"},{t:1.1,name:"whoosh"},{t:1.6,name:"whoosh"}],
      trans:{in:"fade",out:"cut",len:.5}},

    /* 2b. Two arks go down; the third stays in orbit with the sleepers. (14-18.8) */
    {id:"lots",dur:4.8,
      bg:{k:"orbit",planet:"violet",limb:"bottom",station:true,ships:1,glow:.6},
      cam:{from:{x:.4,y:.5,z:1.0,r:0},to:{x:.6,y:.46,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"ship",cls:"dropship",faction:"meridian",from:[.3,.3],to:[.38,.88],scale:.45,rot:1.2,t0:.3,t1:4.4,ease:"in"},
        {k:"ship",cls:"dropship",faction:"aurora",from:[.5,.28],to:[.58,.92],scale:.4,rot:1.3,t0:.9,t1:4.8,ease:"in"}
      ],
      fx:[{k:"stars",t0:0,t1:4.8,a:.5}],
      lines:[{who:"narrator",text:"They drew lots for the winter.",t:.7,dur:2.2,style:"narration"}],
      sfx:[{t:.4,name:"engine"},{t:3.2,name:"chime"}],
      trans:{in:"cut",out:"cut"}},

    /* 3. Year 0 still. Mags, thirty, a silhouette at the glass, whistles the worker motif; Anselm walks to his Cradle. (18.8-29.3) */
    {id:"glass",dur:10.5,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.5,y:.52,z:1.0,r:0},to:{x:.56,y:.5,z:1.2,r:0},ease:"inout"},
      actors:[
        {id:"mags",char:"mags",at:[.27,.66],h:.88,face:"r",expr:"neutral",mode:"silhouette",t0:.2,t1:10.5},
        {id:"anselm",char:"anselm",at:[.9,.64],h:.8,face:"l",expr:"smile",mode:"bust",t0:.6,t1:7.4,move:{to:[.72,.64],ease:"inout"}}
      ],
      fx:[
        {k:"stars",t0:0,t1:10.5,a:.35},
        {k:"dust",t0:0,t1:10.5,a:.3,col:"#bda8ff"},
        {k:"pulse",t0:7.9,t1:10.5,x:.64,y:.74,col:"#6dff9b",a:.55,r:.5}
      ],
      lines:[
        {who:"anselm",text:"One winter.",t:3.2,dur:1.5,style:"normal",expr:"smile"},
        {who:"mags",text:"I'll count the days.",t:5.3,dur:1.9,style:"normal"}
      ],
      sfx:[{t:1.2,name:"chime"},{t:1.7,name:"chime"},{t:7.3,name:"door"},{t:7.9,name:"click"}],
      trans:{in:"cut",out:"fade",len:.7}},

    /* 4a. Year 9. Cold hall, locked camera. A woman's silhouette, no ring, signs a hologram. A Hauler crosses the far doorway under a brass wheel (crate 9-17), unremarked. (29.3-35.8) */
    {id:"hall9",dur:6.5,
      bg:{k:"hall",style:"meridian",light:"cold"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"lin"},
      actors:[{id:"signer",char:"ostrander",at:[.3,.66],h:.86,face:"r",expr:"neutral",mode:"silhouette",t0:2.2,t1:6.5}],
      props:[
        {k:"holo",shape:"sigil",at:[.47,.52],scale:.85,col:"#9fd6ff",t0:2.6,t1:6.5},
        {k:"unit",type:"hauler",faction:"meridian",from:[.64,.7],to:[.9,.7],scale:.5,t0:3.2,t1:6.3,ease:"lin"},
        {k:"station",from:[.64,.63],to:[.9,.63],scale:.26,col:"#c9953a",t0:3.2,t1:6.3,ease:"lin"}
      ],
      fx:[
        {k:"dust",t0:0,t1:6.5,a:.3},
        {k:"pulse",t0:4.4,t1:5.8,x:.47,y:.52,col:"#9fd6ff",a:.5,r:.4}
      ],
      title:{text:"YEAR 9",t0:.4,t1:2.4},
      sfx:[{t:.2,name:"wind"},{t:2.3,name:"door"},{t:3.4,name:"engine"},{t:4.4,name:"click"}],
      trans:{in:"fade",out:"cut",len:.7}},

    /* 4b. The array breaks; the Cradle lights go out one by one. (35.8-41.8) */
    {id:"dark",dur:6.0,
      bg:{k:"array",state:"broken",planet:"violet"},
      cam:{from:{x:.52,y:.5,z:1.2,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"out"},
      music:{cue:"sting_reveal"},
      fx:[
        {k:"stars",t0:0,t1:6.0,a:.3},
        {k:"glitch",t0:0,t1:.5,a:.7},
        {k:"sparks",t0:.1,t1:1.4,x:.55,y:.55,col:"#9fd6ff",a:.6},
        {k:"vignette",t0:.8,t1:6.0,a:.7}
      ],
      lines:[{who:"narrator",text:"In the ninth year, someone signed for the dark.",t:2.3,dur:3.1,style:"narration"}],
      sfx:[{t:.1,name:"glitch"},{t:.9,name:"powerdown"},{t:1.7,name:"powerdown"},{t:2.5,name:"powerdown"}],
      trans:{in:"cut",out:"fade",len:.7}},

    /* 5a. Year 31, Lamp Night. The city lights its lamps one by one. (41.8-44.6) */
    {id:"lampnight",dur:2.8,
      bg:{k:"base",faction:"meridian",time:"dusk",state:"calm"},
      cam:{from:{x:.5,y:.62,z:1.4,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"out"},
      props:[
        {k:"beacon",at:[.14,.6],scale:.14,col:"#ffb35c",t0:.2,t1:2.8},
        {k:"beacon",at:[.26,.57],scale:.14,col:"#ffb35c",t0:.45,t1:2.8},
        {k:"beacon",at:[.37,.62],scale:.14,col:"#ffb35c",t0:.7,t1:2.8},
        {k:"beacon",at:[.5,.58],scale:.14,col:"#ffb35c",t0:.95,t1:2.8},
        {k:"beacon",at:[.63,.62],scale:.14,col:"#ffb35c",t0:1.2,t1:2.8},
        {k:"beacon",at:[.74,.57],scale:.14,col:"#ffb35c",t0:1.45,t1:2.8},
        {k:"beacon",at:[.86,.6],scale:.14,col:"#ffb35c",t0:1.7,t1:2.8}
      ],
      fx:[{k:"dust",t0:0,t1:2.8,a:.3},{k:"embers",t0:0,t1:2.8,a:.25,col:"#ffb35c"}],
      title:{text:"YEAR 31",sub:"Lamp Night",t0:.3,t1:2.7},
      sfx:[{t:.2,name:"gong"}],
      trans:{in:"fade",out:"cut",len:.6}},

    /* 5b. Idris, Marr at his shoulder (red trim on the blue coat). Nine thousand lamps; one more winter. (44.6-51.5) */
    {id:"marshal",dur:6.9,
      bg:{k:"base",faction:"meridian",time:"dusk",state:"calm"},
      cam:{from:{x:.4,y:.5,z:1.05,r:0},to:{x:.46,y:.5,z:1.18,r:0},ease:"inout"},
      actors:[
        {id:"marr",char:"marr",at:[.17,.68],h:.74,face:"r",expr:"neutral",mode:"bust",t0:.2,t1:6.9},
        {id:"idris",char:"idris",at:[.37,.66],h:.86,face:"r",expr:"weary",mode:"bust",t0:.2,t1:6.9}
      ],
      props:[
        {k:"beacon",at:[.62,.6],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.72,.56],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.82,.62],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.9,.57],scale:.14,col:"#ffb35c"},
        {k:"unit",type:"rifleman",faction:"meridian",at:[.7,.84],scale:.45},
        {k:"unit",type:"hauler",faction:"meridian",from:[1.05,.88],to:[.6,.88],scale:.6,t0:.5,t1:6.6,ease:"lin"}
      ],
      fx:[{k:"dust",t0:0,t1:6.9,a:.3},{k:"flare",t0:1.2,t1:2.2,x:.7,y:.58,col:"#ffd9a0",a:.5}],
      lines:[
        {who:"marr",text:"Nine thousand lamps lit and logged, Marshal.",t:.9,dur:2.9,style:"normal",expr:"neutral"},
        {who:"idris",text:"Noted. One more winter.",t:4.3,dur:1.7,style:"normal",expr:"weary"}
      ],
      sfx:[{t:.3,name:"wind"},{t:1.0,name:"engine"}],
      trans:{in:"cut",out:"cut"}},

    /* 5c. Intercut: Lyra at the Glass Market in teal light, counting coins. (51.5-54.5) */
    {id:"coins",dur:3.0,
      bg:{k:"hall",style:"aurora",light:"cold"},
      cam:{from:{x:.55,y:.52,z:1.1,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"inout"},
      actors:[{id:"lyra",char:"lyra",at:[.66,.68],h:.88,face:"l",expr:"weary",mode:"bust",t0:.1,t1:3.0}],
      props:[
        {k:"crystal",at:[.38,.84],scale:.2,col:"#f6c04a"},
        {k:"crystal",at:[.46,.86],scale:.17,col:"#f6c04a"},
        {k:"crystal",at:[.53,.83],scale:.14,col:"#f6c04a"}
      ],
      fx:[{k:"dust",t0:0,t1:3.0,a:.3,col:"#7ae8d0"},{k:"flare",t0:.4,t1:1.2,x:.42,y:.8,col:"#ffe08a",a:.4}],
      lines:[{who:"lyra",text:"Ninety-nine. One short. Naturally.",t:.3,dur:2.3,style:"normal",expr:"smirk"}],
      sfx:[{t:.15,name:"click"},{t:.55,name:"click"},{t:1.0,name:"click"},{t:1.5,name:"click"}],
      trans:{in:"cut",out:"cut"}},

    /* 5d. Mags in the cab, lamps for the Tower. She counts the days, and whistles the load secure. (54.5-60.7) */
    {id:"cab",dur:6.2,
      bg:{k:"base",faction:"meridian",time:"dusk",state:"calm"},
      cam:{from:{x:.7,y:.52,z:1.1,r:0},to:{x:.64,y:.5,z:1.22,r:0},ease:"inout"},
      actors:[{id:"mags",char:"mags",at:[.64,.68],h:.88,face:"l",expr:"weary",mode:"bust",t0:.1,t1:6.2}],
      props:[
        {k:"unit",type:"hauler",faction:"meridian",from:[.18,.84],to:[.34,.84],scale:.9,t0:0,t1:6.0,ease:"out"},
        {k:"beacon",at:[.14,.6],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.26,.56],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.4,.62],scale:.14,col:"#ffb35c"},
        {k:"beacon",at:[.9,.58],scale:.14,col:"#ffb35c"}
      ],
      fx:[{k:"dust",t0:0,t1:6.2,a:.3},{k:"embers",t0:0,t1:6.2,a:.2,col:"#ffb35c"}],
      lines:[{who:"mags",text:"Day eleven thousand, three hundred and fifteen. Lamp's lit, Anselm.",t:.7,dur:4.2,style:"whisper",expr:"weary"}],
      sfx:[{t:5.1,name:"chime"},{t:5.55,name:"chime"}],
      trans:{in:"cut",out:"cut"}},

    /* 6a. A ridge of red banners; the title card is the number the banners carry. Kaz on the skyline. (60.7-65.7) */
    {id:"ridge",dur:5.0,
      bg:{k:"surface",biome:"ash",time:"dusk",features:["banners","cliffs","tents"]},
      cam:{from:{x:.46,y:.58,z:1.0,r:0},to:{x:.5,y:.5,z:1.22,r:0},ease:"inout"},
      actors:[{id:"kaz",char:"kaz",at:[.25,.74],h:.6,face:"r",expr:"neutral",mode:"silhouette",t0:.3,t1:5.0}],
      props:[
        {k:"banner",faction:"obsidian",at:[.36,.5],scale:1.0,z:-1},
        {k:"banner",faction:"obsidian",at:[.5,.48],scale:1.0,z:-1},
        {k:"banner",faction:"obsidian",at:[.64,.5],scale:1.0,z:-1},
        {k:"banner",faction:"obsidian",at:[.78,.52],scale:1.1,z:-1},
        {k:"banner",faction:"obsidian",at:[.3,.62],scale:1.6},
        {k:"banner",faction:"obsidian",at:[.7,.62],scale:1.6},
        {k:"banner",faction:"obsidian",at:[.06,.7],scale:2.4,z:1},
        {k:"banner",faction:"obsidian",at:[.94,.7],scale:2.4,z:1},
        {k:"crowd",faction:"obsidian",at:[.5,.86],scale:3.2},
        {k:"unit",type:"reaver",faction:"obsidian",at:[.42,.8],scale:.9},
        {k:"unit",type:"reaver",faction:"obsidian",at:[.58,.82],scale:.9}
      ],
      fx:[{k:"embers",t0:0,t1:5.0,a:.8},{k:"smoke",t0:0,t1:5.0,a:.4}],
      title:{text:"9000",t0:.5,t1:4.7},
      sfx:[{t:.05,name:"impact"},{t:.3,name:"rumble"},{t:.6,name:"gong"}],
      trans:{in:"cut",out:"cut"}},

    /* 6b. The Reckoner appears to her Warlord as a hologram under her gold ring. Locked camera. (65.7-72.1) */
    {id:"host",dur:6.4,
      bg:{k:"surface",biome:"ash",time:"night",features:["banners","tents"]},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"lin"},
      actors:[
        {id:"kaz",char:"kaz",at:[.26,.68],h:.86,face:"r",expr:"neutral",mode:"silhouette",t0:.1,t1:6.4},
        {id:"reckoner",char:"ostrander",at:[.72,.64],h:.86,face:"l",expr:"neutral",mode:"hologram",t0:.3,t1:6.4}
      ],
      props:[
        {k:"holo",shape:"ring",at:[.72,.54],scale:1.7,col:"#f6c04a",t0:.3,t1:6.4},
        {k:"banner",faction:"obsidian",at:[.07,.62],scale:1.8},
        {k:"banner",faction:"obsidian",at:[.93,.62],scale:1.8},
        {k:"crowd",faction:"obsidian",at:[.5,.92],scale:3.0}
      ],
      fx:[{k:"scan",t0:.3,t1:6.4,a:.3},{k:"embers",t0:0,t1:6.4,a:.4},{k:"glitch",t0:.3,t1:.7,a:.5}],
      lines:[
        {who:"kaz",text:"The Host is fed, Reckoner. We climb at dark.",t:.9,dur:2.9,style:"normal",expr:"neutral"},
        {who:"ostrander",text:"Thank you, Kaz.",t:4.3,dur:1.6,style:"normal",expr:"smile"}
      ],
      sfx:[{t:.3,name:"static"},{t:.35,name:"comms"}],
      trans:{in:"glitch",out:"cut",len:.4}},

    /* 6c. Close. The sum. Sting. (72.1-76.1) */
    {id:"nine",dur:4.0,
      bg:{k:"surface",biome:"ash",time:"night",features:["banners"]},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"lin"},
      music:{cue:"sting_evil"},
      actors:[{id:"reckoner",char:"ostrander",at:[.5,.68],h:1.05,face:"l",expr:"cold",mode:"hologram",t0:0,t1:4.0}],
      props:[{k:"holo",shape:"ring",at:[.5,.55],scale:2.1,col:"#f6c04a",t0:0,t1:4.0}],
      fx:[{k:"scan",t0:0,t1:4.0,a:.35},{k:"vignette",t0:0,t1:4.0,a:.7},{k:"glitch",t0:0,t1:.3,a:.5}],
      lines:[{who:"ostrander",text:"Nine thousand.",t:1.2,dur:1.7,style:"normal",expr:"cold"}],
      sfx:[{t:0,name:"static"},{t:1.0,name:"rumble"}],
      trans:{in:"cut",out:"cut"}},

    /* 7. Title hit: the ringed planet, the golden crystal, the violet ether satellite. (76.1-81.3) */
    {id:"title",dur:5.2,
      bg:{k:"planet",planet:"violet",rings:true,phase:.6,size:1.0,moons:0,atmosphere:true,nebula:"gold"},
      cam:{from:{x:.5,y:.5,z:1.18,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"out"},
      props:[
        {k:"station",from:[.9,.3],to:[.8,.26],scale:.45,col:"#a98bff",t0:0,t1:5.2,ease:"out"},
        {k:"crystal",at:[.18,.74],scale:.55,col:"#f6c04a"}
      ],
      fx:[{k:"stars",t0:0,t1:5.2,a:.7},{k:"flare",t0:.2,t1:1.8,x:.18,y:.72,col:"#ffe29a",a:.9}],
      title:{text:"ORBITAL DOMINION",sub:"The Lantern Tithe",t0:.4,t1:5.0},
      sfx:[{t:.05,name:"impact"},{t:.1,name:"boom"},{t:.4,name:"chime"}],
      trans:{in:"flash",out:"fade",len:.5}}
  ]
},

/* ============================================================================================================================
   CREDITS  (about 83 s)  The Sleepers' roll, read in six groups and answered; then the telling's own lost, read singly; last, the Keeper.
   Warm flare = a lamp lit for the absent. Green flare = a Cradle that is alive. The array has no per-cradle state, so the light is an fx.
   ============================================================================================================================ */
credits:{
  id:"credits",kind:"credits",title:"The Lamp-Roll",music:"credits",letterbox:true,seed:62,
  scenes:[

    {id:"roll",dur:5.8,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.45,y:.5,z:1.12,r:0},ease:"inout"},
      fx:[{k:"stars",t0:0,t1:5.8,a:.4},{k:"dust",t0:0,t1:5.8,a:.3,col:"#bda8ff"}],
      title:{text:"THE LAMP-ROLL",sub:"Read aloud, every Lamp Night",t0:.4,t1:3.6},
      lines:[{who:"narrator",text:"Tonight the Roll is read aloud, and every name is answered.",t:1.0,dur:3.8,style:"narration"}],
      sfx:[{t:.5,name:"chime"}],
      trans:{in:"fade",out:"cut",len:.8}},

    /* A still: the reformed Council has a seat for the Haulers, and Mags has opinions about it. */
    {id:"stool",dur:4.8,
      bg:{k:"hall",style:"meridian",light:"warm"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"lin"},
      actors:[{id:"mags",char:"mags",at:[.4,.72],h:.9,face:"r",expr:"weary",mode:"bust",t0:.2,t1:4.8}],
      props:[
        {k:"crowd",faction:"meridian",at:[.74,.82],scale:2.6},
        {k:"banner",faction:"meridian",at:[.1,.55],scale:1.6,z:-1},
        {k:"banner",faction:"meridian",at:[.9,.55],scale:1.6,z:-1}
      ],
      fx:[{k:"dust",t0:0,t1:4.8,a:.25}],
      lines:[{who:"mags",text:"Stool's an inch short. Table's an inch high. I'll sit.",t:.7,dur:3.4,style:"normal",expr:"weary"}],
      sfx:[{t:.2,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    /* Group 1: the dead, answered for. */
    {id:"g1",dur:7.9,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.2,y:.5,z:1.15,r:0},to:{x:.3,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"meridian",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:7.9,a:.3},{k:"flare",t0:6.1,t1:7.6,x:.3,y:.45,col:"#ffc27a",a:.6}],
      title:{text:"CRADLES 31 – 655",sub:"answered for",t0:.2,t1:5.6},
      lines:[
        {who:"narrator",text:"Wren, Abel. Voss, Adaeze. Lowry, Bram. Rue, Caspian. Oakes, Delphine. Marlowe, Eshe.",t:.5,dur:5.2,style:"narration"},
        {who:"narrator",text:"Here.",t:6.1,dur:1.3,style:"thought"}
      ],
      sfx:[{t:6.1,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    /* Group 2 */
    {id:"g2",dur:7.2,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.3,y:.5,z:1.15,r:0},to:{x:.4,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"obsidian",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:7.2,a:.3},{k:"flare",t0:5.4,t1:6.9,x:.55,y:.45,col:"#ffc27a",a:.6}],
      title:{text:"CRADLES 731 – 1,533",sub:"answered for",t0:.2,t1:4.9},
      lines:[
        {who:"narrator",text:"Teller, Faro. Pell, Gideon. Quist, Halloran. Corvane, Ines. Ashby, Jory.",t:.5,dur:4.5,style:"narration"},
        {who:"narrator",text:"Here.",t:5.4,dur:1.3,style:"thought"}
      ],
      sfx:[{t:5.4,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    /* Group 3: the family is read in its turn, without a pause. */
    {id:"g3",dur:8.2,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.4,y:.5,z:1.15,r:0},to:{x:.5,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"aurora",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:8.2,a:.3},{k:"flare",t0:6.4,t1:7.9,x:.62,y:.45,col:"#ffc27a",a:.6}],
      title:{text:"CRADLES 1,801 – 2,655",sub:"answered for",t0:.2,t1:5.9},
      lines:[
        {who:"narrator",text:"Moon, Keziah. Ostrander, Teodor. Ostrander, Linnet. Gray, Lysander. Oyelaran, Marguerite.",t:.5,dur:5.5,style:"narration"},
        {who:"narrator",text:"Here.",t:6.4,dur:1.3,style:"thought"}
      ],
      sfx:[{t:6.4,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    /* The telling's own lost, read singly. One lamp lit for each name. */
    {id:"lost1",dur:6.4,
      bg:{k:"void",tint:"#1a1224",glow:.4},
      cam:{from:{x:.5,y:.55,z:1.0,r:0},to:{x:.5,y:.5,z:1.12,r:0},ease:"inout"},
      props:[
        {k:"beacon",at:[.3,.6],scale:.28,col:"#ffb35c",t0:.5,t1:6.4},
        {k:"beacon",at:[.5,.6],scale:.28,col:"#ffb35c",t0:1.9,t1:6.4},
        {k:"beacon",at:[.7,.6],scale:.28,col:"#ffb35c",t0:3.3,t1:6.4}
      ],
      fx:[{k:"stars",t0:0,t1:6.4,a:.3},{k:"dust",t0:0,t1:6.4,a:.25,col:"#ffb35c"}],
      title:{text:"FROM THE TELLING",t0:.2,t1:3.2},
      lines:[
        {who:"narrator",text:"Tarn, Brio.",t:.5,dur:1.3,style:"narration"},
        {who:"narrator",text:"Marr, Joren.",t:1.9,dur:1.3,style:"narration"},
        {who:"narrator",text:"Marr, Lucan.",t:3.3,dur:1.3,style:"narration"},
        {who:"narrator",text:"Here.",t:4.9,dur:1.3,style:"thought"}
      ],
      sfx:[{t:.5,name:"chime"},{t:1.9,name:"chime"},{t:3.3,name:"chime"},{t:4.9,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    {id:"lost2",dur:9.0,
      bg:{k:"void",tint:"#1a1224",glow:.4},
      cam:{from:{x:.5,y:.5,z:1.12,r:0},to:{x:.5,y:.46,z:1.0,r:0},ease:"inout"},
      props:[
        {k:"beacon",at:[.18,.6],scale:.28,col:"#ffb35c",t0:.5,t1:9.0},
        {k:"beacon",at:[.32,.6],scale:.28,col:"#ffb35c",t0:2.0,t1:9.0},
        {k:"beacon",at:[.5,.62],scale:.12,col:"#ffb35c",t0:3.9,t1:9.0},{k:"beacon",at:[.56,.58],scale:.12,col:"#ffb35c",t0:4.0,t1:9.0},
        {k:"beacon",at:[.62,.62],scale:.12,col:"#ffb35c",t0:4.1,t1:9.0},{k:"beacon",at:[.68,.58],scale:.12,col:"#ffb35c",t0:4.2,t1:9.0},
        {k:"beacon",at:[.74,.62],scale:.12,col:"#ffb35c",t0:4.3,t1:9.0},{k:"beacon",at:[.8,.58],scale:.12,col:"#ffb35c",t0:4.4,t1:9.0},
        {k:"beacon",at:[.86,.62],scale:.12,col:"#ffb35c",t0:4.5,t1:9.0}
      ],
      fx:[{k:"stars",t0:0,t1:9.0,a:.3},{k:"dust",t0:0,t1:9.0,a:.25,col:"#ffb35c"}],
      lines:[
        {who:"narrator",text:"Crake, Oswin.",t:.5,dur:1.4,style:"narration"},
        {who:"narrator",text:"Vale, Idris.",t:2.0,dur:1.3,style:"narration"},
        {who:"narrator",text:"The thirty-eight keepers of the Lamp Tower.",t:3.7,dur:2.9,style:"narration"},
        {who:"narrator",text:"Here.",t:7.0,dur:1.3,style:"thought"}
      ],
      sfx:[{t:.5,name:"chime"},{t:2.0,name:"chime"},{t:3.9,name:"chime"},{t:7.0,name:"crowd"}],
      trans:{in:"cut",out:"cut"}},

    /* Group 4: the living answer for themselves, in full voice. Green. */
    {id:"g4",dur:8.2,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.5,y:.5,z:1.15,r:0},to:{x:.6,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"meridian",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:8.2,a:.3},{k:"flare",t0:6.4,t1:7.9,x:.42,y:.45,col:"#6dff9b",a:.65},{k:"flare",t0:6.5,t1:8.0,x:.66,y:.5,col:"#6dff9b",a:.5}],
      title:{text:"CRADLES 3,018 – 4,871",sub:"awake",t0:.2,t1:5.9},
      lines:[
        {who:"narrator",text:"Brandt, Nico. Fenwick, Odile. Hask, Perrin. Rae, Quillon. Doyle, Rafferty. Lund, Saffron.",t:.5,dur:5.5,style:"narration"},
        {who:"narrator",text:"Here.",t:6.4,dur:1.3,style:"narration"}
      ],
      sfx:[{t:6.4,name:"chime"}],
      trans:{in:"cut",out:"cut"}},

    {id:"g5",dur:8.1,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.6,y:.5,z:1.15,r:0},to:{x:.7,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"obsidian",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:8.1,a:.3},{k:"flare",t0:6.3,t1:7.8,x:.5,y:.45,col:"#6dff9b",a:.65},{k:"flare",t0:6.4,t1:7.9,x:.72,y:.52,col:"#6dff9b",a:.5}],
      title:{text:"CRADLES 5,203 – 6,942",sub:"awake",t0:.2,t1:5.8},
      lines:[
        {who:"narrator",text:"Wick, Tobias. Marsh, Ulla. Kine, Vesper. Cale, Wystan. Holloway, Anselm. Brandt, Yara.",t:.5,dur:5.4,style:"narration"},
        {who:"narrator",text:"Here.",t:6.3,dur:1.3,style:"narration"}
      ],
      sfx:[{t:6.3,name:"chime"}],
      trans:{in:"cut",out:"cut"}},

    {id:"g6",dur:7.0,
      bg:{k:"array",state:"dormant",planet:"violet"},
      cam:{from:{x:.7,y:.5,z:1.15,r:0},to:{x:.8,y:.5,z:1.2,r:0},ease:"inout"},
      props:[
        {k:"crowd",faction:"aurora",at:[.5,.9],scale:3.2},
        {k:"beacon",at:[.3,.7],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.5,.68],scale:.16,col:"#ffb35c"},{k:"beacon",at:[.7,.7],scale:.16,col:"#ffb35c"}
      ],
      fx:[{k:"stars",t0:0,t1:7.0,a:.3},{k:"flare",t0:5.2,t1:6.7,x:.4,y:.45,col:"#6dff9b",a:.65},{k:"flare",t0:5.3,t1:6.8,x:.6,y:.5,col:"#6dff9b",a:.5}],
      title:{text:"CRADLES 7,118 – 8,941",sub:"awake",t0:.2,t1:4.7},
      lines:[
        {who:"narrator",text:"Orme, Zephyr. Tarsk, Colm. Rook, Dessa. Fen, Everard. Sallow, Fenna.",t:.5,dur:4.3,style:"narration"},
        {who:"narrator",text:"Here.",t:5.2,dur:1.3,style:"narration"}
      ],
      sfx:[{t:5.2,name:"chime"}],
      trans:{in:"cut",out:"cut"}},

    /* The last name on the Roll is the Keeper's own. */
    {id:"keeper",dur:6.2,
      bg:{k:"void",tint:"#1c1410",glow:.5},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.55,y:.5,z:1.12,r:0},ease:"inout"},
      actors:[{id:"ione",char:"ione",at:[.62,.68],h:.9,face:"l",expr:"neutral",mode:"bust",t0:.2,t1:6.2}],
      props:[{k:"beacon",at:[.3,.7],scale:.3,col:"#ffb35c"}],
      fx:[
        {k:"dust",t0:0,t1:6.2,a:.3,col:"#ffb35c"},
        {k:"flare",t0:3.5,t1:5.6,x:.62,y:.62,col:"#6dff9b",a:.7}
      ],
      lines:[
        {who:"narrator",text:"Dray, Ione. Cradle 4,112.",t:.6,dur:1.9,style:"narration"},
        {who:"ione",text:"Here.",t:3.5,dur:1.4,style:"normal",expr:"smile"}
      ],
      sfx:[{t:3.5,name:"chime"}],
      trans:{in:"cut",out:"fade",len:.6}},

    /* Fade to the Price Lamp over the Tollhouse door, lit. */
    {id:"pricelamp",dur:3.8,
      bg:{k:"base",faction:"aurora",time:"dusk",state:"calm"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.46,z:1.18,r:0},ease:"inout"},
      props:[{k:"beacon",at:[.5,.45],scale:.9,col:"#ffd27a",t0:.7,t1:3.8}],
      fx:[
        {k:"pulse",t0:.7,t1:3.8,x:.5,y:.45,col:"#ffd27a",a:.6,r:.8},
        {k:"flare",t0:.6,t1:2.0,x:.5,y:.45,col:"#fff0c0",a:.7}
      ],
      sfx:[{t:.7,name:"chime"}],
      trans:{in:"fade",out:"fade",len:1.2}}
  ]
},

/* ============================================================================================================================
   DEFEAT SCENES. The narrator here is never the `ione` actor.
   ============================================================================================================================ */

/* The Lamp Goes Out: M1, M2, M3, M5. */
defeat_a1:{
  id:"defeat_a1",kind:"defeat",title:"The Lamp Goes Out",music:"tragedy",letterbox:true,seed:11,
  scenes:[
    {id:"window",dur:11.0,
      bg:{k:"base",faction:"meridian",time:"night",state:"ruined"},
      cam:{from:{x:.5,y:.56,z:1.0,r:0},to:{x:.5,y:.6,z:1.4,r:0},ease:"inout"},
      props:[
        {k:"beacon",at:[.5,.6],scale:.16,col:"#ffb35c",t0:.2,t1:1.7},
        {k:"beacon",at:[.5,.6],scale:.16,col:"#ffb35c",t0:2.0,t1:2.9},
        {k:"beacon",at:[.5,.6],scale:.16,col:"#ffb35c",t0:3.2,t1:3.8},
        {k:"beacon",at:[.5,.6],scale:.16,col:"#ffb35c",t0:4.1,t1:4.4}
      ],
      fx:[
        {k:"dust",t0:0,t1:11.0,a:.5},
        {k:"smoke",t0:0,t1:11.0,a:.25},
        {k:"pulse",t0:.2,t1:4.4,x:.5,y:.6,col:"#ffb35c",a:.4,r:.4}
      ],
      lines:[{who:"narrator",text:"A lamp can burn out. That is why we light them together.",t:5.2,dur:3.7,style:"narration"}],
      sfx:[{t:.1,name:"wind"},{t:4.5,name:"powerdown"}],
      trans:{in:"fade",out:"fade",len:1.2}}
  ]
},

/* The Count Is Short: M4, M6 (the Wake's missions; the status line is generic). */
defeat_a2:{
  id:"defeat_a2",kind:"defeat",title:"The Count Is Short",music:"tragedy",letterbox:true,seed:12,
  scenes:[
    {id:"static",dur:5.0,
      bg:{k:"map",focus:[.5,.5],marks:[{x:.5,y:.5,k:"danger"},{x:.2,y:.78,k:"friendly"},{x:.8,y:.22,k:"enemy"}],faction:"obsidian"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.1,r:0},ease:"inout"},
      fx:[{k:"glitch",t0:0,t1:5.0,a:.4},{k:"scan",t0:0,t1:5.0,a:.4}],
      title:{text:"THE ROLL",sub:"Date —",t0:.6,t1:4.7},
      sfx:[{t:.1,name:"static"},{t:2.5,name:"glitch"}],
      trans:{in:"fade",out:"cut",len:.5}},
    {id:"motes",dur:7.0,
      bg:{k:"void",tint:"#150c24",glow:.35},
      cam:{from:{x:.5,y:.6,z:1.0,r:0},to:{x:.5,y:.45,z:1.15,r:0},ease:"inout"},
      fx:[
        {k:"embers",t0:0,t1:7.0,col:"#b79cff",a:.9,n:1.6,spd:.7},
        {k:"dust",t0:0,t1:7.0,col:"#b79cff",a:.3},
        {k:"vignette",t0:0,t1:7.0,a:.6}
      ],
      lines:[{who:"overseer",text:"ALLOCATION UNMET. DISPATCH CONTINUES.",t:3.8,dur:2.5,style:"radio"}],
      sfx:[{t:3.7,name:"comms"}],
      trans:{in:"cut",out:"fade",len:.8}}
  ]
},

/* The Tithe Is Paid: M7, M8, M9. */
defeat_a3:{
  id:"defeat_a3",kind:"defeat",title:"The Tithe Is Paid",music:"tragedy",letterbox:true,seed:13,
  scenes:[
    {id:"roll",dur:4.2,
      bg:{k:"void",tint:"#12060a",glow:.25},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.45,z:1.1,r:0},ease:"inout"},
      props:[
        {k:"holo",shape:"sigil",from:[.5,1.15],to:[.5,-.15],scale:.5,col:"#d9a0a0",t0:0,t1:2.4,ease:"lin"},
        {k:"holo",shape:"sigil",from:[.5,1.15],to:[.5,-.15],scale:.5,col:"#d9a0a0",t0:.45,t1:2.85,ease:"lin"},
        {k:"holo",shape:"sigil",from:[.5,1.15],to:[.5,-.15],scale:.5,col:"#d9a0a0",t0:.9,t1:3.3,ease:"lin"},
        {k:"holo",shape:"sigil",from:[.5,1.15],to:[.5,-.15],scale:.5,col:"#d9a0a0",t0:1.35,t1:3.75,ease:"lin"},
        {k:"holo",shape:"sigil",from:[.5,1.15],to:[.5,.5],scale:.5,col:"#f2c0c0",t0:1.8,t1:4.2,ease:"out"}
      ],
      fx:[{k:"scan",t0:0,t1:4.2,a:.3},{k:"dust",t0:0,t1:4.2,a:.3}],
      sfx:[{t:.2,name:"static"},{t:.6,name:"click"},{t:1.05,name:"click"},{t:1.5,name:"click"},{t:1.95,name:"click"},{t:2.4,name:"click"}],
      trans:{in:"fade",out:"cut",len:.5}},
    {id:"thanks",dur:5.2,
      bg:{k:"hall",style:"obsidian",light:"blood"},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.0,r:0},ease:"lin"},
      music:{cue:"sting_evil"},
      actors:[{id:"reckoner",char:"ostrander",at:[.5,.7],h:1.0,face:"l",expr:"cold",mode:"shadow",t0:.2,t1:5.2}],
      props:[{k:"holo",shape:"ring",at:[.5,.58],scale:2.0,col:"#f6c04a",t0:.2,t1:5.2}],
      fx:[{k:"vignette",t0:0,t1:5.2,a:.8},{k:"embers",t0:0,t1:5.2,a:.3}],
      lines:[{who:"ostrander",text:"Thank you.",t:1.9,dur:1.6,style:"normal",expr:"smile"}],
      sfx:[{t:.2,name:"static"}],
      trans:{in:"cut",out:"cut"}},
    {id:"complete",dur:4.4,
      bg:{k:"void",tint:"#0a0610",glow:.2},
      cam:{from:{x:.5,y:.5,z:1.0,r:0},to:{x:.5,y:.5,z:1.12,r:0},ease:"inout"},
      fx:[{k:"pulse",t0:0,t1:4.4,x:.5,y:.5,col:"#b79cff",a:.4}],
      title:{text:"9,000",sub:"of 9,000",t0:.3,t1:3.7},
      lines:[{who:"overseer",text:"ALLOCATION COMPLETE.",t:1.3,dur:1.7,style:"radio"}],
      sfx:[{t:1.2,name:"comms"},{t:3.2,name:"powerdown"}],
      trans:{in:"cut",out:"fade",len:1.0}}
  ]
}

});
