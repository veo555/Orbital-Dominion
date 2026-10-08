/* =========================================================================
   CAMPAIGN CUES B + STINGS — data only (format: the worked examples in 82_music.js and 83_music_factions.js; docs/AUDIO_SPEC.md §4).
     tragedy   A minor, 66 BPM, sorrow: dark pad, strings over the Andalusian descent, bell tolls, a soft funeral pulse        (10 bars, ~36 s)
     betrayal  C phrygian, 100 BPM, shock: a dim-7 impact, a chromatic pulse reel, a hold, then the villain figure over a falling bass (12 bars, ~29 s)
     reunion   F major, 80 BPM, tender: warm pad, harp arpeggios, a flute line, kaz in major, the worker whistle                 (12 bars, ~36 s)
     dawn      D minor lifting to D major, 96 BPM, relief: a dark drone, the idris call in major, a warm colony hymn              (16 bars, ~40 s)
     finale    D, 96 BPM, triumph, 90 s: villain (phrygian) resolves to major; worker; then meridian, obsidian and aurora timbres
               join in turn while idris, kaz, lyra are stated; colony opens into hope; a full tutti; array tolls and the cadence (36 bars)
     credits   D, 64 BPM, reflective, 75 s: array toll and a choir roll; the meridian fortress line, the aurora bells (F#), the obsidian
               chant (E phrygian), and back to D for the answering chorus and a bell                                           (20 bars)
   Stings (2–8 s, non-looping; victory / defeat / era also per faction as <sting>.<faction>, built from that faction's palette):
     sting_victory sting_defeat sting_era sting_hero (idris) sting_alarm sting_reveal sting_evil (villain)
   Rules kept here: no stem follows intensity, era or night (no int / era / night curves, no eraGain / nightGain, no int filters): the
   notes and the stem levels are fixed per section (constant gains and section mix only). The engine's global night still scales filter
   cutoffs (fmul), which is outside this file. Motifs are referenced by name through MOTIF (83_motifs.js). A missing motif is skipped
   by the engine with a warning and the cue still plays.
   Rendering/audio only: no simulation state, no randomness, no DOM.
   ========================================================================= */
(function(){
'use strict';

/* ============================================================================================================================ CAMPAIGN CUES */

/* tragedy — sorrow. A minor, 66 BPM. Lament over the Andalusian descent (Am G F E), strings and a dark pad, a bell toll and a soft
   funeral pulse. Sections: lament (4), hold (3), turn (2), close (1). */
MUSIC_DATA.tragedy={
  tempo:66,beats:4,grid:16,key:'A',mode:'minor',loop:false,tail:3,gain:0.3,room:'hall',dly:0.75,dlyFb:0.28,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.55,rev:0.35,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.9,rev:0.04,prio:1},
    arp:{inst:'bell',reg:'C4',gain:0.34,rev:0.3,room:'hall',prio:0.4,ref:'chord'},
    lead:{inst:'strings',reg:'C4',ref:'scale',gain:0.6,rev:0.3,room:'hall',dly:0.1,prio:0.9,spread:0.15},
    drums:{kind:'lanes',gain:0.6,rev:0.1,prio:0.95,kit:{kick:'kick_soft'}},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.38,rev:0.45,room:'hall',voices:2,prio:0.8,spread:0.4}
  },
  sections:[
    {name:'lament',bars:4,chords:'Am G F E',
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1,!:4 1,~:4 1,~:4 1,~:4'},
        lead:{p:['5:8 4:4 3:4','4:8 3:4 2:4','3:8 1:4 .:4','#7:6 6:2 5:8']},
        drums:{kick:'x.......x.......'},choir:{p:'chord'}}},
    {name:'hold',bars:3,chords:'Dm Am E',inst:{lead:'flute'},mix:{drums:0.8},
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1,!:4 1,~:4 1,~:4 1,~:4'},
        lead:{p:['6:8 5:4 4:4','3:4 2:4 1:4 .:4','2:8 .:4 #7:4']},choir:{p:'chord'},
        drums:{kick:'x.......x.......'}}},
    {name:'turn',bars:2,chords:'F G',
      play:{pad:{p:'chord'},bass:{p:'B:16'},lead:{p:['1:4 3:4 6:8','7:8 5:4 .:4']},choir:{p:'chord'}}},
    {name:'close',bars:1,chords:'Am',
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1,:16'},lead:{p:'1:16'},choir:{p:'chord'}}}
  ]
};

/* betrayal — shock. C phrygian, 100 BPM. A dim-7 impact with a crash, then a chromatic pulse reel (Cm Db Cm Ab Bb), a held
   diminished hold, and the turn: the villain figure over a falling chromatic bass, ending on an unresolved G. */
