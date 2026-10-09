/* =========================================================================
   STORY (2/n) - ACT I DISPATCHES (text dispatches, v4.0: these replace the v3 films). Briefings, debriefs and interludes of M1-M3.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions; double-quoted JS strings, single quotes inside text.
   Shape: STORY.dispatch[id]={id,kind,title,mood,lines:[{who,text,style,expr?}]}. who = a character id or "narrator"; style = normal|radio|whisper|shout|narration|thought|heading
   (heading = a dateline / chapter card). mood = a MUSIC_CUES id the dispatch card may play. Contract: docs/DISPATCH_SPEC.md, src/js/43_vocab.js, docs/story/BIBLE.md.
   ========================================================================= */
Object.assign(STORY.dispatch,{

  m01_brief:{id:"m01_brief",kind:"briefing",title:"Lamp Night",mood:"tension",lines:[
    {who:"narrator",text:"LAMP NIGHT - Brasswatch Heights, Year 31",style:"heading"},
    {who:"narrator",text:"The elders say the war was fought across a continent.",style:"narration"},
    {who:"narrator",text:"I tell it on one field, because a story needs somewhere to stand.",style:"narration"},
    {who:"marr",text:"The Key answers to your hand alone, Marshal.",style:"normal"},
    {who:"marr",text:"Banners on the east rise. They read nine thousand.",style:"normal"},
    {who:"narrator",text:"9000",style:"heading"},
    {who:"idris",text:"Nine thousand. They are counting something.",style:"normal",expr:"determined"},
    {who:"marr",text:"They do not say what for, Marshal.",style:"normal",expr:"cold"},
    {who:"mags",text:"Forty crates, Marshal. Forty-one if you count the cat.",style:"normal",expr:"smile"},
    {who:"idris",text:"Hold until dawn. Mind the Stair.",style:"normal",expr:"determined"}
  ]},

  m01_win:{id:"m01_win",kind:"debrief",title:"Dawn on the Heights",mood:"dawn",lines:[
    {who:"marr",text:"There is silver in your hair, Marshal.",style:"normal"},
    {who:"idris",text:"It was always there.",style:"normal",expr:"weary"},
    {who:"marr",text:"Not this much.",style:"normal",expr:"cold"},
    {who:"idris",text:"Whose lamp?",style:"normal",expr:"weary"},
    {who:"mags",text:"My husband's. Anselm.",style:"normal",expr:"weary"},
    {who:"idris",text:"Which Cradle?",style:"normal",expr:"determined"},
    {who:"mags",text:"Six thousand three hundred and ten.",style:"normal"},
    {who:"idris",text:"Cradle six thousand three hundred and ten.",style:"normal",expr:"determined"},
    {who:"overseer",text:"RESERVE 6,067. DISPATCH CONTINUES.",style:"radio"},
    {who:"kaz",text:"Thank you for the light, Marshal. The Reckoner wished to see it answer.",style:"radio",expr:"cold"},
    {who:"idris",text:"See it?",style:"normal",expr:"determined"}
  ]},

  i01:{id:"i01",kind:"interlude",title:"Forty Crates",mood:"mystery",lines:[
    {who:"mags",text:"Thirty-eight. Thirty-nine. Forty.",style:"normal"},
    {who:"mags",text:"Forty-one. Not on the manifest. Stay.",style:"normal",expr:"smile"},
    {who:"overseer",text:"RESERVE MINUS SEVEN. DISPATCH CONTINUES.",style:"radio"},
    {who:"mags",text:"Seven.",style:"normal"},
    {who:"narrator",text:"She did not say it. She never said anything she could carry instead.",style:"narration"}
  ]},

  m02_brief:{id:"m02_brief",kind:"briefing",title:"The Waking Fund",mood:"tension",lines:[
    {who:"narrator",text:"THE WAKING FUND - Tollhouse Terrace, Day 2",style:"heading"},
    {who:"narrator",text:"At Tollhouse Terrace everything had a price, and the price was written in teal chalk.",style:"narration"},
    {who:"narrator",text:"Over the door hung the Price Lamp, which lit only when a debt was paid in full.",style:"narration"},
    {who:"narrator",text:"It had been dark for twenty-three years.",style:"narration"},
    {who:"oru",text:"Three posts, six runs apiece, and the blockade breaks.",style:"normal",expr:"smirk"},
    {who:"lyra",text:"And the consideration?",style:"normal",expr:"smirk"},
    {who:"oru",text:"Keep your charter, Lyra.",style:"normal"},
    {who:"narrator",text:"Y9 - locked",style:"heading"},
    {who:"mags",text:"Gross four hundred and twelve. Fund, forty-one. Thirty-one years of tenths.",style:"normal"},
    {who:"lyra",text:"Then let's make the crates lighter. I'll start with the one marked Oru's conscience.",style:"normal",expr:"smirk"}
  ]},

  m02_win:{id:"m02_win",kind:"debrief",title:"Open Lanes",mood:"mystery",lines:[
    {who:"idris",text:"Name your price, Seer.",style:"radio"},
    {who:"lyra",text:"Open the routes. Take the file. I do not sell it twice.",style:"normal",expr:"determined"},
    {who:"idris",text:"What is it?",style:"radio"},
    {who:"lyra",text:"A receipt.",style:"normal",expr:"weary"},
    {who:"mags",text:"Forty crates, Seer. Same as always.",style:"radio"},
    {who:"mags",text:"Why's it feel heavier?",style:"radio",expr:"weary"}
  ]},

  i02:{id:"i02",kind:"interlude",title:"The Roll",mood:"mystery",lines:[
    {who:"idris",text:"Reserve Draw. Signed Y. Ostrander. Sealed A. Thane. Two thousand seven hundred and fourteen.",style:"whisper",expr:"weary"},
    {who:"idris",text:"Thirty shots.",style:"normal",expr:"sad"},
    {who:"marr",text:"Two hundred and twelve before Lamp Night, Marshal.",style:"normal"},
    {who:"marr",text:"Seven a shot, eight twice.",style:"normal",expr:"cold"},
    {who:"marr",text:"And Lamp Night, seven more. Bay two thousand nine hundred and twenty-seven to thirty-three.",style:"normal"},
    {who:"marr",text:"I wrote them down.",style:"normal",expr:"cold"},
    {who:"idris",text:"Names?",style:"normal",expr:"determined"},
    {who:"marr",text:"Bays, Marshal. Nobody wrote the names. That is what acceptable means.",style:"normal",expr:"cold"}
  ]},

  m03_brief:{id:"m03_brief",kind:"briefing",title:"The Axis",mood:"mystery",lines:[
    {who:"narrator",text:"THE AXIS - Day 4",style:"heading"},
    {who:"narrator",text:"The Guild had surveyed the Basin for twenty years and found one place every line bent toward.",style:"narration"},
    {who:"brio",text:"Technically it's a ring. Practically it's a very large door.",style:"normal",expr:"smile"},
    {who:"idris",text:"Who built it?",style:"normal",expr:"determined"},
    {who:"brio",text:"Nobody signs a door. I can tell you who's been using it, though.",style:"normal",expr:"smirk"},
    {who:"brio",text:"Give me five camps and a day.",style:"normal",expr:"determined"},
    {who:"marr",text:"I will hold the forward hub and keep the lamps lit, Marshal.",style:"normal"},
    {who:"idris",text:"I trust you, Lucan.",style:"normal",expr:"weary"},
    {who:"narrator",text:"The Marshal trusted him, and had never said why.",style:"narration"}
  ]},

  m03_win:{id:"m03_win",kind:"debrief",title:"Bearing Three-One-Zero",mood:"tragedy",lines:[
    {who:"narrator",text:"Brio Tarn asked for five camps and a day. He was given the camps.",style:"narration"},
    {who:"brio",text:"Whoever bears the Key and has spent the Lantern may pay the Lantern once.",style:"radio",expr:"determined"},
    {who:"idris",text:"Once.",style:"normal",expr:"weary"},
    {who:"brio",text:"Tell the Seer. Bearing three-one-zero. She'll know.",style:"radio",expr:"smile"},
    {who:"marr",text:"Count me, Marshal.",style:"radio",expr:"cold"},
    {who:"overseer",text:"LAMP TOWER LOST. KEEPERS 38.",style:"radio"}
  ]},

  i03:{id:"i03",kind:"interlude",title:"The Key Passes",mood:"betrayal",lines:[
    {who:"marr",text:"Every one the Marshal ever signed. And Lamp Night's.",style:"normal"},
    {who:"ostrander",text:"Thank you, Lucan. What did it cost you?",style:"radio"},
    {who:"marr",text:"Seven years of saying 'Yes, Marshal.'",style:"normal",expr:"cold"},
    {who:"ostrander",text:"Then it will be well spent.",style:"radio"},
    {who:"narrator",text:"Thirty-eight keepers were on the Tower stair.",style:"narration"},
    {who:"thane",text:"Marshal... the Tower, regrettably... and in the circumstances, the Council is minded to relieve you.",style:"normal",expr:"weary"},
    {who:"thane",text:"Prudent.",style:"normal",expr:"cold"},
    {who:"idris",text:"Noted, Speaker.",style:"normal",expr:"determined"},
    {who:"idris",text:"I count forty. Go home.",style:"normal",expr:"weary"},
    {who:"narrator",text:"He told no one about the white in his hair.",style:"narration"}
  ]}
});
