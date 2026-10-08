/* =========================================================================
   CAMPAIGN CUES (set A) — data only (format: docs/AUDIO_SPEC.md §9): title, intro, hope, mystery, tension, dread, villain, march, battle.
   Each cue is MUSIC_DATA[id] (82_music.js). Motifs are referenced by id (83_motifs.js). Rendering/audio only; no sim state, no randomness.
   Conventions used here (see §9.4): every cue is static (no `on`/`mix`/`int`/`era` gating, no section `mix`), so a live cue and an
   offline audioRender of it are the same music. Colour changes inside a section come from separate stems (one timbre per stem)
   and from motif entries (each carries its own inst and mode). Patterns are one entry per bar where the bar differs.

   INTRO  "The Lantern Tithe" — 26 bars of 4/4 at 80 BPM (3.000 s per bar), key D. Plays straight through (loop:false, len 78 s).
     section  index  start (s)  bars  length (s)  what it is
     A        0      0.0        6     18.0        planet-rise: a soft heartbeat on the quarters, a swell on a D pedal, the worker figure (bars 2-3), the colony hymn (bars 4-5)
     B        1      18.0       7     21.0        colony hymn (bars 0-1), then the three factions in turn: Meridian (bars 2-3, brass fanfare),
                                                  Aurora (bar 4, bells), Obsidian (bars 5-6, taiko and horn stomp); ends on a Bb into C
     C        2      39.0       5     15.0        villain reveal: a darkening pad (Dm, C#dim, C, Bb, A), the villain cluster on a pedal each bar,
                                                  a heartbeat that quickens; the array tolls at bar 4 and rings into D
     D        3      54.0       6     18.0        war: drums and the bass drive over Dm (bars 0-2), then Bb, C and the cadence on A (bar 5); Idris (bar 0),
                                                  Kaz (bars 1, 3), Idris a fourth up (bar 2), Lyra (bar 4)
     E        4      72.0       2     6.0         title hit (crash, timpani, a brass chord held over both bars) on D major; the hope motif
                                                  resolves, the lyra bell answers; the chord rings out
   Straight-through starts are the table above. The film may steer with `section:n`: a jump restarts that section at its first bar.
   §9.5 lists the steer points these section lengths support.

   LOOPS (all 4/4 unless marked): title 48 s (16 bars, 80 BPM, D) · hope 40 s (20 bars of 3/4, 90 BPM, D) · mystery 40 s (16 bars, 96 BPM, F#) ·
     tension 32 s (16 bars, 120 BPM, E) · dread 40 s (12 bars, 72 BPM, B) · villain 40 s (12 bars, 72 BPM, C) · march 40 s (16 bars, 96 BPM, D) ·
     battle 40 s (20 bars, 120 BPM, A). Every loop seam is a cadence: its last chord leads into its first (title D-D, hope D-D, mystery F#maj7-F#maj7,
     tension Em-Em, dread C-Bm7b5, villain Ab-Cm, march A-D, battle E-Am).
   ========================================================================= */
