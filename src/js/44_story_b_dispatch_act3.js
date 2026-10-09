/* =========================================================================
   STORY (2/n) - ACT III DISPATCHES (text dispatches, v4.0: these replace the v3 films). Briefings, debriefs and interludes of M7-M9 and the ending.
   Loaded after 44_story_a.js inside the game IIFE. Data only: no functions; double-quoted JS strings, single quotes inside text.
   Shape: STORY.dispatch[id]={id,kind,title,mood,lines:[{who,text,style,expr?}]}. who = a character id or "narrator"; style = normal|radio|whisper|shout|narration|thought|heading
   (heading = a dateline / chapter card). mood = a MUSIC_CUES id the dispatch card may play. Contract: docs/DISPATCH_SPEC.md, src/js/43_vocab.js, docs/story/BIBLE.md.
   ========================================================================= */
Object.assign(STORY.dispatch,{

  m07_brief:{id:"m07_brief",kind:"briefing",title:"The Choir Spire",mood:"march",lines:[
    {who:"narrator",text:"THE CHOIR SPIRE - Day 8, Brasswatch Heights",style:"heading"},
    {who:"narrator",text:"The Marshal had obeyed every order he was ever given, and had never once asked anyone for anything.",style:"narration"},
    {who:"thane",text:"Marshal. The Council takes custody of the Key. Prudently.",style:"radio"},
    {who:"idris",text:"I will give it up the day you read the Roll aloud in this hall.",style:"normal",expr:"determined"},
    {who:"thane",text:"Marshal, that is not... in the circumstances, it is not prudent.",style:"radio",expr:"weary"},
    {who:"idris",text:"No.",style:"normal",expr:"cold"},
    {who:"idris",text:"I need the Spire taken, and I cannot take it alone. Will you?",style:"normal",expr:"determined"},
    {who:"lyra",text:"I have a fleet and no army, which I'm told is just a very expensive parade. That's a price. You come back.",style:"normal",expr:"smirk"},
    {who:"idris",text:"Brio Tarn left you a number. Three-one-zero.",style:"normal"},
    {who:"lyra",text:"He was right.",style:"normal",expr:"determined"},
    {who:"lyra",text:"If I do this, I do it free. Every name.",style:"normal",expr:"determined"}
  ]},

  m07_win:{id:"m07_win",kind:"debrief",title:"The Spire Falls",mood:"betrayal",lines:[
    {who:"marr",text:"You never said it, Marshal. Not once.",style:"normal",expr:"cold"},
    {who:"idris",text:"Joren Marr. Karst Pass, the ninth of Thaw, Year twenty-two. Eleven men.",style:"normal",expr:"weary"},
    {who:"idris",text:"I wrote it inside the Key's case. I read it every Lamp Night.",style:"normal",expr:"weary"},
    {who:"idris",text:"Who else, Lucan?",style:"normal",expr:"weary"},
    {who:"marr",text:"Say it yourself.",style:"normal",expr:"cold"},
    {who:"idris",text:"Brio Tarn. You left him on the Axis.",style:"normal",expr:"cold"},
    {who:"marr",text:"You said it. It turns out that was all I wanted. It does not cover the second.",style:"normal",expr:"weary"},
    {who:"marr",text:"She will want you at the Axis. So do I.",style:"normal",expr:"weary"},
    {who:"lyra",text:"Parley. She is asking.",style:"radio"}
  ]},

  i07:{id:"i07",kind:"interlude",title:"The Offer",mood:"villain",lines:[
    {who:"ostrander",text:"Every lamp in your city burns on a sleeper's breath. I want to stop pretending it is oil.",style:"radio"},
    {who:"idris",text:"Then wake them. Do not spend the living.",style:"normal",expr:"cold"},
    {who:"ostrander",text:"Someone is always spent, Idris. The Council chose strangers. I choose by lot, in daylight, and I say their names.",style:"radio"},
    {who:"idris",text:"Class Nine is your own people.",style:"normal",expr:"determined"},
    {who:"ostrander",text:"Then you see I am fair.",style:"radio"},
    {who:"lyra",text:"Are you in it?",style:"normal"},
    {who:"ostrander",text:"Someone must keep the count.",style:"radio"},
    {who:"lyra",text:"Fenna Sallow, Cradle 8,941: living. Her granddaughter signed your list because the date was blank.",style:"normal",expr:"cold"},
    {who:"ostrander",text:"They know now. You saw to that. They are still here.",style:"radio"},
    {who:"idris",text:"You cannot buy the dead back with the living. And you are not in your own sum.",style:"normal",expr:"determined"},
    {who:"lyra",text:"She's right three times.",style:"normal",expr:"weary"},
    {who:"idris",text:"And wrong once.",style:"normal",expr:"determined"}
  ]},

  m08_brief:{id:"m08_brief",kind:"briefing",title:"Patience",mood:"tension",lines:[
    {who:"narrator",text:"PATIENCE - Night 8, the Lamp Tower rubble",style:"heading"},
    {who:"narrator",text:"The load was the size of a wheel and the colour of a candle.",style:"narration"},
    {who:"narrator",text:"For twenty-two years the catalogue had called it function unknown.",style:"narration"},
    {who:"mags",text:"Year nine. Crate nine-seventeen, Class Nine isolation coupling. I signed for it.",style:"normal",expr:"weary"},
    {who:"mags",text:"I carried it in. I will carry it out.",style:"normal",expr:"determined"},
    {who:"dax",text:"I don't do causes. I do loads. That's two hours.",style:"normal",expr:"smirk"},
    {who:"kaz",text:"I will walk beside it.",style:"normal",expr:"cold"},
    {who:"mags",text:"You'll walk behind it. I steer.",style:"normal",expr:"weary"},
    {who:"mags",text:"She runs hot. Landing's the only well on the road.",style:"normal",expr:"weary"},
    {who:"kaz",text:"I know what is at the Landing.",style:"normal",expr:"cold"},
    {who:"mags",text:"Then you know where the well is.",style:"normal",expr:"weary"},
    {who:"lyra",text:"I'm at the Axis, listening to it. Don't stop.",style:"radio",expr:"determined"}
  ]},

  m08_win:{id:"m08_win",kind:"debrief",title:"The Axis Hums",mood:"mystery",lines:[
    {who:"narrator",text:"THE AXIS - Dawn",style:"heading"},
    {who:"oru",text:"Tamsin Oru, for the record. The Hunt was mine to pay for. No charge.",style:"radio",expr:"smirk"},
    {who:"mags",text:"Delivery complete.",style:"normal",expr:"determined"},
    {who:"kaz",text:"Not yet.",style:"normal",expr:"cold"},
    {who:"lyra",text:"It's waiting for the Key-bearer.",style:"normal"}
  ]},

  i08:{id:"i08",kind:"interlude",title:"The Last Lamp Night",mood:"mystery",lines:[
    {who:"narrator",text:"THE LAST LAMP NIGHT - Brasswatch Heights, Night 8",style:"heading"},
    {who:"idris",text:"It says: whoever bears the Key and has spent the Lantern may pay the Lantern once.",style:"normal",expr:"determined"},
    {who:"idris",text:"It wakes everyone who still sleeps. It takes one life. The Key is mine. So is the account.",style:"normal",expr:"determined"},
    {who:"idris",text:"Hers was a pen. The Axis wants the Key.",style:"normal",expr:"cold"},
    {who:"lyra",text:"I tune it. It will want something of mine too.",style:"normal",expr:"determined"},
    {who:"idris",text:"I am not asking anyone to stop me.",style:"normal",expr:"cold"},
    {who:"idris",text:"I am asking you not to let me go alone.",style:"normal",expr:"weary"},
    {who:"mags",text:"I'll drive.",style:"normal",expr:"determined"},
    {who:"kaz",text:"I'll carry.",style:"normal"},
    {who:"lyra",text:"I'll tune.",style:"normal",expr:"smirk"},
    {who:"dax",text:"Billable.",style:"normal",expr:"cold"},
    {who:"mags",text:"No.",style:"normal",expr:"weary"},
    {who:"narrator",text:"FOR BRIO TARN - Lit last",style:"heading"}
  ]},

  m09_brief:{id:"m09_brief",kind:"briefing",title:"The Closing",mood:"march",lines:[
    {who:"narrator",text:"THE CLOSING - Night 9",style:"heading"},
    {who:"narrator",text:"Nine nights. She had said nine, and she was nothing if not exact.",style:"narration"},
    {who:"idris",text:"Three Foci. Hold the Stair. Then the Axis. We take them in that order.",style:"normal",expr:"determined"},
    {who:"idris",text:"The Corps is mine again. Thane signed it back at dawn. He did not look at me.",style:"normal",expr:"weary"},
    {who:"kaz",text:"The Host joins us. They have read the Roll.",style:"normal",expr:"cold"},
    {who:"lyra",text:"I'll be at the Axis. Mags stays with you.",style:"radio",expr:"determined"},
    {who:"idris",text:"Hold the line. When it is time, I will tell you.",style:"normal",expr:"determined"}
  ]},

  m09_win:{id:"m09_win",kind:"debrief",title:"One Life",mood:"finale",lines:[
    {who:"marr",text:"The bays, Marshal. Every one. Someone should read them.",style:"normal",expr:"cold"},
    {who:"idris",text:"I will see that they are read.",style:"normal",expr:"weary"},
    {who:"marr",text:"Joren.",style:"normal",expr:"cold"},
    {who:"idris",text:"One life. Count me.",style:"normal",expr:"determined"},
    {who:"mags",text:"Here.",style:"normal",expr:"weary"},
    {who:"overseer",text:"HOLLOWAY, M. UNCLASSED. NO ALLOCATION.",style:"radio"},
    {who:"ostrander",text:"One. For six thousand and sixty-seven.",style:"radio"},
    {who:"ostrander",text:"He said it plainly. I could not.",style:"radio",expr:"sad"},
    {who:"lyra",text:"I can't see how it ends.",style:"normal"},
    {who:"mags",text:"Nobody can. Get up.",style:"normal",expr:"determined"},
    {who:"overseer",text:"KEY-BEARER ACCEPTED. WAKING SEQUENCE: BEGIN.",style:"radio"}
  ]},

  ending:{id:"ending",kind:"ending",title:"Every Light Is Paid For",mood:"finale",lines:[
    {who:"narrator",text:"THE LANTERN - Orbit, Year 31",style:"heading"},
    {who:"ostrander",text:"Linnet. Cradle two thousand and two. Empty since the winter I emptied it.",style:"normal",expr:"sad"},
    {who:"ostrander",text:"Take it from me.",style:"normal",expr:"sad"},
    {who:"overseer",text:"ACCOUNT CLOSED. NO BALANCE DUE.",style:"radio"},
    {who:"ostrander",text:"It was written for me. It asked for the Key, and the Key was his.",style:"normal",expr:"shock"},
    {who:"mags",text:"There is a seat in that pod. I will carry you when you land.",style:"radio",expr:"determined"},
    {who:"ostrander",text:"I counted everyone. I never counted myself.",style:"normal",expr:"weary"},
    {who:"narrator",text:"ELEVEN DAYS",style:"heading"},
    {who:"mags",text:"Forty pods. Forty-one if you count the cat.",style:"normal",expr:"determined"},
    {who:"dax",text:"Bastion bills by the hour. Some hours aren't billable.",style:"normal",expr:"smirk"},
    {who:"oru",text:"The cold stores are open. No charge. Don't make it a habit.",style:"radio",expr:"smirk"},
    {who:"narrator",text:"CRADLE 4,112 - Carried down the field",style:"heading"},
    {who:"mags",text:"Four thousand one hundred and twelve.",style:"normal",expr:"smile"},
    {who:"kaz",text:"Here.",style:"normal",expr:"weary"},
    {who:"mags",text:"Six thousand and sixty-seven. Delivery complete.",style:"normal",expr:"determined"},
    {who:"mags",text:"Seven short.",style:"normal",expr:"determined"},
    {who:"narrator",text:"ONE WINTER - Thirty-one years on",style:"heading"},
    {who:"anselm",text:"I only closed my eyes for a winter.",style:"normal",expr:"weary"},
    {who:"anselm",text:"Is the east field still on the cistern?",style:"normal",expr:"weary"},
    {who:"mags",text:"You are late.",style:"normal",expr:"smirk"},
    {who:"anselm",text:"Mags. You kept the lamp.",style:"normal"},
    {who:"pim",text:"Does it hurt, carrying?",style:"normal"},
    {who:"kaz",text:"Yes. It hurts. Carry it anyway.",style:"normal",expr:"sad"},
    {who:"tilda",text:"Hold your end up, Warlord.",style:"normal",expr:"cold"},
    {who:"thane",text:"Dead. I will say it again. Dead. Two thousand nine hundred and thirty-three.",style:"normal",expr:"weary"},
    {who:"ostrander",text:"Teodor Ostrander. Two thousand and one. Linnet Ostrander. Two thousand and two.",style:"normal",expr:"sad"},
    {who:"mags",text:"Lit.",style:"normal",expr:"weary"},
    {who:"narrator",text:"Every light is paid for.",style:"heading"},
    {who:"narrator",text:"BRIO - The first new town",style:"heading"},
    {who:"ione",text:"I was Cradle 4,112. The light was green.",style:"normal"},
    {who:"overseer",text:"RESERVE 0. DISPATCH HALTED.",style:"radio"}
  ]}
});