MUSIC_DATA.betrayal={
  tempo:100,beats:4,grid:16,key:'C',mode:'phrygian',loop:false,tail:2.5,gain:0.5,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.5,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_pulse',reg:'C2',gain:0.8,rev:0.03,prio:1},
    arp:{inst:'brass_stab',reg:'C3',gain:0.6,rev:0.15,room:'hall',voices:3,prio:0.7,spread:0.3},
    lead:{inst:'stab_metal',reg:'C4',ref:'scale',gain:0.5,rev:0.2,room:'plate',prio:0.8,spread:0.4},
    drums:{kind:'lanes',gain:0.8,rev:0.08,prio:0.95},
    perc:{kind:'lanes',gain:0.7,rev:0.25,room:'hall',prio:0.6},
    fx:{inst:'bell',reg:'C4',gain:0.4,rev:0.3,room:'hall',prio:0.5,ref:'chord'}
  },
  sections:[
    {name:'impact',bars:1,chords:'Cdim7',
      play:{pad:{p:'chord'},bass:{p:'B:16',inst:'bass_sub'},arp:{p:'C:16'},
        drums:{kick:'X...............'},perc:{crash:'X...............'}}},
    {name:'reel',bars:5,chords:'Cm Db Cm Ab Bb',
      play:{pad:{p:'chord'},bass:{p:'B:2 B:2 B:2 B:2 B:2 B:2 B:2 B:2'},arp:{p:'C . . . C . . . C . . . C . . .'},
        lead:{p:'1:2 .:2 1:2 .:2 2:2 .:2 1:2 .:2'},
        drums:{kick:'x...x...x...x...',snare:'....x.......x...',hat:'x.x.x.x.x.x.x.x.'}}},
    {name:'hold',bars:2,chords:'Cdim@2',inst:{bass:'bass_sub'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},fx:{p:'3,:8 .:8'}}},
    {name:'turn',bars:4,chords:'Cm Bb Ab G',inst:{bass:'bass_dist'},mix:{bass:0.8},
      motifs:[{id:'villain',bar:0,beat:0,stem:'lead',key:'C',mode:'phrygian',vel:0.9}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},drums:{kick:'x.......x.......'},
        perc:{crash:['X...............','................','................','................']}}}
  ]
};

/* reunion — tender. F major, 80 BPM. Warm pad, harp arpeggios and a flute line; kaz restated in major (the horn, quiet), the worker
   whistle (kalimba) returning, and a close on F. */
MUSIC_DATA.reunion={
  tempo:80,beats:4,grid:16,key:'F',mode:'major',loop:false,tail:3,gain:0.32,room:'hall',dly:0.75,dlyFb:0.28,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.55,rev:0.35,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    arp:{inst:'harp',reg:'C4',gain:0.6,rev:0.3,room:'hall',dly:0.15,prio:0.4,spread:0.4},
    lead:{inst:'flute',reg:'C4',ref:'scale',gain:0.6,rev:0.28,room:'hall',dly:0.1,prio:0.9,spread:0.1},
    choir:{inst:'choir_aah',reg:'C3',gain:0.34,rev:0.45,room:'hall',voices:3,prio:0.6,spread:0.5}
  },
  sections:[
    {name:'tender',bars:4,chords:'Fmaj7 Dm7 Bbmaj7 C',
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 2 . . . 3 . . .'},
        lead:{p:['3:8 5:4 3:4','6:8 5:4 .:4','4:4 6:4 8:8','7:8 5:8']}}},
    {name:'kaz',bars:4,chords:'Dm Bb C F',
      motifs:[{id:'kaz',bar:0,beat:0,stem:'lead',inst:'horn',key:'F',mode:'major',vel:0.7}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 2 . . . 3 . . .'}}},
    {name:'whistle',bars:2,chords:'F C',
      motifs:[{id:'worker',bar:0,beat:0,stem:'lead',inst:'kalimba',key:'F',mode:'major',oct:1,vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},choir:{p:'chord'}}},
    {name:'close',bars:2,chords:'F@2',
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 2 . . . 3 . . .'},
        lead:{p:['5:8 3:8','1:16']},choir:{p:'chord'}}}
  ]
};

/* dawn — relief. D minor (a night drone, a bell and a rising swell) lifts into D major; the idris call on the horn, a glass shimmer,
   a warm colony hymn in flute and choir, and a horn cadence on D. */