(function(){
'use strict';
/* pattern vocabulary: lane strings are one char per step (16 per 4/4 bar, 12 per 3/4 bar at grid 16); melodic strings are tokens summing to the bar */
const Z='................';
const HIT='x...............';                       // a single hit on the one
const KM='x.......x.......',K4='x...x...x...x...',KOB='x..x..x.x..x..x.';
const SNB='....x.......x...',SNC='o.o.X.o.o.o.X.o.',SNC2='o.o.X.o.o.o.X.oo',SNE='....x.......x.xx';
const HAT8='x.x.x.x.x.x.x.x.',HAT16='xoxoxoxoxoxoxoxo',TK='X.......X...x...',TIMP4='x...x...x...x...';
const B8='B:8 .:8',BM='B:4 3:4 B:4 3:4',BQ='B:4 B:4 B:4 B:4',RIFF='B:2 B:2 3:2 B:2 B:2 B:2 3:2 B:2';
const ARP8='1:2 2:2 3:2 2:2 1:2 2:2 3:2 2:2';      // arpeggio in eighths (chord tones 1-2-3-2)
const ARP3='1:2 2:2 3:2 1:2 2:2 3:2';              // the same in 3/4 (12 steps)
const SWELL=(n)=>({p:'1:'+n,inst:'swell'});        // one long swell note, n steps (16 per bar)

/* ================================================================================================================ INTRO */
MUSIC_DATA.intro={
  tempo:80,beats:4,grid:16,key:'D',mode:'dorian',loop:false,tail:4,gain:0.5,room:'hall',dly:0.75,dlyFb:0.28,
  stems:{
    pad:  {inst:'pad_warm',reg:'C3',gain:0.6,rev:0.34,room:'hall',voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_sub',reg:'C2',gain:0.8,rev:0.04,prio:1},
    riff: {inst:'bass_dist',reg:'C2',gain:0.5,rev:0.05,prio:0.9},
    arp:  {inst:'marimba',reg:'C4',gain:0.6,rev:0.25,dly:0.12,prio:0.5},
    lead: {inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.24,dly:0.1,prio:0.9},
    drums:{kind:'lanes',gain:0.72,rev:0.08,prio:0.95},
    perc: {kind:'lanes',gain:0.7,rev:0.16,prio:0.7},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.42,rev:0.45,room:'hall',voices:3,prio:0.6,spread:0.5},
    fx:   {inst:'swell',reg:'C3',gain:0.6,rev:0.3,room:'air',prio:0.4},
    stab: {inst:'brass_stab',reg:'C3',gain:0.5,rev:0.2,voices:3,prio:0.7,spread:0.4}
  },
  sections:[
    /* A: planet-rise (bars 0-5). Air pad, a pedal, a swell that opens the whole section, the worker figure, the hymn. */
    {name:'A',bars:6,chords:'Dsus2@2 Gadd9@2 Dm Am',inst:{pad:'pad_air'},
     play:{
       pad:{p:'chord',vel:0.55},
       bass:{p:['B:16','B:16','B:16','B:16','B:8 .:8','B:8 .:8'],vel:0.4},
       perc:{kick_soft:['o...o...o...o...']},
       fx:SWELL(96)
     },
     motifs:[
       {id:'worker',bar:2,beat:0,stem:'arp',inst:'marimba',vel:1.2},
       {id:'worker',bar:3,beat:0,stem:'arp',inst:'marimba',vel:1.2},
       {id:'colony',bar:4,beat:0,stem:'lead',inst:'pad_warm'},
       {id:'colony',bar:4,beat:0,stem:'choir',inst:'choir_ooh'}
     ]},
    /* B: the hymn, then the three factions in turn, each with its own colour (bars 6-12) */
    {name:'B',bars:7,chords:'Dm Am D G Dadd#11 Dmb9 Bb',inst:{bass:'bass_saw'},
     play:{
       pad:{p:'chord',vel:0.8},
       bass:{p:[B8,B8,BM,BM,B8,'B:4 B:4 B:4 .:4',BQ]},
       riff:{p:['.:16','.:16','.:16','.:16','.:16','B:2 B:2 .:2 B:2 .:2 B:2 B:2 .:2','B:2 .:2 B:2 B:2 .:2 B:2 B:2 .:2']},
       drums:{kick:[Z,Z,KM,KM,K4,KOB,KOB],snare:[Z,Z,SNC,SNC2,Z,SNB,SNB],hat:[Z,Z,Z,Z,HAT16,HAT8,HAT8]},
       perc:{kick_soft:['o...o...o...o...','o...o...o...o...',Z,Z,Z,Z,Z],timp1:[Z,Z,KM,KM,Z,Z,Z],shaker:[Z,Z,Z,Z,'x.x.x.x.x.x.x.x.',Z,Z]}
     },
     motifs:[
       {id:'colony',bar:0,beat:0,stem:'lead',inst:'pad_warm'},
       {id:'colony',bar:0,beat:0,stem:'choir',inst:'choir_ooh'},
       {id:'idris',bar:2,beat:0,stem:'lead',inst:'brass'},
       {id:'idris',bar:3,beat:0,stem:'lead',inst:'brass',transpose:7},
       {id:'lyra',bar:4,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:4,beat:0,stem:'choir',inst:'choir_aah'},
       {id:'kaz',bar:5,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:5,beat:0,stem:'perc',inst:'taiko'},
       {id:'kaz',bar:6,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:6,beat:0,stem:'perc',inst:'taiko'}
     ]},
    /* C: villain reveal (bars 13-17). Darkening pad, the villain cluster over a pedal once a bar, a heartbeat; the array tolls at the end */
    {name:'C',bars:5,chords:'Dm C#dim C Bb A',inst:{pad:'pad_dark'},
     play:{
       pad:{p:'chord'},
       perc:{kick_deep:['x.......x.......','x.......x.......','x.....x.......x.',TIMP4,TIMP4]},
       drums:{tamb:[Z,Z,Z,Z,'o.o.o.o.o.o.o.o.']}
     },
     motifs:[
       {id:'villain',bar:0,beat:0,stem:'bass',inst:'mot_dsaw_sub',vel:0.45},
       {id:'villain',bar:1,beat:0,stem:'bass',inst:'mot_dsaw_sub',vel:0.45},
       {id:'villain',bar:2,beat:0,stem:'bass',inst:'mot_dsaw_sub',transpose:-2,vel:0.45},
       {id:'villain',bar:3,beat:0,stem:'bass',inst:'mot_dsaw_sub',vel:0.45},
       {id:'array',bar:4,beat:0,stem:'fx',inst:'mot_toll'}
     ]},
    /* D: war (bars 18-23). Drive bass and groove over three bars of Dm, then Bb and C; the heroes: Idris, Kaz, Idris a fourth up, Kaz, Lyra; the cadence on A */
    {name:'D',bars:6,chords:'Dm@3 Bb C A',inst:{pad:'pad_strings'},
     play:{
       pad:{p:'chord'},
       bass:{p:BQ},
       riff:{p:RIFF},
       drums:{crash:[HIT,Z,Z,Z,Z,Z],kick:[KOB,KOB,KOB,KOB,KOB,K4],snare:[SNB,SNB,SNB,SNB,SNE,SNB],hat:[HAT8,HAT8,HAT8,HAT8,HAT8,HAT8]},
       perc:{timp1:[TIMP4,TIMP4,TIMP4,TIMP4,TIMP4,HIT]}
     },
     motifs:[
       {id:'idris',bar:0,beat:0,stem:'lead',inst:'brass'},
       {id:'kaz',bar:1,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:1,beat:0,stem:'perc',inst:'taiko'},
       {id:'idris',bar:2,beat:0,stem:'lead',inst:'brass',transpose:5},
       {id:'kaz',bar:3,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:3,beat:0,stem:'perc',inst:'taiko'},
       {id:'lyra',bar:4,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:4,beat:0,stem:'choir',inst:'choir_aah'}
     ]},
    /* E: title hit (bars 24-25). Crash, timpani and a brass chord held over both bars on the one; the hope motif resolves, the lyra bell answers; D major rings out */
    {name:'E',bars:2,chords:'D@2',mode:'major',inst:{pad:'pad_strings'},
     play:{
       pad:{p:'chord',voices:2},
       stab:{p:'C:32',inst:'brass',vel:1.4},
       drums:{crash:['X...............',Z],kick:['X...............',Z]},
       perc:{timp1:['X...............',Z]}
     },
     motifs:[
       {id:'hope',bar:0,beat:0,stem:'lead',inst:'strings',vel:1.2},
       {id:'lyra',bar:1,beat:0,stem:'arp',inst:'bell'}
     ]}
  ]
};

/* ================================================================================================================ TITLE (D, the menu theme) */
MUSIC_DATA.title={
  tempo:80,grid:16,key:'D',mode:'major',loop:true,tail:4,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_strings',reg:'C3',gain:0.55,rev:0.34,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_saw',reg:'C2',gain:0.75,rev:0.04,prio:1},
    arp:  {inst:'harp',reg:'C4',gain:0.55,rev:0.3,dly:0.14,prio:0.9},
    lead: {inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.24,dly:0.1,prio:0.9},
    choir:{inst:'choir_aah',reg:'C3',gain:0.4,rev:0.45,voices:2,prio:0.4,spread:0.5},
    drums:{kind:'lanes',gain:0.7,rev:0.08,prio:0.95},
    perc: {kind:'lanes',gain:0.6,rev:0.16,prio:0.7}
  },
  sections:[
    {name:'call',bars:8,chords:'D@2 G@2 A@2 D@2',
     play:{pad:{p:'chord'},bass:{p:[B8,B8,BM,BM,BM,B8,B8,BM]},arp:{p:ARP8},choir:{p:'chord'},
       drums:{kick:[KM,KM,KM,KM,KM,KM,KM,KM],snare:[SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNE],hat:[HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8]},
       perc:{timp1:[HIT,Z,Z,Z,HIT,Z,Z,Z]}},
     motifs:[
       {id:'idris',bar:0,beat:0,stem:'lead',inst:'brass'},
       {id:'idris',bar:4,beat:0,stem:'lead',inst:'brass',transpose:7},
       {id:'lyra',bar:6,beat:0,stem:'arp',inst:'bell'}
     ]},
    {name:'answer',bars:8,chords:'Bm@2 G@2 A@2 D@2',inst:{pad:'pad_warm'},
     play:{pad:{p:'chord'},bass:{p:[B8,B8,BM,BM,BM,B8,B8,BM]},arp:{p:ARP8},choir:{p:'chord'},
       drums:{kick:[KM,KM,KM,KM,KM,KM,KM,KM],snare:[SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNE],hat:[HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8]}},
     motifs:[
       {id:'colony',bar:0,beat:0,stem:'lead',inst:'pad_warm'},
       {id:'colony',bar:0,beat:0,stem:'choir',inst:'choir_ooh'},
       {id:'hope',bar:5,beat:0,stem:'lead',inst:'strings'}
     ]}
  ]
};

