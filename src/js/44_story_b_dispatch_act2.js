/* =========================================================================
   STORY (2/n) - ACT II DISPATCHES (text dispatches, v4.0: these replace the v3 films). Briefings, debriefs and interludes of M4-M6.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions; double-quoted JS strings, single quotes inside text.
   Shape: STORY.dispatch[id]={id,kind,title,mood,lines:[{who,text,style,expr?}]}. who = a character id or "narrator"; style = normal|radio|whisper|shout|narration|thought|heading
   (heading = a dateline / chapter card). mood = a MUSIC_CUES id the dispatch card may play. Contract: docs/DISPATCH_SPEC.md, src/js/43_vocab.js, docs/story/BIBLE.md.
   ========================================================================= */
Object.assign(STORY.dispatch,{

  m04_brief:{id:"m04_brief",kind:"briefing",title:"Ember Census",mood:"villain",lines:[
    {who:"narrator",text:"EMBER CENSUS - Cinder Rise, Day 5",style:"heading"},
    {who:"narrator",text:"The Wake did not call it Brasswatch.",style:"narration"},
    {who:"narrator",text:"On the red-banner ridge they called it Cinder Rise.",style:"narration"},
    {who:"crake",text:"A levy has been quartered at Tallow Landing. The Reckoner asks that it be cleared.",style:"normal"},
    {who:"kaz",text:"A levy.",style:"normal"},
    {who:"crake",text:"The Council's. A barracks of Habitats. Entered.",style:"normal"},
    {who:"ostrander",text:"Thank you, Warlord. You will be thanked again.",style:"radio"},
    {who:"pim",text:"I am for Fenna Sallow. Cradle eight thousand nine hundred and forty-one. Will it hurt?",style:"normal"},
    {who:"kaz",text:"No.",style:"normal"},
    {who:"crake",text:"To collect, the Reckoner requires the Orbital Foci. Era Three, before the Council.",style:"normal"}
  ]},

  m04_win:{id:"m04_win",kind:"debrief",title:"Tallow Landing",mood:"tragedy",lines:[
    {who:"narrator",text:"TALLOW LANDING - Dawn, Day 5",style:"heading"},
    {who:"crake",text:"Eighty taxpayers in eight blocks. Sixty-three children and elders. One hundred and forty-three. All entered.",style:"radio"},
    {who:"kaz",text:"They were not a levy.",style:"normal",expr:"cold"},
    {who:"crake",text:"No.",style:"radio"},
    {who:"thane",text:"Warlord, regrettably... one did mention children. In the circumstances.",style:"radio",expr:"weary"},
    {who:"narrator",text:"He had never turned to the last page. Beside every name, the date was blank.",style:"narration"},
    {who:"kaz",text:"Dray, Ione. Cradle 4,112. Living.",style:"normal",expr:"sad"}
  ]},

  i04:{id:"i04",kind:"interlude",title:"Cradle 4,112",mood:"tragedy",lines:[
    {who:"narrator",text:"In the Spire's lens-hall every Cradle was a light. Most were green.",style:"narration"},
    {who:"narrator",text:"4,112 - Dray, Ione",style:"heading"},
    {who:"kaz",text:"Ione.",style:"normal",expr:"sad"},
    {who:"ostrander",text:"She is alive, Kaz. I never said she was not.",style:"normal"},
    {who:"kaz",text:"You said the answers were sealed.",style:"normal",expr:"cold"},
    {who:"ostrander",text:"I did. I never said by whom.",style:"normal"},
    {who:"kaz",text:"Then why Tallow Landing?",style:"normal",expr:"cold"},
    {who:"ostrander",text:"Because the next row is amber, Kaz. Hers will be.",style:"normal"},
    {who:"ostrander",text:"I am asking you to wake them all, once, before the lights go out.",style:"normal"},
    {who:"kaz",text:"Yes, Reckoner.",style:"normal",expr:"weary"},
    {who:"ostrander",text:"Thank you, Kaz.",style:"normal"},
    {who:"narrator",text:"He went down the Spire. He did what he had been fed to do.",style:"narration"}
  ]},

  m05_brief:{id:"m05_brief",kind:"briefing",title:"Glass Market",mood:"dread",lines:[
    {who:"narrator",text:"GLASS MARKET - Night 6",style:"heading"},
    {who:"narrator",text:"A Seer can see the end of a bargain.",style:"narration"},
    {who:"narrator",text:"She cannot see who will pay.",style:"narration"},
    {who:"lyra",text:"Six Specters, one night, the Wake's Roll. What's it worth to you?",style:"normal",expr:"determined"},
    {who:"oru",text:"The Syndicate does not rob a census. No charge for the advice.",style:"normal",expr:"smile"},
    {who:"lyra",text:"Then the Syndicate can pay for the next one.",style:"normal",expr:"cold"},
    {who:"mags",text:"I just drive. Quietly.",style:"normal"},
    {who:"lyra",text:"Then hum something.",style:"normal",expr:"smirk"},
    {who:"lyra",text:"Veil on.",style:"normal",expr:"smirk"},
    {who:"lyra",text:"Do not break it. If anyone shoots at us, shoot back politely.",style:"normal",expr:"smirk"}
  ]},

  m05_win:{id:"m05_win",kind:"debrief",title:"Class Nine",mood:"mystery",lines:[
    {who:"lyra",text:"Class Nine is the Collective. Its own people, first.",style:"normal",expr:"determined"},
    {who:"lyra",text:"And the author isn't on it. She wrote herself out.",style:"normal",expr:"cold"},
    {who:"narrator",text:"CHARTER 14 - one warning. consideration: routes.",style:"heading"},
    {who:"lyra",text:"My warning. Oru kept it in a drawer.",style:"normal",expr:"sad"},
    {who:"narrator",text:"The Veil showed her a hand on the Key.",style:"thought"}
  ]},

  i05:{id:"i05",kind:"interlude",title:"What the Seer Sold",mood:"dread",lines:[
    {who:"lyra",text:"A charter for a warning, Tamsin. I'd like to know the exchange rate.",style:"normal",expr:"determined"},
    {who:"oru",text:"One trade charter, number fourteen. Paid in full, Lyra. You agreed.",style:"radio",expr:"smile"},
    {who:"lyra",text:"Then what does it cost to tell everyone?",style:"normal",expr:"cold"},
    {who:"oru",text:"More than you have.",style:"radio"},
    {who:"lyra",text:"I have my eyes.",style:"normal",expr:"sad"},
    {who:"oru",text:"You would sell them?",style:"radio"},
    {who:"lyra",text:"I would spend them.",style:"normal",expr:"determined"}
  ]},

  m06_brief:{id:"m06_brief",kind:"briefing",title:"The Third Bell",mood:"villain",lines:[
    {who:"narrator",text:"THE THIRD BELL - The Axis, Night 7",style:"heading"},
    {who:"narrator",text:"They said whoever held the Axis held the Lantern.",style:"narration"},
    {who:"narrator",text:"Nobody asked what the Lantern held.",style:"narration"},
    {who:"crake",text:"Bells are rung on Meridian's posts at the fourth minute and the eighth. The ring is held by Class Nine.",style:"normal"},
    {who:"kaz",text:"Class Nine?",style:"normal"},
    {who:"crake",text:"The ring's garrison. Carried forward.",style:"normal"},
    {who:"marr",text:"Authorisation loaded, Reckoner. The Marshal's own, from Lamp Night.",style:"normal"},
    {who:"ostrander",text:"Thank you, Lucan. Thank you, Warlord. Hold it for me.",style:"radio"},
    {who:"pim",text:"Thank you for the bread, Warlord.",style:"normal",expr:"smile"},
    {who:"kaz",text:"We feed our own. Keep the lamp lit.",style:"normal"}
  ]},

  m06_win:{id:"m06_win",kind:"debrief",title:"Motes",mood:"tragedy",lines:[
    {who:"narrator",text:"The coats and tools lay where their owners had stood.",style:"narration"},
    {who:"lyra",text:"I told you to count.",style:"radio"},
    {who:"kaz",text:"Crake?",style:"normal",expr:"weary"},
    {who:"lyra",text:"He sent the girl out first. Then he stayed.",style:"radio"}
  ]},

  i06:{id:"i06",kind:"interlude",title:"Two Lamps",mood:"tragedy",lines:[
    {who:"kaz",text:"Tallow Landing. I did that. I carried it out and called it faith.",style:"normal",expr:"weary"},
    {who:"idris",text:"Thirty shots, Warlord. I never asked what the number meant.",style:"normal",expr:"weary"},
    {who:"kaz",text:"Class Nine?",style:"normal",expr:"cold"},
    {who:"idris",text:"I read it on the board.",style:"normal",expr:"weary"},
    {who:"kaz",text:"It meant us. Not deferred. Dead.",style:"normal",expr:"cold"},
    {who:"kaz",text:"The surveyor. Brio Tarn. That ambush was mine.",style:"normal",expr:"weary"},
    {who:"idris",text:"I know whose.",style:"normal",expr:"determined"},
    {who:"kaz",text:"I was never cruel. I did what I was told.",style:"normal",expr:"weary"},
    {who:"idris",text:"Two lamps. Until the Spire.",style:"normal",expr:"determined"},
    {who:"kaz",text:"Thank you for the light, Marshal.",style:"normal",expr:"weary"}
  ]}
});