MUSIC_DATA.dawn={
  tempo:96,beats:4,grid:16,key:'D',mode:'major',loop:false,tail:3,gain:0.5,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.5,rev:0.35,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    arp:{inst:'bell',reg:'C4',gain:0.4,rev:0.3,room:'hall',prio:0.4,ref:'chord',spread:0.5},
    lead:{inst:'horn',reg:'C4',ref:'scale',gain:0.6,rev:0.25,room:'hall',dly:0.1,prio:0.9,pan:0.05},
    fx:{inst:'swell',reg:'C4',kind:'notes',gain:0.35,rev:0.2,room:'air',prio:0.3},
    drums:{kind:'lanes',gain:0.5,rev:0.1,prio:0.9},
    choir:{inst:'choir_aah',reg:'C3',gain:0.4,rev:0.4,room:'hall',voices:3,prio:0.6,spread:0.5}
  },
  sections:[
    {name:'night',bars:4,mode:'minor',chords:'Dm Gm Dm A',mix:{pad:0.85,bass:0.85},
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1,:16'},fx:{p:['.:16','.:16','.:16','1:16']}}},
    {name:'dawn',bars:4,chords:'D G A D',
      motifs:[{id:'idris',bar:0,beat:0,stem:'lead',inst:'horn',key:'D',mode:'major',vel:0.95}],
      inst:{pad:'pad_warm',bass:'bass_saw',arp:'glass'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 4 . . . 3 . . .'},drums:{shaker:'x.x.x.x.x.x.x.x.'}}},
    {name:'warm',bars:4,chords:'Bm G D/F# A',
      motifs:[{id:'colony',bar:0,beat:0,stem:'choir',inst:'choir_aah',key:'D',mode:'major',vel:0.9}],
      inst:{pad:'pad_warm',bass:'bass_saw'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},
        lead:{p:['6:8 3:8','4:4 5:4 6:8','8:8 7:4 8:4','5:8 6:8'],inst:'flute'},drums:{shaker:'x.x.x.x.x.x.x.x.'}}},
    {name:'rise',bars:4,chords:'G A Bm D',mix:{bass:0.85,arp:0.8},
      inst:{pad:'pad_warm'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1,:16'},
        lead:{p:['4:8 5:8','8:8 7:4 8:4','5:4 3:4 1:8','1:16']}}}
  ]
};

/* finale — triumph, 90 s (36 bars at 96 BPM). The villain (phrygian, dark pedal) is answered by the worker whistle in major; the
   meridian timbre joins with idris (brass, timpani, snare); the obsidian timbre joins with kaz (horn, taiko, anvil, riff, stabs);
   the aurora timbre joins with lyra (glass, bells, air pad, shaker); colony opens into hope; a full tutti; the array tolls and the
   final cadence rings on D. The gate window is the first 24 s: that stretch stays in D so its key measures as D. */
MUSIC_DATA.finale={
  tempo:96,beats:4,grid:16,key:'D',mode:'major',loop:false,tail:3.5,gain:0.5,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.5,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    arp:{inst:'bell',reg:'C4',gain:0.36,rev:0.3,room:'hall',prio:0.4,ref:'chord',spread:0.6,voices:2},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.22,room:'hall',dly:0.1,prio:0.9,pan:0.06},
    drums:{kind:'lanes',gain:0.75,rev:0.08,prio:0.95},
    perc:{kind:'lanes',gain:0.7,rev:0.2,room:'hall',prio:0.6},
    mot:{inst:'bell',reg:'C4',gain:0.55,rev:0.3,room:'hall',prio:0.9},
    toll:{inst:'bell',reg:'C4',gain:0.8,rev:0.4,room:'hall',prio:0.95},
    choir:{inst:'choir_aah',reg:'C3',gain:0.42,rev:0.45,room:'hall',voices:3,prio:0.6,spread:0.5}
  },
  sections:[
    /* S1 abyss (0–10 s): the villain over a dark pedal, phrygian */
    {name:'abyss',bars:4,mode:'phrygian',chords:'Dm Eb Dm A',inst:{pad:'pad_dark',bass:'bass_dist'},mix:{bass:0.7,perc:0.85},
      motifs:[{id:'villain',bar:0,beat:0,stem:'bass',key:'D',mode:'phrygian',vel:0.9}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},perc:{sub_hit:['x...............','................','................','................']}}},
    /* S2 workers (10–20 s): the villain resolves to major; the worker whistle */
    {name:'workers',bars:4,chords:'D G A D',inst:{pad:'pad_warm',bass:'bass_saw'},
      motifs:[{id:'worker',bar:0,beat:0,stem:'mot',key:'D',mode:'major',oct:1,vel:0.9},
              {id:'worker',bar:2,beat:0,stem:'mot',key:'D',mode:'major',oct:1,vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},drums:{kick:'x.......x.......',hat:'x.x.x.x.x.x.x.x.'}}},
    /* S3 fortress (20–30 s): meridian joins (brass, snare, timpani); idris */
    {name:'fortress',bars:4,chords:'D G A D',inst:{pad:'pad_warm',bass:'bass_saw'},
      motifs:[{id:'idris',bar:0,beat:0,stem:'lead',inst:'brass',key:'D',mode:'major',vel:1},
              {id:'idris',bar:2,beat:0,stem:'lead',inst:'horn',key:'D',mode:'major',oct:1,vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},drums:{kick:'x.......x.......',snare:'o.o.X.o.o.o.X.o.'},
        perc:{timp1:['x...............','x.......x.......','x...............','x...............']},choir:{p:'chord'}}},
    /* S4 furnace (30–40 s): obsidian joins (taiko, anvil, distorted riff, stabs); kaz with the horn an octave down */
    {name:'furnace',bars:4,chords:'D Bm G A',inst:{pad:'pad_dark',bass:'bass_dist',arp:'stab_metal'},
      motifs:[{id:'kaz',bar:0,beat:0,stem:'lead',inst:'horn',key:'D',mode:'major',oct:-1,vel:0.95}],
      play:{pad:{p:'chord'},bass:{p:'B:2 B:2 .:2 B:2 B:2 B:2 .:2 B:2'},arp:{p:'. . C . . . C . . . C . . . C .'},
        lead:{p:['.:16','.:16','1:3 .:1 2:1 1:2 .:1 3:2 2:2 1:2 .:2','5:3 .:1 3:1 2:2 .:1 1:2 2:2 3:2 .:2'],oct:1,inst:'lead_dist'},
        drums:{kick:'x..x..x.x..x..x.',hat:'x.xxx.xxx.xxx.xx'},
        perc:{taiko:'X.......X...x...',taiko_hi:'..x...x...x...x.',
          anvil:['................','................','................','x...............']},
        choir:{p:'chord'}}},
    /* S5 lantern (40–50 s): aurora joins (glass, bells, air pad, shaker, chorus); lyra */
    {name:'lantern',bars:4,chords:'Bm G D A',inst:{pad:'pad_air',bass:'bass_sub',arp:'bell',choir:'choir_ooh'},mix:{arp:0.85,perc:0.85},
      motifs:[{id:'lyra',bar:0,beat:0,stem:'mot',key:'D',mode:'major',vel:0.9}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},arp:{p:'1 . 3 . 2 . 4 . 3 . 2 . 3 . 4 .'},drums:{shaker:'x.x.x.x.x.x.x.x.'},
        perc:{tamb:'..x...x...x...x.'},choir:{p:'chord'}}},
    /* S6 colony (50–60 s): the warm hymn, all three timbres */
    {name:'colony',bars:4,chords:'G D Em A',inst:{pad:'pad_warm',bass:'bass_saw',arp:'bell',choir:'choir_aah'},
      motifs:[{id:'colony',bar:0,beat:0,stem:'mot',key:'D',mode:'major',vel:0.9}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},arp:{p:'1 . 3 . 2 . 3 . 1 . 3 . 2 . 3 .'},
        drums:{kick:'x...x...x...x...',snare:'o.o.x.o.o.o.x.o.'},perc:{timp1:'x.......x.......'}}},
    /* S7 hope (60–70 s): the colony resolves into hope; full kit */
    {name:'hope',bars:4,chords:'G D Bm A',inst:{pad:'pad_warm',bass:'bass_saw',arp:'glass'},
      motifs:[{id:'hope',bar:0,beat:0,stem:'lead',key:'D',mode:'major',vel:1},
              {id:'hope',bar:2,beat:0,stem:'lead',inst:'horn',key:'D',mode:'major',oct:1,vel:0.85}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},arp:{p:'1 . . . 3 . . . 2 . . . 4 . . .'},
        drums:{kick:'x.......x.......',snare:'o.o.X.o.o.o.X.o.',hat:'x.x.x.x.x.x.x.x.'},
        perc:{timp1:['x...............','x.......x.......','x...............','x...............']},choir:{p:'chord'}}},
    /* S8 tutti (70–80 s): idris an octave up, kaz and lyra together */
    {name:'tutti',bars:4,chords:'D A Bm G',inst:{pad:'pad_warm',bass:'bass_saw',arp:'bell'},
      motifs:[{id:'idris',bar:0,beat:0,stem:'lead',inst:'brass',key:'D',mode:'major',oct:1,vel:1},
              {id:'kaz',bar:2,beat:0,stem:'lead',inst:'horn',key:'D',mode:'major',vel:0.85},
              {id:'lyra',bar:2,beat:0,stem:'mot',key:'D',mode:'major',oct:1,vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},arp:{p:'1 . . . 3 . . . 2 . . . 4 . . .'},
        drums:{kick:'x...x...x...x...',snare:'o.o.X.o.o.o.X.o.',hat:'x.x.x.x.x.x.x.x.'},
        perc:{taiko:'X.......X...x...',timp1:['x...............','x.......x.......','x...............','x...............']},
        choir:{p:'chord'}}},
    /* S9 release (80–90 s): the array tolls; the cadence rings on D */
    {name:'release',bars:4,chords:'G A Bm D',inst:{pad:'pad_warm',choir:'choir_aah'},mix:{toll:0.6,choir:0.8},
      motifs:[{id:'array',bar:0,beat:0,stem:'toll',key:'D',mode:'major',vel:1},
              {id:'array',bar:2,beat:0,stem:'toll',key:'D',mode:'major',vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},drums:{kick:['x...............','................','................','................']},
        choir:{p:'chord'}}}
  ]
};

