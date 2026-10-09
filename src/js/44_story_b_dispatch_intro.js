/* =========================================================================
   STORY (2/n) - INTRO, CREDITS AND DEFEAT DISPATCHES (text dispatches, v4.0: these replace the v3 films). The intro, the credits (the Lamp-Roll) and the three defeat dispatches.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions; double-quoted JS strings, single quotes inside text.
   Shape: STORY.dispatch[id]={id,kind,title,mood,lines:[{who,text,style,expr?}]}. who = a character id or "narrator"; style = normal|radio|whisper|shout|narration|thought|heading
   (heading = a dateline / chapter card). mood = a MUSIC_CUES id the dispatch card may play. Contract: docs/DISPATCH_SPEC.md, src/js/43_vocab.js, docs/story/BIBLE.md.
   ========================================================================= */
Object.assign(STORY.dispatch,{

  intro:{id:"intro",kind:"intro",title:"The Lantern Tithe",mood:"intro",lines:[
    {who:"narrator",text:"Every lamp on Orison is lit for someone who isn't here.",style:"narration"},
    {who:"narrator",text:"YEAR 0",style:"heading"},
    {who:"narrator",text:"Forty thousand came. The soil would feed thirty-one.",style:"narration"},
    {who:"narrator",text:"They drew lots for the winter.",style:"narration"},
    {who:"anselm",text:"One winter.",style:"normal",expr:"smile"},
    {who:"mags",text:"I'll count the days.",style:"normal"},
    {who:"narrator",text:"YEAR 9",style:"heading"},
    {who:"narrator",text:"In the ninth year, someone signed for the dark.",style:"narration"},
    {who:"narrator",text:"YEAR 31 - Lamp Night",style:"heading"},
    {who:"marr",text:"Nine thousand lamps lit and logged, Marshal.",style:"normal"},
    {who:"idris",text:"Noted. One more winter.",style:"normal",expr:"weary"},
    {who:"lyra",text:"Ninety-nine. One short. Naturally.",style:"normal",expr:"smirk"},
    {who:"mags",text:"Day eleven thousand, three hundred and fifteen. Lamp's lit, Anselm.",style:"whisper",expr:"weary"},
    {who:"narrator",text:"9000",style:"heading"},
    {who:"kaz",text:"The Host is fed, Reckoner. We climb at dark.",style:"normal"},
    {who:"ostrander",text:"Thank you, Kaz.",style:"normal",expr:"smile"},
    {who:"ostrander",text:"Nine thousand.",style:"normal",expr:"cold"},
    {who:"narrator",text:"ORBITAL DOMINION - The Lantern Tithe",style:"heading"}
  ]},

  credits:{id:"credits",kind:"credits",title:"The Lamp-Roll",mood:"credits",lines:[
    {who:"narrator",text:"THE LAMP-ROLL - Read aloud, every Lamp Night",style:"heading"},
    {who:"narrator",text:"Tonight the Roll is read aloud, and every name is answered.",style:"narration"},
    {who:"mags",text:"Stool's an inch short. Table's an inch high. I'll sit.",style:"normal",expr:"weary"},
    {who:"narrator",text:"CRADLES 31 – 655 - answered for",style:"heading"},
    {who:"narrator",text:"Wren, Abel. Voss, Adaeze. Lowry, Bram. Rue, Caspian. Oakes, Delphine. Marlowe, Eshe.",style:"narration"},
    {who:"narrator",text:"Here.",style:"thought"},
    {who:"narrator",text:"CRADLES 731 – 1,533 - answered for",style:"heading"},
    {who:"narrator",text:"Teller, Faro. Pell, Gideon. Quist, Halloran. Corvane, Ines. Ashby, Jory.",style:"narration"},
    {who:"narrator",text:"Here.",style:"thought"},
    {who:"narrator",text:"CRADLES 1,801 – 2,655 - answered for",style:"heading"},
    {who:"narrator",text:"Moon, Keziah. Ostrander, Teodor. Ostrander, Linnet. Gray, Lysander. Oyelaran, Marguerite.",style:"narration"},
    {who:"narrator",text:"Here.",style:"thought"},
    {who:"narrator",text:"FROM THE TELLING",style:"heading"},
    {who:"narrator",text:"Tarn, Brio.",style:"narration"},
    {who:"narrator",text:"Marr, Joren.",style:"narration"},
    {who:"narrator",text:"Marr, Lucan.",style:"narration"},
    {who:"narrator",text:"Crake, Oswin.",style:"narration"},
    {who:"narrator",text:"Vale, Idris.",style:"narration"},
    {who:"narrator",text:"The thirty-eight keepers of the Lamp Tower.",style:"narration"},
    {who:"narrator",text:"Here.",style:"thought"},
    {who:"narrator",text:"CRADLES 3,018 – 4,871 - awake",style:"heading"},
    {who:"narrator",text:"Brandt, Nico. Fenwick, Odile. Hask, Perrin. Rae, Quillon. Doyle, Rafferty. Lund, Saffron.",style:"narration"},
    {who:"narrator",text:"Here.",style:"narration"},
    {who:"narrator",text:"CRADLES 5,203 – 6,942 - awake",style:"heading"},
    {who:"narrator",text:"Wick, Tobias. Marsh, Ulla. Kine, Vesper. Cale, Wystan. Holloway, Anselm. Brandt, Yara.",style:"narration"},
    {who:"narrator",text:"Here.",style:"narration"},
    {who:"narrator",text:"CRADLES 7,118 – 8,941 - awake",style:"heading"},
    {who:"narrator",text:"Orme, Zephyr. Tarsk, Colm. Rook, Dessa. Fen, Everard. Sallow, Fenna.",style:"narration"},
    {who:"narrator",text:"Here.",style:"narration"},
    {who:"narrator",text:"Dray, Ione. Cradle 4,112.",style:"narration"},
    {who:"ione",text:"Here.",style:"normal",expr:"smile"}
  ]},

  defeat_a1:{id:"defeat_a1",kind:"defeat",title:"The Lamp Goes Out",mood:"tragedy",lines:[
    {who:"narrator",text:"A lamp can burn out. That is why we light them together.",style:"narration"}
  ]},

  defeat_a2:{id:"defeat_a2",kind:"defeat",title:"The Count Is Short",mood:"tragedy",lines:[
    {who:"narrator",text:"THE ROLL - Waking date: ______",style:"heading"},
    {who:"overseer",text:"ALLOCATION UNMET. DISPATCH CONTINUES.",style:"radio"}
  ]},

  defeat_a3:{id:"defeat_a3",kind:"defeat",title:"The Tithe Is Paid",mood:"tragedy",lines:[
    {who:"narrator",text:"OSTRANDER, Y. - exempt, essential",style:"heading"},
    {who:"ostrander",text:"Thank you.",style:"normal",expr:"smile"},
    {who:"narrator",text:"9,000 - of 9,000",style:"heading"},
    {who:"overseer",text:"ALLOCATION COMPLETE.",style:"radio"}
  ]}
});
