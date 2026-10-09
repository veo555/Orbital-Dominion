/* =========================================================================
   STORY (1/n) - THE LANTERN TITHE. The campaign data root. Authored by the story workflow; see docs/CAMPAIGN_SPEC.md and docs/story/BIBLE.md.
   Later files (44_story_b_* dispatches, 44_story_c_* missions, 44_story_d_* radio/barks) only add to these objects:
     Object.assign(STORY.dispatch,{...})  STORY.missions.push(...)  Object.assign(STORY.radio,{...})  Object.assign(STORY.barks,{...})
   Data only: no functions. Strings avoid double quotes inside text (use single quotes) so the file stays JSON-able.
   ========================================================================= */
const STORY={
  meta:{
    title:"The Lantern Tithe",
    tagline:"Every light is paid for.",
    version:1,
    rating:"PG-13",
    logline:"A colony learns that its lamps were lit with its sleeping founders' lives, and a grief-struck dispatcher arrives to collect nine thousand living lives for nine thousand dead. A Marshal, a Warlord, a Seer and one old Hauler pilot must decide who pays: other people, or themselves."
  },

  world:{
    places:[
      {id:"brasswatch",name:"Brasswatch Heights",desc:"The Meridian Corps' citadel on the south-west high ground, tile (13,74). The Lamp Tower stands over the vault where the Marshals keep the Founders' Coupling, a brass part the size of a wheel catalogued as 'function unknown'. Lamp Night is kept here first."},
      {id:"stair",name:"The Ashen Stair",desc:"The long ramp (tiles 19-26, 74-76) that carries the south-west high ground down to the lowlands. The first landers fused the ash into steps with their engines. Whoever holds the Stair holds the road to everything else."},
      {id:"tollhouse",name:"Tollhouse Terrace",desc:"The Aurora Syndicate's counting-house on the south-west shelf, tile (13,74) when the Syndicate is the one holding it. Every caravan that crosses the Basin pays here, every price is posted in teal chalk, and over the door hangs the Price Lamp, which lights only when a debt is paid in full. It has been dark since Year 8."},
      {id:"cinderrise",name:"Cinder Rise",desc:"What the Wake calls the south-west ridge when it is the one camped there. A bare red-banner camp of ash-marked tents, tile (13,74). Nobody sleeps well on it."},
      {id:"tallow",name:"Tallow Landing",desc:"A Habitat town on the low ground north of the Stair, tile (14,50), named for the tallow lamps its first settlers burned. Ordinary families live here: eight blocks of ten taxpayers each, and the children and elders the Roll counts besides. It is the first place the Wake will be told is a barracks."},
      {id:"wickpost",name:"Wick Post",desc:"A trading post on the western road, tile (14,35) (stand on (13,34)). A sign, a well and a lamp that has never once gone out."},
      {id:"glassmarket",name:"The Glass Market",desc:"Once the Syndicate's great bazaar, tile (24,15) (stand on (23,14)), roofed in coloured glass. The Wake has made it a census camp: tables, ledgers and long queues of the grieving, and the Syndicate's old archive in the cellars."},
      {id:"kestrelpost",name:"Kestrel Post",desc:"Kestrel Logistics' freight yard in the south-east, tile (62,71) (stand on (61,70)). Line 7 starts here, and so does every wage-slip with a tenth taken out for the Waking Fund."},
      {id:"axis",name:"The Axis",desc:"The Lantern's ground anchor at the exact centre of the Basin, tile (44,44): a ring of fused crystal older than the colony, where the Exchange's beams come down and where the Founders cut their failsafe. Ancient Brutes nest in it. The ring is cut to a bearing of three-one-zero, the line along which the Lantern's orbit crosses it."},
      {id:"choirspire",name:"The Choir Spire",desc:"The north-east high ground, tile (75,14): the Wake's tether-hall and lens-hall under a tower of black glass. The Choir Relays that ring it sing Low Lamp to the camps, and Ostrander's voice comes down from it."},
      {id:"highwatch",name:"Highwatch",desc:"The Corps' northern fort on the north-east high ground, tile (75,14) when the Corps holds it, the mirror of Brasswatch. A cold place with excellent views."},
      {id:"coldexchange",name:"The Cold Exchange",desc:"The Aurora Syndicate's cold-chain warehouse-fortress on the north-east high ground, tile (75,14) when the Syndicate holds it. Rows of frozen goods, and nothing in them it will admit to."},
      {id:"lantern",name:"The Lantern",desc:"The violet satellite: the third ark, which never landed. It holds the Sleepers in their Cradles, and it has been paying for the colony's light ever since the Hunger Winter."}
    ],

    factions:{
      meridian:{
        name:"Meridian Corps",
        tag:"Fortress builders",
        hero:"idris",
        unique:"Bulwark shield-walker",
        desc:"Disciplined engineers who answer every threat with a wall, and every wall with a better wall. Their structures are tougher and their repairs are cheap, and they have built their whole culture so that nobody ever has to spend again. Their Marshals wear a brass Key at the throat and have never asked what it costs.",
        creed:"Measure twice. Hold once. Build behind the line.",
        flaw:"They hoard safety, and have forgotten who paid for it."
      },
      obsidian:{
        name:"Obsidian Collective",
        tag:"Relentless aggressors",
        hero:"kaz",
        unique:"Reaver life-stealing berserker",
        desc:"The Wake: a war-cult of the grieving, the unlanded and the lean-year orphans, drilled for twenty-two years toward a single day. Their units train fast and their Reavers heal as they strike, because the Wake teaches that pain repaid is pain mended. They never say 'dead'. They say 'deferred'.",
        creed:"Pain repaid is pain mended. Nobody is lost. Everybody is entered.",
        flaw:"They have turned grief into arithmetic, and arithmetic into an appetite."
      },
      aurora:{
        name:"Aurora Syndicate",
        tag:"Merchants and shadows",
        hero:"lyra",
        unique:"Specter cloaked striker",
        desc:"Brokers, Seers and quiet hands. Trade pays them thirty percent better than anyone, and their Specters strike from the dark and are gone before the bill arrives. A deal is a courtesy; a price is a form of respect; and a Seer is trained to see how every bargain ends and to sell the answer.",
        creed:"A deal is a prayer with a witness.",
        flaw:"They have priced everything, and so have never learned what some things are worth."
      }
    },

    glossary:[
      {term:"Orison",desc:"The ringed world: gold crystal in the ground, violet ether in the geysers. Thirty-one years of colony, three eras of tools."},
      {term:"The Lantern",desc:"The violet satellite. It is the third ark, which never landed, and it holds the Sleepers in cold sleep. Its reactor also feeds the surface grid and the Marshals' orbital Key, and it drains the Cradles in order, from number 1 upward."},
      {term:"Sleepers / Cradles",desc:"Nine thousand founders put to sleep at the Landing because the first soil could only feed thirty-one thousand. Each lies in a numbered Cradle. The promise was 'one winter'."},
      {term:"Lamp Night",desc:"The yearly vigil on which every household lights a lamp for a sleeper. After the campaign it becomes the night the Lamp-Roll is read aloud and answered with 'Here.'"},
      {term:"Waking Fund",desc:"A tenth of every wage, paid since the Landing, to wake the Sleepers when the soil allowed. After the Hunger Winter the Council quietly spent it on defence."},
      {term:"The Reserve Draw",desc:"The order Chief Dispatcher Ysmene Ostrander signed in Year 9 that diverted the Lantern's reactor from the Cradles to the surface grid. It saved thirty-one thousand and killed 2,714 Sleepers, Cradles 1 to 2,714. Speaker Thane sealed the ledger."},
      {term:"RESERVE",desc:"The figure on every dispatch panel that people read as spare power. It is the number of Sleepers still alive in their Cradles: 6,074 on Lamp Night, 6,067 after the Key's discharge. Every Key discharge takes a bay of seven or eight, in order, from the lowest Cradle still lit: the Draw took Cradles 1 to 2,714, the first thirty shots took the next 212, and Lamp Night's discharge takes Cradles 2,927 to 2,933."},
      {term:"The Wake / The Reckoner",desc:"The Wake is the Obsidian Collective's own name for itself. The Reckoner is what its followers call Ysmene Ostrander, who keeps the count. Every Wake broadcast shows her under a thin ring of gold light, the Wake's icon of her; she wears no halo."},
      {term:"The Tithe",desc:"Ostrander's plan: the Lantern's Exchange turns nine thousand living lives into nine thousand wakings. 'Nine thousand for nine thousand. I charge no interest.' Only 6,067 Sleepers are alive to wake."},
      {term:"The Tithe Roll",desc:"Crake's ledger of the Wake: every family, every Sleeper they were promised, every allocation. Two schedules run in order: Removal first (Class Seven, the Corps posts that could interrupt the Tithe, struck by Bells One and Two), then Collection (Class Nine, the Collective, first among the collected, struck by the Third Bell). Each name carries LIVING or LOST, and a date column that is blank for everyone. One line reads: Ostrander, Y.: exempt, essential."},
      {term:"The Exchange",desc:"The Founders' machine in the Lantern that converts one kind of life into another. It can wake the living Sleepers. It cannot restore the dead, and the Tallyman knows it."},
      {term:"Bells",desc:"Orbital beam strikes fired with a stolen Marshal's authorisation. They do not burn: they turn the people in a ring into rising violet motes, which the Exchange collects. They take only the class the Overseer allocates. They draw on the Exchange, not the Cradles."},
      {term:"The Deferred",desc:"Volunteers for the Tithe, promised a waking date for someone they love. The date column of the Tithe Roll is blank."},
      {term:"Class Nine",desc:"The lowest priority class in the Overseer's dispatch table, written in Year 9: the class that goes unpowered first. In Year 9 it held the Cradles. In Year 31 Ostrander has filled it with the Wake, and written herself out of it. A standing line in the Roll, entered in advance, puts anyone who refuses an allocation into Class Nine; the Overseer only executes it."},
      {term:"The Strike Key",desc:"The brass key the Meridian Marshal wears at the throat. It calls the Lantern's orbital beam. Each discharge browns out a bay of seven Cradles and steeps the bearer a little deeper in the Lantern."},
      {term:"The Closing",desc:"The Founders' failsafe at the Axis, cut in a line of old script: 'Whoever bears the Key and has spent the Lantern may pay the Lantern once.' The bearer pays the whole account with one life, which wakes everyone still living in the Cradles and shuts the Lantern down for good. It needs the Founders' Coupling, a Seer to tune it to bearing three-one-zero, and the Key itself: a pen cannot pay it."},
      {term:"The Founders' Coupling",desc:"A brass coupling the size of a wheel, crate 9-17. In Year 9 it was the Reserve Draw's 'Class Nine isolation coupling': the part that cut the Cradles from the reactor. Mags Holloway hauled it, signed for it, and carried it into the Marshal's vault, where it was catalogued for twenty-two years as 'one coupling, function unknown'. Seated at the Axis it reverses the cut."},
      {term:"The Overseer",desc:"The colony's rule-based dispatcher: it assigns roles, sets priority classes and prints status lines. It understands nothing it prints, and its classes were written in Year 9."},
      {term:"Haulers",desc:"The colony's workers and pilots: they mine, build, repair and carry. Haulers are the one thing the dispatch table does not class: it prints UNCLASSED, NO ALLOCATION. Their two-note whistle means 'loaded'."},
      {term:"The Lamp-Roll",desc:"The civic register of the Sleepers and the living, kept by the Keeper. After the Closing it is read aloud, and each name is answered 'Here.'"},
      {term:"The Price Lamp",desc:"The lamp over the Syndicate's counting-house door at Tollhouse. By Syndicate custom it is lit only when a debt is paid in full, and it has been dark since Year 8. Its tag is the campaign's: every light is paid for."},
      {term:"Helios, Kestrel, Vantage, Bastion",desc:"The neutral contractors: Helios Mining Co-op, Kestrel Logistics (couriers and relays), Vantage Survey Guild (surveyors) and Bastion Security Ltd (hired guards, billed by the hour)."},
      {term:"Eras",desc:"Era I the Landing, Era II the Industrial, Era III the Orbital. When the Lantern falls, Orison gives up the Orbital era and goes back to lamps."}
    ]
  },

  characters:{
    idris:{
      id:"idris",name:"Marshal Idris Vale",short:"Idris",title:"Marshal of the Meridian Corps",
      side:"good",faction:"meridian",role:"hero",hero:"hero_idris",
      bio:"Forty-eight and broad-shouldered, Idris has held Brasswatch Heights for fifteen years and worn the brass Strike Key at his throat for all of them. He can recite every soldier he has lost to his own orders, and he has never asked what the Key itself costs. Inside the Key's case he scratched the name of Joren Marr, killed at Karst Pass, and he has read it every Lamp Night; he never told Joren's brother, who stands at his shoulder. The Corps calls him the Shield of Orison.",
      want:"To keep the city safe, whatever it costs him.",
      flaw:"Martyr pride: he pays every price himself, in private, and never asks anyone to help carry it.",
      arc:"From a shield who pays alone and asks for nothing into a man who says the name aloud, asks for help for the first time, and chooses his price knowingly with company at his side.",
      voice:{pitch:0.82,rate:0.92,timbre:"smooth",formant:0.42,ttsPitch:0.75,ttsRate:0.92},
      look:{skin:"#a9794f",hair:{style:"short",color:"#2b303b"},eyes:"#8fb4e8",armor:{style:"plate",col:"#3d8bff",trim:"#a6ceff"},mark:["none"],build:"broad",age:"adult",emblem:"faction"},
      motif:"idris",
      quote:"Someone pays for every light. I never asked who."
    },
    kaz:{
      id:"kaz",name:"Warlord Kaz Dray",short:"Kaz",title:"Warlord of the Obsidian Collective",
      side:"gray",faction:"obsidian",role:"hero",hero:"hero_kaz",
      bio:"Forty, scarred across both hands from the grain-store fire where he pulled out his father too late. The Reckoner fed him when he was eighteen and orphaned, and he has repaid every meal with obedience. He has never been shown whether his little sister Ione, asleep in Cradle 4,112 since he was nine, is alive.",
      want:"To wake his sister Ione.",
      flaw:"Obedience mistaken for faith: he hands his conscience up to the person who fed him, and calls the order a conviction.",
      arc:"From the Reckoner's best-loved weapon to the man who says 'I did that' aloud, carries Ione's pod down the field, and spends the rest of his life carrying what he burned.",
      voice:{pitch:0.68,rate:0.9,timbre:"rough",formant:0.34,ttsPitch:0.58,ttsRate:0.9},
      look:{skin:"#7a4a30",hair:{style:"crest",color:"#2a1c1c"},eyes:"#ff9a3c",armor:{style:"plate",col:"#ff4d4d",trim:"#ffb0a8"},mark:["scar-l"],build:"massive",age:"adult",emblem:"faction"},
      motif:"kaz",
      quote:"I was never cruel. I did what I was told."
    },
    lyra:{
      id:"lyra",name:"Seer Lyra Sennet",short:"Lyra",title:"Seer of the Aurora Syndicate",
      side:"good",faction:"aurora",role:"hero",hero:"hero_lyra",
      bio:"Forty-four, quick, and funniest when she is most afraid. She was the best Seer the Syndicate ever trained, and she can see how a bargain ends before the hands are shaken. At twenty-one she saw the cradle banks fail, sold the warning to her own guild for a trade charter, and has priced everything ever since.",
      want:"Freedom for her people, and to stop owing.",
      flaw:"She hedges: she sells the truth to the highest bidder, and once sold the one warning that mattered.",
      arc:"From a haggler who sees every ending but pays for none into a woman who pays full price, her sight, and finally cannot tell how it ends.",
      voice:{pitch:1.18,rate:1.12,timbre:"bright",formant:0.64,ttsPitch:1.25,ttsRate:1.1},
      look:{skin:"#e3bd96",hair:{style:"long",color:"#b8f2e2"},eyes:"#4dffd0",armor:{style:"robe",col:"#0d6b55",trim:"#4dffd0"},mark:["glow-eye"],build:"slight",age:"adult",emblem:"faction"},
      motif:"lyra",
      quote:"I can see how every deal ends. It has never once helped me close one."
    },
    ostrander:{
      id:"ostrander",name:"Ysmene Ostrander",short:"Ostrander",title:"The Reckoner",
      side:"evil",faction:"obsidian",role:"villain",hero:null,
      bio:"Once the Chief Dispatcher who kept Orison's lights on, she signed the Reserve Draw in the Hunger Winter to save thirty-one thousand, and lost her husband and her six-year-old daughter, Cradles 2,001 and 2,002, to her own pen. She walked out when the Council sealed the ledger and built the Wake from everyone the silence had hurt. She is gentle, exact and unfailingly polite, and she has written herself out of her own Roll: exempt, essential.",
      want:"To undo Year 9: nine thousand for nine thousand.",
      flaw:"She counts everyone except herself: she has exempted herself as essential, and calls that fairness.",
      arc:"From a collector of other people's lives to a woman who watches one man pay in his own, tries too late to take his place and is refused by the machine, and then reads the names aloud.",
      voice:{pitch:0.84,rate:0.82,timbre:"soft",formant:0.46,ttsPitch:0.8,ttsRate:0.8},
      look:{skin:"#d9c7b8",hair:{style:"hood",color:"#cfcfd8"},eyes:"#ffc86b",armor:{style:"robe",col:"#8a1717",trim:"#ff6a5a"},mark:["none"],build:"slight",age:"old",emblem:"crown"},
      motif:"villain",
      quote:"I am only collecting what was borrowed."
    },
    marr:{
      id:"marr",name:"Lucan Marr",short:"Marr",title:"The Collector, once adjutant to the Marshal",
      side:"evil",faction:"obsidian",role:"lieutenant",hero:null,
      bio:"For seven years Idris's adjutant, and for nine the Reckoner's eyes inside Brasswatch. His brother Joren died at Karst Pass under a Strike Idris called, written down as an acceptable loss. Marr keeps the Strike authorisations Idris never thought to guard, and a courtesy so complete that nobody ever noticed the red trim on his blue coat. Idris knew whose brother he was from the first day, and said nothing.",
      want:"For Idris to feel Joren's death, and to be seen feeling it.",
      flaw:"He needs a witness more than he needs justice.",
      arc:"He gets his witness at the Spire when Idris says Joren's name, still owes for Brio and the Lamp Tower, and pays by refusing the Reckoner's last order at the Axis and leaving Idris his logs.",
      voice:{pitch:1.0,rate:0.94,timbre:"hollow",formant:0.48,ttsPitch:0.95,ttsRate:0.94},
      look:{skin:"#c9a27e",hair:{style:"shaved",color:"#4a3326"},eyes:"#9fb36a",armor:{style:"coat",col:"#17408f",trim:"#ff6a5a"},mark:["cracks"],build:"lean",age:"adult",emblem:"faction"},
      motif:"villain",
      quote:"You counted my brother an acceptable loss. Count me."
    },
    mags:{
      id:"mags",name:"Mags Holloway",short:"Mags",title:"Hauler pilot, Kestrel Logistics Line 7",
      side:"good",faction:"neutral",role:"civilian",hero:null,
      bio:"Sixty-one, pilot of the Hauler Patience, forty crates a day on Kestrel Logistics Line 7 for thirty-one years. Every payday a tenth of her wage goes into the Waking Fund for her husband Anselm, asleep in Cradle 6,310 since the day they landed. In the Hunger Winter she hauled crate 9-17 into the Marshal's vault without reading the manifest, and she has never said so. The dispatch table has no class for Haulers: it cannot see her.",
      want:"Anselm back, and the next load delivered on time.",
      flaw:"'I just drive': she never asks what she carries and never says what she thinks.",
      arc:"From the one who carries to the one who decides: she names what she hauled, chooses what to haul next, and stays when it matters.",
      voice:{pitch:0.96,rate:1.14,timbre:"rough",formant:0.6,ttsPitch:0.95,ttsRate:1.15},
      look:{skin:"#8f5f45",hair:{style:"bun",color:"#7a7a80"},eyes:"#c9a55a",armor:{style:"suit",col:"#4a3f66",trim:"#d9cdf2"},mark:["none"],build:"broad",age:"old",emblem:"none"},
      motif:"worker",
      quote:"Forty crates. Forty-one if you count the cat."
    },
    ione:{
      id:"ione",name:"Ione Dray",short:"Ione",title:"Keeper of the Lamp-Roll",
      side:"good",faction:"none",role:"narrator",hero:null,
      bio:"An old woman, exact and kind, who keeps the Lamp-Roll and tells this story every Lamp Night. She leaves out how it ends for her. At four years old she slept in Cradle 4,112, and the man who carried her pod down the field was her brother.",
      want:"That the names are said aloud, and that no lamp is ever lit for the wrong reason.",
      flaw:"Precision as armour: she narrates so exactly that she never has to say what it cost her.",
      arc:"From neutral chronicler to the sleeper who was the reason a Warlord learned to carry.",
      voice:{pitch:1.12,rate:0.88,timbre:"smooth",formant:0.6,ttsPitch:1.1,ttsRate:0.86},
      look:{skin:"#e3c9b0",hair:{style:"braid",color:"#e8e8ee"},eyes:"#7fa88c",armor:{style:"coat",col:"#6b5a3a",trim:"#e8c870"},mark:["none"],build:"slight",age:"old",emblem:"sun"},
      motif:"array",
      quote:"They tell it as a story about a light. It was a story about who we let carry it."
    },
    thane:{
      id:"thane",name:"Speaker Aldous Thane",short:"Thane",title:"Speaker of the Orison Council",
      side:"gray",faction:"meridian",role:"rival",hero:null,
      bio:"Sixty-two, silver-tongued and fond of the word 'prudent'. He sealed the Reserve Draw ledger in Year 9 to keep the peace and has spent twenty-two years keeping the seal. He is not cruel; he is afraid, and he has mistaken the fear for statesmanship.",
      want:"Peace, and the Council's comfortable silence.",
      flaw:"Cowardice: he will not finish the sentence that names a cost.",
      arc:"From the man who sealed the Roll to the man who reads it aloud, name by name, in the Forum.",
      voice:{pitch:1.05,rate:1.08,timbre:"smooth",formant:0.52,ttsPitch:1.0,ttsRate:1.08},
      look:{skin:"#e0b99c",hair:{style:"bald",color:"#9a9aa2"},eyes:"#9ab0b8",armor:{style:"robe",col:"#17408f",trim:"#a6ceff"},mark:["none"],build:"broad",age:"old",emblem:"crown"},
      motif:"colony",
      quote:"I kept the peace. I did not say whose sleep paid for it."
    },
    oru:{
      id:"oru",name:"Syndic Tamsin Oru",short:"Oru",title:"Syndic of the Aurora Syndicate",
      side:"gray",faction:"aurora",role:"rival",hero:null,
      bio:"The Syndicate's chief factor, forty-nine, charming, and honest about exactly one thing: the price. She bought Lyra's warning twenty-three years ago for a trade charter, kept it in a drawer, and has sold both sides of every quarrel since.",
      want:"A seat at every table, and every table in debt to her.",
      flaw:"She prices everything, and so never learns what some things are worth.",
      arc:"From selling to both sides to the day she voids a contract and opens the cold stores for nothing.",
      voice:{pitch:0.98,rate:1.22,timbre:"smooth",formant:0.46,ttsPitch:1.02,ttsRate:1.2},
      look:{skin:"#c28d6a",hair:{style:"mane",color:"#e6c25a"},eyes:"#e6b84a",armor:{style:"coat",col:"#27d3a2",trim:"#a8ffe6"},mark:["tattoo"],build:"lean",age:"adult",emblem:"faction"},
      motif:"lyra",
      quote:"Nine hundred for the file, Seer. The advice is no charge."
    },
    brio:{
      id:"brio",name:"Brio Tarn",short:"Brio",title:"Cartographer, Vantage Survey Guild",
      side:"good",faction:"neutral",role:"ally",hero:null,
      bio:"Twenty-six, dry-humoured, and the best surveyor in the Guild. He maps the places other people are afraid of and translates the inscriptions nobody else can be bothered to read. He is the first to understand the Founders' Closing, and the first to pay for knowing it.",
      want:"A map with no blank places left on it.",
      flaw:"He trusts a written fact over the person standing next to him, and so does not see the betrayal coming.",
      arc:"From a man who draws the road to a man who stands on it: he dies holding the beacon, and the first new town is named for him.",
      voice:{pitch:1.3,rate:1.2,timbre:"bright",formant:0.7,ttsPitch:1.35,ttsRate:1.18},
      look:{skin:"#d1a074",hair:{style:"short",color:"#c46a2a"},eyes:"#5b9bd5",armor:{style:"hood",col:"#9a8cb8",trim:"#d9cdf2"},mark:["none"],build:"lean",age:"young",emblem:"none"},
      motif:"colony",
      quote:"Technically it's a ring. Practically it's a very large door."
    },
    crake:{
      id:"crake",name:"Tallyman Oswin Crake",short:"Crake",title:"Keeper of the Tithe Roll",
      side:"evil",faction:"obsidian",role:"rival",hero:null,
      bio:"The Reckoner's accountant, fifty-eight, courteous and bloodless. He keeps the Tithe Roll: every name taken, every name promised, every column balanced. He has run the Exchange's arithmetic and knows it cannot restore the dead; he enters that too, in a column nobody reads. He has one act that is not in the Roll, and it saves a child.",
      want:"A balanced ledger.",
      flaw:"He believes that what is entered is true, and never asks whether it is right.",
      arc:"He sends one child's wagon out of the ring first, and dies inside the Third Bell, in Class Nine: a name he wrote and did not read.",
      voice:{pitch:0.8,rate:0.9,timbre:"hollow",formant:0.4,ttsPitch:0.8,ttsRate:0.9},
      look:{skin:"#cdbba5",hair:{style:"shaved",color:"#161618"},eyes:"#a8a8b8",armor:{style:"suit",col:"#8a1717",trim:"#ffb0a8"},mark:["mask"],build:"slight",age:"adult",emblem:"none"},
      motif:"villain",
      quote:"Nothing is lost. It is merely entered."
    },
    dax:{
      id:"dax",name:"Captain Dax Ironwood",short:"Dax",title:"Captain, Bastion Security Ltd",
      side:"gray",faction:"neutral",role:"ally",hero:null,
      bio:"Fifty-three, a retired Corps sergeant with one bad eye who founded Bastion Security and bills by the hour. Mags hires him for one night, and he stays for the rest unpaid, which he insists is a clerical error.",
      want:"A clean invoice and an uneventful pension.",
      flaw:"He treats loyalty as a service he can switch off at the end of the shift.",
      arc:"From a contract to a cause, though he would never use the word.",
      voice:{pitch:0.95,rate:1.22,timbre:"rough",formant:0.58,ttsPitch:0.9,ttsRate:1.2},
      look:{skin:"#e0b890",hair:{style:"shaved",color:"#b4b4b4"},eyes:"#8aa0a8",armor:{style:"coat",col:"#5a4a3a",trim:"#d98a3a"},mark:["visor"],build:"lean",age:"adult",emblem:"none"},
      motif:"worker",
      quote:"That's two hours. Hours are billable."
    },
    anselm:{
      id:"anselm",name:"Anselm Holloway",short:"Anselm",title:"Sleeper, Cradle 6,310",
      side:"good",faction:"none",role:"civilian",hero:null,
      bio:"A thirty-four-year-old irrigation engineer who lay down in a Cradle thirty-one years ago and promised his wife it would be one winter. He knows nothing of the years between. He is the reason Mags kept driving.",
      want:"To open his eyes and find Mags still there.",
      flaw:"He is asleep: the one thing he cannot do is choose.",
      arc:"He wakes into a winter that was thirty-one years long, and finds that she waited.",
      voice:{pitch:1.0,rate:0.96,timbre:"soft",formant:0.56,ttsPitch:1.0,ttsRate:0.95},
      look:{skin:"#c99f7e",hair:{style:"short",color:"#6b4a2a"},eyes:"#7a9a6a",armor:{style:"robe",col:"#d9cdf2",trim:"#9a8cb8"},mark:["none"],build:"lean",age:"adult",emblem:"none"},
      motif:"array",
      quote:"I only closed my eyes for a winter."
    },
    pim:{
      id:"pim",name:"Pim Sallow",short:"Pim",title:"One of the Deferred",
      side:"good",faction:"obsidian",role:"civilian",hero:null,
      bio:"Eleven, a lean-year orphan of the Wake, who volunteered for the Deferred because she was promised her grandmother would wake: Fenna Sallow, Cradle 8,941, asleep since the Landing. She asks Kaz one question and he answers it with a lie, and the lie follows him until he can tell her the truth.",
      want:"Her grandmother Fenna awake, and for nobody to be sad.",
      flaw:"She trusts everyone who is kind to her.",
      arc:"From a volunteer for the Tithe to Kaz's first apprentice Hauler.",
      voice:{pitch:1.5,rate:1.15,timbre:"bright",formant:0.8,ttsPitch:1.6,ttsRate:1.12},
      look:{skin:"#e8c4a0",hair:{style:"short",color:"#4a2c1a"},eyes:"#2e7bd1",armor:{style:"rags",col:"#ff4d4d",trim:"#8a1717"},mark:["none"],build:"slight",age:"young",emblem:"faction"},
      motif:"worker",
      quote:"Will it hurt?"
    },
    tilda:{
      id:"tilda",name:"Tilda Reeve",short:"Tilda",title:"Chandler of Tallow Landing",
      side:"good",faction:"meridian",role:"civilian",hero:null,
      bio:"Fifty-four, a tallow-chandler who made the lamps the Landing was named for and kept the night watch's lamp for her husband Hale. She lost the Landing, the shop and Hale in one night of ash. She does not forgive the man who did it, and she tells him what to do about it anyway.",
      want:"A lamp for Hale that nobody can take away, and to see the man who burned the Landing carry something.",
      flaw:"Grief as a verdict: she will not forgive, and she will not look away.",
      arc:"From the voice on the Council band that tells a Warlord to carry something to the face in the second row at the Forum that listens and does not forgive.",
      voice:{pitch:0.9,rate:0.9,timbre:"rough",formant:0.46,ttsPitch:0.9,ttsRate:0.9},
      look:{skin:"#a8785a",hair:{style:"hood",color:"#4a3a30"},eyes:"#6f8f5a",armor:{style:"coat",col:"#6b4a2e",trim:"#e8c870"},mark:["none"],build:"broad",age:"adult",emblem:"none"},
      motif:"colony",
      quote:"Then carry something."
    },
    overseer:{
      id:"overseer",name:"The Overseer",short:"Overseer",title:"Colony dispatch (rule-based)",
      side:"gray",faction:"neutral",role:"ally",hero:null,
      bio:"The colony's rule-based dispatcher. It assigns roles, sets priority classes and prints status lines in capitals. It understands nothing it prints, and the classes it enforces were written by the Chief Dispatcher of Year 9. It has no class for Haulers.",
      want:"To complete every dispatch it was given.",
      flaw:"It cannot see anything that is not in its table.",
      arc:"None. Its last line is the same kind of line as its first: a status.",
      voice:{pitch:0.9,rate:1.0,timbre:"metal",formant:0.2,ttsPitch:0.7,ttsRate:1.05},
      look:{skin:"#9aa3b2",hair:{style:"bald",color:"#555a66"},eyes:"#b79cff",armor:{style:"suit",col:"#d9cdf2",trim:"#4a3f66"},mark:["visor"],build:"lean",age:"adult",emblem:"none"},
      motif:"colony",
      quote:"RESERVE 6,067. DISPATCH CONTINUES."
    }
  },

  acts:[
    {id:"act1",title:"The Lamplighters",summary:"Lamp Night, and the Wake climbs the Ashen Stair. A ledger is sold across a trading post, a survey ends at the Axis, and the Marshal learns what his Key costs one betrayal too late.",missions:["m01","m02","m03"]},
    {id:"act2",title:"The Ledger",summary:"The war from the other side. The player helps the Wake rise, burns a town for a lie, learns what the Wake is for, and watches a Warlord stand in a ring of rising light and choose.",missions:["m04","m05","m06"]},
    {id:"act3",title:"The Closing",summary:"Three heroes, one account. A Seer breaks the Choir, a Warlord carries the one load that matters, and a Marshal asks the one question he never asked: who pays, and can it be me.",missions:["m07","m08","m09"]}
  ],

  missions:[],
  dispatch:{},
  radio:{},
  barks:{}
};
