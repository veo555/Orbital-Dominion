/* =========================================================================
   STORY (4/n) - ACT I IN-MISSION RADIO (owner: act1). Lines for M1 Lamp Night (m01_r*), M2 The Waking Fund (m02_r*) and M3 The Axis (m03_r*).
   Each id is fired by a trigger in 44_story_c_act1.js (the radio action). Voices: docs/story/BIBLE.md section 6 (voice guides, token ownership).
   Style: 'radio' for comms and status lines; 'shout' only for the Marshal's order. Durations give at least 19 characters a second.
   Data only: no functions, no double quotes inside text (single quotes only).
   ========================================================================= */
Object.assign(STORY.radio,{
  /* ---------------- M1 Lamp Night: Night 1, Brasswatch Heights, defend until dawn ---------------- */
  m01_r1:{who:"overseer",text:"RESERVE 6,074. DISPATCH CONTINUES.",style:"radio",dur:2.6},
  m01_r2:{who:"marr",text:"Garrison first, Marshal. It trains the riflemen, and every turret needs one. The Siphon lifts ether off the geysers.",style:"radio",dur:6.2},
  m01_r3:{who:"mags",text:"Lamps for the Tower, Marshal. Forty crates. Where do you want them?",style:"radio",dur:4.0},
  m01_r4:{who:"marr",text:"Raptors from the east, Marshal. Every sill is lit.",style:"radio",dur:3.2},
  m01_r5:{who:"marr",text:"The Key is cleared, Marshal. The Hub is ready to train you.",style:"radio",dur:3.6},
  m01_r6:{who:"kaz",text:"Hold your lamps high, Marshal. You'll want the light.",style:"radio",dur:3.4},
  m01_r7:{who:"idris",text:"Noted. Hold the Stair.",style:"radio",dur:2.0},
  m01_r8:{who:"idris",text:"Fire.",style:"shout",dur:1.5},
  m01_r9:{who:"overseer",text:"STRIKE DISCHARGE. BAY 2,927 TO 2,933.",style:"radio",dur:2.6},
  m01_r10:{who:"marr",text:"The Lantern answers, Marshal.",style:"radio",dur:2.4},
  m01_r11:{who:"kaz",text:"The light came down on us, Marshal. We are thanked for it.",style:"radio",dur:3.6},
  m01_r12:{who:"marr",text:"I keep your logs, Marshal. Someone should read them.",style:"radio",dur:3.4},
  m01_r13:{who:"mags",text:"Nine Haulers on the books, Marshal. Five stay behind the Hub. I'm counting.",style:"radio",dur:4.0},
  m01_r14:{who:"mags",text:"Copy.",style:"radio",dur:1.5},

  /* ---------------- M2 The Waking Fund: Days 2-3, Kestrel Post, economy and trade ---------------- */
  m02_r1:{who:"oru",text:"Fifteen hundred mined and Era Two opens, Lyra. Then the Exchange sells, and the posts pay.",style:"radio",dur:5.2},
  m02_r2:{who:"overseer",text:"PRIORITY TABLE LOADED. CLASS ONE THROUGH NINE.",style:"radio",dur:2.8},
  m02_r3:{who:"mags",text:"Convoy's in, Seer. The Fund took forty-one off my slip again. Nobody says what it buys.",style:"radio",dur:5.0},
  m02_r4:{who:"overseer",text:"ERA II. ALLOCATION: CLASS SIX.",style:"radio",dur:2.2},
  m02_r5:{who:"idris",text:"The order says contraband. Every crate on the Kestrel lane is noted.",style:"radio",dur:4.0},
  m02_r6:{who:"lyra",text:"Which order? Read me the seal, Marshal.",style:"radio",dur:2.6},
  m02_r7:{who:"brio",text:"Vantage Survey, calling any Seer. Does bearing three-one-zero mean anything? Every line we draw bends to it.",style:"radio",dur:6.2},
  m02_r8:{who:"lyra",text:"Not yet. Send me the chart.",style:"radio",dur:2.2},
  m02_r9:{who:"overseer",text:"PILOT HOLLOWAY, M. UNCLASSED. NO ALLOCATION.",style:"radio",dur:3.0},
  m02_r10:{who:"oru",text:"Raiders on Kestrel Post. Bill the Corps for every crate they break, Lyra.",style:"radio",dur:4.2},
  m02_r11:{who:"idris",text:"Embargo's lifted on your lanes, Seer. Name your price.",style:"radio",dur:3.4},
  m02_r12:{who:"lyra",text:"Open the routes.",style:"radio",dur:1.6},
  m02_r13:{who:"oru",text:"Clear the lane, Lyra. Kestrel's freight rate is posted, and I never discount a posted rate. For you, I might.",style:"radio",dur:5.9},
  m02_r14:{who:"lyra",text:"Freighter's docked at Kestrel, Oru. If the next one clears the camps, what's the route worth to you?",style:"radio",dur:5.4},

  /* ---------------- M3 The Axis: Day 4, creep clearing, the ambush and the hold ---------------- */
  m03_r1:{who:"brio",text:"Vantage survey, Marshal. Beacons go down at every camp you clear.",style:"radio",dur:4.0},
  m03_r2:{who:"brio",text:"One beacon down. The next camp is lit on your map, Marshal. (Yes, I know. I drew it.)",style:"radio",dur:4.6},
  m03_r3:{who:"brio",text:"Two down. Still a ring, Marshal. Still a very large door, and I can count its hinges.",style:"radio",dur:4.6},
  m03_r4:{who:"marr",text:"Six riflemen up the forward road, Marshal. I signed for them, and every camp is in my book.",style:"radio",dur:5.0},
  m03_r5:{who:"brio",text:"Four down. The last one is the ring itself. Brutes, and crystal fused like glass.",style:"radio",dur:4.6},
  m03_r6:{who:"overseer",text:"AXIS. ACCESS GRANTED.",style:"radio",dur:2.0},
  m03_r7:{who:"brio",text:"Founders' script, Marshal. Whoever bears the Key and has spent the Lantern may pay the Lantern once.",style:"radio",dur:5.8},
  m03_r8:{who:"marr",text:"Forgive me, Marshal.",style:"radio",dur:2.2},
  m03_r9:{who:"marr",text:"You counted my brother an acceptable loss. Count me.",style:"radio",dur:3.6},
  m03_r10:{who:"kaz",text:"You found it for us, Marshal. Thank you.",style:"radio",dur:2.8},
  m03_r11:{who:"brio",text:"Beacon's holding. They want the beacon, Marshal, not me.",style:"radio",dur:3.4},
  m03_r12:{who:"brio",text:"Tell the Seer. Bearing three-one-zero. She'll know.",style:"radio",dur:3.4}
});
