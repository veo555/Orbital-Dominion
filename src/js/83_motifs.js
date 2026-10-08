/* =========================================================================
   LEITMOTIFS — the eight entries of MOTIFS (43_vocab.js) as registry functions MOTIF[id] (82_music.js).
   Contract (docs/AUDIO_SPEC.md §9.2): MOTIF[id](key, mode, voice) -> {inst, notes} (or a bare notes array).
     key    tonic name, e.g. 'D', 'F#'                 mode   scale name: 'major' 'dorian' 'phrygian' 'lydian' ...
     voice  the sequencer's context {inst, oct, vel, bpm, tempo, beat, stem, era, night, intensity}: read-only, not used here
     notes  [{n: midi, b: start in beats, d: length in beats, v: 0..1}]   beats are counted from the entry's own beat
     inst   the motif's default instrument; a cue entry may override it with `inst:` (so any instrument can carry any motif)
   Restating: every pitch is built from `key` and `mode` (MUSIC.deg / MUSIC.pc), so a cue restates a motif in any key.
   Determinism: pure functions of (key, mode). No randomness, no clock, no sim state.
   Shapes (beats at 60/bpm s each):  idris 4.5 b · kaz 3.9 b · lyra 4 b · villain 4 b · worker 2.5 b · colony 8 b · array 9 b · hope 10 b.
   New instruments (prefix mot_, registered into MUSIC.INST): mot_toll (array: a large tolling bell), mot_dsaw_sub (villain: detuned low saws over a sub).
   ========================================================================= */
