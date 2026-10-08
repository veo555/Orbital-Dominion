/* =========================================================================
   STORY (4b/n) - ACT II IN-MISSION RADIO (owner: act2). Lines for M4 Ember Census (m04_r*), M5 Glass Market (m05_r*) and M6 The Third Bell (m06_r*).
   Each id is fired by a trigger in 44_story_c_act2.js (the radio action). Voices: docs/story/BIBLE.md section 6 (voice guides, token ownership).
   Style: 'radio' for comms and status lines; 'shout' for a Bell allocation; 'whisper' for Lyra under the Veil; 'normal' for Kaz's one-word answers.
   Durations give at least 19 characters a second (readability gate in tools/validate_story.js).
   Data only: no functions, no double quotes inside text (single quotes only).
   ========================================================================= */
Object.assign(STORY.radio,{
  /* ---------------- M4 Ember Census: Day 5, Cinder Rise, the levy at Tallow Landing and the race to Era III ---------------- */
  m04_r1:{who:"crake",text:"The Council has quartered a levy at Tallow Landing, Warlord. The Reckoner asks that it be cleared.",style:"radio",dur:5.5},
  m04_r2:{who:"mags",text:"Six Haulers on the books, Warlord. Keep them behind the ridge. I'm counting every one.",style:"radio",dur:4.8},
  m04_r3:{who:"ostrander",text:"Good. Hold the ridge, Warlord. Enter whatever climbs it.",style:"radio",dur:3.0},
  m04_r4:{who:"kaz",text:"Council column from the north, Reckoner. We hold the ridge.",style:"radio",dur:3.3},
  m04_r5:{who:"pim",text:"Thank you for the bread, Warlord.",style:"radio",dur:1.9},
  m04_r6:{who:"thane",text:"Warlord... regrettably... there are, in the circumstances, children.",style:"radio",dur:3.8},
  m04_r7:{who:"overseer",text:"ERA II. FOUNDRY AND AIRFIELD AVAILABLE.",style:"radio",dur:2.2},
  m04_r8:{who:"overseer",text:"COUNCIL ERA II. ALLOCATION: CLASS SEVEN.",style:"radio",dur:2.3},
  m04_r9:{who:"kaz",text:"Lamps in the windows, Tallyman. There are families at the windows.",style:"radio",dur:3.7},
  m04_r10:{who:"crake",text:"Entered as a levy, Warlord. The Roll is balanced.",style:"radio",dur:2.8},
  m04_r11:{who:"crake",text:"Census complete.",style:"radio",dur:1.5},
  m04_r12:{who:"overseer",text:"ERA III. TITHE FOCI AUTHORISED.",style:"radio",dur:1.8},
  m04_r13:{who:"overseer",text:"COUNCIL ERA III. ALLOCATION: CLASS SEVEN.",style:"radio",dur:2.3},
  m04_r14:{who:"kaz",text:"Third column. The ridge is ours, Reckoner. For now.",style:"radio",dur:2.9},
  m04_r15:{who:"mags",text:"One short on the books, Warlord. I'm counting.",style:"radio",dur:2.6},

  /* ---------------- M5 Glass Market: Night 6, Specters through the census camp, the Roll and the Veil ---------------- */
  m05_r1:{who:"mags",text:"Ford's behind us. Wick Post is the first light you'll see. Keep your head down.",style:"radio",dur:4.4},
  m05_r2:{who:"lyra",text:"Veil on. Nobody attacks. If somebody does, attack back quietly.",style:"whisper",dur:3.5},
  m05_r3:{who:"crake",text:"One more column to balance.",style:"radio",dur:1.5},
  m05_r4:{who:"lyra",text:"Charter fourteen. Oh, I know that handwriting.",style:"whisper",dur:2.6},
  m05_r5:{who:"lyra",text:"Class Nine: the Collective. First.",style:"whisper",dur:1.9},
  m05_r6:{who:"lyra",text:"Ostrander, Y.: exempt, essential.",style:"whisper",dur:1.9},
  m05_r7:{who:"overseer",text:"ALARM. PATROL DISPATCHED.",style:"radio",dur:1.5},
  m05_r8:{who:"lyra",text:"If that's a patrol, it's a very expensive one. Stay under the Veil and go quiet.",style:"whisper",dur:4.5},
  m05_r9:{who:"lyra",text:"It wants its Key-bearer.",style:"whisper",dur:1.5},
  m05_r10:{who:"mags",text:"Lamp's lit at Wick Post, Seer. Come in out of the dark.",style:"radio",dur:3.1},
  m05_r11:{who:"lyra",text:"Census is quiet. Nobody saw a thing. What's that worth to you?",style:"whisper",dur:3.5},
  m05_r12:{who:"mags",text:"Pickets at Tallow and at the Market, Seer. Your Specters can't be seen. Use that.",style:"radio",dur:4.5},

  /* ---------------- M6 The Third Bell: Night 7, the Axis, Bells One to Three and the wagons ---------------- */
  m06_r1:{who:"crake",text:"Class Nine will hold the ring.",style:"radio",dur:1.7},
  m06_r2:{who:"overseer",text:"BELL ONE. ALLOCATION: CLASS SEVEN.",style:"radio",dur:1.9},
  m06_r3:{who:"idris",text:"Noted. Hold the posts. Give me the names of everyone who stays.",style:"radio",dur:3.5},
  m06_r4:{who:"overseer",text:"BELL TWO. ALLOCATION: CLASS SEVEN.",style:"radio",dur:1.9},
  m06_r5:{who:"crake",text:"The child's wagon leaves first, Warlord. The three behind it are the rest of the Deferred.",style:"radio",dur:5.0},
  m06_r6:{who:"lyra",text:"Kaz. Look at the ping. Count whose it is.",style:"radio",dur:2.3},
  m06_r7:{who:"kaz",text:"Crake.",style:"normal",dur:1.5},
  m06_r8:{who:"crake",text:"Don't pull back. The Roll is balanced only if the Host stays.",style:"radio",dur:3.4},
  m06_r9:{who:"kaz",text:"You knew.",style:"normal",dur:1.5},
  m06_r10:{who:"crake",text:"Everything in the Roll is true. It is rarely read.",style:"radio",dur:2.8},
  m06_r11:{who:"overseer",text:"BELL THREE. ALLOCATION: CLASS NINE.",style:"shout",dur:2.0},
  m06_r12:{who:"kaz",text:"Turrets on the ring, Reckoner. We clear them, then we hold.",style:"radio",dur:3.3}
});