/* credits — reflective, 75 s (20 bars at 64 BPM). The array tolls over the Sleepers' roll; the meridian fortress line (rising fourths
   and fifths) on the horn; the aurora bells in F# lydian; the obsidian chant in E phrygian; back in D for the answering chorus and a bell. */
MUSIC_DATA.credits={
  tempo:64,beats:4,grid:16,key:'D',mode:'major',loop:false,tail:4,gain:0.32,room:'hall',dly:0.75,dlyFb:0.28,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.5,rev:0.4,room:'hall',voices:3,prio:1,spread:0.35},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    arp:{inst:'harp',reg:'C4',gain:0.55,rev:0.35,room:'hall',dly:0.15,prio:0.4,spread:0.4},
    lead:{inst:'horn',reg:'C4',ref:'scale',gain:0.5,rev:0.3,room:'hall',dly:0.1,prio:0.9,pan:-0.05},
    perc:{kind:'lanes',gain:0.6,rev:0.2,room:'hall',prio:0.6},
    toll:{inst:'bell',reg:'C4',gain:0.8,rev:0.4,room:'hall',prio:0.95},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.36,rev:0.5,room:'air',voices:3,prio:0.9,spread:0.6}
  },
  sections:[
    {name:'roll',bars:4,chords:'D Bm G A',
      motifs:[{id:'array',bar:0,beat:0,stem:'toll',key:'D',mode:'major',vel:0.9},
              {id:'array',bar:2,beat:0,stem:'toll',key:'D',mode:'major',vel:0.8}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},choir:{p:'chord'}}},
    {name:'fortress',bars:4,chords:'D G A D',
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 2 . . . 3 . . .'},
        lead:{p:['1:4 4:4 5:4 8:4','8:8 7:4 6:4','4:8 5:4 6:4','8:16']}}},
    {name:'bells',bars:4,key:'F#',mode:'lydian',chords:'F#maj7@2 G#add9/F# C#sus2',
      inst:{pad:'pad_air',arp:'bell',lead:'glass',bass:'bass_sub'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . 3 . 2 . 4 . 3 . 2 . 3 . 4 .'},
        lead:{p:['5:8 3:4 1:4','6:4 5:4 3:8','2:8 1:4 .:4','1:16']}}},
    {name:'chant',bars:4,key:'E',mode:'phrygian',chords:'E5@2 F5 E5',
      inst:{pad:'pad_dark',bass:'bass_sub',choir:'chant'},
      play:{pad:{p:'chord'},bass:{p:'B:16'},choir:{p:['1:8 .:8 1:8 .:8','1:4 .:4 1:4 .:4']},perc:{taiko:'X.......X.......'}}},
    {name:'here',bars:4,chords:'D G A D',inst:{choir:'choir_aah'},
      motifs:[{id:'array',bar:1,beat:0,stem:'toll',key:'D',mode:'major',vel:0.8},
              {id:'array',bar:3,beat:0,stem:'toll',key:'D',mode:'major',vel:0.9}],
      play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 2 . . . 3 . . .'},choir:{p:'chord'}}}
  ]
};