/* ================================================================================================================ HOPE (3/4) */
MUSIC_DATA.hope={
  tempo:90,meter:[3,4],grid:16,key:'D',mode:'major',loop:true,tail:4,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_warm',reg:'C3',gain:0.6,rev:0.36,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_sub',reg:'C2',gain:0.7,rev:0.04,prio:1},
    arp:  {inst:'harp',reg:'C4',gain:0.55,rev:0.3,dly:0.14,prio:0.5},
    lead: {inst:'strings',reg:'C4',ref:'scale',gain:0.55,rev:0.3,dly:0.1,prio:0.9},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.4,rev:0.45,voices:3,prio:0.6,spread:0.5},
    perc: {kind:'lanes',gain:0.45,rev:0.2,prio:0.5}
  },
  sections:[
    {name:'verse',bars:10,chords:'D@2 G@2 A@2 D@2 Bm@2',
     play:{pad:{p:'chord'},bass:{p:'B:12'},arp:{p:ARP3},choir:{p:'chord'}},
     motifs:[
       {id:'colony',bar:0,beat:0,stem:'lead',inst:'pad_warm'},
       {id:'colony',bar:0,beat:0,stem:'choir',inst:'choir_ooh'}
     ]},
    {name:'resolve',bars:10,chords:'G@2 D@2 Em@2 A@2 D@2',inst:{pad:'pad_strings'},
     play:{pad:{p:'chord'},bass:{p:'B:12'},arp:{p:ARP3},perc:{shaker:['x.x.x.x.x.x.']}},
     motifs:[
       {id:'hope',bar:0,beat:0,stem:'lead',inst:'strings'},
       {id:'lyra',bar:4,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:4,beat:0,stem:'choir',inst:'choir_aah'}
     ]}
  ]
};

