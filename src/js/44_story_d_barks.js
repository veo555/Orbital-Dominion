/* =========================================================================
   STORY (barks) - HERO, EVERYMAN AND VILLAIN BARKS (owner: barks). Short spoken lines for 84_voice.js bark(charId,key):
     select  the player selects the unit        ack     the player gives it an order
     levelup the hero gains a rank               fall    the hero dies
     taunt   the villain, unprompted
   Keys: idris, kaz, lyra (8 select, 8 ack, 4 levelup, 4 fall); mags, the Hauler pilot everyman (8 select, 8 ack); ostrander (6 taunt).
   The everyman is keyed by character id 'mags': voxCanon() does not map the 'hauler' unit type, so callers pass 'mags'.
   Voices: docs/story/BIBLE.md section 6 (voice guides). Every line is 60 characters or fewer. Data only: no functions, no double quotes inside text.
   ========================================================================= */
Object.assign(STORY.barks,{
  /* ---------------- Marshal Idris Vale: parade-ground counts, orders said back, the Marshal in the third person ---------------- */
  idris:{
    select:[
      "Marshal Vale, reporting. Forty riflemen, counted.",
      "The Marshal is listening. Give the order.",
      "Distance, count, bearing. Which first?",
      "Standing by. The Marshal has stood all night.",
      "Noted. What needs holding, and for how long?",
      "How many, and where? The Marshal counts first.",
      "The Key is cold. The Marshal is ready.",
      "Hold the line? The Marshal will hold it."
    ],
    ack:[
      "Order repeated. The Marshal obeys.",
      "Received, repeated, and carried out.",
      "Men counted first. Then the order. Going.",
      "The order is heard. The Marshal asks no questions.",
      "The Marshal goes where the order goes.",
      "Every man counted. Every man obeys.",
      "Repeated for the record. Carrying it out.",
      "Order received. The Marshal carries it alone."
    ],
    levelup:[
      "Rank confirmed. The shoulders are heavier now.",
      "Another rank. I did not ask the price.",
      "Stronger. The Stair is no shorter than before.",
      "New rank. The count is still short."
    ],
    fall:[
      "Hold the Stair. Count the riflemen, not me.",
      "Noted. The line is yours now. Hold it.",
      "The order stands. Carry on without the Marshal.",
      "Stand the line. The Marshal stands down."
    ]
  },

  /* ---------------- Warlord Kaz Dray: flat declaratives, bread and ash, thanks people, the Wake's 'we' ---------------- */
  kaz:{
    select:[
      "Here. Ash on our hands. Where is the weight?",
      "We are here. Bread in the packs. Tell us the road.",
      "Hands are ready. Say the place, and we lift.",
      "Thank you for calling us. We are standing up.",
      "Warlord Kaz. We walk when you say. Thank you.",
      "We have the ropes. Tell us what to pull.",
      "Ash on the hands, weight on the back. Ready.",
      "The Wake is here. Give us the heavy end."
    ],
    ack:[
      "Yes. It goes on our backs, then.",
      "Thank you. It is on our hands now.",
      "Weight taken. We go.",
      "Heavy. We go anyway.",
      "Hands under it. Lifting now.",
      "We hear you. We go up the road.",
      "Thank you. We will not drop it.",
      "We go. The bread goes with us."
    ],
    levelup:[
      "Stronger hands. The same ash on them.",
      "Fed on bread. Now there is more weight.",
      "We are stronger. The fire is not finished.",
      "More weight. I can take it. Thank you."
    ],
    fall:[
      "Give my load to someone who can carry it.",
      "Ione. Carry her down the field for me.",
      "Thank you. It was heavy.",
      "Put the weight down gently. Mind the ash."
    ]
  },

  /* ---------------- Seer Lyra Sennet: trade terms, if-then, an offer at the end, jokes when frightened ---------------- */
  lyra:{
    select:[
      "Seer Sennet. What's the job worth to you?",
      "Lyra here. If the terms are good, I'm listening.",
      "Consideration first. Then I'll tell you the rest.",
      "A Seer, a price, a plan. Choose any two.",
      "Ready to sell you a sunrise. What's it worth?",
      "Oh, it's you. What's the charter this time?",
      "I see the deal already. Make me an offer.",
      "Sennet, Seer, and open for business."
    ],
    ack:[
      "Done, if the terms hold. Then we bill them.",
      "Agreed. If it goes wrong, I was never here.",
      "On it. If it works, we're square. If not, Oru pays.",
      "Terms accepted. If I'm wrong, I'll refund you.",
      "Moving. If we survive, I invoice the whole trip.",
      "If it's a trap, it's a well-priced one. Going.",
      "Agreed, on account. If it works, I take a cut.",
      "Fine. What's it worth if I say no?"
    ],
    levelup:[
      "Sharper sight. Same bad bargains, though.",
      "I see further now. I don't like the view.",
      "Clearer now. Don't tell Oru what it cost.",
      "Better sight. I'll bill myself double, too."
    ],
    fall:[
      "Tell Oru the debt is paid. Light the lamp.",
      "Oh. That's new. I can't see the ending.",
      "Well. Worst price I ever got.",
      "Sell my sight cheap, Oru. Somebody needs it."
    ]
  },

  /* ---------------- The everyman: Mags Holloway, Hauler pilot, Kestrel Line 7. Short freight-yard lines, counts aloud ---------------- */
  mags:{
    select:[
      "Patience, Line Seven. Heavy run or light?",
      "Mags Holloway. Loaded and waiting, Boss.",
      "Engine's warm. Where's the load, Boss?",
      "One, two, three crates on the rack. Ready.",
      "Patience is fuelled. Give me the route.",
      "Four loads on the books. Pick a lane.",
      "Two notes means loaded. Where to today?",
      "She runs hot today. Keep her moving."
    ],
    ack:[
      "Copy that. On the road.",
      "Load's secure. Going now.",
      "Delivery on the way. Four minutes, give or take.",
      "Heavy, but I've got it. Moving.",
      "Counting as we go. One, two, three.",
      "Cat's on the cab roof. We're rolling anyway.",
      "Two notes, loaded. Rolling out now.",
      "Manifest signed. Route's logged. Going."
    ]
  },

  /* ---------------- The Reckoner, Ysmene Ostrander: courteous, exact, never raises her voice, no contractions ---------------- */
  ostrander:{
    taunt:[
      "Keep spending, please. I will keep the count for you.",
      "Seven to a bay. I will collect every one. Thank you.",
      "The lost are not forgotten. I read every name.",
      "Sleep till the oil and the morning meet. I will wake you.",
      "Thank you for your patience. The Roll is nearly complete.",
      "You have spent before, as I have. Keep going, please."
    ]
  }
});