/* ============================================================================================================================ STINGS
   Generic stings (the palette is brass, timpani, bells and the air pad); then the faction variants, each from that faction's palette:
   meridian (brass, horn, timpani, snare rudiments, plate reverb, D), obsidian (taiko, anvil, distorted lead, stabs, chant, E phrygian,
   hall), aurora (FM bells, glass, air pad, choir, shaker, F# lydian, air reverb). */

/* victory — triumph, D major, 120 BPM, 4 bars (8 s): a fanfare call, a fortress-style rise, A7, and a held D under a bell cluster */
MUSIC_DATA.sting_victory={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'D',mode:'major',tail:2.5,gain:0.6,room:'hall',duck:0.35,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.45,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.7,rev:0.22,room:'hall',prio:0.9,pan:0.05},
    perc:{kind:'lanes',gain:0.7,rev:0.2,room:'hall',prio:0.8},
    bell:{inst:'bell',reg:'C4',gain:0.36,rev:0.35,room:'hall',prio:0.4,ref:'chord',spread:0.5}
  },
  sections:[{name:'fanfare',bars:4,chords:'D G A7 D',
    play:{pad:{p:'chord'},bass:{p:'B:16'},
      lead:{p:['1:2 .:2 1:2 .:2 5:4 8:4','4:4 4:4 5:4 4:4','5:4 3:4 2:4 1:4','8:16']},
      perc:{timp1:['x...............','x...x...x...x...','x.x.x.x.x.x.x.x.','X...............'],
        crash:['X...............','................','................','................']},
      bell:{p:['.:16','.:16','.:16','1:4 3:4 5:4 8:4']}}}]
};

/* defeat — sorrow, D minor, 60 BPM, 2 bars (8 s): a falling horn line, a low timpani roll and two bell tolls */
MUSIC_DATA.sting_defeat={
  sting:true,loop:false,tempo:60,beats:4,grid:16,key:'D',mode:'minor',tail:2.5,gain:0.38,room:'hall',duck:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.5,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    lead:{inst:'horn',reg:'C4',ref:'scale',gain:0.6,rev:0.25,room:'hall',prio:0.9},
    perc:{kind:'lanes',gain:0.7,rev:0.2,room:'hall',prio:0.8},
    bell:{inst:'bell',reg:'C4',gain:0.36,rev:0.35,room:'hall',prio:0.4,ref:'chord'}
  },
  sections:[{name:'fall',bars:2,chords:'Gm Dm',
    play:{pad:{p:'chord'},bass:{p:'B:16'},lead:{p:['4:4 3:4 2:4 1:4','1:16']},
      perc:{timp5:['x...............','x...............']},bell:{p:['1,:16','1,:16']}}}]
};

/* era — rise, D major, 96 BPM, 2 bars (5 s): a rising scale on the brass, a timpani and snare roll into a chord */
MUSIC_DATA.sting_era={
  sting:true,loop:false,tempo:96,beats:4,grid:16,key:'D',mode:'major',tail:2.5,gain:0.6,room:'hall',duck:0.3,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.4,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.22,room:'hall',prio:0.9},
    perc:{kind:'lanes',gain:0.7,rev:0.2,room:'hall',prio:0.8}
  },
  sections:[{name:'rise',bars:2,chords:'D G',
    play:{pad:{p:'chord'},bass:{p:['B:16','B:16']},
      lead:{p:['1:2 2:2 3:2 4:2 5:2 6:2 7:2 8:2','8:4 5:4 8:8']},
      perc:{timp1:['x.x.x.x.x.x.x.x.','X...............'],snare:['rrrrrrrrrrrrrrrr','................']}}}]
};