/* ================================================================================================================ MYSTERY (F# lydian) */
MUSIC_DATA.mystery={
  tempo:96,grid:16,key:'F#',mode:'lydian',loop:true,tail:4,gain:0.45,room:'air',dly:1,dlyFb:0.35,
  stems:{
    pad:  {inst:'pad_air',reg:'C3',gain:0.6,rev:0.42,room:'air',voices:3,prio:1,spread:0.5},
    bass: {inst:'bass_sub',reg:'C2',gain:0.7,rev:0.05,prio:1},
    arp:  {inst:'bell',reg:'C5',gain:0.5,rev:0.4,room:'air',dly:0.3,prio:0.5,spread:0.6},
    choir:{inst:'choir_aah',reg:'C4',gain:0.36,rev:0.5,room:'air',voices:3,prio:0.6,spread:0.6},
    fx:   {inst:'swell',reg:'C3',gain:0.4,rev:0.3,room:'air',prio:0.4},
    perc: {kind:'lanes',gain:0.45,rev:0.2,room:'air',prio:0.4}
  },
  sections:[
    {name:'probe',bars:8,chords:'F#maj7@2 G#add9@2 A#m7@2 C#sus2@2',inst:{pad:'pad_air'},
     play:{pad:{p:'chord'},bass:{p:BQ,vel:0.5},fx:SWELL(128),choir:{p:'chord'},perc:{shaker:['o...o...o...o...','o...o...o...o.o.']}},
     motifs:[
       {id:'lyra',bar:1,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:1,beat:0,stem:'choir',inst:'choir_aah'},
       {id:'lyra',bar:5,beat:0,stem:'arp',inst:'bell'}
     ]},
    {name:'reveal',bars:8,chords:'Bmaj7#11@2 F#maj7@2 G#m7@2 F#maj7@2',inst:{pad:'pad_air'},
     play:{pad:{p:'chord'},bass:{p:BQ,vel:0.5},choir:{p:'chord'},perc:{shaker:['o...o...o...o...','o...o...o...o.o.']}},
     motifs:[
       {id:'lyra',bar:0,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:4,beat:0,stem:'choir',inst:'choir_aah'},
       {id:'lyra',bar:6,beat:0,stem:'arp',inst:'bell'}
     ]}
  ]
};

