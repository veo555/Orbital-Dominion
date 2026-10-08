/* =========================================================================
   STORY (4c/n) - ACT III IN-MISSION RADIO (owner: act3). Lines for M7 The Choir Spire (m07_r*), M8 Patience (m08_r*) and M9 The Closing (m09_r*).
   Each id is fired by a trigger in 44_story_c_act3.js (the radio action). Voices: docs/story/BIBLE.md section 6 (voice guides, token ownership).
   Style: 'radio' for comms and status lines; 'shout' for a Bell allocation or a closing authorisation; 'whisper' for a veiled line;
   'normal' for one-word or quiet answers. Durations give at least 19 characters a second (readability gate in tools/validate_story.js).
   The Overseer prints status only (NOUN VALUE. VERB NOUN.) and never understands what it prints.
   Data only: no functions, no double quotes inside text (single quotes only).
   ========================================================================= */
Object.assign(STORY.radio,{
  /* ---------------- M7 The Choir Spire: Day 8, the Spire's high ground, the Roll given away and the gate ---------------- */
  m07_r1:{who:"idris",text:"I'll be at the gate, Seer.",style:"radio",dur:2.0},
  m07_r2:{who:"lyra",text:"That's a price. You come back.",style:"radio",dur:2.2},
  m07_r3:{who:"lyra",text:"It's free. Every name, every column. Take it. Please take it.",style:"radio",dur:3.5},
  m07_r4:{who:"kaz",text:"The Host is turned. She has the Choir and nothing else.",style:"radio",dur:3.3},
  m07_r5:{who:"overseer",text:"CHOIR RELAY LOST. BELL RANGE REDUCED.",style:"radio",dur:2.3},
  m07_r6:{who:"idris",text:"Rifles on the lower ramp.",style:"radio",dur:2.0},
  m07_r7:{who:"overseer",text:"CHOIR RELAY LOST. BELL RANGE AT MINIMUM.",style:"radio",dur:2.6},
  m07_r8:{who:"marr",text:"Marshal. Three relays logged. The Choir has stopped singing.",style:"radio",dur:3.5},
  m07_r9:{who:"marr",text:"Gate logged, Seer. Eleven of mine on the ramp. The rest are on the Axis road.",style:"radio",dur:4.5},

  /* ---------------- M8 Patience: Night 8, the escort from the Stair to the Axis, Tallow, the tower and the Singularity ---------------- */
  m08_r1:{who:"mags",text:"Load's secure. Slow and level, Warlord. She doesn't like potholes.",style:"radio",dur:3.8},
  m08_r2:{who:"tilda",text:"Is that you, Warlord?",style:"radio",dur:1.8},
  m08_r3:{who:"kaz",text:"I burned this. I did that.",style:"normal",dur:2.0},
  m08_r4:{who:"tilda",text:"Then carry something.",style:"radio",dur:1.8},
  m08_r5:{who:"lyra",text:"I sold the warning, Mags.",style:"radio",dur:2.0},
  m08_r6:{who:"mags",text:"Then stop haggling.",style:"radio",dur:1.8},
  m08_r7:{who:"dax",text:"Bastion arriving. Unpaid, Warlord. Clerical error. Invoice to follow.",style:"radio",dur:4.2},
  m08_r8:{who:"lyra",text:"Well's open. Stay out of the middle.",style:"radio",dur:2.4},
  m08_r9:{who:"oru",text:"Tamsin Oru. Contract void. Hunters stand down.",style:"radio",dur:2.8},
  m08_r10:{who:"mags",text:"Load's on the Axis. Easing her down.",style:"radio",dur:2.0},

  /* ---------------- M9 The Closing: Night 9 to dawn, the Tithe Foci, the Axis garrison and one life counted ---------------- */
  m09_r1:{who:"overseer",text:"ALLOCATION: CLASS NINE FIRST.",style:"radio",dur:2.2},
  m09_r2:{who:"overseer",text:"TITHE PULSE. STAIR.",style:"radio",dur:1.8},
  m09_r3:{who:"kaz",text:"I did that. I carried it out and called it faith. This is not that.",style:"radio",dur:3.9},
  m09_r4:{who:"overseer",text:"FOCUS LOST. TITHE RATE REDUCED.",style:"radio",dur:2.2},
  m09_r5:{who:"overseer",text:"LAST FOCUS LOST. TITHE HALTED.",style:"radio",dur:2.2},
  m09_r6:{who:"ostrander",text:"Thank you, Lucan. Fire.",style:"radio",dur:2.0},
  m09_r7:{who:"marr",text:"No. Not him. He said my brother's name.",style:"radio",dur:2.5},
  m09_r8:{who:"overseer",text:"ALLOCATION: MARR, L. CLASS NINE.",style:"shout",dur:2.3},
  m09_r9:{who:"idris",text:"I'm on the Axis. Count who's still with me.",style:"normal",dur:2.6},
  m09_r10:{who:"lyra",text:"Tuned. Bearing three-one-zero. Brio's number.",style:"radio",dur:2.8},
  m09_r11:{who:"mags",text:"I'm here.",style:"radio",dur:1.5},
  m09_r12:{who:"overseer",text:"KEY-BEARER PRESENT. CLOSING AUTHORISED.",style:"shout",dur:2.6},
  m09_r13:{who:"overseer",text:"NINTH BELL. THE HEIGHTS. ALLOCATION: CLASS NINE.",style:"radio",dur:3.0},
  m09_r14:{who:"overseer",text:"TITHE PULSE 2 OF 2. STAIR.",style:"radio",dur:2.0},
  m09_r15:{who:"overseer",text:"TITHE CLOCK. NINTH BELL AT 24:00.",style:"radio",dur:2.4}
});