/* hero — heroic, D major, 120 BPM, 2 bars (4 s): the idris call on the brass over a timpani hit and a crash */
MUSIC_DATA.sting_hero={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'D',mode:'major',tail:2.5,gain:0.6,room:'hall',duck:0.3,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.45,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.7,rev:0.22,room:'hall',prio:0.9},
    perc:{kind:'lanes',gain:0.7,rev:0.2,room:'hall',prio:0.8}
  },
  sections:[{name:'call',bars:2,chords:'D A',
    motifs:[{id:'idris',bar:0,beat:0,stem:'lead',inst:'brass',key:'D',mode:'major',vel:1}],
    play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},
      perc:{timp1:['x.......x.......','x...x...x...x...'],crash:['X...............','................']}}}]
};

/* alarm — tense, E phrygian, 160 BPM, 2 bars (3 s): eighth-note stabs that alternate E and Bb (a tritone), a kick and snare pulse */
MUSIC_DATA.sting_alarm={
  sting:true,loop:false,tempo:160,beats:4,grid:16,key:'E',mode:'phrygian',tail:2,gain:0.8,room:'hall',duck:0.5,
  stems:{
    arp:{inst:'stab_metal',reg:'C3',gain:0.6,rev:0.1,room:'plate',prio:0.9,ref:'chord',voices:1,gate:0.5},
    drums:{kind:'lanes',gain:0.8,rev:0.05,prio:0.95},
    perc:{kind:'lanes',gain:0.7,rev:0.15,room:'plate',prio:0.8}
  },
  sections:[{name:'siren',bars:2,chords:Array(8).fill('E5@0.125 Bb5@0.125').join(' '),
    play:{arp:{p:'1 . 1 . 1 . 1 . 1 . 1 . 1 . 1 .'},drums:{kick:'x...x...x...x...',snare:'....x.......x...'},
      perc:{clang:['X...............','................']}}}]
};

/* reveal — shock, C phrygian, 120 BPM, 2 bars (4 s): a dim-7 brass stab with a crash and a deep kick, then a falling sub */
MUSIC_DATA.sting_reveal={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'C',mode:'phrygian',tail:2.5,gain:0.4,room:'hall',duck:0.4,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.4,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    arp:{inst:'brass_stab',reg:'C3',gain:0.7,rev:0.15,room:'hall',voices:4,prio:0.9,spread:0.3},
    perc:{kind:'lanes',gain:0.8,rev:0.2,room:'hall',prio:0.9}
  },
  sections:[{name:'shock',bars:2,chords:'Cdim7 Bdim7',
    play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:['C:16','.:16']},
      perc:{crash:['X...............','................'],kick_deep:['X...............','................'],
        sub_hit:['................','X...............']}}}]
};

/* evil — menacing, D phrygian, 96 BPM, 2 bars (5 s): the villain figure over a distorted pedal and a sub hit */
MUSIC_DATA.sting_evil={
  sting:true,loop:false,tempo:96,beats:4,grid:16,key:'D',mode:'phrygian',tail:3,gain:0.5,room:'hall',duck:0.45,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.45,rev:0.3,room:'hall',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_dist',reg:'C2',gain:0.8,rev:0.03,prio:1},
    perc:{kind:'lanes',gain:0.8,rev:0.2,room:'hall',prio:0.9}
  },
  sections:[{name:'menace',bars:2,chords:'Dm Eb',
    motifs:[{id:'villain',bar:0,beat:0,stem:'lead',key:'D',mode:'phrygian',vel:0.9}],
    play:{pad:{p:'chord'},bass:{p:'B:16'},perc:{sub_hit:['x...............','................']}}}]
};

/* ---------------------------------------------------------------- faction variants: <sting>.<faction> */

/* victory.meridian — the fortress rise (1-4-5-8) on brass, a snare rudiment and timpani, plate reverb */
MUSIC_DATA['sting_victory.meridian']={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'D',mode:'major',tail:2.5,gain:0.6,room:'plate',duck:0.35,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.4,rev:0.25,room:'plate',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.7,rev:0.2,room:'plate',prio:0.9,pan:0.06},
    perc:{kind:'lanes',gain:0.75,rev:0.15,room:'plate',prio:0.8}
  },
  sections:[{name:'bastion',bars:4,chords:'D G A7 D',
    play:{pad:{p:'chord'},bass:{p:'B:16'},
      lead:{p:['1:4 4:4 5:4 8:4','8:4 6:4 5:4 4:4','5:4 3:4 2:4 1:4','8:16']},
      perc:{timp1:['x...x...x...x...','x.......x.......','x...x...x...x...','X...............'],
        snare:['o.o.X.o.o.o.X.o.','o.o.X.o.o.o.X.o.','d.xgx.xgd.xgX.rr','................']}}}]
};