/* ================================================================================================================ TENSION (E phrygian) */
MUSIC_DATA.tension={
  tempo:120,grid:16,key:'E',mode:'phrygian',loop:true,tail:3,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_dark',reg:'C3',gain:0.6,rev:0.3,voices:3,prio:1,spread:0.25},
    bass: {inst:'bass_pulse',reg:'C2',gain:0.7,rev:0.03,prio:1},
    stab: {inst:'stab_metal',reg:'C3',gain:0.5,rev:0.18,room:'plate',prio:0.6},
    lead: {inst:'lead_dist',reg:'C3',ref:'scale',gain:0.45,rev:0.2,prio:0.9},
    vil:  {inst:'mot_dsaw_sub',reg:'C2',gain:0.7,rev:0.12,room:'hall',prio:1},
    drums:{kind:'lanes',gain:0.7,rev:0.06,prio:0.95},
    perc: {kind:'lanes',gain:0.7,rev:0.14,prio:0.7},
    fx:   {inst:'riser',reg:'C3',gain:0.4,rev:0.2,prio:0.3}
  },
  sections:[
    {name:'rise',bars:8,chords:'Em@2 F@2 Em@2 F@2',inst:{pad:'pad_dark'},
     play:{pad:{p:'chord'},bass:{p:'B:2 .:2 B:2 B:2 .:2 B:2 B:2 .:2'},stab:{p:'1:1 .:3 .:4 1:1 .:3 .:4'},drums:{kick:[KOB,KOB,KOB,KOB,KOB,KOB,KOB,KOB]}},
     motifs:[
       {id:'villain',bar:0,beat:0,stem:'vil',inst:'mot_dsaw_sub',vel:0.6},
       {id:'villain',bar:4,beat:0,stem:'vil',inst:'mot_dsaw_sub'}
     ]},
    {name:'peak',bars:8,chords:'Em@2 D@2 F@2 Em@2',inst:{pad:'pad_dark'},
     play:{pad:{p:'chord'},bass:{p:'B:2 .:2 B:2 B:2 .:2 B:2 B:2 .:2'},stab:{p:'1:1 .:3 .:4 1:1 .:3 .:4'},
       drums:{kick:['X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.','X..X..X.X..X..X.'],snare:[SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB],hat:[HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8]},
       perc:{taiko:[TK,TK,TK,TK,TK,TK,TK,TK]}},
     motifs:[
       {id:'villain',bar:2,beat:0,stem:'vil',inst:'mot_dsaw_sub'},
       {id:'villain',bar:6,beat:0,stem:'vil',inst:'mot_dsaw_sub'},
       {id:'kaz',bar:0,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:4,beat:0,stem:'lead',inst:'horn'}
     ]}
  ]
};

