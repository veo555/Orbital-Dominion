/* =========================================================================
   STORY (3/n) - ACT III CINEMATICS (owner: act3). Briefings, debriefs and interludes of M7-M9:
   m07_brief, m07_win, i07, m08_brief, m08_win, i08, m09_brief, m09_win, and the ending (128 s).
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions; double-quoted JS strings, single quotes inside text.
   Contract: docs/CINEMATIC_SPEC.md (scene shape), src/js/43_vocab.js (ids), docs/story/BIBLE.md (voices, chronology, numbers).
   Staging: speakers are busts facing each other (x ~.28 'r' vs ~.72 'l'); comms are hologram actors with style 'radio';
   Ostrander is never a bust before the ending: hologram, silhouette or shadow under the gold ring, on a locked camera;
   the Overseer is a radio chip with no actor; Lyra is a silhouette wherever her glow-eye would show;
   narration is who:'narrator' and Ione is first seen in the ending. Music changes sit on scene starts; no line starts within 0.5 s of one.
   Numbers: 6,067 living; 2,933 dead (2,714 Draw + 212 + 7); Fenna Sallow 8,941; Cradle 4,112; Linnet 2,002; Teodor 2,001.
   ========================================================================= */
Object.assign(STORY.cine,{

  /* m07_brief: Question: will the Marshal give up the Key, and can he ask anyone for anything? He refuses custody, then asks the Seer for the first time. Turn: she commits everything and gives the Roll away free. Button: 'I do it free. Every name.' */
  m07_brief:{
    id:"m07_brief",kind:"briefing",title:"The Choir Spire",music:"march",letterbox:true,seed:701,
    scenes:[
      {id:"forum",dur:6.0,
        bg:{k:"hall",style:"meridian",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.12,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"banner",t0:0,t1:6.0,faction:"meridian",at:[0.1,0.5],scale:1.8,z:-1},
          {k:"banner",t0:0,t1:6.0,faction:"meridian",at:[0.9,0.5],scale:1.8,z:-1}
        ],
        fx:[{k:"dust",t0:0,t1:6.0,a:0.25,col:"#c8d8f0"},{k:"vignette",t0:0,t1:6.0,a:0.5}],
        lines:[
          {who:"narrator",text:"The Marshal had obeyed every order he was ever given, and had never once asked anyone for anything.",t:0.3,dur:5.6,style:"narration"}
        ],
        sfx:[{t:0.2,name:"wind"}],
        title:{text:"THE CHOIR SPIRE",sub:"Day 8, Brasswatch Heights",t0:0.2,t1:2.6},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"steps",dur:7.9,
        bg:{k:"base",faction:"meridian",time:"day",state:"calm"},
        cam:{from:{x:0.46,y:0.62,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.6],h:0.86,face:"r",expr:"determined",mode:"bust",t0:0,t1:7.9},
          {id:"thane",char:"thane",at:[0.72,0.56],h:0.8,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:7.9}
        ],
        props:[{k:"holo",t0:0,t1:7.9,shape:"crown",at:[0.74,0.22],scale:0.42,col:"#a6ceff",a:0.5,z:-1}],
        fx:[{k:"scan",t0:0,t1:7.9,a:0.12},{k:"vignette",t0:0,t1:7.9,a:0.5}],
        lines:[
          {who:"thane",text:"Marshal. The Council takes custody of the Key. Prudently.",t:0.3,dur:3.3,style:"radio",expr:"neutral"},
          {who:"idris",text:"I will give it up the day you read the Roll aloud in this hall.",t:4.0,dur:3.8,style:"normal",expr:"determined"}
        ],
        sfx:[{t:0.1,name:"static"}],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"notprudent",dur:5.8,
        bg:{k:"base",faction:"meridian",time:"day",state:"calm"},
        cam:{from:{x:0.5,y:0.58,z:1.2,r:0},to:{x:0.42,y:0.56,z:1.36,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.6],h:0.9,face:"r",expr:"cold",mode:"bust",t0:0,t1:5.8},
          {id:"thane",char:"thane",at:[0.72,0.56],h:0.8,face:"l",expr:"weary",mode:"hologram",t0:0,t1:5.8}
        ],
        props:[{k:"holo",t0:0,t1:5.8,shape:"crown",at:[0.74,0.22],scale:0.42,col:"#a6ceff",a:0.5,z:-1}],
        fx:[{k:"scan",t0:0,t1:5.8,a:0.12},{k:"vignette",t0:0,t1:5.8,a:0.55}],
        lines:[
          {who:"thane",text:"Marshal, that is not... in the circumstances, it is not prudent.",t:0.3,dur:3.7,style:"radio",expr:"weary"},
          {who:"idris",text:"No.",t:4.4,dur:1.3,style:"normal",expr:"cold"}
        ],
        sfx:[{t:0.1,name:"static"}],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"outside",dur:12.3,
        bg:{k:"surface",biome:"ash",time:"dusk",features:["hub","towers"]},
        cam:{from:{x:0.44,y:0.62,z:1.0,r:0},to:{x:0.56,y:0.58,z:1.18,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.16,0.64],h:0.84,face:"r",expr:"neutral",mode:"bust",t0:0,t1:12.3,move:{to:[0.3,0.64],ease:"out"}},
          {id:"lyra",char:"lyra",at:[0.74,0.6],h:0.84,face:"l",expr:"smirk",mode:"bust",t0:0,t1:12.3}
        ],
        props:[
          {k:"ship",cls:"carrier",faction:"aurora",at:[0.8,0.1],scale:1.1,t0:0,t1:12.3,z:-1},
          {k:"ship",cls:"frigate",faction:"aurora",from:[1.1,0.2],to:[0.6,0.14],scale:0.8,t0:0,t1:6,ease:"out"},
          {k:"building",type:"airfield",faction:"meridian",at:[0.42,0.84],scale:1.0,t0:0,t1:12.3}
        ],
        fx:[{k:"dust",t0:0,t1:12.3,a:0.3,col:"#ffb070"},{k:"embers",t0:0,t1:12.3,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:12.3,a:0.5}],
        lines:[
          {who:"idris",text:"I need the Spire taken, and I cannot take it alone. Will you?",t:1.9,dur:3.7,style:"normal",expr:"determined"},
          {who:"lyra",text:"I have a fleet and no army, which I'm told is just a very expensive parade. That's a price. You come back.",t:6.0,dur:6.1,style:"normal",expr:"smirk"}
        ],
        sfx:[{t:0.2,name:"engine"}],
        trans:{in:"fade",out:"cut",len:0.5}
      },
      {id:"number",dur:7.9,
        bg:{k:"map",focus:[0.5,0.5],marks:[{x:0.148,y:0.841,k:"friendly"},{x:0.5,y:0.5,k:"objective"},{x:0.852,y:0.159,k:"enemy"}],faction:"meridian"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.14,r:0},ease:"lin"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.62],h:0.8,face:"r",expr:"neutral",mode:"bust",t0:0,t1:7.9},
          {id:"lyra",char:"lyra",at:[0.74,0.6],h:0.84,face:"l",expr:"determined",mode:"bust",t0:0,t1:7.9}
        ],
        fx:[{k:"rings",t0:3.5,t1:7.9,a:0.4,col:"#7fc4ff",x:0.5,y:0.5},{k:"vignette",t0:0,t1:7.9,a:0.45}],
        lines:[
          {who:"idris",text:"Brio Tarn left you a number. Three-one-zero.",t:0.3,dur:2.8,style:"normal",expr:"neutral"},
          {who:"lyra",text:"He was right.",t:3.5,dur:1.3,style:"normal",expr:"determined"},
          {who:"lyra",text:"If I do this, I do it free. Every name.",t:5.2,dur:2.5,style:"normal",expr:"determined"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  },

  /* m07_win: Question: will the Marshal say the name aloud? He says Joren's, with the date, and when asked, Brio's too. Turn: Marr gets his witness and it does not cover the second. Button: 'Parley. She is asking.' */
  m07_win:{
    id:"m07_win",kind:"debrief",title:"The Spire Falls",music:"betrayal",letterbox:true,seed:702,
    scenes:[
      {id:"smoke",dur:11.9,
        bg:{k:"battlefield",biome:"ash",time:"night",intensity:0.6,sides:["obsidian","meridian"]},
        cam:{from:{x:0.4,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.52,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:11.9},
          {id:"marr",char:"marr",at:[0.7,0.6],h:0.9,face:"l",expr:"cold",mode:"bust",t0:1.0,t1:11.9}
        ],
        props:[
          {k:"building",type:"generator",faction:"obsidian",at:[0.66,0.44],scale:0.9,t0:0,t1:11.9,z:-1},
          {k:"building",type:"generator",faction:"obsidian",at:[0.86,0.52],scale:0.9,t0:0,t1:11.9,z:-1},
          {k:"building",type:"hub",faction:"obsidian",at:[0.78,0.74],scale:1.1,t0:0,t1:11.9}
        ],
        fx:[{k:"smoke",t0:0,t1:4.0,a:0.6},{k:"embers",t0:0,t1:11.9,a:0.4,col:"#ff7a5a"},{k:"vignette",t0:0,t1:11.9,a:0.55}],
        lines:[
          {who:"marr",text:"You never said it, Marshal. Not once.",t:1.0,dur:2.3,style:"normal",expr:"cold"},
          {who:"idris",text:"Joren Marr. Karst Pass, the ninth of Thaw, Year twenty-two. Eleven men.",t:3.7,dur:4.1,style:"normal",expr:"weary"},
          {who:"idris",text:"I wrote it inside the Key's case. I read it every Lamp Night.",t:8.2,dur:3.6,style:"normal",expr:"weary"}
        ],
        sfx:[{t:0.2,name:"rumble"},{t:1.0,name:"wind"}],
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"who",dur:3.9,
        bg:{k:"battlefield",biome:"ash",time:"night",intensity:0.6,sides:["obsidian","meridian"]},
        cam:{from:{x:0.5,y:0.52,z:1.2,r:0},to:{x:0.5,y:0.52,z:1.26,r:0},ease:"lin"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:3.9},
          {id:"marr",char:"marr",at:[0.7,0.6],h:0.9,face:"l",expr:"cold",mode:"bust",t0:0,t1:3.9}
        ],
        props:[
          {k:"building",type:"generator",faction:"obsidian",at:[0.66,0.44],scale:0.9,t0:0,t1:3.9,z:-1},
          {k:"building",type:"hub",faction:"obsidian",at:[0.78,0.74],scale:1.1,t0:0,t1:3.9}
        ],
        fx:[{k:"embers",t0:0,t1:3.9,a:0.4,col:"#ff7a5a"},{k:"vignette",t0:0,t1:3.9,a:0.55}],
        lines:[
          {who:"idris",text:"Who else, Lucan?",t:0.3,dur:1.5,style:"normal",expr:"weary"},
          {who:"marr",text:"Say it yourself.",t:2.2,dur:1.5,style:"normal",expr:"cold"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"brio",dur:3.8,
        bg:{k:"battlefield",biome:"ash",time:"night",intensity:0.6,sides:["obsidian","meridian"]},
        cam:{from:{x:0.5,y:0.52,z:1.26,r:0},to:{x:0.6,y:0.5,z:1.5,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.9,face:"r",expr:"cold",mode:"bust",t0:0,t1:3.8},
          {id:"marr",char:"marr",at:[0.7,0.6],h:0.9,face:"l",expr:"shock",mode:"bust",t0:0,t1:3.8,move:{to:[0.76,0.6],ease:"out"}}
        ],
        props:[
          {k:"building",type:"generator",faction:"obsidian",at:[0.66,0.44],scale:0.9,t0:0,t1:3.8,z:-1},
          {k:"building",type:"hub",faction:"obsidian",at:[0.78,0.74],scale:1.1,t0:0,t1:3.8}
        ],
        fx:[{k:"embers",t0:0,t1:3.8,a:0.4,col:"#ff7a5a"},{k:"vignette",t0:0,t1:3.8,a:0.55}],
        lines:[
          {who:"idris",text:"Brio Tarn. You left him on the Axis.",t:0.3,dur:2.5,style:"normal",expr:"cold"}
        ],
        sfx:[{t:2.9,name:"static"}],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"yourself",dur:8.3,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.56,y:0.5,z:1.3,r:0},to:{x:0.5,y:0.52,z:1.18,r:0},ease:"out"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:8.3},
          {id:"marr",char:"marr",at:[0.7,0.6],h:0.9,face:"l",expr:"weary",mode:"bust",t0:0,t1:8.3}
        ],
        props:[{k:"crystal",t0:0,t1:8.3,at:[0.5,0.84],scale:1.0,z:1}],
        fx:[{k:"embers",t0:0,t1:8.3,a:0.3,col:"#ff7a5a"},{k:"vignette",t0:0,t1:8.3,a:0.55}],
        lines:[
          {who:"marr",text:"You said it. It turns out that was all I wanted. It does not cover the second.",t:0.6,dur:4.6,style:"normal",expr:"weary"},
          {who:"marr",text:"She will want you at the Axis. So do I.",t:5.6,dur:2.5,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"fade",len:0.6}
      },
      {id:"tag",dur:2.0,
        bg:{k:"void",tint:"#0d4a40",glow:0.4},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.05,r:0},ease:"lin"},
        actors:[],
        fx:[{k:"stars",t0:0,t1:2.0,a:0.5}],
        lines:[
          {who:"lyra",text:"Parley. She is asking.",t:0.3,dur:1.5,style:"radio",expr:"neutral"}
        ],
        trans:{in:"cut",out:"fade",len:0.6}
      }
    ]
  },

  /* i07: Question: what will the Reckoner say when someone asks her to her face? She offers three true things and then stops. Turn: 'Are you in it?' Button: 'And wrong once.' The hologram holds and says nothing. */
  i07:{
    id:"i07",kind:"interlude",title:"The Offer",music:"villain",letterbox:true,seed:703,
    scenes:[
      {id:"offer",dur:8.9,
        bg:{k:"hall",style:"forbidden",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"ostrander",char:"ostrander",at:[0.72,0.6],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:8.9},
          {id:"idris",char:"idris",at:[0.28,0.62],h:0.9,face:"r",expr:"cold",mode:"bust",t0:0,t1:8.9}
        ],
        props:[{k:"holo",t0:0,t1:8.9,shape:"ring",at:[0.72,0.3],scale:0.55,col:"#ffd070",z:-1}],
        fx:[{k:"scan",t0:0,t1:8.9,a:0.15},{k:"dust",t0:0,t1:8.9,a:0.3,col:"#c8c0d8"},{k:"vignette",t0:0,t1:8.9,a:0.6}],
        lines:[
          {who:"ostrander",text:"Every lamp in your city burns on a sleeper's breath. I want to stop pretending it is oil.",t:0.4,dur:5.2,style:"radio",expr:"neutral"},
          {who:"idris",text:"Then wake them. Do not spend the living.",t:6.0,dur:2.7,style:"normal",expr:"cold"}
        ],
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"bylot",dur:12.5,
        bg:{k:"hall",style:"forbidden",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"ostrander",char:"ostrander",at:[0.72,0.6],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:12.5},
          {id:"idris",char:"idris",at:[0.28,0.62],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:12.5}
        ],
        props:[{k:"holo",t0:0,t1:12.5,shape:"ring",at:[0.72,0.3],scale:0.55,col:"#ffd070",z:-1}],
        fx:[{k:"scan",t0:0,t1:12.5,a:0.15},{k:"dust",t0:0,t1:12.5,a:0.3,col:"#c8c0d8"},{k:"vignette",t0:0,t1:12.5,a:0.6}],
        lines:[
          {who:"ostrander",text:"Someone is always spent, Idris. The Council chose strangers. I choose by lot, in daylight, and I say their names.",t:0.5,dur:6.4,style:"radio",expr:"neutral"},
          {who:"idris",text:"Class Nine is your own people.",t:7.9,dur:2.2,style:"normal",expr:"determined"},
          {who:"ostrander",text:"Then you see I am fair.",t:10.5,dur:1.8,style:"radio",expr:"neutral"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"reveal",dur:5.2,
        bg:{k:"hall",style:"forbidden",light:"blood"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.27,0.62],h:0.9,face:"r",expr:"neutral",mode:"silhouette",t0:0,t1:5.2},
          {id:"ostrander",char:"ostrander",at:[0.72,0.6],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:5.2}
        ],
        props:[{k:"holo",t0:0,t1:5.2,shape:"ring",at:[0.72,0.3],scale:0.55,col:"#ffd070",z:-1}],
        fx:[{k:"pulse",t0:0,t1:5.2,a:0.25,col:"#ffd070",x:0.72,y:0.3},{k:"vignette",t0:0,t1:5.2,a:0.6}],
        lines:[
          {who:"lyra",text:"Are you in it?",t:0.8,dur:1.6,style:"normal",expr:"neutral"},
          {who:"ostrander",text:"Someone must keep the count.",t:2.8,dur:2.2,style:"radio",expr:"neutral"}
        ],
        music:{cue:"sting_evil"},
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"fenna",dur:10.0,
        bg:{k:"hall",style:"forbidden",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.27,0.62],h:0.9,face:"r",expr:"cold",mode:"silhouette",t0:0,t1:10.0},
          {id:"ostrander",char:"ostrander",at:[0.72,0.6],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:10.0}
        ],
        props:[{k:"holo",t0:0,t1:10.0,shape:"ring",at:[0.72,0.3],scale:0.55,col:"#ffd070",z:-1}],
        fx:[{k:"scan",t0:0,t1:10.0,a:0.15},{k:"vignette",t0:0,t1:10.0,a:0.6}],
        lines:[
          {who:"lyra",text:"Fenna Sallow, Cradle 8,941: living. Her granddaughter signed your list because the date was blank.",t:0.6,dur:5.6,style:"normal",expr:"cold"},
          {who:"ostrander",text:"They know now. You saw to that. They are still here.",t:6.6,dur:3.2,style:"radio",expr:"neutral"}
        ],
        music:{cue:"villain"},
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"cannot",dur:11.2,
        bg:{k:"hall",style:"forbidden",light:"cold"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.62],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:11.2},
          {id:"lyra",char:"lyra",at:[0.5,0.72],h:0.75,face:"l",expr:"weary",mode:"silhouette",t0:0,t1:11.2},
          {id:"ostrander",char:"ostrander",at:[0.72,0.6],h:0.95,face:"l",expr:"neutral",mode:"hologram",t0:0,t1:11.2}
        ],
        props:[{k:"holo",t0:0,t1:11.2,shape:"ring",at:[0.72,0.3],scale:0.55,col:"#ffd070",z:-1}],
        fx:[{k:"scan",t0:0,t1:11.2,a:0.15},{k:"vignette",t0:0,t1:11.2,a:0.6}],
        lines:[
          {who:"idris",text:"You cannot buy the dead back with the living. And you are not in your own sum.",t:0.5,dur:4.7,style:"normal",expr:"determined"},
          {who:"lyra",text:"She's right three times.",t:7.2,dur:1.8,style:"normal",expr:"weary"},
          {who:"idris",text:"And wrong once.",t:9.4,dur:1.6,style:"normal",expr:"determined"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  },

  /* m08_brief: Question: what is the load, and who will drive it? Mags names what she hauled in Year 9 and chooses the next load herself. Turn: the Warlord is told to walk behind. Button: Lyra on the band, 'Don't stop.' */
  m08_brief:{
    id:"m08_brief",kind:"briefing",title:"Patience",music:"tension",letterbox:true,seed:704,
    scenes:[
      {id:"rubble",dur:9.0,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.15,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"building",type:"garrison",faction:"meridian",at:[0.82,0.62],scale:0.9,t0:0,t1:9.0,z:-1},
          {k:"beacon",t0:0,t1:9.0,at:[0.5,0.62],scale:0.3,col:"#f5d28a"},
          {k:"crystal",t0:0,t1:9.0,at:[0.3,0.82],scale:0.6,z:1}
        ],
        fx:[{k:"dust",t0:0,t1:9.0,a:0.4,col:"#d8c8a8"},{k:"embers",t0:0,t1:9.0,a:0.3,col:"#ffb070"},{k:"vignette",t0:0,t1:9.0,a:0.55}],
        lines:[
          {who:"narrator",text:"The load was the size of a wheel and the colour of a candle.",t:0.8,dur:3.6,style:"narration"},
          {who:"narrator",text:"For twenty-two years the catalogue had called it function unknown.",t:4.8,dur:3.9,style:"narration"}
        ],
        sfx:[{t:0.1,name:"rumble"}],
        title:{text:"PATIENCE",sub:"Night 8, the Lamp Tower rubble",t0:0.2,t1:2.6},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"wageslips",dur:11.6,
        bg:{k:"base",faction:"meridian",time:"night",state:"ruined"},
        cam:{from:{x:0.42,y:0.6,z:1.2,r:0},to:{x:0.5,y:0.56,z:1.35,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:11.6},
          {id:"dax",char:"dax",at:[0.72,0.64],h:0.88,face:"l",expr:"smirk",mode:"bust",t0:0,t1:11.6}
        ],
        props:[{k:"beacon",t0:0,t1:11.6,at:[0.5,0.7],scale:0.3,col:"#f5d28a"}],
        fx:[{k:"dust",t0:0,t1:11.6,a:0.3,col:"#d8c8a8"},{k:"vignette",t0:0,t1:11.6,a:0.55}],
        lines:[
          {who:"mags",text:"Year nine. Crate nine-seventeen, Class Nine isolation coupling. I signed for it.",t:0.5,dur:4.7,style:"normal",expr:"weary"},
          {who:"mags",text:"I carried it in. I will carry it out.",t:5.6,dur:2.4,style:"normal",expr:"determined"},
          {who:"dax",text:"I don't do causes. I do loads. That's two hours.",t:8.4,dur:3.0,style:"normal",expr:"smirk"}
        ],
        sfx:[{t:0.2,name:"wind"}],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"stair",dur:8.7,
        bg:{k:"surface",biome:"ash",time:"night",features:["wreck","towers"]},
        cam:{from:{x:0.46,y:0.6,z:1.1,r:0},to:{x:0.5,y:0.58,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"kaz",char:"kaz",at:[0.72,0.6],h:0.92,face:"l",expr:"cold",mode:"bust",t0:0.3,t1:8.7},
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:8.7}
        ],
        props:[{k:"ship",cls:"shuttle",faction:"meridian",col:"#e6c35a",at:[0.5,0.42],scale:0.9,t0:0,t1:8.7},{k:"beacon",t0:0,t1:8.7,at:[0.5,0.7],scale:0.26,col:"#f5d28a"}],
        fx:[{k:"embers",t0:0,t1:8.7,a:0.3,col:"#ff7a5a"},{k:"vignette",t0:0,t1:8.7,a:0.55}],
        lines:[
          {who:"kaz",text:"I will walk beside it.",t:0.8,dur:1.6,style:"normal",expr:"cold"},
          {who:"mags",text:"You'll walk behind it. I steer.",t:2.8,dur:2.1,style:"normal",expr:"weary"},
          {who:"mags",text:"She runs hot. Landing's the only well on the road.",t:5.3,dur:3.1,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"landing",dur:5.5,
        bg:{k:"surface",biome:"ash",time:"dusk",features:["hub","cliffs"]},
        cam:{from:{x:0.56,y:0.6,z:1.25,r:0},to:{x:0.5,y:0.58,z:1.1,r:0},ease:"inout"},
        actors:[
          {id:"kaz",char:"kaz",at:[0.72,0.6],h:0.92,face:"l",expr:"cold",mode:"bust",t0:0,t1:5.5},
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.5}
        ],
        props:[{k:"beacon",t0:0,t1:5.5,at:[0.5,0.7],scale:0.26,col:"#f5d28a"}],
        fx:[{k:"dust",t0:0,t1:5.5,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:5.5,a:0.55}],
        lines:[
          {who:"kaz",text:"I know what is at the Landing.",t:0.6,dur:2.0,style:"normal",expr:"cold"},
          {who:"mags",text:"Then you know where the well is.",t:3.0,dur:2.2,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"band",dur:4.6,
        bg:{k:"map",focus:[0.5,0.5],marks:[{x:0.148,y:0.841,k:"friendly"},{x:0.5,y:0.5,k:"objective"},{x:0.16,y:0.57,k:"danger"}],faction:"aurora"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.1,r:0},ease:"lin"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.72,0.5],h:0.8,face:"l",expr:"determined",mode:"hologram",t0:0,t1:4.6}
        ],
        fx:[{k:"rings",t0:0,t1:4.6,a:0.35,col:"#b08cff",x:0.5,y:0.5},{k:"vignette",t0:0,t1:4.6,a:0.5}],
        lines:[
          {who:"lyra",text:"I'm at the Axis, listening to it. Don't stop.",t:1.4,dur:2.9,style:"radio",expr:"determined"}
        ],
        trans:{in:"cut",out:"fade",len:0.6}
      }
    ]
  },

  /* m08_win: Question: has the Coupling arrived? It has seated, and the Axis hums, and the Hunt is voided on the record. Turn: 'Not yet.' Button: 'It's waiting for the Key-bearer.' */
  m08_win:{
    id:"m08_win",kind:"debrief",title:"The Axis Hums",music:"mystery",letterbox:true,seed:705,
    scenes:[
      {id:"seat",dur:7.2,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.62,z:0.9,r:0},to:{x:0.5,y:0.52,z:1.25,r:0},ease:"out"},
        actors:[],
        props:[
          {k:"crystal",t0:0,t1:7.2,at:[0.5,0.78],scale:1.4,z:1},
          {k:"crystal",t0:0,t1:7.2,at:[0.24,0.7],scale:0.8,z:-1},
          {k:"beacon",t0:0.6,t1:7.2,at:[0.5,0.58],scale:0.22,col:"#ffd9a0"}
        ],
        fx:[{k:"rings",t0:2.6,t1:7.2,a:0.6,col:"#b08cff",x:0.5,y:0.6},{k:"vignette",t0:0,t1:7.2,a:0.5}],
        sfx:[{t:0.2,name:"wind"},{t:2.6,name:"chime"}],
        title:{text:"THE AXIS",sub:"Dawn",t0:0.2,t1:2.4},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"oru",dur:4.8,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.56,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.52,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.88,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.8},
          {id:"oru",char:"oru",at:[0.72,0.56],h:0.82,face:"l",expr:"smirk",mode:"hologram",t0:0,t1:4.8}
        ],
        props:[
          {k:"crystal",t0:0,t1:4.8,at:[0.5,0.78],scale:1.4,z:1},
          {k:"beacon",t0:0,t1:4.8,at:[0.5,0.6],scale:0.22,col:"#ffd9a0"}
        ],
        fx:[{k:"rings",t0:0,t1:4.8,a:0.5,col:"#b08cff",x:0.5,y:0.6},{k:"vignette",t0:0,t1:4.8,a:0.5}],
        lines:[
          {who:"oru",text:"Tamsin Oru, for the record. The Hunt was mine to pay for. No charge.",t:0.5,dur:4.0,style:"radio",expr:"smirk"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"waiting",dur:7.6,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.56,z:1.2,r:0},to:{x:0.5,y:0.54,z:1.3,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:7.6},
          {id:"lyra",char:"lyra",at:[0.52,0.6],h:0.72,face:"l",expr:"neutral",mode:"silhouette",t0:0,t1:7.6},
          {id:"kaz",char:"kaz",at:[0.72,0.62],h:0.92,face:"l",expr:"cold",mode:"bust",t0:0,t1:7.6}
        ],
        props:[
          {k:"crystal",t0:0,t1:7.6,at:[0.5,0.78],scale:1.4,z:1},
          {k:"beacon",t0:0,t1:7.6,at:[0.5,0.6],scale:0.22,col:"#ffd9a0"}
        ],
        fx:[{k:"rings",t0:0,t1:7.6,a:0.5,col:"#b08cff",x:0.5,y:0.6},{k:"vignette",t0:0,t1:7.6,a:0.5}],
        lines:[
          {who:"mags",text:"Delivery complete.",t:0.5,dur:1.7,style:"normal",expr:"determined"},
          {who:"kaz",text:"Not yet.",t:2.6,dur:1.5,style:"normal",expr:"cold"},
          {who:"lyra",text:"It's waiting for the Key-bearer.",t:4.5,dur:2.3,style:"normal",expr:"neutral"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  },

  /* i08: Question: will Idris say why it must be him, and will anyone let him go alone? He tells them the Closing and asks for company, the first time. Turn: five people say yes in their own voices. Button: the Key laid down unclipped, and a sixth lamp lit last; the hope cue enters on that scene only. */
  i08:{
    id:"i08",kind:"interlude",title:"The Last Lamp Night",music:"mystery",letterbox:true,seed:706,
    scenes:[
      {id:"lamp",dur:5.6,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.05,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.6}
        ],
        props:[
          {k:"building",type:"garrison",faction:"meridian",at:[0.82,0.6],scale:1.0,t0:0,t1:5.6,z:-1},
          {k:"beacon",t0:2.6,t1:5.6,at:[0.36,0.7],scale:0.12,col:"#ffb347"}
        ],
        fx:[{k:"embers",t0:0,t1:5.6,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:5.6,a:0.6}],
        sfx:[{t:0.1,name:"wind"},{t:2.3,name:"click"}],
        title:{text:"THE LAST LAMP NIGHT",sub:"Brasswatch Heights, Night 8",t0:0.2,t1:3.0},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"closing",dur:11.5,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.2,r:0},to:{x:0.46,y:0.5,z:1.32,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.92,face:"r",expr:"determined",mode:"bust",t0:0,t1:11.5},
          {id:"mags",char:"mags",at:[0.6,0.66],h:0.8,face:"l",expr:"neutral",mode:"silhouette",t0:0.5,t1:11.5},
          {id:"lyra",char:"lyra",at:[0.72,0.6],h:0.84,face:"l",expr:"neutral",mode:"silhouette",t0:0.5,t1:11.5},
          {id:"dax",char:"dax",at:[0.84,0.66],h:0.8,face:"l",expr:"neutral",mode:"silhouette",t0:0.5,t1:11.5},
          {id:"kaz",char:"kaz",at:[0.93,0.6],h:0.9,face:"l",expr:"neutral",mode:"silhouette",t0:0.5,t1:11.5}
        ],
        props:[{k:"beacon",t0:0,t1:11.5,at:[0.36,0.7],scale:0.12,col:"#ffb347"},{k:"building",type:"garrison",faction:"meridian",at:[0.82,0.6],scale:1.0,t0:0,t1:11.5,z:-1}],
        fx:[{k:"embers",t0:0,t1:11.5,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:11.5,a:0.6}],
        lines:[
          {who:"idris",text:"It says: whoever bears the Key and has spent the Lantern may pay the Lantern once.",t:0.5,dur:4.7,style:"normal",expr:"determined"},
          {who:"idris",text:"It wakes everyone who still sleeps. It takes one life. The Key is mine. So is the account.",t:6.1,dur:5.2,style:"normal",expr:"determined"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"pen",dur:9.1,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.2,r:0},to:{x:0.5,y:0.5,z:1.22,r:0},ease:"lin"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.62],h:0.92,face:"r",expr:"cold",mode:"bust",t0:0,t1:9.1},
          {id:"lyra",char:"lyra",at:[0.72,0.6],h:0.9,face:"l",expr:"determined",mode:"bust",t0:0,t1:9.1}
        ],
        props:[{k:"beacon",t0:0,t1:9.1,at:[0.36,0.7],scale:0.12,col:"#ffb347"}],
        fx:[{k:"embers",t0:0,t1:9.1,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:9.1,a:0.6}],
        lines:[
          {who:"idris",text:"Hers was a pen. The Axis wants the Key.",t:0.6,dur:2.5,style:"normal",expr:"cold"},
          {who:"lyra",text:"I tune it. It will want something of mine too.",t:3.5,dur:2.8,style:"normal",expr:"determined"},
          {who:"idris",text:"I am not asking anyone to stop me.",t:6.7,dur:2.2,style:"normal",expr:"cold"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"asking",dur:6.8,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.1,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.28,0.62],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0,t1:6.8},
          {id:"mags",char:"mags",at:[0.56,0.64],h:0.86,face:"l",expr:"determined",mode:"bust",t0:0,t1:6.8},
          {id:"kaz",char:"kaz",at:[0.76,0.6],h:0.92,face:"l",expr:"neutral",mode:"bust",t0:0,t1:6.8}
        ],
        props:[{k:"beacon",t0:0,t1:6.8,at:[0.36,0.7],scale:0.12,col:"#ffb347"}],
        fx:[{k:"embers",t0:0,t1:6.8,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:6.8,a:0.6}],
        lines:[
          {who:"idris",text:"I am asking you not to let me go alone.",t:0.6,dur:2.6,style:"normal",expr:"weary"},
          {who:"mags",text:"I'll drive.",t:3.6,dur:1.3,style:"normal",expr:"determined"},
          {who:"kaz",text:"I'll carry.",t:5.3,dur:1.3,style:"normal",expr:"neutral"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"tune",dur:5.3,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.5,z:1.15,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"lin"},
        actors:[
          {id:"mags",char:"mags",at:[0.36,0.62],h:0.86,face:"r",expr:"weary",mode:"bust",t0:0,t1:5.3},
          {id:"lyra",char:"lyra",at:[0.6,0.6],h:0.9,face:"l",expr:"smirk",mode:"bust",t0:0,t1:5.3},
          {id:"dax",char:"dax",at:[0.8,0.64],h:0.88,face:"l",expr:"cold",mode:"bust",t0:0,t1:5.3}
        ],
        props:[{k:"beacon",t0:0,t1:5.3,at:[0.36,0.7],scale:0.12,col:"#ffb347"}],
        fx:[{k:"embers",t0:0,t1:5.3,a:0.25,col:"#ffb070"},{k:"vignette",t0:0,t1:5.3,a:0.6}],
        lines:[
          {who:"lyra",text:"I'll tune.",t:0.5,dur:1.3,style:"normal",expr:"smirk"},
          {who:"dax",text:"Billable.",t:2.2,dur:1.3,style:"normal",expr:"cold"},
          {who:"mags",text:"No.",t:3.9,dur:1.3,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"hope",dur:5.6,
        bg:{k:"ruins",biome:"ash",time:"night"},
        cam:{from:{x:0.5,y:0.56,z:1.2,r:0},to:{x:0.5,y:0.5,z:1.3,r:0},ease:"out"},
        actors:[
          {id:"idris",char:"idris",at:[0.3,0.62],h:0.92,face:"r",expr:"neutral",mode:"bust",t0:0,t1:5.6},
          {id:"lyra",char:"lyra",at:[0.7,0.6],h:0.84,face:"l",expr:"neutral",mode:"silhouette",t0:0,t1:5.6}
        ],
        props:[
          {k:"beacon",t0:0,t1:5.6,at:[0.36,0.7],scale:0.12,col:"#ffb347"},
          {k:"beacon",t0:0.6,t1:5.6,at:[0.42,0.72],scale:0.06,col:"#e8c46a"},
          {k:"beacon",t0:3.2,t1:5.6,at:[0.6,0.72],scale:0.1,col:"#ffb347"}
        ],
        fx:[{k:"flare",t0:3.2,t1:4.2,x:0.6,y:0.72,col:"#ffb347",a:0.5},{k:"vignette",t0:0,t1:5.6,a:0.5}],
        sfx:[{t:0.6,name:"click"},{t:3.2,name:"chime"}],
        title:{text:"FOR BRIO TARN",sub:"Lit last",t0:3.4,t1:5.4},
        music:{cue:"hope"},
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  },

  /* m09_brief: Question: how does the finale go, and where does the Corps stand? Thane has released it; the Host has read the Roll. Turn: Idris tells the player to hold the line. Button: 'When it is time, I will tell you.' */
  m09_brief:{
    id:"m09_brief",kind:"briefing",title:"The Closing",music:"march",letterbox:true,seed:707,
    scenes:[
      {id:"nine",dur:5.2,
        bg:{k:"bridge",faction:"meridian",alert:true,view:"array"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.1,r:0},ease:"inout"},
        actors:[],
        fx:[{k:"scan",t0:0,t1:5.2,a:0.1},{k:"vignette",t0:0,t1:5.2,a:0.5}],
        lines:[
          {who:"narrator",text:"Nine nights. She had said nine, and she was nothing if not exact.",t:1.0,dur:3.9,style:"narration"}
        ],
        title:{text:"THE CLOSING",sub:"Night 9",t0:0.2,t1:2.6},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"map",dur:9.9,
        bg:{k:"map",focus:[0.5,0.5],marks:[{x:0.148,y:0.841,k:"friendly"},{x:0.455,y:0.591,k:"danger"},{x:0.545,y:0.409,k:"danger"},{x:0.841,y:0.432,k:"danger"},{x:0.5,y:0.5,k:"objective"},{x:0.852,y:0.159,k:"enemy"}],faction:"meridian"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.12,r:0},ease:"lin"},
        actors:[
          {id:"idris",char:"idris",at:[0.26,0.62],h:0.8,face:"r",expr:"determined",mode:"bust",t0:0,t1:9.9}
        ],
        fx:[{k:"vignette",t0:0,t1:9.9,a:0.45}],
        lines:[
          {who:"idris",text:"Three Foci. Hold the Stair. Then the Axis. We take them in that order.",t:0.6,dur:4.2,style:"normal",expr:"determined"},
          {who:"idris",text:"The Corps is mine again. Thane signed it back at dawn. He did not look at me.",t:5.2,dur:4.5,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"host",dur:8.2,
        bg:{k:"battlefield",biome:"ash",time:"dusk",intensity:0.4,sides:["obsidian","meridian"]},
        cam:{from:{x:0.5,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.22,r:0},ease:"inout"},
        actors:[
          {id:"kaz",char:"kaz",at:[0.72,0.6],h:0.92,face:"l",expr:"cold",mode:"bust",t0:0,t1:8.2},
          {id:"mags",char:"mags",at:[0.4,0.66],h:0.86,face:"r",expr:"weary",mode:"bust",t0:0,t1:8.2},
          {id:"lyra",char:"lyra",at:[0.9,0.4],h:0.6,face:"l",expr:"determined",mode:"hologram",t0:0,t1:8.2}
        ],
        props:[
          {k:"unit",type:"reaver",faction:"obsidian",from:[-0.2,0.8],to:[1.2,0.8],scale:1.1,t0:0,t1:8.2,z:1},
          {k:"unit",type:"reaver",faction:"obsidian",from:[-0.3,0.74],to:[1.2,0.74],scale:0.8,t0:0.4,t1:8.2,z:-1},
          {k:"unit",type:"reaver",faction:"obsidian",from:[-0.1,0.86],to:[1.2,0.86],scale:1.5,t0:0.9,t1:8.2,z:1}
        ],
        fx:[{k:"dust",t0:0,t1:8.2,a:0.3,col:"#ffb070"},{k:"vignette",t0:0,t1:8.2,a:0.5}],
        lines:[
          {who:"kaz",text:"The Host joins us. They have read the Roll.",t:2.2,dur:2.7,style:"normal",expr:"cold"},
          {who:"lyra",text:"I'll be at the Axis. Mags stays with you.",t:5.3,dur:2.6,style:"radio",expr:"determined"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"hold",dur:5.6,
        bg:{k:"base",faction:"meridian",time:"dusk",state:"siege"},
        cam:{from:{x:0.5,y:0.52,z:1.05,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.5,0.6],h:1.0,face:"r",expr:"determined",mode:"bust",t0:0,t1:5.6}
        ],
        fx:[{k:"embers",t0:0,t1:5.6,a:0.3,col:"#ff7a5a"},{k:"vignette",t0:0,t1:5.6,a:0.55}],
        lines:[
          {who:"idris",text:"Hold the line. When it is time, I will tell you.",t:0.9,dur:3.0,style:"normal",expr:"determined"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  },

  /* m09_win: Question: will the one life be paid, and by whom? Marr gives Idris his logs and says Joren; Idris puts the Key down and says 'Count me'; the Reckoner does the sum aloud. Button: the Overseer, which cannot class a Hauler. */
  m09_win:{
    id:"m09_win",kind:"debrief",title:"One Life",music:"finale",letterbox:true,seed:708,
    scenes:[
      {id:"bays",dur:7.9,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.6,z:1.2,r:0},to:{x:0.5,y:0.55,z:1.3,r:0},ease:"inout"},
        actors:[
          {id:"marr",char:"marr",at:[0.3,0.62],h:0.92,face:"r",expr:"cold",mode:"bust",t0:0,t1:7.9},
          {id:"idris",char:"idris",at:[0.72,0.62],h:0.9,face:"l",expr:"weary",mode:"bust",t0:0,t1:7.9}
        ],
        props:[{k:"crystal",t0:0,t1:7.9,at:[0.5,0.82],scale:1.2,z:1}],
        fx:[
          {k:"rings",t0:0,t1:7.9,a:0.3,col:"#ffd9a0",x:0.5,y:0.6},
          {k:"dust",t0:1.5,t1:7.9,a:0.6,col:"#c8a8ff",x:0.3,y:0.55},
          {k:"vignette",t0:0,t1:7.9,a:0.5}
        ],
        lines:[
          {who:"marr",text:"The bays, Marshal. Every one. Someone should read them.",t:0.3,dur:3.3,style:"normal",expr:"cold"},
          {who:"idris",text:"I will see that they are read.",t:4.0,dur:2.2,style:"normal",expr:"weary"},
          {who:"marr",text:"Joren.",t:6.6,dur:1.2,style:"normal",expr:"cold"}
        ],
        trans:{in:"fade",out:"cut",len:0.5}
      },
      {id:"count",dur:4.5,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.56,z:1.3,r:0},to:{x:0.5,y:0.52,z:1.4,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.36,0.6],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:4.5},
          {id:"mags",char:"mags",at:[0.66,0.62],h:0.88,face:"l",expr:"weary",mode:"bust",t0:0,t1:4.5}
        ],
        props:[{k:"beacon",t0:0.4,t1:4.5,at:[0.5,0.7],scale:0.07,col:"#ffd27a"}],
        fx:[{k:"rings",t0:0.4,t1:4.5,a:0.5,col:"#ffd9a0",x:0.5,y:0.6},{k:"vignette",t0:0,t1:4.5,a:0.5}],
        lines:[
          {who:"idris",text:"One life. Count me.",t:1.0,dur:1.5,style:"normal",expr:"determined"},
          {who:"mags",text:"Here.",t:2.9,dur:1.4,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"beam",dur:5.0,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.6,z:1.4,r:0},ease:"in"},
        actors:[
          {id:"idris",char:"idris",at:[0.36,0.6],h:0.9,face:"r",expr:"neutral",mode:"bust",t0:0,t1:5.0},
          {id:"mags",char:"mags",at:[0.66,0.62],h:0.88,face:"l",expr:"sad",mode:"bust",t0:0,t1:5.0}
        ],
        props:[{k:"beacon",t0:0,t1:5.0,at:[0.5,0.7],scale:0.07,col:"#ffd27a"}],
        fx:[
          {k:"beam",t0:0.4,t1:4.6,x:0.5,y:0.62,col:"#f4efff",a:0.95},
          {k:"flare",t0:0.4,t1:1.0,x:0.5,y:0.62,col:"#ffffff",a:0.7},
          {k:"sparks",t0:0.6,t1:2.6,x:0.5,y:0.62,col:"#e6dcff",a:0.5}
        ],
        lines:[
          {who:"overseer",text:"HOLLOWAY, M. UNCLASSED. NO ALLOCATION.",t:2.4,dur:2.4,style:"radio",expr:"neutral"}
        ],
        trans:{in:"flash",out:"cut",len:0.5}
      },
      {id:"sum",dur:5.4,
        bg:{k:"hall",style:"obsidian",light:"blood"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.0,r:0},ease:"lin"},
        actors:[
          {id:"ostrander",char:"ostrander",at:[0.72,0.5],h:0.95,face:"l",expr:"neutral",mode:"shadow",t0:0,t1:5.4}
        ],
        props:[{k:"holo",t0:0,t1:5.4,shape:"ring",at:[0.72,0.2],scale:0.5,col:"#ffd070",z:-1}],
        fx:[{k:"dust",t0:0,t1:5.4,a:0.2,col:"#ff6a5a"},{k:"vignette",t0:0,t1:5.4,a:0.8}],
        lines:[
          {who:"ostrander",text:"One. For six thousand and sixty-seven.",t:0.3,dur:2.4,style:"radio",expr:"neutral"},
          {who:"ostrander",text:"He said it plainly. I could not.",t:3.1,dur:2.1,style:"radio",expr:"sad"}
        ],
        trans:{in:"cut",out:"fade",len:0.6}
      },
      {id:"end",dur:7.0,
        bg:{k:"surface",biome:"crystal",time:"dawn",features:["crystals"]},
        cam:{from:{x:0.5,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.52,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"lyra",char:"lyra",at:[0.28,0.62],h:0.9,face:"r",expr:"neutral",mode:"silhouette",t0:0,t1:7.0},
          {id:"mags",char:"mags",at:[0.66,0.62],h:0.88,face:"l",expr:"determined",mode:"bust",t0:0,t1:7.0}
        ],
        props:[{k:"beacon",t0:0,t1:7.0,at:[0.5,0.7],scale:0.07,col:"#ffd27a"}],
        fx:[{k:"rings",t0:0,t1:7.0,a:0.3,col:"#ffd9a0",x:0.5,y:0.6},{k:"vignette",t0:0,t1:7.0,a:0.5}],
        lines:[
          {who:"lyra",text:"I can't see how it ends.",t:0.2,dur:1.7,style:"normal",expr:"neutral"},
          {who:"mags",text:"Nobody can. Get up.",t:2.3,dur:1.4,style:"normal",expr:"determined"},
          {who:"overseer",text:"KEY-BEARER ACCEPTED. WAKING SEQUENCE: BEGIN.",t:4.1,dur:2.7,style:"radio",expr:"neutral"}
        ],
        trans:{in:"fade",out:"fade",len:0.3}
      }
    ]
  },

  /* ending: Question: how does the account close, and who pays? Ostrander tries to take the Key-bearer's place and is refused; she takes the seat in the pod. Turn: the Great Haul, and Kaz answers the roll for his sister. Button: the Overseer, halted: 'RESERVE 0. DISPATCH HALTED.' */
  ending:{
    id:"ending",kind:"ending",title:"Every Light Is Paid For",music:"finale",letterbox:true,seed:709,
    scenes:[
      {id:"lantern",dur:4.2,
        bg:{k:"array",state:"charging",planet:"violet"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.14,r:0},ease:"inout"},
        actors:[
          {id:"idris",char:"idris",at:[0.5,0.62],h:0.72,face:"r",expr:"neutral",mode:"silhouette",t0:0,t1:3.6}
        ],
        props:[
          {k:"beacon",t0:1.6,t1:4.2,at:[0.2,0.72],scale:0.06,col:"#7dffb0"},
          {k:"beacon",t0:1.6,t1:4.2,at:[0.34,0.8],scale:0.06,col:"#7dffb0"},
          {k:"beacon",t0:1.6,t1:4.2,at:[0.66,0.8],scale:0.06,col:"#7dffb0"},
          {k:"beacon",t0:1.6,t1:4.2,at:[0.8,0.72],scale:0.06,col:"#7dffb0"}
        ],
        fx:[
          {k:"beam",t0:0,t1:3.2,x:0.5,y:0.6,col:"#e8e0ff",a:0.7},
          {k:"rings",t0:1.4,t1:4.2,x:0.5,y:0.6,col:"#7dffb0",a:0.5},
          {k:"vignette",t0:0,t1:4.2,a:0.55}
        ],
        sfx:[{t:1.5,name:"powerup"}],
        title:{text:"THE LANTERN",sub:"Orbit, Year 31",t0:0.3,t1:3.4},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"linnet",dur:7.2,
        bg:{k:"array",state:"dormant",planet:"violet"},
        cam:{from:{x:0.56,y:0.52,z:1.22,r:0},to:{x:0.5,y:0.5,z:1.34,r:0},ease:"inout"},
        actors:[
          {id:"ostrander",char:"ostrander",at:[0.66,0.6],h:0.92,face:"l",expr:"sad",mode:"bust",t0:0,t1:7.2}
        ],
        props:[{k:"beacon",t0:0,t1:7.2,at:[0.32,0.72],scale:0.08,col:"#3a4258"}],
        fx:[{k:"pulse",t0:5.4,t1:7.2,x:0.66,y:0.8,col:"#b48cff",a:0.4},{k:"dust",t0:0,t1:7.2,a:0.2,col:"#c8c0d8"},{k:"vignette",t0:0,t1:7.2,a:0.5}],
        lines:[
          {who:"ostrander",text:"Linnet. Cradle two thousand and two. Empty since the winter I emptied it.",t:0.6,dur:4.4,style:"normal",expr:"sad"},
          {who:"ostrander",text:"Take it from me.",t:5.4,dur:1.6,style:"normal",expr:"sad"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"refused",dur:7.4,
        bg:{k:"array",state:"dormant",planet:"violet"},
        cam:{from:{x:0.5,y:0.5,z:1.2,r:0},to:{x:0.5,y:0.5,z:1.26,r:0},ease:"lin"},
        actors:[
          {id:"ostrander",char:"ostrander",at:[0.66,0.6],h:0.92,face:"l",expr:"shock",mode:"bust",t0:0,t1:7.4}
        ],
        props:[
          {k:"beacon",t0:0,t1:7.4,at:[0.32,0.72],scale:0.08,col:"#3a4258"},
          {k:"holo",t0:0,t1:7.4,shape:"sigil",at:[0.5,0.3],scale:0.5,col:"#b48cff",a:0.5,z:-1}
        ],
        fx:[{k:"scan",t0:0,t1:7.4,a:0.2},{k:"vignette",t0:0,t1:7.4,a:0.5}],
        sfx:[{t:0.4,name:"click"}],
        lines:[
          {who:"overseer",text:"ACCOUNT CLOSED. NO BALANCE DUE.",t:0.5,dur:2.2,style:"radio",expr:"neutral"},
          {who:"ostrander",text:"It was written for me. It asked for the Key, and the Key was his.",t:3.1,dur:4.0,style:"normal",expr:"shock"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"pod",dur:7.6,
        bg:{k:"array",state:"charging",planet:"violet"},
        cam:{from:{x:0.5,y:0.5,z:1.1,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.26,0.6],h:0.8,face:"r",expr:"determined",mode:"hologram",t0:0,t1:7.6},
          {id:"ostrander",char:"ostrander",at:[0.7,0.6],h:0.92,face:"l",expr:"weary",mode:"bust",t0:0,t1:7.6}
        ],
        props:[{k:"beacon",t0:0.4,t1:7.6,at:[0.5,0.74],scale:0.12,col:"#b48cff"}],
        fx:[{k:"rings",t0:0,t1:7.6,x:0.5,y:0.7,col:"#b48cff",a:0.3},{k:"vignette",t0:0,t1:7.6,a:0.5}],
        lines:[
          {who:"mags",text:"There is a seat in that pod. I will carry you when you land.",t:0.6,dur:3.6,style:"radio",expr:"determined"},
          {who:"ostrander",text:"I counted everyone. I never counted myself.",t:4.6,dur:2.9,style:"normal",expr:"weary"}
        ],
        trans:{in:"cut",out:"fade",len:0.6}
      },
      {id:"fall",dur:10.8,
        bg:{k:"planet",planet:"azure",rings:true,phase:0.3,size:1.2,moons:1,atmosphere:true,nebula:"violet"},
        cam:{from:{x:0.5,y:0.4,z:0.9,r:0},to:{x:0.55,y:0.5,z:1.1,r:0},ease:"in"},
        actors:[],
        props:[
          {k:"station",from:[0.6,0.24],to:[0.86,0.92],scale:0.5,rot:0.3,t0:0.2,t1:10.8,ease:"in",z:1},
          {k:"beacon",from:[0.58,0.28],to:[0.84,0.86],scale:0.05,col:"#c9a8ff",t0:0.6,t1:10.8,ease:"in"}
        ],
        fx:[
          {k:"comets",t0:0.2,t1:10.8,x:0.6,y:0.2,to:[0.9,0.9],col:"#b48cff",a:0.7},
          {k:"flare",t0:0.2,t1:1.2,x:0.6,y:0.24,col:"#e6d6ff",a:0.7},
          {k:"vignette",t0:0,t1:10.8,a:0.45}
        ],
        sfx:[{t:0.2,name:"rumble"},{t:4.0,name:"wind"}],
        music:{cue:"villain"},
        trans:{in:"fade",out:"cut",len:0.8}
      },
      {id:"haul",dur:8.4,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["dunes","towers"]},
        cam:{from:{x:0.42,y:0.56,z:1.0,r:0},to:{x:0.56,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.3,0.6],h:0.9,face:"r",expr:"determined",mode:"bust",t0:0,t1:8.4},
          {id:"dax",char:"dax",at:[0.66,0.62],h:0.88,face:"l",expr:"smirk",mode:"bust",t0:0,t1:8.4}
        ],
        props:[
          {k:"unit",type:"hauler",faction:"meridian",col:"#e6c35a",from:[-0.2,0.72],to:[1.2,0.72],scale:1.3,t0:0.4,t1:8.4},
          {k:"unit",type:"hauler",faction:"meridian",col:"#e6c35a",from:[-0.3,0.8],to:[1.2,0.8],scale:1.9,t0:0.8,t1:8.4},
          {k:"unit",type:"hauler",faction:"meridian",col:"#e6c35a",from:[-0.1,0.86],to:[1.2,0.86],scale:2.4,t0:1.1,t1:8.4,z:1},
          {k:"building",type:"depot",faction:"aurora",at:[0.8,0.58],scale:0.8,t0:0,t1:8.4,z:-1}
        ],
        fx:[{k:"dust",t0:0,t1:8.4,a:0.3,col:"#ffd0a0"},{k:"vignette",t0:0,t1:8.4,a:0.5}],
        title:{text:"ELEVEN DAYS",t0:0.3,t1:2.6},
        lines:[
          {who:"mags",text:"Forty pods. Forty-one if you count the cat.",t:1.2,dur:2.7,style:"normal",expr:"determined"},
          {who:"dax",text:"Bastion bills by the hour. Some hours aren't billable.",t:4.9,dur:3.3,style:"normal",expr:"smirk"}
        ],
        sfx:[{t:4.2,name:"chime"},{t:4.6,name:"chime"}],
        music:{cue:"finale"},
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"cold",dur:4.4,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["dunes"]},
        cam:{from:{x:0.6,y:0.56,z:1.2,r:0},to:{x:0.5,y:0.54,z:1.34,r:0},ease:"inout"},
        actors:[
          {id:"oru",char:"oru",at:[0.72,0.56],h:0.8,face:"l",expr:"smirk",mode:"hologram",t0:0,t1:4.4},
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.88,face:"r",expr:"weary",mode:"bust",t0:0,t1:4.4}
        ],
        props:[{k:"building",type:"depot",faction:"aurora",at:[0.8,0.6],scale:0.9,t0:0,t1:4.4,z:1}],
        fx:[{k:"smoke",t0:0,t1:4.4,a:0.4,x:0.8,y:0.6,col:"#e8f4ff"},{k:"vignette",t0:0,t1:4.4,a:0.5}],
        lines:[
          {who:"oru",text:"The cold stores are open. No charge. Don't make it a habit.",t:0.6,dur:3.5,style:"radio",expr:"smirk"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"reunion",dur:12.0,
        bg:{k:"surface",biome:"dust",time:"dawn",features:["cliffs","dunes"]},
        cam:{from:{x:0.5,y:0.56,z:1.3,r:0},to:{x:0.46,y:0.56,z:1.1,r:0},ease:"inout"},
        title:{text:"CRADLE 4,112",sub:"Carried down the field",t0:0.4,t1:3.2},
        actors:[
          {id:"kaz",char:"kaz",at:[0.4,0.64],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:12.0},
          {id:"mags",char:"mags",at:[0.94,0.62],h:0.88,face:"l",expr:"smile",mode:"bust",t0:0,t1:12.0,move:{to:[0.12,0.62],ease:"lin"}}
        ],
        props:[
          {k:"beacon",t0:0,t1:12.0,at:[0.44,0.74],scale:0.07,col:"#ffd9a0"},
          {k:"unit",type:"hauler",faction:"meridian",col:"#e6c35a",from:[-0.2,0.84],to:[1.2,0.84],scale:1.2,t0:0,t1:12.0,z:-1}
        ],
        fx:[{k:"dust",t0:0,t1:12.0,a:0.3,col:"#ffd0a0"},{k:"vignette",t0:0,t1:12.0,a:0.5}],
        lines:[
          {who:"mags",text:"Four thousand one hundred and twelve.",t:7.2,dur:2.5,style:"normal",expr:"smile"},
          {who:"kaz",text:"Here.",t:10.6,dur:1.2,style:"normal",expr:"weary"}
        ],
        sfx:[{t:9.9,name:"chime"},{t:10.3,name:"chime"}],
        music:{cue:"reunion"},
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"tally",dur:7.0,
        bg:{k:"surface",biome:"dust",time:"dusk",features:["towers"]},
        cam:{from:{x:0.44,y:0.6,z:1.1,r:0},to:{x:0.5,y:0.6,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.4,0.6],h:0.92,face:"r",expr:"determined",mode:"bust",t0:0,t1:7.0}
        ],
        props:[
          {k:"building",type:"depot",faction:"aurora",at:[0.8,0.6],scale:0.7,t0:0,t1:7.0,z:-1},
          {k:"unit",type:"hauler",faction:"meridian",col:"#e6c35a",at:[0.66,0.78],scale:1.6,t0:0,t1:7.0}
        ],
        fx:[{k:"vignette",t0:0,t1:7.0,a:0.5}],
        music:{cue:"finale"},
        lines:[
          {who:"mags",text:"Six thousand and sixty-seven. Delivery complete.",t:0.5,dur:3.1,style:"normal",expr:"determined"},
          {who:"mags",text:"Seven short.",t:4.0,dur:1.4,style:"normal",expr:"determined"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      },
      {id:"winter",dur:7.8,
        bg:{k:"surface",biome:"green",time:"dawn",features:["towers"]},
        cam:{from:{x:0.42,y:0.56,z:1.05,r:0},to:{x:0.5,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"anselm",char:"anselm",at:[0.4,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:7.8}
        ],
        props:[{k:"beacon",t0:1.0,t1:7.8,at:[0.66,0.8],scale:0.08,col:"#ffb347"}],
        fx:[{k:"vignette",t0:0,t1:7.8,a:0.5}],
        title:{text:"ONE WINTER",sub:"Thirty-one years on",t0:0.3,t1:2.6},
        lines:[
          {who:"anselm",text:"I only closed my eyes for a winter.",t:2.2,dur:2.4,style:"normal",expr:"weary"},
          {who:"anselm",text:"Is the east field still on the cistern?",t:5.0,dur:2.7,style:"normal",expr:"weary"}
        ],
        trans:{in:"fade",out:"cut",len:0.6}
      },
      {id:"lamp",dur:4.5,
        bg:{k:"surface",biome:"green",time:"dawn",features:["towers"]},
        cam:{from:{x:0.5,y:0.58,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"anselm",char:"anselm",at:[0.34,0.62],h:0.9,face:"r",expr:"neutral",mode:"bust",t0:0,t1:4.5},
          {id:"mags",char:"mags",at:[0.68,0.6],h:0.92,face:"l",expr:"smirk",mode:"bust",t0:0,t1:4.5}
        ],
        props:[{k:"beacon",t0:0.5,t1:4.5,at:[0.5,0.8],scale:0.1,col:"#ffb347"}],
        fx:[{k:"vignette",t0:0,t1:4.5,a:0.5}],
        lines:[
          {who:"mags",text:"You are late.",t:0.4,dur:1.4,style:"normal",expr:"smirk"},
          {who:"anselm",text:"Mags. You kept the lamp.",t:2.2,dur:2.0,style:"normal",expr:"neutral"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"roofbeam",dur:5.5,
        bg:{k:"surface",biome:"ash",time:"dawn",features:["tents","banners"]},
        cam:{from:{x:0.42,y:0.6,z:1.2,r:0},to:{x:0.5,y:0.6,z:1.3,r:0},ease:"inout"},
        actors:[
          {id:"kaz",char:"kaz",at:[0.34,0.68],h:0.88,face:"r",expr:"sad",mode:"bust",t0:0,t1:5.5},
          {id:"pim",char:"pim",at:[0.66,0.72],h:0.6,face:"l",expr:"neutral",mode:"bust",t0:0.8,t1:5.5}
        ],
        props:[{k:"building",type:"habitat",faction:"meridian",at:[0.84,0.66],scale:0.8,t0:0,t1:5.5,z:-1}],
        fx:[{k:"dust",t0:0,t1:5.5,a:0.3,col:"#ffd0a0"},{k:"vignette",t0:0,t1:5.5,a:0.5}],
        sfx:[{t:0.2,name:"wind"},{t:3.5,name:"crowd"}],
        lines:[
          {who:"pim",text:"Does it hurt, carrying?",t:1.2,dur:1.8,style:"normal",expr:"neutral"},
          {who:"kaz",text:"Yes. It hurts. Carry it anyway.",t:3.4,dur:1.9,style:"normal",expr:"sad"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"burial",dur:7.6,
        bg:{k:"surface",biome:"ash",time:"dawn",features:["tents"]},
        cam:{from:{x:0.5,y:0.56,z:1.2,r:0},to:{x:0.5,y:0.56,z:1.32,r:0},ease:"inout"},
        actors:[
          {id:"kaz",char:"kaz",at:[0.36,0.66],h:0.88,face:"r",expr:"sad",mode:"bust",t0:0,t1:7.6},
          {id:"tilda",char:"tilda",at:[0.7,0.6],h:0.92,face:"l",expr:"cold",mode:"bust",t0:0.2,t1:7.6}
        ],
        props:[
          {k:"banner",faction:"obsidian",from:[0.46,0.46],to:[0.46,0.84],scale:1.3,t0:0.8,t1:4.8,ease:"in"},
          {k:"building",type:"habitat",faction:"meridian",at:[0.86,0.66],scale:0.6,t0:0,t1:7.6,z:-1}
        ],
        fx:[{k:"dust",t0:0,t1:7.6,a:0.2,col:"#ffd0a0"},{k:"vignette",t0:0,t1:7.6,a:0.5}],
        lines:[
          {who:"tilda",text:"Hold your end up, Warlord.",t:5.0,dur:2.0,style:"normal",expr:"cold"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"forum",dur:10.8,
        bg:{k:"hall",style:"meridian",light:"warm"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.52,z:1.1,r:0},ease:"inout"},
        actors:[
          {id:"thane",char:"thane",at:[0.26,0.6],h:0.92,face:"r",expr:"weary",mode:"bust",t0:0,t1:10.8},
          {id:"ostrander",char:"ostrander",at:[0.52,0.6],h:0.92,face:"l",expr:"sad",mode:"bust",t0:0,t1:10.8},
          {id:"tilda",char:"tilda",at:[0.8,0.7],h:0.6,face:"l",expr:"cold",mode:"bust",t0:0,t1:10.8}
        ],
        props:[
          {k:"beacon",t0:0,t1:10.8,at:[0.14,0.36],scale:0.05,col:"#ffb347",z:-1},
          {k:"beacon",t0:0,t1:10.8,at:[0.88,0.36],scale:0.05,col:"#ffb347",z:-1}
        ],
        fx:[{k:"dust",t0:0,t1:10.8,a:0.2,col:"#ffd0a0"},{k:"vignette",t0:0,t1:10.8,a:0.5}],
        lines:[
          {who:"thane",text:"Dead. I will say it again. Dead. Two thousand nine hundred and thirty-three.",t:0.8,dur:4.7,style:"normal",expr:"weary"},
          {who:"ostrander",text:"Teodor Ostrander. Two thousand and one. Linnet Ostrander. Two thousand and two.",t:5.9,dur:4.7,style:"normal",expr:"sad"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"pricelamp",dur:8.6,
        bg:{k:"base",faction:"aurora",time:"dusk",state:"calm"},
        cam:{from:{x:0.5,y:0.6,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"mags",char:"mags",at:[0.3,0.62],h:0.9,face:"r",expr:"weary",mode:"bust",t0:0,t1:8.6},
          {id:"lyra",char:"lyra",at:[0.78,0.62],h:0.72,face:"l",expr:"neutral",mode:"silhouette",t0:0,t1:8.6}
        ],
        props:[
          {k:"beacon",t0:0,t1:3.6,at:[0.5,0.3],scale:0.14,col:"#3a3340"},
          {k:"beacon",t0:3.6,t1:8.6,at:[0.5,0.3],scale:0.14,col:"#ffd27a"},
          {k:"crowd",faction:"aurora",at:[0.7,0.86],scale:2.6,t0:0,t1:8.6,z:1}
        ],
        fx:[
          {k:"sparks",t0:1.0,t1:3.6,x:0.5,y:0.34,col:"#ffd27a",a:0.6},
          {k:"flare",t0:3.6,t1:4.4,x:0.5,y:0.3,col:"#ffd27a",a:0.6},
          {k:"vignette",t0:0,t1:8.6,a:0.5}
        ],
        sfx:[{t:1.2,name:"chime"}],
        lines:[
          {who:"mags",text:"Lit.",t:4.0,dur:1.4,style:"normal",expr:"weary"}
        ],
        title:{text:"Every light is paid for.",t0:5.8,t1:8.4},
        music:{cue:"hope"},
        trans:{in:"cut",out:"fade",len:0.8}
      },
      {id:"brio",dur:6.2,
        bg:{k:"surface",biome:"green",time:"dawn",features:["towers","tents"]},
        cam:{from:{x:0.5,y:0.56,z:1.1,r:0},to:{x:0.5,y:0.56,z:1.2,r:0},ease:"inout"},
        actors:[
          {id:"ione",char:"ione",at:[0.34,0.6],h:0.92,face:"r",expr:"neutral",mode:"bust",t0:0,t1:6.2}
        ],
        props:[{k:"building",type:"habitat",faction:"meridian",at:[0.7,0.7],scale:0.7,t0:0,t1:6.2,z:1}],
        fx:[{k:"stars",t0:0,t1:6.2,a:0.4},{k:"vignette",t0:0,t1:6.2,a:0.5}],
        title:{text:"BRIO",sub:"The first new town",t0:0.4,t1:2.8},
        lines:[
          {who:"ione",text:"I was Cradle 4,112. The light was green.",t:3.2,dur:2.7,style:"normal",expr:"neutral"}
        ],
        trans:{in:"cut",out:"cut",len:0.4}
      },
      {id:"array",dur:8.0,
        bg:{k:"array",state:"dormant",planet:"azure"},
        cam:{from:{x:0.5,y:0.5,z:1.0,r:0},to:{x:0.5,y:0.5,z:1.25,r:0},ease:"inout"},
        actors:[],
        props:[
          {k:"beacon",t0:0,t1:8.0,at:[0.2,0.72],scale:0.06,col:"#3a4258"},
          {k:"beacon",t0:0,t1:8.0,at:[0.34,0.8],scale:0.06,col:"#3a4258"},
          {k:"beacon",t0:0,t1:8.0,at:[0.66,0.8],scale:0.06,col:"#3a4258"},
          {k:"beacon",t0:0,t1:8.0,at:[0.8,0.72],scale:0.06,col:"#3a4258"}
        ],
        fx:[{k:"rings",t0:0,t1:8.0,a:0.35,col:"#ffd27a",x:0.5,y:0.6},{k:"stars",t0:0,t1:8.0,a:0.6},{k:"vignette",t0:0,t1:8.0,a:0.5}],
        lines:[
          {who:"overseer",text:"RESERVE 0. DISPATCH HALTED.",t:3.0,dur:2.1,style:"radio",expr:"neutral"}
        ],
        trans:{in:"cut",out:"fade",len:0.8}
      }
    ]
  }

});
