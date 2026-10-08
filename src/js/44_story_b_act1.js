/* =========================================================================
   STORY (2/n) - ACT I CINEMATICS (owner: act1). Briefings, debriefs and interludes of M1-M3:
   m01_brief, m01_win, i01, m02_brief, m02_win, i02, m03_brief, m03_win, i03.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions, no quotes inside text (single quotes only).
   Contract: docs/CINEMATIC_SPEC.md (scene shape), src/js/43_vocab.js (ids), docs/story/BIBLE.md (voices, chronology, numbers).
   Staging rules used throughout: speakers are busts facing each other (x ~.28 'r' vs ~.72 'l'); comms are mode 'hologram' with style 'radio';
   the Overseer is only ever a radio chip (status grammar NOUN VALUE. VERB NOUN.); Ostrander is a hologram on a locked camera with the gold ring prop behind her head;
   banners reading 9000 are a title card; the white in Idris's hair and the cat are said, never drawn.
   Music turns (cue changes only at scene starts, never mid-line; no `section` is used because the campaign cue data has no declared sections yet):
   m01_win mystery on the Warlord's call; m02_brief mystery on the Price Lamp, tension again on the map; i02 sting_reveal on 'seven', dread on the Key;
   m03_brief tension on the trust; i03 villain on Marr's price (+ stinger sfx), sting_reveal as the beam lands (siege base), then the ruined base for the keepers, tragedy in the Forum.
   Chronology note: i03 plays after M3 (Day 4); Lamp Night was Night 1, so Marr says 'Lamp Night's', not 'last night's'.
   Map marks (bg k:'map') are frame coordinates of the world square drawn at 84% of the frame height, centred:
   x = .5 + (tx-44)/88*(.84/2.39), y = .5 + (ty-44)/88*.84. Posts and hubs are the tiles in docs/story/BIBLE.md section 5; creep camps are 'danger'.
   Pacing rules checked by script (tests are not enough): every line dur >= chars/19+.3, >= .4 s between lines, <= 3 lines per scene, a tail of about
   .8 s after the last line of a scene (about .5 s only where the very next scene continues the same exchange), and one dialogue-free image at the head of m01_brief, m01_win, m03_brief.
   Not verified: props, fx and the map/hall/base backgrounds were still placeholders when this was written, so only the portraits' composition was seen.
   ========================================================================= */