/* victory.obsidian — taiko and an anvil, a distorted riff in E phrygian, a chant pulse under the call */
MUSIC_DATA['sting_victory.obsidian']={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'E',mode:'phrygian',tail:2.5,gain:0.45,room:'hall',duck:0.35,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.45,rev:0.3,room:'hall',voices:3,prio:1,spread:0.25},
    bass:{inst:'bass_dist',reg:'C2',ref:'scale',gain:0.7,rev:0.03,prio:1},
    lead:{inst:'lead_dist',reg:'C3',ref:'scale',gain:0.55,rev:0.2,room:'hall',dly:0.1,prio:0.9},
    perc:{kind:'lanes',gain:0.8,rev:0.2,room:'hall',prio:0.9},
    choir:{inst:'chant',reg:'C3',gain:0.5,rev:0.3,room:'hall',voices:1,prio:0.6,p:{vowel:'o',to:'a',scale:0.88}}
  },
  sections:[{name:'warcry',bars:4,chords:'E5 F5 E5 E5',
    play:{pad:{p:'chord'},bass:{p:'B:8 B:8'},
      lead:{p:['1:4 1:4 2:4 1:4','3:4 .:4 2:4 1:4','1:2 .:2 1:2 .:2 2:4 1:4','1:16']},
      perc:{taiko:['X...x...X...x...','X.x.x.x.X.x.x.x.','X...x...X...x...','X...............'],
        taiko_hi:['..x...x...x...x.','..x...x...x...x.','..x.x.x...x.x.x.','................'],
        anvil:['x...............','................','x...............','X...............']},
      choir:{p:['1:16','1:16','1:16','1:16']}}}]
};

/* victory.aurora — shimmering FM bell arpeggios over an air pad, a glass lead rising to F#, a shaker, a choir swell */
MUSIC_DATA['sting_victory.aurora']={
  sting:true,loop:false,tempo:120,beats:4,grid:16,key:'F#',mode:'lydian',tail:3,gain:0.5,room:'air',duck:0.3,
  stems:{
    pad:{inst:'pad_air',reg:'C3',gain:0.5,rev:0.45,room:'air',voices:2,prio:1,spread:0.55},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.05,prio:1},
    lead:{inst:'glass',reg:'C4',ref:'scale',gain:0.55,rev:0.4,room:'air',dly:0.3,prio:0.9,pan:-0.12},
    arp:{inst:'bell',reg:'C5',gain:0.45,rev:0.4,room:'air',prio:0.5,ref:'chord',spread:0.85,voices:2},
    perc:{kind:'lanes',gain:0.6,rev:0.2,room:'air',prio:0.7}
  },
  sections:[{name:'radiance',bars:4,chords:'F#maj7 A#m7 C#sus2 F#add9',
    play:{pad:{p:'chord'},bass:{p:'B:16'},
      lead:{p:['5:4 6:4 8:8','8:4 6:4 5:4 3:4','5:8 3:8','1:16']},
      arp:{p:'1 . . . 3 . . . 2 . . . 4 . . .'},perc:{shaker:'x.x.x.x.x.x.x.x.'}}}]
};

/* defeat.meridian — a falling brass line in D minor, a low timpani, soft snare hits and bell tolls, plate reverb */
MUSIC_DATA['sting_defeat.meridian']={
  sting:true,loop:false,tempo:60,beats:4,grid:16,key:'D',mode:'minor',tail:2.5,gain:0.6,room:'plate',duck:0.3,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.45,rev:0.25,room:'plate',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.2,room:'plate',prio:0.9},
    perc:{kind:'lanes',gain:0.7,rev:0.15,room:'plate',prio:0.8},
    bell:{inst:'bell',reg:'C4',gain:0.36,rev:0.3,room:'plate',prio:0.4,ref:'chord'}
  },
  sections:[{name:'tithe',bars:2,chords:'Gm Dm',
    play:{pad:{p:'chord'},bass:{p:'B:16'},lead:{p:['4:4 3:4 2:4 1:4','1:16']},
      perc:{timp5:['x...............','x...............'],snare:['o...o...o...o...','................']},
      bell:{p:['1,:16','1,:16']}}}]
};

/* defeat.obsidian — a slow taiko heartbeat, a low sub, a dying chant and a falling distorted riff in E phrygian */
MUSIC_DATA['sting_defeat.obsidian']={
  sting:true,loop:false,tempo:60,beats:4,grid:16,key:'E',mode:'phrygian',tail:3,gain:0.6,room:'hall',duck:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.45,rev:0.3,room:'hall',voices:3,prio:1,spread:0.25},
    bass:{inst:'bass_dist',reg:'C2',gain:0.7,rev:0.03,prio:1},
    lead:{inst:'lead_dist',reg:'C3',ref:'scale',gain:0.5,rev:0.22,room:'hall',prio:0.9},
    perc:{kind:'lanes',gain:0.75,rev:0.2,room:'hall',prio:0.8},
    choir:{inst:'chant',reg:'C3',gain:0.45,rev:0.35,room:'hall',voices:1,prio:0.6}
  },
  sections:[{name:'ash',bars:2,chords:'F5 E5',
    play:{pad:{p:'chord'},bass:{p:'B:16'},lead:{p:['2:4 1:4 .:4 1:4','1:12 .:4']},
      perc:{taiko:['X.......X.......','X...............'],kick_deep:['x...............','................']},
      choir:{p:['1:16','1:16']}}}]
};