/* ================================================================================================================ DREAD (B locrian) */
MUSIC_DATA.dread={
  tempo:72,grid:16,key:'B',mode:'locrian',loop:true,tail:4,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_dark',reg:'C3',gain:0.55,rev:0.34,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_sub',reg:'C2',gain:0.7,rev:0.04,prio:1},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.36,rev:0.5,voices:2,prio:0.4,spread:0.5},
    fx:   {inst:'mot_toll',reg:'C2',gain:0.45,rev:0.4,room:'air',prio:0.5},
    perc: {kind:'lanes',gain:0.6,rev:0.2,prio:0.9},
    drums:{kind:'lanes',gain:0.4,rev:0.12,prio:0.5}
  },
  sections:[
    {name:'toll',bars:6,chords:'Bm7b5@2 C@2 Bm7b5@2',
     play:{pad:{p:'chord'},bass:{p:BQ,vel:0.5},perc:{kick_deep:['x.......x.......']}},
     motifs:[
       {id:'array',bar:0,beat:0,stem:'fx',inst:'mot_toll',vel:0.7},
       {id:'array',bar:4,beat:0,stem:'fx',inst:'mot_toll',vel:0.7}
     ]},
    {name:'hunger',bars:6,chords:'Dm@2 Bm7b5@2 C@2',
     play:{pad:{p:'chord'},bass:{p:BQ,vel:0.5},choir:{p:'chord'},perc:{kick_deep:['x...x...x...x...']},drums:{tamb:['o...o...o...o...']}},
     motifs:[
       {id:'villain',bar:0,beat:0,stem:'bass',inst:'mot_dsaw_sub'},
       {id:'villain',bar:2,beat:0,stem:'bass',inst:'mot_dsaw_sub',transpose:-2},
       {id:'villain',bar:4,beat:0,stem:'bass',inst:'mot_dsaw_sub'},
       {id:'villain',bar:5,beat:0,stem:'bass',inst:'mot_dsaw_sub'}
     ]}
  ]
};

/* ================================================================================================================ VILLAIN (C phrygian) */
MUSIC_DATA.villain={
  tempo:72,grid:16,key:'C',mode:'phrygian',loop:true,tail:4,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_dark',reg:'C3',gain:0.55,rev:0.3,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_sub',reg:'C2',gain:0.7,rev:0.04,prio:1},
    riff: {inst:'bass_dist',reg:'C2',gain:0.5,rev:0.05,prio:0.9},
    lead: {inst:'horn',reg:'C3',ref:'scale',gain:0.55,rev:0.22,prio:0.9},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.36,rev:0.45,voices:3,prio:0.6,spread:0.5},
    drums:{kind:'lanes',gain:0.6,rev:0.08,prio:0.8},
    perc: {kind:'lanes',gain:0.7,rev:0.14,prio:0.8}
  },
  sections:[
    {name:'hall',bars:6,chords:'Cm@2 Db@2 Bbm Cm',
     play:{pad:{p:'chord'},choir:{p:'chord'},perc:{kick_deep:[Z,'o.......o.......','o.......o.......','o.......o.......','o.......o.......','o.......o.......']}},
     motifs:[
       {id:'villain',bar:0,beat:0,stem:'bass',inst:'mot_dsaw_sub',vel:0.3},
       {id:'villain',bar:2,beat:0,stem:'bass',inst:'mot_dsaw_sub',transpose:-2,vel:0.3},
       {id:'villain',bar:4,beat:0,stem:'bass',inst:'mot_dsaw_sub',vel:0.3}
     ]},
    {name:'strike',bars:6,chords:'Cm@2 Db@2 Ab@2',
     play:{pad:{p:'chord'},riff:{p:RIFF,vel:0.8},drums:{kick:[KOB,KOB,KOB,KOB,KOB,KOB]},perc:{taiko:['x.......x...x...','x.......x...x...','x.......x...x...','x.......x...x...','x.......x...x...','x.......x...x...']}},
     motifs:[
       {id:'kaz',bar:0,beat:0,stem:'lead',inst:'horn',vel:0.7},
       {id:'kaz',bar:2,beat:0,stem:'lead',inst:'horn',vel:0.7},
       {id:'kaz',bar:4,beat:0,stem:'lead',inst:'horn',vel:0.7},
       {id:'kaz',bar:5,beat:0,stem:'lead',inst:'horn',vel:0.7}
     ]}
  ]
};