Object.assign(STORY.cine,{

  /* m01_brief: Question: what is the Wake counting? The Keeper opens on the lamps, Marr sheathes every sentence, Mags is the first warm voice. Button: a two-note whistle, whole. */
  m01_brief:{
    id:"m01_brief",kind:"briefing",title:"Lamp Night",music:"tension",letterbox:true,seed:101,
    scenes:[
      {id:"dusk",dur:14.2,
        bg:{k:"base",faction:"meridian",time:"dusk",state:"calm"},
        cam:{from:{x:0.4,y:0.82,z:1.9,r:0},to:{x:0.48,y:0.54,z:1,r:0},ease:"out"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.64],h:0.92,face:"r",expr:"determined",mode:"bust",t0:8,t1:14.2},
          {id:"marr",char:"marr",at:[0.64,0.7],h:0.76,face:"l",expr:"neutral",mode:"bust",t0:8.2,t1:14.2,move:{to:[0.6,0.7],ease:"out"}}
        ],
        props:[
          {k:"crowd",t0:0,t1:14.2,faction:"meridian",at:[0.5,0.93],scale:3.2,z:-1,a:0.6},
          {k:"beacon",t0:0,t1:14.2,at:[0.1,0.8],scale:0.2,col:"#ffcf80",z:-1},
          {k:"beacon",t0:0.6,t1:14.2,at:[0.24,0.84],scale:0.24,col:"#ffcf80",z:-1},
          {k:"beacon",t0:1.2,t1:14.2,at:[0.41,0.8],scale:0.2,col:"#ffcf80",z:-1},
          {k:"beacon",t0:1.8,t1:14.2,at:[0.58,0.85],scale:0.24,col:"#ffcf80",z:-1},
          {k:"beacon",t0:2.4,t1:14.2,at:[0.74,0.8],scale:0.2,col:"#ffcf80",z:-1},
          {k:"beacon",t0:3,t1:14.2,at:[0.89,0.84],scale:0.24,col:"#ffcf80",z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:14.2,col:"#ffc880",a:0.55,n:0.9},
          {k:"stars",t0:0,t1:14.2,a:0.3},
          {k:"flare",t0:9.2,t1:10.6,x:0.3,y:0.74,col:"#e6c06a",a:0.5,r:0.4},
          {k:"vignette",t0:0,t1:14.2,a:0.5}
        ],
        lines:[
          {who:"narrator",text:"The elders say the war was fought across a continent.",t:1.8,dur:3.1,style:"narration"},
          {who:"narrator",text:"I tell it on one field, because a story needs somewhere to stand.",t:5.3,dur:3.8,style:"narration"},
          {who:"marr",text:"The Key answers to your hand alone, Marshal.",t:10.7,dur:2.7,style:"normal",expr:"neutral"}
        ],
        sfx:[
          {t:0.2,name:"wind"},
          {t:9.4,name:"click"}
        ],
        title:{text:"LAMP NIGHT",sub:"Brasswatch Heights, Year 31",t0:0.4,t1:4.4},
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"rise",dur:10.3,
        bg:{k:"battlefield",biome:"ash",time:"dusk",intensity:0.25,sides:["meridian","obsidian"]},
        cam:{from:{x:0.7,y:0.44,z:1,r:0},to:{x:0.74,y:0.41,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.33,0.66],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:10.3},
          {id:"marr",char:"marr",at:[0.53,0.72],h:0.72,face:"r",expr:"neutral",mode:"bust",t0:0,t1:10.3}
        ],
        props:[
          {k:"banner",t0:0,t1:10.3,faction:"obsidian",at:[0.62,0.5],scale:1.5,z:-1},
          {k:"banner",t0:0,t1:10.3,faction:"obsidian",at:[0.74,0.44],scale:1.7,z:-1},
          {k:"banner",t0:0,t1:10.3,faction:"obsidian",at:[0.86,0.5],scale:1.5,z:-1},
          {k:"crowd",t0:0,t1:10.3,faction:"obsidian",at:[0.74,0.66],scale:3.4,z:-1,a:0.85},
          {k:"unit",t0:0,t1:10.3,type:"reaver",faction:"obsidian",at:[0.6,0.62],scale:0.6},
          {k:"unit",t0:0,t1:10.3,type:"reaver",faction:"obsidian",at:[0.8,0.67],scale:0.6}
        ],
        fx:[
          {k:"smoke",t0:0,t1:10.3,a:0.3},
          {k:"embers",t0:0,t1:10.3,col:"#ff6a5a",a:0.4},
          {k:"heat",t0:0,t1:10.3,a:0.25},
          {k:"vignette",t0:0,t1:10.3,a:0.55}
        ],
        lines:[
          {who:"marr",text:"Banners on the east rise. They read nine thousand.",t:1,dur:3,style:"normal",expr:"neutral"},
          {who:"idris",text:"Nine thousand. They are counting something.",t:4.4,dur:2.6,style:"normal",expr:"determined"},
          {who:"marr",text:"They do not say what for, Marshal.",t:7.4,dur:2.1,style:"normal",expr:"cold"}
        ],
        sfx:[
          {t:0.3,name:"gong"},
          {t:0.5,name:"rumble"}
        ],
        title:{text:"9000",t0:2.2,t1:4.8}
      },
      {id:"oil",dur:8.5,
        bg:{k:"base",faction:"meridian",time:"dusk",state:"calm"},
        cam:{from:{x:0.62,y:0.6,z:1.1,r:0},to:{x:0.5,y:0.55,z:1.22,r:0},ease:"out"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.62],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:8.5},
          {id:"mags",char:"mags",at:[0.8,0.66],h:0.82,face:"l",expr:"smile",mode:"bust",t0:0,t1:8.5,move:{to:[0.74,0.66],t0:0,t1:1,ease:"out"}}
        ],
        props:[
          {k:"unit",t0:0,t1:1.2,type:"hauler",faction:"meridian",from:[1.15,0.8],to:[0.9,0.8],scale:2,z:-1,ease:"out"},
          {k:"beacon",t0:0,t1:8.5,at:[0.1,0.82],scale:0.22,col:"#ffcf80",z:-1},
          {k:"beacon",t0:0,t1:8.5,at:[0.46,0.84],scale:0.22,col:"#ffcf80",z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:8.5,col:"#ffc880",a:0.45,n:0.7},
          {k:"vignette",t0:0,t1:8.5,a:0.5}
        ],
        lines:[
          {who:"mags",text:"Forty crates, Marshal. Forty-one if you count the cat.",t:0.7,dur:3.2,style:"normal",expr:"smile"},
          {who:"idris",text:"Hold until dawn. Mind the Stair.",t:4.3,dur:2,style:"normal",expr:"determined"}
        ],
        sfx:[
          {t:0.1,name:"engine"},
          {t:6.8,name:"chime"},
          {t:7.3,name:"chime"}
        ],
        trans:{in:"cut",out:"fade",len:1}
      }
    ]
  },

  /* m01_win: Question: what did the night cost? Relief with a wrong note: the silver nobody explains, a man who counts people, a thank-you that sounds like a receipt. Button: the band closes. */
  m01_win:{
    id:"m01_win",kind:"debrief",title:"Dawn on the Heights",music:"dawn",letterbox:true,seed:102,
    scenes:[
      {id:"dawn",dur:8.6,
        bg:{k:"battlefield",biome:"ash",time:"dawn",intensity:0.15,sides:["meridian","obsidian"]},
        cam:{from:{x:0.62,y:0.46,z:1,r:0},to:{x:0.46,y:0.52,z:1.24,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.64],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0.8,t1:8.6},
          {id:"marr",char:"marr",at:[0.72,0.68],h:0.78,face:"l",expr:"neutral",mode:"bust",t0:1,t1:8.6}
        ],
        props:[
          {k:"unit",t0:0,t1:7,type:"reaver",faction:"obsidian",from:[0.58,0.5],to:[1.1,0.46],scale:0.34,z:-1},
          {k:"unit",t0:0.5,t1:7.5,type:"reaver",faction:"obsidian",from:[0.5,0.52],to:[1.08,0.49],scale:0.34,z:-1},
          {k:"banner",t0:0.2,t1:7,faction:"obsidian",from:[0.56,0.46],to:[1.08,0.43],scale:0.5,z:-1},
          {k:"beacon",t0:0,t1:8.6,at:[0.08,0.84],scale:0.24,col:"#a8793c",a:0.7,z:-1},
          {k:"beacon",t0:0,t1:8.6,at:[0.5,0.86],scale:0.22,col:"#a8793c",a:0.6,z:-1}
        ],
        fx:[
          {k:"flare",t0:0.2,t1:2.6,x:0.84,y:0.32,col:"#ffd9a0",a:0.5,r:0.6},
          {k:"smoke",t0:0,t1:8.6,a:0.35},
          {k:"dust",t0:0,t1:8.6,col:"#ffd9a0",a:0.4},
          {k:"heat",t0:0,t1:8.6,a:0.2},
          {k:"vignette",t0:0,t1:8.6,a:0.45}
        ],
        lines:[
          {who:"marr",text:"There is silver in your hair, Marshal.",t:2,dur:2.3,style:"normal",expr:"neutral"},
          {who:"idris",text:"It was always there.",t:4.7,dur:1.4,style:"normal",expr:"weary"},
          {who:"marr",text:"Not this much.",t:6.5,dur:1.3,style:"normal",expr:"cold"}
        ],
        sfx:[
          {t:0.2,name:"wind"},
          {t:0.5,name:"rumble"}
        ]
      },
      {id:"whose",dur:5.5,
        bg:{k:"base",faction:"meridian",time:"dawn",state:"calm"},
        cam:{from:{x:0.52,y:0.55,z:1.15,r:0},to:{x:0.48,y:0.55,z:1.24,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.64],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.5},
          {id:"mags",char:"mags",at:[0.72,0.64],h:0.82,face:"l",expr:"weary",mode:"bust",t0:0,t1:5.5}
        ],
        props:[
          {k:"unit",t0:0,t1:5.5,type:"hauler",faction:"meridian",at:[0.88,0.82],scale:1.6,z:-1,a:0.9},
          {k:"beacon",t0:0.2,t1:2,from:[0.72,0.84],to:[0.5,0.62],scale:0.7,col:"#ffcf80",ease:"out"},
          {k:"beacon",t0:2,t1:5.5,at:[0.5,0.62],scale:0.7,col:"#ffcf80"}
        ],
        fx:[
          {k:"dust",t0:0,t1:5.5,col:"#ffd9a0",a:0.4,n:0.6},
          {k:"vignette",t0:0,t1:5.5,a:0.45}
        ],
        lines:[
          {who:"idris",text:"Whose lamp?",t:0.3,dur:1.2,style:"normal",expr:"weary"},
          {who:"mags",text:"My husband's. Anselm.",t:1.9,dur:1.5,style:"normal",expr:"weary"},
          {who:"idris",text:"Which Cradle?",t:3.8,dur:1.2,style:"normal",expr:"determined"}
        ],
        sfx:[]
      },
      {id:"cradle",dur:8.9,
        bg:{k:"base",faction:"meridian",time:"dawn",state:"calm"},
        cam:{from:{x:0.54,y:0.58,z:1.32,r:0},to:{x:0.56,y:0.58,z:1.46,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.2,0.68],h:0.8,face:"r",expr:"weary",mode:"bust",t0:0,t1:8.9},
          {id:"mags",char:"mags",at:[0.66,0.62],h:0.98,face:"l",expr:"neutral",mode:"bust",t0:0,t1:8.9}
        ],
        props:[
          {k:"beacon",t0:0,t1:8.9,at:[0.44,0.68],scale:0.7,col:"#ffcf80"},
          {k:"holo",t0:5.8,t1:8.9,shape:"map",at:[0.14,0.3],scale:0.7,col:"#b79cff",a:0.8,z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:8.9,col:"#ffd9a0",a:0.35,n:0.5},
          {k:"scan",t0:5.8,t1:8.9,a:0.2},
          {k:"vignette",t0:0,t1:8.9,a:0.5}
        ],
        lines:[
          {who:"mags",text:"Six thousand three hundred and ten.",t:0.3,dur:2.2,style:"normal",expr:"neutral"},
          {who:"idris",text:"Cradle six thousand three hundred and ten.",t:2.9,dur:2.6,style:"normal",expr:"determined"},
          {who:"overseer",text:"RESERVE 6,067. DISPATCH CONTINUES.",t:6,dur:2.1,style:"radio"}
        ],
        sfx:[
          {t:5.8,name:"comms"}
        ]
      },
      {id:"band",dur:6.8,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["towers","hub"]},
        cam:{from:{x:0.4,y:0.58,z:1.2,r:0},to:{x:0.44,y:0.56,z:1.34,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.66],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:6.8},
          {id:"kaz",char:"kaz",at:[0.72,0.58],h:0.82,face:"l",expr:"cold",mode:"hologram",t0:0,t1:6}
        ],
        props:[],
        fx:[
          {k:"scan",t0:0,t1:6,a:0.3},
          {k:"glitch",t0:5.9,t1:6.3},
          {k:"dust",t0:0,t1:6.8,col:"#ffd9a0",a:0.35,n:0.5},
          {k:"vignette",t0:0,t1:6.8,a:0.5}
        ],
        lines:[
          {who:"kaz",text:"Thank you for the light, Marshal. The Reckoner wished to see it answer.",t:0.3,dur:4.1,style:"radio",expr:"cold"},
          {who:"idris",text:"See it?",t:4.8,dur:1.2,style:"normal",expr:"determined"}
        ],
        sfx:[
          {t:0.2,name:"comms"},
          {t:5.9,name:"static"}
        ],
        music:{cue:"mystery"},
        trans:{in:"cut",out:"fade",len:1}
      }
    ]
  },

  /* i01: Question: will she say it? She counts, reads the number and carries it instead. Plants the counting gag and the whistle that breaks. Button: her hands on the wheel. */
  i01:{
    id:"i01",kind:"interlude",title:"Forty Crates",music:"mystery",letterbox:true,seed:103,
    scenes:[
      {id:"count",dur:6.9,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["generators","towers"]},
        cam:{from:{x:0.5,y:0.55,z:1,r:0},to:{x:0.56,y:0.56,z:1.14,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.74,0.64],h:0.84,face:"l",expr:"neutral",mode:"bust",t0:0,t1:6.9}
        ],
        props:[
          {k:"building",t0:0,t1:6.9,type:"depot",faction:"meridian",at:[0.16,0.68],scale:0.9,z:-1},
          {k:"building",t0:0,t1:6.9,type:"depot",faction:"meridian",at:[0.3,0.72],scale:0.8,z:-1},
          {k:"unit",t0:0,t1:6.9,type:"hauler",faction:"meridian",at:[0.5,0.76],scale:1.8,z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:6.9,col:"#ffd9a0",a:0.4,n:0.6},
          {k:"heat",t0:0,t1:6.9,a:0.2},
          {k:"vignette",t0:0,t1:6.9,a:0.45}
        ],
        lines:[
          {who:"mags",text:"Thirty-eight. Thirty-nine. Forty.",t:0.8,dur:2.1,style:"normal",expr:"neutral"},
          {who:"mags",text:"Forty-one. Not on the manifest. Stay.",t:3.8,dur:2.3,style:"normal",expr:"smile"}
        ],
        sfx:[
          {t:0.2,name:"wind"}
        ],
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"panel",dur:6.4,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["generators","towers"]},
        cam:{from:{x:0.46,y:0.55,z:1.12,r:0},to:{x:0.4,y:0.55,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.72,0.65],h:0.84,face:"l",expr:"neutral",mode:"bust",t0:0,t1:6.4}
        ],
        props:[
          {k:"holo",t0:0.2,t1:6.4,shape:"map",at:[0.3,0.42],scale:0.95,col:"#b79cff"}
        ],
        fx:[
          {k:"scan",t0:0,t1:6.4,a:0.25},
          {k:"dust",t0:0,t1:6.4,col:"#ffd9a0",a:0.3,n:0.5},
          {k:"vignette",t0:0,t1:6.4,a:0.5}
        ],
        lines:[
          {who:"overseer",text:"RESERVE MINUS SEVEN. DISPATCH CONTINUES.",t:0.6,dur:2.5,style:"radio"},
          {who:"mags",text:"Seven.",t:4.2,dur:1.2,style:"normal",expr:"neutral"}
        ],
        sfx:[
          {t:0.3,name:"comms"}
        ]
      },
      {id:"whistle",dur:4,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["generators"]},
        cam:{from:{x:0.48,y:0.6,z:1.2,r:0},to:{x:0.44,y:0.62,z:1.5,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.64,0.66],h:0.96,face:"l",expr:"weary",mode:"bust",t0:0,t1:4}
        ],
        props:[
          {k:"beacon",t0:0,t1:4,at:[0.32,0.68],scale:0.9,col:"#ffcf80"}
        ],
        fx:[
          {k:"flare",t0:0.3,t1:1.2,x:0.3,y:0.62,col:"#ffcf80",a:0.4,r:0.4},
          {k:"dust",t0:0,t1:4,col:"#ffd9a0",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:4,a:0.6}
        ],
        lines:[],
        sfx:[
          {t:1.2,name:"chime"},
          {t:1.7,name:"chime"},
          {t:1.72,name:"powerdown"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"wheel",dur:6.4,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["generators","towers"]},
        cam:{from:{x:0.5,y:0.52,z:1,r:0},to:{x:0.5,y:0.74,z:1.85,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.5,0.6],h:0.92,face:"r",expr:"neutral",mode:"silhouette",t0:0,t1:6.4}
        ],
        props:[
          {k:"unit",t0:0,t1:6.4,type:"hauler",faction:"meridian",at:[0.5,0.74],scale:3.4}
        ],
        fx:[
          {k:"dust",t0:0,t1:6.4,col:"#ffd9a0",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:6.4,a:0.65}
        ],
        lines:[
          {who:"narrator",text:"She did not say it. She never said anything she could carry instead.",t:1,dur:3.9,style:"narration"}
        ],
        sfx:[],
        trans:{in:"fade",out:"fade",len:1}
      }
    ]
  },

  /* m02_brief: Question: what does the Seer owe? Everything has a price in teal chalk except one lamp and one drawer. Button: a joke told by someone who is not laughing. */
  m02_brief:{
    id:"m02_brief",kind:"briefing",title:"The Waking Fund",music:"tension",letterbox:true,seed:104,
    scenes:[
      {id:"terrace",dur:6.4,
        bg:{k:"base",faction:"aurora",time:"dusk",state:"calm"},
        cam:{from:{x:0.5,y:0.72,z:1.05,r:0},to:{x:0.5,y:0.6,z:1.2,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"banner",t0:0,t1:6.4,faction:"aurora",at:[0.2,0.5],scale:1.4,z:-1},
          {k:"banner",t0:0,t1:6.4,faction:"aurora",at:[0.8,0.5],scale:1.4,z:-1},
          {k:"crowd",t0:0,t1:6.4,faction:"aurora",at:[0.5,0.88],scale:2.6,z:-1,a:0.6}
        ],
        fx:[
          {k:"dust",t0:0,t1:6.4,col:"#9ff3df",a:0.5,n:0.8},
          {k:"stars",t0:0,t1:6.4,a:0.3},
          {k:"vignette",t0:0,t1:6.4,a:0.5}
        ],
        lines:[
          {who:"narrator",text:"At Tollhouse Terrace everything had a price, and the price was written in teal chalk.",t:0.8,dur:4.8,style:"narration"}
        ],
        sfx:[
          {t:0.2,name:"wind"}
        ],
        title:{text:"THE WAKING FUND",sub:"Tollhouse Terrace, Day 2",t0:0.5,t1:4.4},
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"lamp",dur:8.9,
        bg:{k:"base",faction:"aurora",time:"dusk",state:"calm"},
        cam:{from:{x:0.5,y:0.66,z:1.05,r:0},to:{x:0.5,y:0.4,z:1.35,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"beacon",t0:0,t1:8.9,at:[0.5,0.3],scale:1.3,col:"#4b6f69",a:0.7}
        ],
        fx:[
          {k:"dust",t0:0,t1:8.9,col:"#9ff3df",a:0.35,n:0.5},
          {k:"vignette",t0:0,t1:8.9,a:0.65}
        ],
        lines:[
          {who:"narrator",text:"Over the door hung the Price Lamp, which lit only when a debt was paid in full.",t:0.5,dur:4.5,style:"narration"},
          {who:"narrator",text:"It had been dark for twenty-three years.",t:5.6,dur:2.5,style:"narration"}
        ],
        sfx:[],
        music:{cue:"mystery"}
      },
      {id:"map",dur:8.6,
        bg:{k:"map",focus:[0.5,0.5],faction:"aurora",marks:[{x:0.376,y:0.786,k:"friendly"},{x:0.572,y:0.758,k:"objective"},{x:0.38,y:0.414,k:"objective"},{x:0.42,y:0.223,k:"objective"},{x:0.512,y:0.634,k:"danger"},{x:0.412,y:0.49,k:"danger"},{x:0.624,y:0.214,k:"enemy"}]},
        cam:{from:{x:0.5,y:0.5,z:1,r:0},to:{x:0.5,y:0.52,z:1.12,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.26,0.66],h:0.86,face:"r",expr:"neutral",mode:"bust",t0:0,t1:8.6},
          {id:"oru",char:"oru",at:[0.74,0.64],h:0.86,face:"l",expr:"smile",mode:"bust",t0:0,t1:8.6}
        ],
        props:[],
        fx:[
          {k:"scan",t0:0,t1:8.6,a:0.2},
          {k:"vignette",t0:0,t1:8.6,a:0.5}
        ],
        lines:[
          {who:"oru",text:"Three posts, six runs apiece, and the blockade breaks.",t:0.6,dur:3.2,style:"normal",expr:"smirk"},
          {who:"lyra",text:"And the consideration?",t:4.2,dur:1.5,style:"normal",expr:"smirk"},
          {who:"oru",text:"Keep your charter, Lyra.",t:6.1,dur:1.6,style:"normal",expr:"neutral"}
        ],
        sfx:[
          {t:0.3,name:"click"}
        ],
        music:{cue:"tension"}
      },
      {id:"drawer",dur:2.2,
        bg:{k:"hall",style:"forbidden",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1,r:0},to:{x:0.5,y:0.5,z:1.12,r:0},ease:"in"},
        actors:[],
        props:[],
        fx:[
          {k:"vignette",t0:0,t1:2.2,a:0.75},
          {k:"dust",t0:0,t1:2.2,col:"#9ff3df",a:0.3,n:0.4}
        ],
        lines:[],
        sfx:[
          {t:0,name:"heartbeat"},
          {t:0.5,name:"click"}
        ],
        title:{text:"Y9",sub:"locked",t0:0.1,t1:2.1},
        trans:{in:"cut",out:"cut",len:0.3}
      },
      {id:"slip",dur:11.2,
        bg:{k:"base",faction:"aurora",time:"dusk",state:"calm"},
        cam:{from:{x:0.5,y:0.58,z:1.1,r:0},to:{x:0.5,y:0.5,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.26,0.66],h:0.86,face:"r",expr:"neutral",mode:"bust",t0:0,t1:11.2},
          {id:"mags",char:"mags",at:[0.74,0.68],h:0.82,face:"l",expr:"neutral",mode:"bust",t0:0,t1:11.2}
        ],
        props:[
          {k:"beacon",t0:0,t1:11.2,at:[0.5,0.13],scale:0.8,col:"#4b6f69",a:0.7,z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:11.2,col:"#9ff3df",a:0.35,n:0.5},
          {k:"vignette",t0:0,t1:11.2,a:0.55}
        ],
        lines:[
          {who:"mags",text:"Gross four hundred and twelve. Fund, forty-one. Thirty-one years of tenths.",t:0.5,dur:4.3,style:"normal",expr:"neutral"},
          {who:"lyra",text:"Then let's make the crates lighter. I'll start with the one marked Oru's conscience.",t:5.4,dur:4.8,style:"normal",expr:"smirk"}
        ],
        sfx:[],
        trans:{in:"cut",out:"fade",len:1}
      }
    ]
  },

  /* m02_win: Question: what did the lanes cost? Lyra haggles even ashamed, and the price is a receipt. Button: the crates are heavier. */
  m02_win:{
    id:"m02_win",kind:"debrief",title:"Open Lanes",music:"mystery",letterbox:true,seed:105,
    scenes:[
      {id:"lanes",dur:4.4,
        bg:{k:"surface",biome:"dust",time:"day",features:["towers","hub"]},
        cam:{from:{x:0.3,y:0.55,z:1.2,r:0},to:{x:0.62,y:0.5,z:1,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"building",t0:0,t1:4.4,type:"depot",faction:"aurora",at:[0.52,0.56],scale:1,z:-1},
          {k:"unit",t0:0,t1:4,type:"freighter",faction:"aurora",from:[-0.15,0.64],to:[1.15,0.64],scale:0.8},
          {k:"unit",t0:0.7,t1:4.4,type:"freighter",faction:"aurora",from:[-0.15,0.7],to:[1.15,0.7],scale:0.8},
          {k:"unit",t0:1.4,t1:4.4,type:"freighter",faction:"aurora",from:[-0.15,0.66],to:[1.15,0.66],scale:0.8}
        ],
        fx:[
          {k:"dust",t0:0,t1:4.4,a:0.4,n:0.8},
          {k:"heat",t0:0,t1:4.4,a:0.25},
          {k:"vignette",t0:0,t1:4.4,a:0.4}
        ],
        lines:[],
        sfx:[
          {t:0.2,name:"engine"},
          {t:1.5,name:"engine"}
        ],
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"price",dur:6.6,
        bg:{k:"base",faction:"aurora",time:"day",state:"calm"},
        cam:{from:{x:0.46,y:0.58,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.28,0.64],h:0.88,face:"r",expr:"weary",mode:"bust",t0:0,t1:6.6},
          {id:"idris",char:"idris",at:[0.72,0.58],h:0.8,face:"l",expr:"determined",mode:"hologram",t0:0,t1:6.6}
        ],
        props:[],
        fx:[
          {k:"scan",t0:0,t1:6.6,a:0.25},
          {k:"vignette",t0:0,t1:6.6,a:0.45}
        ],
        lines:[
          {who:"idris",text:"Name your price, Seer.",t:0.5,dur:1.5,style:"radio",expr:"neutral"},
          {who:"lyra",text:"Open the routes. Take the file. I do not sell it twice.",t:2.6,dur:3.2,style:"normal",expr:"determined"}
        ],
        sfx:[
          {t:0.2,name:"comms"}
        ]
      },
      {id:"receipt",dur:4.6,
        bg:{k:"base",faction:"aurora",time:"day",state:"calm"},
        cam:{from:{x:0.5,y:0.58,z:1.2,r:0},to:{x:0.5,y:0.56,z:1.4,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.5,0.66],h:1.02,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.6}
        ],
        props:[],
        fx:[
          {k:"vignette",t0:0,t1:4.6,a:0.55}
        ],
        lines:[
          {who:"idris",text:"What is it?",t:0.4,dur:1.2,style:"radio"},
          {who:"lyra",text:"A receipt.",t:2.5,dur:1.2,style:"normal",expr:"weary"}
        ],
        sfx:[]
      },
      {id:"heavier",dur:6.5,
        bg:{k:"surface",biome:"dust",time:"day",features:["towers","hub"]},
        cam:{from:{x:0.46,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.24,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.26,0.66],h:0.86,face:"r",expr:"weary",mode:"bust",t0:0,t1:6.5},
          {id:"mags",char:"mags",at:[0.74,0.58],h:0.8,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:6.5}
        ],
        props:[
          {k:"unit",t0:0,t1:5.5,type:"freighter",faction:"aurora",from:[-0.15,0.8],to:[1.15,0.8],scale:0.7,z:-1}
        ],
        fx:[
          {k:"scan",t0:0,t1:6.5,a:0.25},
          {k:"dust",t0:0,t1:6.5,a:0.3,n:0.5},
          {k:"vignette",t0:0,t1:6.5,a:0.5}
        ],
        lines:[
          {who:"mags",text:"Forty crates, Seer. Same as always.",t:0.4,dur:2.2,style:"radio",expr:"neutral"},
          {who:"mags",text:"Why's it feel heavier?",t:3.7,dur:1.5,style:"radio",expr:"weary"}
        ],
        sfx:[
          {t:0.2,name:"comms"},
          {t:5.4,name:"heartbeat"}
        ],
        trans:{in:"cut",out:"fade",len:1}
      }
    ]
  },

  /* i02: Question: what did the Key cost? Idris reads a ledger, Marr answers with exact numbers and no names. The sting lands on seven. Button: the brass Key seen as a price. */
  i02:{
    id:"i02",kind:"interlude",title:"The Roll",music:"mystery",letterbox:true,seed:106,
    scenes:[
      {id:"ledger",dur:9.4,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.45,y:0.5,z:1,r:0},to:{x:0.42,y:0.5,z:1.16,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.64],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:9.4}
        ],
        props:[
          {k:"holo",t0:0.3,t1:9.4,shape:"map",at:[0.64,0.46],scale:1.5},
          {k:"holo",t0:6.3,t1:9.4,shape:"map",at:[0.84,0.4],scale:0.8,col:"#d9b45a",a:0.9}
        ],
        fx:[
          {k:"scan",t0:0,t1:9.4,a:0.25},
          {k:"dust",t0:0,t1:9.4,a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:9.4,a:0.6}
        ],
        lines:[
          {who:"idris",text:"Reserve Draw. Signed Y. Ostrander. Sealed A. Thane. Two thousand seven hundred and fourteen.",t:0.9,dur:5.2,style:"whisper",expr:"weary"},
          {who:"idris",text:"Thirty shots.",t:7.2,dur:1.2,style:"normal",expr:"sad"}
        ],
        sfx:[
          {t:0.3,name:"comms"},
          {t:6.3,name:"click"}
        ],
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"doorway",dur:4.8,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.55,y:0.5,z:1.05,r:0},to:{x:0.58,y:0.5,z:1.15,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.64],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.8},
          {id:"marr",char:"marr",at:[0.8,0.64],h:0.82,face:"l",expr:"neutral",mode:"bust",t0:0.3,t1:4.8,move:{to:[0.76,0.64],ease:"out"}}
        ],
        props:[
          {k:"holo",t0:0,t1:4.8,shape:"map",at:[0.5,0.42],scale:1.1,col:"#d9b45a",a:0.7,z:-1}
        ],
        fx:[
          {k:"scan",t0:0,t1:4.8,a:0.2},
          {k:"vignette",t0:0,t1:4.8,a:0.6}
        ],
        lines:[
          {who:"marr",text:"Two hundred and twelve before Lamp Night, Marshal.",t:1,dur:3,style:"normal",expr:"neutral"}
        ],
        sfx:[
          {t:0.2,name:"door"}
        ]
      },
      {id:"seven",dur:11.1,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.6,y:0.52,z:1.2,r:0},to:{x:0.62,y:0.52,z:1.34,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.25,0.68],h:0.8,face:"r",expr:"weary",mode:"bust",t0:0,t1:11.1},
          {id:"marr",char:"marr",at:[0.68,0.64],h:1,face:"l",expr:"cold",mode:"bust",t0:0,t1:11.1}
        ],
        props:[
          {k:"holo",t0:0,t1:11.1,shape:"map",at:[0.46,0.38],scale:0.9,col:"#d9b45a",a:0.5,z:-1}
        ],
        fx:[
          {k:"pulse",t0:0,t1:1.4,col:"#d9b45a",a:0.4},
          {k:"shake",t0:0,t1:0.5,a:0.25},
          {k:"vignette",t0:0,t1:11.1,a:0.7}
        ],
        lines:[
          {who:"marr",text:"Seven a shot, eight twice.",t:0.5,dur:1.7,style:"normal",expr:"cold"},
          {who:"marr",text:"And Lamp Night, seven more. Bay two thousand nine hundred and twenty-seven to thirty-three.",t:3,dur:5.1,style:"normal",expr:"neutral"},
          {who:"marr",text:"I wrote them down.",t:8.9,dur:1.3,style:"normal",expr:"cold"}
        ],
        sfx:[
          {t:0,name:"heartbeat"}
        ],
        music:{cue:"sting_reveal"}
      },
      {id:"names",dur:7.5,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.5,y:0.52,z:1.08,r:0},to:{x:0.5,y:0.52,z:1.18,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.64],h:0.9,face:"r",expr:"sad",mode:"bust",t0:0,t1:7.5},
          {id:"marr",char:"marr",at:[0.74,0.64],h:0.86,face:"l",expr:"cold",mode:"bust",t0:0,t1:7.5}
        ],
        props:[],
        fx:[
          {k:"scan",t0:0,t1:7.5,a:0.15},
          {k:"vignette",t0:0,t1:7.5,a:0.6}
        ],
        lines:[
          {who:"idris",text:"Names?",t:0.5,dur:1.2,style:"normal",expr:"determined"},
          {who:"marr",text:"Bays, Marshal. Nobody wrote the names. That is what acceptable means.",t:2.5,dur:4,style:"normal",expr:"cold"}
        ],
        sfx:[],
        music:{cue:"mystery"}
      },
      {id:"key",dur:4.6,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.46,y:0.52,z:1,r:0},to:{x:0.5,y:0.52,z:1.14,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.66],h:0.98,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.6}
        ],
        props:[
          {k:"holo",t0:0.4,t1:4.6,shape:"sigil",at:[0.72,0.48],scale:1.05,col:"#d9b45a",a:0.95}
        ],
        fx:[
          {k:"pulse",t0:0,t1:4.6,col:"#d9b45a",a:0.3,x:0.72,y:0.48},
          {k:"dust",t0:0,t1:4.6,col:"#d9b45a",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:4.6,a:0.75}
        ],
        lines:[],
        sfx:[
          {t:0.5,name:"heartbeat"},
          {t:2,name:"heartbeat"}
        ],
        music:{cue:"dread"},
        trans:{in:"cut",out:"fade",len:1.2}
      }
    ]
  },

  /* m03_brief: Question: what is at the centre of the map? We must like Brio before we lose him; the Marshal trusts the wrong man for a reason he has never spoken. Button: the Keeper tells us what he never said. */
  m03_brief:{
    id:"m03_brief",kind:"briefing",title:"The Axis",music:"mystery",letterbox:true,seed:107,
    scenes:[
      {id:"survey",dur:7.5,
        bg:{k:"map",focus:[0.5,0.5],faction:"neutral",marks:[{x:0.5,y:0.5,k:"objective"},{x:0.412,y:0.49,k:"danger"},{x:0.444,y:0.29,k:"danger"},{x:0.488,y:0.366,k:"danger"},{x:0.512,y:0.634,k:"danger"},{x:0.436,y:0.748,k:"friendly"},{x:0.376,y:0.786,k:"friendly"}]},
        cam:{from:{x:0.5,y:0.52,z:1,r:0},to:{x:0.5,y:0.5,z:1.5,r:0},ease:"inout"},
        actors:[],
        props:[],
        fx:[
          {k:"scan",t0:0,t1:7.5,a:0.25},
          {k:"dust",t0:0,t1:7.5,col:"#d9cdf2",a:0.3,n:0.5},
          {k:"vignette",t0:0,t1:7.5,a:0.5}
        ],
        lines:[
          {who:"narrator",text:"The Guild had surveyed the Basin for twenty years and found one place every line bent toward.",t:1.4,dur:5.3,style:"narration"}
        ],
        sfx:[
          {t:0.3,name:"click"}
        ],
        title:{text:"THE AXIS",sub:"Day 4",t0:0.3,t1:4.3},
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"ring",dur:5.3,
        bg:{k:"hall",style:"meridian",light:"warm"},
        cam:{from:{x:0.46,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.55,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.64],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:5.3},
          {id:"brio",char:"brio",at:[0.72,0.64],h:0.84,face:"l",expr:"smile",mode:"bust",t0:0,t1:5.3}
        ],
        props:[
          {k:"holo",t0:0.2,t1:5.3,shape:"map",at:[0.5,0.7],scale:1},
          {k:"beacon",t0:0,t1:5.3,at:[0.9,0.78],scale:0.34,col:"#ffb060",z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:5.3,col:"#ffd9a0",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:5.3,a:0.45}
        ],
        lines:[
          {who:"brio",text:"Technically it's a ring. Practically it's a very large door.",t:1,dur:3.5,style:"normal",expr:"smile"}
        ],
        sfx:[
          {t:0.2,name:"whoosh"}
        ]
      },
      {id:"who",dur:9.1,
        bg:{k:"hall",style:"meridian",light:"warm"},
        cam:{from:{x:0.54,y:0.56,z:1.18,r:0},to:{x:0.6,y:0.56,z:1.3,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.24,0.64],h:0.86,face:"r",expr:"determined",mode:"bust",t0:0,t1:9.1},
          {id:"brio",char:"brio",at:[0.7,0.64],h:0.94,face:"l",expr:"laugh",mode:"bust",t0:0,t1:9.1}
        ],
        props:[
          {k:"holo",t0:0,t1:9.1,shape:"map",at:[0.47,0.74],scale:0.8,z:-1,a:0.8},
          {k:"beacon",t0:0,t1:9.1,at:[0.92,0.8],scale:0.34,col:"#ffb060",z:-1}
        ],
        fx:[
          {k:"dust",t0:0,t1:9.1,col:"#ffd9a0",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:9.1,a:0.45}
        ],
        lines:[
          {who:"idris",text:"Who built it?",t:0.4,dur:1.2,style:"normal",expr:"determined"},
          {who:"brio",text:"Nobody signs a door. (I can tell you who's been using it, though.)",t:2,dur:3.8,style:"normal",expr:"smirk"},
          {who:"brio",text:"Give me five camps and a day.",t:6.3,dur:1.9,style:"normal",expr:"determined"}
        ],
        sfx:[]
      },
      {id:"trim",dur:5.5,
        bg:{k:"hall",style:"meridian",light:"warm"},
        cam:{from:{x:0.56,y:0.58,z:1.1,r:0},to:{x:0.64,y:0.6,z:1.38,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.24,0.64],h:0.84,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.5},
          {id:"marr",char:"marr",at:[0.68,0.64],h:0.96,face:"l",expr:"neutral",mode:"bust",t0:0,t1:5.5}
        ],
        props:[],
        fx:[
          {k:"flare",t0:1.6,t1:3.2,x:0.72,y:0.8,col:"#ff7a62",a:0.55,r:0.5},
          {k:"dust",t0:0,t1:5.5,col:"#ffd9a0",a:0.3,n:0.4},
          {k:"vignette",t0:0,t1:5.5,a:0.5}
        ],
        lines:[
          {who:"marr",text:"I will hold the forward hub and keep the lamps lit, Marshal.",t:0.7,dur:3.6,style:"normal",expr:"neutral"}
        ],
        sfx:[
          {t:4.3,name:"heartbeat"}
        ]
      },
      {id:"trust",dur:7.3,
        bg:{k:"hall",style:"meridian",light:"warm"},
        cam:{from:{x:0.52,y:0.58,z:1.25,r:0},to:{x:0.5,y:0.56,z:1.05,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.64],h:0.9,face:"r",expr:"weary",mode:"silhouette",t0:0,t1:7.3},
          {id:"marr",char:"marr",at:[0.72,0.64],h:0.9,face:"l",expr:"neutral",mode:"silhouette",t0:0,t1:7.3}
        ],
        props:[],
        fx:[
          {k:"dust",t0:0,t1:7.3,col:"#ffd9a0",a:0.25,n:0.4},
          {k:"vignette",t0:0,t1:7.3,a:0.6}
        ],
        lines:[
          {who:"idris",text:"I trust you, Lucan.",t:1.5,dur:1.4,style:"normal",expr:"weary"},
          {who:"narrator",text:"The Marshal trusted him, and had never said why.",t:3.5,dur:2.9,style:"narration"}
        ],
        sfx:[],
        music:{cue:"tension"},
        trans:{in:"cut",out:"fade",len:1}
      }
    ]
  },

  /* m03_win: Question: what did Brio find? The Founders' sentence, a bearing, and a beacon that goes dark just as the Tower does. Button: a violet column where the Tower stood. */
  m03_win:{
    id:"m03_win",kind:"debrief",title:"Bearing Three-One-Zero",music:"tragedy",letterbox:true,seed:108,
    scenes:[
      {id:"ring",dur:5.8,
        bg:{k:"ruins",biome:"crystal",time:"dusk"},
        cam:{from:{x:0.5,y:0.44,z:1,r:0},to:{x:0.5,y:0.56,z:1.36,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"crystal",t0:0,t1:5.8,at:[0.735,0.64],scale:0.69,z:0},
          {k:"crystal",t0:0,t1:5.8,at:[0.633,0.703],scale:0.75,z:0},
          {k:"crystal",t0:0,t1:5.8,at:[0.452,0.718],scale:0.77,z:0},
          {k:"crystal",t0:0,t1:5.8,at:[0.3,0.675],scale:0.72,z:0},
          {k:"crystal",t0:0,t1:5.8,at:[0.265,0.6],scale:0.64,z:-1},
          {k:"crystal",t0:0,t1:5.8,at:[0.367,0.537],scale:0.58,z:-1},
          {k:"crystal",t0:0,t1:5.8,at:[0.548,0.522],scale:0.56,z:-1},
          {k:"crystal",t0:0,t1:5.8,at:[0.7,0.565],scale:0.61,z:-1},
          {k:"beacon",t0:0,t1:5.8,at:[0.5,0.64],scale:1.3,col:"#ffb060"}
        ],
        fx:[
          {k:"smoke",t0:0,t1:5.8,a:0.5},
          {k:"embers",t0:0,t1:5.8,a:0.5,col:"#ffb060"},
          {k:"heat",t0:0,t1:5.8,a:0.3},
          {k:"vignette",t0:0,t1:5.8,a:0.55}
        ],
        lines:[
          {who:"narrator",text:"Brio Tarn asked for five camps and a day. He was given the camps.",t:1.1,dur:3.8,style:"narration"}
        ],
        sfx:[
          {t:0.2,name:"wind"},
          {t:0.6,name:"rumble"}
        ],
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"log",dur:12.2,
        bg:{k:"ruins",biome:"crystal",time:"dusk"},
        cam:{from:{x:0.5,y:0.54,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.66],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:12.2},
          {id:"brio",char:"brio",at:[0.74,0.58],h:0.82,face:"l",expr:"determined",mode:"hologram",t0:0,t1:10.7}
        ],
        props:[
          {k:"beacon",t0:0,t1:10.7,at:[0.5,0.72],scale:1.1,col:"#ffb060"},
          {k:"beacon",t0:10.7,t1:12.2,at:[0.5,0.72],scale:1.1,col:"#2d2b30",a:0.9}
        ],
        fx:[
          {k:"smoke",t0:0,t1:12.2,a:0.4},
          {k:"embers",t0:0,t1:10.7,a:0.4,col:"#ffb060"},
          {k:"scan",t0:0,t1:10.7,a:0.3},
          {k:"glitch",t0:10.6,t1:11},
          {k:"vignette",t0:0,t1:12.2,a:0.55}
        ],
        lines:[
          {who:"brio",text:"Whoever bears the Key and has spent the Lantern may pay the Lantern once.",t:0.8,dur:4.2,style:"radio",expr:"determined"},
          {who:"idris",text:"Once.",t:5.5,dur:1.2,style:"normal",expr:"weary"},
          {who:"brio",text:"Tell the Seer. Bearing three-one-zero. She'll know.",t:7.4,dur:3,style:"radio",expr:"smile"}
        ],
        sfx:[
          {t:0.3,name:"comms"},
          {t:10.7,name:"powerdown"}
        ]
      },
      {id:"band",dur:3.4,
        bg:{k:"ruins",biome:"crystal",time:"dusk"},
        cam:{from:{x:0.46,y:0.56,z:1.22,r:0},to:{x:0.5,y:0.56,z:1.34,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.66],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0,t1:3.4},
          {id:"marr",char:"marr",at:[0.74,0.58],h:0.82,face:"l",expr:"cold",mode:"hologram",t0:0,t1:2.6}
        ],
        props:[],
        fx:[
          {k:"smoke",t0:0,t1:3.4,a:0.35},
          {k:"scan",t0:0,t1:2.6,a:0.3},
          {k:"glitch",t0:2.5,t1:2.9},
          {k:"vignette",t0:0,t1:3.4,a:0.6}
        ],
        lines:[
          {who:"marr",text:"Count me, Marshal.",t:0.6,dur:1.3,style:"radio",expr:"cold"}
        ],
        sfx:[
          {t:0.3,name:"comms"},
          {t:2.5,name:"static"}
        ]
      },
      {id:"column",dur:5.6,
        bg:{k:"battlefield",biome:"ash",time:"dusk",intensity:0.7,sides:["meridian","obsidian"]},
        cam:{from:{x:0.32,y:0.56,z:1,r:0},to:{x:0.34,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.74,0.66],h:1,face:"l",expr:"weary",mode:"silhouette",t0:0,t1:5.6}
        ],
        props:[],
        fx:[
          {k:"beam",t0:0,t1:5.6,x:0.3,y:0.8,to:[0.3,0.05],col:"#b79cff",a:0.85},
          {k:"embers",t0:0,t1:5.6,col:"#b79cff",a:0.7,dir:-1.57,n:1.2},
          {k:"rings",t0:0,t1:5.6,x:0.3,y:0.78,col:"#b79cff",a:0.5},
          {k:"smoke",t0:0,t1:5.6,a:0.35},
          {k:"vignette",t0:0,t1:5.6,a:0.65}
        ],
        lines:[
          {who:"overseer",text:"LAMP TOWER LOST. KEEPERS 38.",t:2,dur:1.8,style:"radio"}
        ],
        sfx:[
          {t:0.1,name:"thunder"},
          {t:0.4,name:"rumble"}
        ],
        trans:{in:"flash",out:"fade",len:1.2}
      }
    ]
  },

  /* i03: Question: who pays for a courtesy? Marr hands over seven years, the Tower falls with its keepers, Thane signs the relief, and forty riflemen will not go home. Button: an unlit lamp. */
  i03:{
    id:"i03",kind:"interlude",title:"The Key Passes",music:"betrayal",letterbox:true,seed:109,
    scenes:[
      {id:"case",dur:7.7,
        bg:{k:"hall",style:"obsidian",light:"blood"},
        cam:{from:{x:0.5,y:0.5,z:1,r:0},to:{x:0.5,y:0.5,z:1,r:0},ease:"lin"},
        actors:[
          {id:"marr",char:"marr",at:[0.26,0.66],h:0.9,face:"r",expr:"neutral",mode:"bust",t0:0,t1:7.7},
          {id:"ostrander",char:"ostrander",at:[0.72,0.58],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:7.7}
        ],
        props:[
          {k:"holo",t0:0,t1:7.7,shape:"ring",at:[0.72,0.47],scale:1.8,col:"#f6c04a",z:-1},
          {k:"holo",t0:0.5,t1:7.7,shape:"sigil",at:[0.5,0.66],scale:0.7,col:"#d9b45a",a:0.9}
        ],
        fx:[
          {k:"scan",t0:0,t1:7.7,a:0.2},
          {k:"pulse",t0:0,t1:7.7,col:"#f6c04a",a:0.22,x:0.72,y:0.47},
          {k:"dust",t0:0,t1:7.7,col:"#ff6a5a",a:0.3,n:0.5},
          {k:"vignette",t0:0,t1:7.7,a:0.7}
        ],
        lines:[
          {who:"marr",text:"Every one the Marshal ever signed. And Lamp Night's.",t:0.8,dur:3.1,style:"normal",expr:"neutral"},
          {who:"ostrander",text:"Thank you, Lucan. What did it cost you?",t:4.5,dur:2.4,style:"radio",expr:"neutral"}
        ],
        sfx:[
          {t:0.3,name:"door"},
          {t:0.9,name:"click"}
        ],
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"cost",dur:6.3,
        bg:{k:"hall",style:"obsidian",light:"blood"},
        cam:{from:{x:0.5,y:0.5,z:1,r:0},to:{x:0.5,y:0.5,z:1,r:0},ease:"lin"},
        actors:[
          {id:"marr",char:"marr",at:[0.27,0.68],h:1,face:"r",expr:"cold",mode:"bust",t0:0,t1:6.3},
          {id:"ostrander",char:"ostrander",at:[0.72,0.58],h:1.05,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:6.3}
        ],
        props:[
          {k:"holo",t0:0,t1:6.3,shape:"ring",at:[0.72,0.45],scale:1.9,col:"#f6c04a",z:-1}
        ],
        fx:[
          {k:"scan",t0:0,t1:6.3,a:0.2},
          {k:"pulse",t0:0,t1:6.3,col:"#f6c04a",a:0.22,x:0.72,y:0.45},
          {k:"dust",t0:0,t1:6.3,col:"#ff6a5a",a:0.3,n:0.5},
          {k:"vignette",t0:0,t1:6.3,a:0.75}
        ],
        lines:[
          {who:"marr",text:"Seven years of saying 'Yes, Marshal.'",t:0.5,dur:2.3,style:"normal",expr:"cold"},
          {who:"ostrander",text:"Then it will be well spent.",t:3.6,dur:1.8,style:"radio",expr:"neutral"}
        ],
        sfx:[
          {t:0.1,name:"stinger"}
        ],
        music:{cue:"villain"}
      },
      {id:"array",dur:3,
        bg:{k:"array",state:"firing",planet:"violet"},
        cam:{from:{x:0.5,y:0.62,z:1,r:0},to:{x:0.5,y:0.46,z:1.26,r:0},ease:"in"},
        actors:[],
        props:[],
        fx:[
          {k:"beam",t0:0.7,t1:3,col:"#b79cff",a:0.9},
          {k:"pulse",t0:0.7,t1:3,col:"#b79cff",a:0.6},
          {k:"flare",t0:0.9,t1:2.4,x:0.5,y:0.5,col:"#d9cdf2",a:0.6},
          {k:"stars",t0:0,t1:3,a:0.6}
        ],
        lines:[],
        sfx:[
          {t:0.5,name:"laser"},
          {t:1,name:"rumble"}
        ],
        trans:{in:"glitch",out:"cut",len:0.5}
      },
      {id:"hit",dur:2.4,
        bg:{k:"base",faction:"meridian",time:"night",state:"siege"},
        cam:{from:{x:0.5,y:0.6,z:1,r:0},to:{x:0.5,y:0.52,z:1.18,r:0},ease:"out"},
        actors:[],
        props:[],
        fx:[
          {k:"beam",t0:0,t1:2.4,x:0.5,y:0.8,to:[0.5,0.02],col:"#b79cff",a:0.95},
          {k:"rings",t0:0,t1:2.4,x:0.5,y:0.78,col:"#b79cff",a:0.5},
          {k:"embers",t0:0,t1:2.4,col:"#b79cff",a:0.7,dir:-1.57,n:1.3},
          {k:"shake",t0:0,t1:1.8,a:0.5},
          {k:"smoke",t0:0,t1:2.4,a:0.4},
          {k:"vignette",t0:0,t1:2.4,a:0.6}
        ],
        lines:[],
        sfx:[
          {t:0.1,name:"boom"},
          {t:0.5,name:"rumble"}
        ],
        music:{cue:"sting_reveal"},
        trans:{in:"flash",out:"cut",len:0.4}
      },
      {id:"tower",dur:4.6,
        bg:{k:"base",faction:"meridian",time:"night",state:"ruined"},
        cam:{from:{x:0.5,y:0.56,z:1.08,r:0},to:{x:0.5,y:0.48,z:1.3,r:0},ease:"out"},
        actors:[],
        props:[],
        fx:[
          {k:"beam",t0:0,t1:4.6,x:0.5,y:0.8,to:[0.5,0.02],col:"#b79cff",a:0.6},
          {k:"embers",t0:0,t1:4.6,col:"#b79cff",a:0.7,dir:-1.57,n:1.3},
          {k:"smoke",t0:0,t1:4.6,a:0.5},
          {k:"vignette",t0:0,t1:4.6,a:0.65}
        ],
        lines:[
          {who:"narrator",text:"Thirty-eight keepers were on the Tower stair.",t:0.9,dur:2.7,style:"narration"}
        ],
        sfx:[
          {t:0.2,name:"wind"}
        ]
      },
      {id:"forum",dur:10.3,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.5,y:0.54,z:1.05,r:0},to:{x:0.46,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.66],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:10.3},
          {id:"thane",char:"thane",at:[0.72,0.64],h:0.88,face:"l",expr:"weary",mode:"bust",t0:0,t1:10.3}
        ],
        props:[
          {k:"holo",t0:0,t1:10.3,shape:"crown",at:[0.5,0.28],scale:0.5,col:"#a6ceff",a:0.6,z:-1}
        ],
        fx:[
          {k:"flare",t0:6.6,t1:7.6,x:0.62,y:0.8,col:"#a6ceff",a:0.4,r:0.4},
          {k:"flare",t0:8.7,t1:10.1,x:0.3,y:0.74,col:"#e6c06a",a:0.5,r:0.4},
          {k:"vignette",t0:0,t1:10.3,a:0.5}
        ],
        lines:[
          {who:"thane",text:"Marshal... the Tower, regrettably... and in the circumstances, the Council is minded to relieve you.",t:0.5,dur:5.6,style:"normal",expr:"weary"},
          {who:"thane",text:"Prudent.",t:6.6,dur:1.2,style:"normal",expr:"cold"},
          {who:"idris",text:"Noted, Speaker.",t:8.3,dur:1.2,style:"normal",expr:"determined"}
        ],
        sfx:[
          {t:6.6,name:"click"}
        ],
        music:{cue:"tragedy"},
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"yard",dur:4.9,
        bg:{k:"base",faction:"meridian",time:"night",state:"calm"},
        cam:{from:{x:0.4,y:0.6,z:1,r:0},to:{x:0.6,y:0.62,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.24,0.66],h:0.94,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.9}
        ],
        props:[
          {k:"crowd",t0:0,t1:4.9,faction:"meridian",at:[0.68,0.76],scale:3.2},
          {k:"unit",t0:0,t1:4.9,type:"rifleman",faction:"meridian",at:[0.5,0.82],scale:0.9},
          {k:"unit",t0:0,t1:4.9,type:"rifleman",faction:"meridian",at:[0.64,0.86],scale:0.9},
          {k:"unit",t0:0,t1:4.9,type:"rifleman",faction:"meridian",at:[0.78,0.82],scale:0.9},
          {k:"unit",t0:0,t1:4.9,type:"rifleman",faction:"meridian",at:[0.9,0.86],scale:0.9},
          {k:"beacon",t0:0,t1:4.9,at:[0.42,0.64],scale:0.4,col:"#ffcf80"},
          {k:"beacon",t0:0,t1:4.9,at:[0.9,0.62],scale:0.4,col:"#ffcf80"}
        ],
        fx:[
          {k:"dust",t0:0,t1:4.9,col:"#ffcf80",a:0.4,n:0.6},
          {k:"vignette",t0:0,t1:4.9,a:0.6}
        ],
        lines:[
          {who:"idris",text:"I count forty. Go home.",t:1.2,dur:1.6,style:"normal",expr:"weary"}
        ],
        sfx:[
          {t:0.2,name:"wind"}
        ]
      },
      {id:"room",dur:5.2,
        bg:{k:"void",tint:"#10131c",glow:0.12},
        cam:{from:{x:0.46,y:0.55,z:1,r:0},to:{x:0.6,y:0.62,z:1.35,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.66],h:0.96,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.2}
        ],
        props:[
          {k:"beacon",t0:0,t1:5.2,at:[0.7,0.72],scale:0.8,col:"#2d2b30",a:0.95}
        ],
        fx:[
          {k:"dust",t0:0,t1:5.2,col:"#d9cdf2",a:0.2,n:0.3},
          {k:"vignette",t0:0,t1:5.2,a:0.8}
        ],
        lines:[
          {who:"narrator",text:"He told no one about the white in his hair.",t:1,dur:2.6,style:"narration"}
        ],
        sfx:[],
        trans:{in:"fade",out:"fade",len:1.4}
      }
    ]
  }
});