/* defeat.aurora — F# minor: falling glass, FM bell tolls over an air pad, a choir sigh */
MUSIC_DATA['sting_defeat.aurora']={
  sting:true,loop:false,tempo:60,beats:4,grid:16,key:'F#',mode:'aeolian',tail:3,gain:0.38,room:'air',duck:0.3,
  stems:{
    pad:{inst:'pad_air',reg:'C3',gain:0.45,rev:0.45,room:'air',voices:3,prio:1,spread:0.55},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.05,prio:1},
    lead:{inst:'glass',reg:'C4',ref:'scale',gain:0.5,rev:0.4,room:'air',dly:0.3,prio:0.9,pan:-0.1},
    arp:{inst:'bell',reg:'C5',gain:0.36,rev:0.4,room:'air',prio:0.4,ref:'chord',spread:0.8},
    choir:{inst:'choir_ooh',reg:'C4',gain:0.36,rev:0.55,room:'air',voices:3,prio:0.6,spread:0.7}
  },
  sections:[{name:'dim',bars:2,chords:'F#m D',
    play:{pad:{p:'chord'},bass:{p:'B:16'},lead:{p:['5:4 4:4 3:4 2:4','1:16']},
      arp:{p:['1,:16','1,:16']},choir:{p:'chord'}}}]
};

/* era.meridian — a snare roll and timpani, a brass scale up to the octave and a snare rudiment, plate reverb */
MUSIC_DATA['sting_era.meridian']={
  sting:true,loop:false,tempo:96,beats:4,grid:16,key:'D',mode:'major',tail:2.5,gain:0.6,room:'plate',duck:0.3,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.4,rev:0.25,room:'plate',voices:3,prio:1,spread:0.3},
    bass:{inst:'bass_saw',reg:'C2',gain:0.7,rev:0.04,prio:1},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.65,rev:0.2,room:'plate',prio:0.9,pan:0.06},
    perc:{kind:'lanes',gain:0.75,rev:0.15,room:'plate',prio:0.8}
  },
  sections:[{name:'muster',bars:2,chords:'D G',
    play:{pad:{p:'chord'},bass:{p:'B:16'},
      lead:{p:['1:2 2:2 3:2 4:2 5:2 6:2 7:2 8:2','8:4 5:4 8:8']},
      perc:{timp1:['x.x.x.x.x.x.x.x.','X...............'],snare:['o.o.X.o.o.o.X.o.','d.xgx.xgd.xgX.rr']}}}]
};

/* era.obsidian — a taiko roll, stabs on E and then F, and an ascending distorted line in E phrygian */
MUSIC_DATA['sting_era.obsidian']={
  sting:true,loop:false,tempo:96,beats:4,grid:16,key:'E',mode:'phrygian',tail:2.5,gain:0.6,room:'hall',duck:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.4,rev:0.3,room:'hall',voices:3,prio:1,spread:0.25},
    bass:{inst:'bass_dist',reg:'C2',gain:0.7,rev:0.03,prio:1},
    arp:{inst:'stab_metal',reg:'C3',gain:0.55,rev:0.2,room:'plate',prio:0.6,ref:'chord',voices:1},
    lead:{inst:'lead_dist',reg:'C3',ref:'scale',gain:0.5,rev:0.2,room:'hall',prio:0.9},
    perc:{kind:'lanes',gain:0.8,rev:0.2,room:'hall',prio:0.9}
  },
  sections:[{name:'mustering',bars:2,chords:'E5 F5',
    play:{pad:{p:'chord'},bass:{p:'B:16'},
      lead:{p:['1:2 2:2 3:2 4:2 5:2 6:2 7:2 8:2','8:4 7:4 6:4 5:4']},
      arp:{p:['1 . 1 . 1 . 1 . 1 . 1 . 1 . 1 .','1 . . . . . . . 1 . . . . . . .']},
      perc:{taiko:['x.x.x.x.x.x.x.x.','X...............'],anvil:['................','X...............']}}}]
};

/* era.aurora — an FM bell arpeggio rising through F# lydian over an air pad, a glass line and a choir swell */
MUSIC_DATA['sting_era.aurora']={
  sting:true,loop:false,tempo:96,beats:4,grid:16,key:'F#',mode:'lydian',tail:3,gain:0.42,room:'air',duck:0.3,
  stems:{
    pad:{inst:'pad_air',reg:'C3',gain:0.45,rev:0.45,room:'air',voices:3,prio:1,spread:0.55},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.05,prio:1},
    lead:{inst:'glass',reg:'C4',ref:'scale',gain:0.55,rev:0.4,room:'air',dly:0.3,prio:0.9,pan:-0.1},
    arp:{inst:'bell',reg:'C4',gain:0.45,rev:0.4,room:'air',prio:0.6,ref:'chord',spread:0.8},
    choir:{inst:'choir_ooh',reg:'C4',gain:0.36,rev:0.55,room:'air',voices:2,prio:0.6,spread:0.7}
  },
  sections:[{name:'shimmer',bars:2,chords:'F#maj7 C#sus2',
    play:{pad:{p:'chord'},bass:{p:'B:16'},arp:{p:'1 . . . 3 . . . 5 . . . 8 . . .'},
      lead:{p:['1:4 3:4 5:4 8:4','8:8 6:8']},choir:{p:'chord'}}}]
};

})();