/* ================================================================================================================ MARCH (D) */
MUSIC_DATA.march={
  tempo:96,grid:16,key:'D',mode:'major',loop:true,tail:3,gain:0.45,room:'hall',dly:0.75,dlyFb:0.28,
  stems:{
    pad:  {inst:'pad_warm',reg:'C3',gain:0.55,rev:0.3,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_saw',reg:'C2',gain:0.75,rev:0.04,prio:1},
    lead: {inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.22,dly:0.1,prio:0.9},
    arp:  {inst:'bell',reg:'C5',gain:0.45,rev:0.3,prio:0.4},
    choir:{inst:'choir_ooh',reg:'C3',gain:0.4,rev:0.45,voices:3,prio:0.6,spread:0.5},
    drums:{kind:'lanes',gain:0.75,rev:0.08,prio:0.95},
    perc: {kind:'lanes',gain:0.75,rev:0.16,prio:0.7}
  },
  sections:[
    {name:'advance',bars:8,chords:'D@2 G@2 A@2 D@2',
     play:{pad:{p:'chord'},bass:{p:BM},drums:{snare:[SNC,SNC,SNC,SNC,SNC2,SNC2,SNC,SNC2],kick:[KM,KM,KM,KM,KM,KM,KM,KM]},perc:{timp1:[KM,KM,KM,KM,KM,KM,KM,KM]}},
     motifs:[
       {id:'idris',bar:0,beat:0,stem:'lead',inst:'brass'},
       {id:'idris',bar:4,beat:0,stem:'lead',inst:'brass'}
     ]},
    {name:'halt',bars:8,chords:'D@2 Bm@2 G@2 A@2',
     play:{pad:{p:'chord'},bass:{p:B8},drums:{kick:[KM,Z,KM,Z,KM,Z,KM,Z],snare:[Z,SNC,Z,SNC,Z,SNC,Z,SNC]}},
     motifs:[
       {id:'colony',bar:0,beat:0,stem:'lead',inst:'pad_warm'},
       {id:'colony',bar:0,beat:0,stem:'choir',inst:'choir_ooh'},
       {id:'idris',bar:4,beat:0,stem:'lead',inst:'brass'},
       {id:'lyra',bar:6,beat:0,stem:'arp',inst:'bell'}
     ]}
  ]
};

/* ================================================================================================================ BATTLE (A dorian) */
MUSIC_DATA.battle={
  tempo:120,grid:16,key:'A',mode:'dorian',loop:true,tail:3,gain:0.45,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:  {inst:'pad_strings',reg:'C3',gain:0.55,rev:0.28,voices:3,prio:1,spread:0.3},
    bass: {inst:'bass_sub',reg:'C2',gain:0.75,rev:0.03,prio:1},
    riff: {inst:'bass_dist',reg:'C2',gain:0.5,rev:0.05,prio:0.9},
    arp:  {inst:'bell',reg:'C5',gain:0.4,rev:0.3,prio:0.4},
    lead: {inst:'brass',reg:'C4',ref:'scale',gain:0.6,rev:0.2,prio:0.9},
    choir:{inst:'choir_aah',reg:'C3',gain:0.36,rev:0.4,voices:3,prio:0.6,spread:0.5},
    drums:{kind:'lanes',gain:0.78,rev:0.08,prio:0.95},
    perc: {kind:'lanes',gain:0.75,rev:0.14,prio:0.7}
  },
  sections:[
    {name:'clash',bars:10,chords:'Am@2 F@2 G@2 Am@2 E@2',
     play:{pad:{p:'chord'},riff:{p:RIFF},drums:{kick:[KOB,KOB,KOB,KOB,KOB,KOB,KOB,KOB,KOB,KOB],snare:[SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB],hat:[HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8,HAT8]},perc:{taiko:[TK,TK,TK,TK,TK,TK,TK,TK,TK,TK]}},
     motifs:[
       {id:'kaz',bar:0,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:4,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:8,beat:0,stem:'lead',inst:'horn'}
     ]},
    {name:'charge',bars:10,chords:'Am@2 F@2 G@2 Am@2 E@2',
     play:{pad:{p:'chord'},riff:{p:RIFF},bass:{p:BQ},drums:{crash:[HIT,Z,Z,Z,Z,Z,Z,Z,Z,Z],kick:[K4,K4,K4,K4,K4,K4,K4,K4,K4,K4],snare:[SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB,SNB],hat:[HAT16,HAT16,HAT16,HAT16,HAT16,HAT16,HAT16,HAT16,HAT16,HAT16]},perc:{timp1:[KM,KM,KM,KM,KM,KM,KM,KM,KM,KM]}},
     motifs:[
       {id:'idris',bar:0,beat:0,stem:'lead',inst:'brass'},
       {id:'lyra',bar:2,beat:0,stem:'arp',inst:'bell'},
       {id:'lyra',bar:2,beat:0,stem:'choir',inst:'choir_aah'},
       {id:'idris',bar:4,beat:0,stem:'lead',inst:'brass',transpose:5},
       {id:'kaz',bar:6,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:6,beat:0,stem:'perc',inst:'taiko'},
       {id:'kaz',bar:8,beat:0,stem:'lead',inst:'horn'},
       {id:'kaz',bar:8,beat:0,stem:'perc',inst:'taiko'}
     ]}
  ]
};
})();