(function(){
'use strict';
const TONIC=(key,oct)=>12*((oct===undefined?4:oct)+1)+MUSIC.pc(key);     // midi of the tonic in octave `oct`
const DEG=(key,mode,deg,oct,acc)=>MUSIC.deg(key,mode,deg,oct===undefined?4:oct,acc||0);   // scale degree of the mode
const MAJORISH={major:1,ionian:1,lydian:1,mixolydian:1};
const PENT=[0,2,4,7,9];                                                    // major pentatonic above the tonic (lyra never touches the #4)
const mode_=m=>String(m||'major').toLowerCase();

/* idris — the noble fanfare: the tonic, a rising fourth, a rising fifth to the tonic an octave up. Brass. */
MOTIF.idris=(key,mode)=>({inst:'brass',notes:[
  {n:DEG(key,mode,1,4),b:0,d:1.5,v:0.72},
  {n:DEG(key,mode,4,4),b:1.5,d:0.5,v:0.84},
  {n:DEG(key,mode,8,4),b:2,d:2.5,v:1.0}
]});

/* kaz — the low stomp. In a minor or modal mode: root, then the tritone (a sharpened fourth), twice: the flavour of the war.
   In a major-family mode (his redemption): the same stomp with the tritone turned into the major triad, resolving up to the tonic. */
MOTIF.kaz=(key,mode)=>{
  if(MAJORISH[mode_(mode)])return{inst:'horn',notes:[
    {n:DEG(key,mode,1,2),b:0,d:0.9,v:1.0},
    {n:DEG(key,mode,3,2),b:1,d:0.5,v:0.8},
    {n:DEG(key,mode,5,2),b:2,d:0.9,v:0.9},
    {n:DEG(key,mode,8,2),b:3,d:1.0,v:1.0}
  ]};
  return{inst:'horn',notes:[
    {n:DEG(key,mode,1,2),b:0,d:0.9,v:1.0},
    {n:DEG(key,mode,4,2,1),b:1.5,d:0.4,v:0.8},
    {n:DEG(key,mode,1,2),b:2,d:0.9,v:1.0},
    {n:DEG(key,mode,4,2,1),b:3.5,d:0.4,v:0.8}
  ]};
};

/* lyra — a floating pentatonic phrase (bell or choir). Pentatonic from the tonic whatever the mode: it stays in the key and never lands on a tendency tone. */
MOTIF.lyra=(key)=>({inst:'bell',notes:[
  {n:TONIC(key,4)+PENT[2],b:0,d:1.5,v:0.7},
  {n:TONIC(key,4)+PENT[4],b:1.5,d:1.0,v:0.8},
  {n:TONIC(key,4)+PENT[3],b:2.5,d:0.5,v:0.7},
  {n:TONIC(key,4)+PENT[1],b:3,d:1.0,v:0.75}
]});

/* villain — a descending chromatic cluster over a pedal: the tonic two octaves down held for the whole bar, and four
   two-note clusters (minor seconds) stepping down a semitone per beat from the fifth. Mode-free: it is chromatic on purpose. */
MOTIF.villain=(key)=>{
  const pedal=TONIC(key,2),top=TONIC(key,3)+7,notes=[{n:pedal,b:0,d:4,v:0.9}];
  for(let k=0;k<4;k++){
    notes.push({n:top-k,b:k,d:0.9,v:k?0.8:0.95});
    notes.push({n:top-k-1,b:k,d:0.9,v:k?0.7:0.85});
  }
  return{inst:'mot_dsaw_sub',notes};
};

/* worker — a small cheerful figure: 1-3-5-8 bouncing up a major triad (the cheerful mode is major whatever the cue's mode). Marimba-like. */
MOTIF.worker=(key)=>({inst:'marimba',notes:[
  {n:DEG(key,'major',1,4),b:0,d:0.5,v:0.8},
  {n:DEG(key,'major',3,4),b:0.5,d:0.5,v:0.8},
  {n:DEG(key,'major',5,4),b:1,d:0.5,v:0.85},
  {n:DEG(key,'major',8,4),b:1.5,d:1.0,v:0.95}
]});

/* colony — the warm hymn: a stepwise phrase that falls to the second degree and climbs back to the fifth. It ends OPEN (on the fifth),
   which is what makes `hope` its resolution. Pad voice, long notes. */
MOTIF.colony=(key,mode)=>({inst:'pad_warm',notes:[
  {n:DEG(key,mode,5,4),b:0,d:2,v:0.75},
  {n:DEG(key,mode,4,4),b:2,d:1,v:0.7},
  {n:DEG(key,mode,3,4),b:3,d:1,v:0.72},
  {n:DEG(key,mode,2,4),b:4,d:2,v:0.75},
  {n:DEG(key,mode,3,4),b:6,d:1,v:0.7},
  {n:DEG(key,mode,5,4),b:7,d:1,v:0.8}
]});

/* array — three huge slow tolls: the tonic two octaves down, the fifth above it, the tonic an octave lower again. Tolling bell. */
MOTIF.array=(key)=>({inst:'mot_toll',notes:[
  {n:TONIC(key,2),b:0,d:3.5,v:1.0},
  {n:TONIC(key,2)+7,b:2.5,d:2.5,v:0.8},
  {n:TONIC(key,1),b:5,d:4,v:0.9}
]});

/* hope — the resolution of colony: the same phrase, the third lifted to major and the open fifth closed on the tonic an octave up. Strings. */
MOTIF.hope=(key)=>({inst:'strings',notes:[
  {n:DEG(key,'major',5,4),b:0,d:2,v:0.75},
  {n:DEG(key,'major',4,4),b:2,d:1,v:0.72},
  {n:DEG(key,'major',3,4),b:3,d:1,v:0.8},
  {n:DEG(key,'major',2,4),b:4,d:2,v:0.78},
  {n:DEG(key,'major',3,4),b:6,d:1,v:0.8},
  {n:DEG(key,'major',1,5),b:7,d:3,v:0.9}
]});

/* new instruments for the motifs above (only these two; the rest of the kit is 80_audio.js / 82_music.js) */
Object.assign(MUSIC.INST,{
  /* a huge tolling bell: the hum and the octave prime (1, 2) with a long ring; the partials decay at different rates (t60). Two nodes per toll. */
  mot_toll:n=>{const R=0.5,rg=Math.max(3.5,n.dur);return[{k:'pluck',mode:'modal',f:n.f,ratios:[1,2.0],t60:rg,tilt:0.45,damp:0.6,dur:rg+R,gain:0.9}];},
  /* a villain's voice: two saws detuned against each other (unison, about 18 cents apart), low-passed and driven, over a sine sub an octave down */
  mot_dsaw_sub:n=>{const R=0.12,d=Math.max(n.dur,0.12);return[
    {k:'osc',type:'sawtooth',f:n.f,unison:{n:2,spread:9},dur:d+R,env:{a:0.01,d:0.25,s:0.7,r:R},filter:{type:'lp',f0:260+360*n.vel,q:1.2},drive:0.2,gain:0.35},
    {k:'osc',type:'sine',f:n.f*0.5,dur:d+R,env:{a:0.012,d:0.25,s:0.85,r:R},gain:0.5}];}
});
})();
