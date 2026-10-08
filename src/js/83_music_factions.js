/* =========================================================================
   FACTION THEMES — data only (format: docs/AUDIO_SPEC.md §9). The in-match score: the director in 82_music.js plays theme_<faction> and drives it with
   musicScene({intensity, night, era}). Rendering/audio only; no sim state, no randomness (the sequencer owns the seeded rng).
     theme_meridian  D Dorian with a D-major lift (bastion), 92/96/100 BPM, 4/4 march: filtered-saw brass, snare rudiments, tuned timpani, rising fourths and fifths
     theme_obsidian  E Phrygian, 120/126/132 BPM, syncopated 4/4: taiko and low toms, distorted sub-bass ostinato, metallic stabs, chant-like formant voices
     theme_aurora    F# Lydian / pentatonic, 80/84/88 BPM, shuffled eighths, FM-bell arpeggios, airy pad and sub, wide stereo, 5-bar phrases and a 7/8 bridge
   Every theme loops (> 64 s at every era), has calm / tension / battle layers selected by intensity (0..1) and a sparse (era I) to full (era III) orchestration.
   Layer map (intensity): calm < 0.3 <= tension < 0.6 <= battle. Each stem fades in/out with `on:[a,b]` / `mix:[[x,gain]..]`; patterns switch with `int:[a,b]` / `era:[a,b]`.
   ========================================================================= */
(function(){
'use strict';
const R=(n,s)=>new Array(n).fill(s);
/* n bars (patterns): `s` in bar k, `e` in every other bar */
const AT=(n,k,s,e)=>{const a=R(n,e);a[k]=s;return a;};
const Z16='................',Z8='........';

/* ============================================================================================================================ MERIDIAN */
/* calm: warm pad, harp, flute tune, soft timpani, half-note bass   tension: + march bass, snare cadence, kick, horn tune   battle: brass tune, rudiments, off-beat stabs, full timpani
   era I: flute / horn only, no stabs, cadence only   era II: + brass, stabs, rudiments   era III: + horn an octave down, choir, driving bass, crash, 100 BPM (era I: 92 BPM) */
const MA_LEAD =['1:4 4:4 5:4 8:4','10:6 9:2 8:8','7:4 5:4 3:4 5:4','4:8 3:4 2:4','5:4 8:4 9:4 8:4','7:6 5:2 4:8','5:4 7:4 8:4 9:4','8:12 .:4'];
const MA2_LEAD=['5:4 8:4 9:4 8:4','10:8 8:4 5:4','7:4 8:4 9:4 7:4','5:8 4:4 3:4','4:4 5:4 7:4 8:4','9:6 8:2 7:8','5:4 8:4 7:4 5:4','4:4 5:4 1:8'];
const MB_LEAD =['5:4 8:4 10:4 8:4','12:8 10:4 8:4','9:4 7:4 5:4 7:4','9:8 7:4 5:4','10:4 8:4 6:4 8:4','9:4 8:4 6:4 4:4','5:4 8:4 10:4 12:4','13:8 12:4 9:4'];
const MC_LEAD =['8:4 11:4 12:4 8:4','10:6 9:2 7:8','11:4 9:4 8:4 7:4','8:12 .:4','5:4 8:4 9:4 10:4','11:6 10:2 9:4 7:4','12:4 11:4 9:4 5:4','9:8 5:4 4:4'];
const MA_FLUTE=['8:8 11:8','12:16','10:8 9:8','8:16','9:8 12:8','11:12 9:4','8:8 10:8','8:16'];
const SNARE_CAL=['o.o.X.o.o.o.X.o.','o.o.X.o.o.o.X.oo'];
const SNARE_BAT=['f.xgx.xgf.xgx.xg','d.xgx.xgd.xgX.rr'];
const SNARE_III=['f.xgx.xgf.xgx.xg','d.xgx.xgd.xgX.rr','f.xgx.XgX.xgx.xg','dxxgx.xgd.xrrrrr'];
const KICK_M='x.......x.......',KICK_P='x.......x.....x.';
const TIMP=[{timp1:['x.......x.......','x...............'],timp4:[Z16,'......x.....x...'],timp5:[Z16,'..............x.']}];
const BASS_HALF=['B:8 .:8','B:4 .:4 3:4 .:4'];
const BASS_MARCH='B:4 3:4 B:4 3:4';
const BASS_DRIVE='B:2 B:2 3:2 B:2 B:2 B:2 3:2 B:2';
const PAD_N=[{p:'chord',night:[0,0.5]},{p:'chord',night:[0.5,1],inst:'pad_dark'}];
const ARP_A='1 . 3 . 2 . 3 . 1 . 3 . 2 . 3 .',ARP_B='1 . 2 . 3 . 2 . 4 . 3 . 2 . 3 .',ARP_C='3 . 2 . 1 . 2 . 3 . 4 . 3 . 2 .';
const STAB='. . . . C . . . . . . . C . . .';
/* one section's play table; L = the section's tune, arp = [calm, busier] arpeggio patterns */
function merPlay(L,arp,stab){
  return{
    pad:PAD_N,
    bass:[{p:BASS_HALF,int:[0,0.58]},{p:BASS_HALF,int:[0.58,1],era:[1,1]},{p:BASS_MARCH,int:[0.58,1],era:[2,2]},{p:BASS_DRIVE,int:[0.58,1],era:[3,3]}],
    arp:[{p:arp[0],int:[0,0.45]},{p:arp[1],int:[0.45,1]}],
    lead:[{p:MA_FLUTE,inst:'flute',int:[0,0.42]},{p:L,inst:'horn',int:[0.42,0.62],vel:0.9},{p:L,inst:'horn',int:[0.62,1],era:[1,1]},
          {p:L,inst:'brass',int:[0.62,1],era:[2,3]},{p:L,inst:'horn',int:[0.62,1],era:[3,3],oct:-1,vel:0.8}],
    stab:{p:stab},
    drums:[{snare:SNARE_CAL,kick:KICK_M,int:[0,0.62]},{snare:SNARE_CAL,kick:KICK_M,int:[0.62,1],era:[1,1]},{snare:SNARE_BAT,kick:KICK_M,int:[0.62,1],era:[2,2]},{snare:SNARE_III,kick:KICK_P,int:[0.62,1],era:[3,3]}],
    perc:TIMP,
    choir:{p:'chord'}
  };
}
MUSIC_DATA.theme_meridian={
  tempo:96,tempoEra:[92,96,100],beats:4,grid:16,key:'D',mode:'dorian',loop:true,tail:3.5,gain:0.42,room:'hall',dly:0.75,dlyFb:0.26,
  stems:{
    pad:{inst:'pad_warm',reg:'C3',gain:0.62,rev:0.34,voices:3,prio:1,spread:0.3,mix:[[0,1],[0.6,0.9],[1,0.72]],nightGain:0.92,nightOct:-1},
    bass:{inst:'bass_saw',reg:'C2',gain:0.8,rev:0.04,prio:1,on:[0.16,0.3],nightGain:1.1},
    arp:{inst:'harp',reg:'C4',gain:0.62,rev:0.3,dly:0.18,gate:0.9,prio:0.4,spread:0.35,mix:[[0,1],[0.42,0.9],[0.62,0]],nightGain:0.7},
    lead:{inst:'brass',reg:'C4',ref:'scale',gain:0.66,rev:0.26,dly:0.1,prio:0.9,pan:0.08,human:0.01},
    stab:{inst:'brass_stab',reg:'C3',gain:0.5,rev:0.18,voices:3,prio:0.7,spread:0.4,on:[0.55,0.7],eraGain:[0,1,1]},
    drums:{kind:'lanes',gain:0.72,rev:0.1,prio:0.95,on:[0.26,0.4],eraGain:[0.8,1,1]},
    perc:{kind:'lanes',gain:0.8,rev:0.2,room:'hall',prio:0.6,on:[0.16,0.32],eraGain:[0.55,0.85,1]},
    choir:{inst:'choir_aah',reg:'C3',gain:0.5,rev:0.45,room:'hall',voices:3,prio:0.6,spread:0.5,on:[0.5,0.7],eraGain:[0,0,1],nightGain:1.1}
  },
  sections:[
    {name:'rally',  bars:8,chords:'Dm@2 C@2 G@2 Am Dm',play:merPlay(MA_LEAD,[ARP_A,ARP_B],STAB)},
    {name:'bastion',bars:8,chords:'D@2 A@2 Bm G D A',mode:'major',inst:{pad:'pad_strings'},play:merPlay(MB_LEAD,[ARP_A,ARP_B],STAB)},
    {name:'rally2', bars:8,chords:'Dm@2 C@2 G@2 Am A7',play:merPlay(MA2_LEAD,[ARP_C,ARP_B],STAB)},
    {name:'citadel',bars:8,chords:'Dm C G Dm Dm C A A7',
     play:Object.assign(merPlay(MC_LEAD,[ARP_B,ARP_B],'C . . C . . C . . . C . C . C .'),{
       perc:[{timp1:['x.......x.......','x.......x...x...'],timp4:['........x.......','......x.....x...'],timp5:[Z16,'..............x.'],int:[0,0.62]},
             {timp1:['x...x...x...x...'],timp4:['..x...x...x...x.'],timp5:['....x.......x...'],crash:AT(8,0,'x...............',Z16),int:[0.62,1]}]})}
  ]
};

/* ============================================================================================================================ OBSIDIAN */
/* calm: taiko heartbeat, sub pad, whispered chant   tension: bass ostinato, tresillo kick, metal stabs, chant   battle: distorted riff, full kit, anvils, hall choir
   era I: toms, ostinato, chant   era II: + stabs, clap, hats   era III: + hall choir (low voices), 132 BPM (era I: 120 BPM) */
const OB_BASS   =['1 . 1 . 1 1 . 2 1 . 1 . 1 1 . 3','1 . 1 . 1 1 . 2 1 . 1 1 . 3 2 .','1 . 1 1 . 1 2 . 1 . 1 . 5 . 3 2'];
const OB_BASS_HI=['1 . 1 1 . 1 2 . 1 . 1 1 . 1 3 2','1 . 1 1 . 1 2 1 1 . 1 1 . 3 2 1','1 1 . 1 1 . 2 1 1 . 1 1 6 . 5 2'];
const OB_KICK=['x..x..x.x..x..x.','x..x..x.x..x.x..'],OB_KICK_H=['x..x..x.x..x..x.','x..x..x.x.xx..x.'];
const OB_TAIKO=['X.......X...x...','X...x...X.x.....'],OB_TAIKO_H=['..x...x...x...x.','..x...x...x..x.x'];
const OB_STAB=['. . . . . . C . . . . . C . . .','. . . . . . C . . . C . . . . .'];
const OB_RIFF=['1:3 .:1 2:1 1:2 .:1 3:2 2:2 1:2 .:2','5:3 .:1 3:1 2:2 .:1 1:2 2:2 3:2 .:2'];
const OB_CHANT=['.:8 1:2 .:2 1:2 .:2','.:4 1:2 .:4 1:2 .:2 3:2'];
const OB_SNARE0=['................','....x.......x...'],OB_SNARE1=['....x.......x...','....X.......X..x'];
const OB_CLAP=['................','....x.......x...'];
const OB_DRUMS=[{kick:OB_KICK,snare:OB_SNARE0,hat:['x.x.x.x.x.x.x.x.'],int:[0,0.6]},{kick:OB_KICK_H,snare:OB_SNARE1,clap:OB_CLAP,hat:['x.xxx.xxx.xxx.xx'],int:[0.6,1]}];
const OB_PERC=(anvil)=>[{taiko:OB_TAIKO,taiko_hi:[Z16,OB_TAIKO_H[0]],int:[0,0.6]},{taiko:OB_TAIKO,taiko_hi:OB_TAIKO_H,anvil:anvil||Z16,int:[0.6,1]}];
function obsPlay(extra){
  return Object.assign({
    pad:{p:'chord'},
    bass:[{p:OB_BASS,int:[0,0.6]},{p:OB_BASS_HI,int:[0.6,1]}],
    arp:{p:OB_STAB},
    drums:OB_DRUMS,perc:OB_PERC(),
    choir:{p:OB_CHANT},
    hall:{p:'chord'}
  },extra||{});
}
MUSIC_DATA.theme_obsidian={
  tempo:126,tempoEra:[120,126,132],beats:4,grid:16,key:'E',mode:'phrygian',loop:true,tail:3.5,gain:0.42,room:'hall',dly:0.75,dlyFb:0.3,
  stems:{
    pad:{inst:'pad_dark',reg:'C3',gain:0.6,rev:0.3,voices:3,prio:1,spread:0.25,mix:[[0,1],[0.6,0.8],[1,0.6]],nightGain:1.05},
    bass:{inst:'bass_dist',reg:'C2',ref:'scale',gain:0.8,rev:0.03,prio:1,on:[0.12,0.26],nightGain:1.1},
    lead:{inst:'lead_dist',reg:'C3',ref:'scale',gain:0.5,rev:0.22,dly:0.14,prio:0.9,on:[0.6,0.78],eraGain:[0.6,1,1]},
    arp:{inst:'stab_metal',reg:'C3',gain:0.62,rev:0.2,room:'plate',voices:2,gate:0.4,prio:0.55,spread:0.5,on:[0.3,0.48],eraGain:[0,1,1]},
    drums:{kind:'lanes',gain:0.78,rev:0.08,prio:0.95,on:[0.24,0.4]},
    perc:{kind:'lanes',gain:0.85,rev:0.22,prio:0.7,on:[0.04,0.2]},
    choir:{inst:'chant',reg:'C3',ref:'chord',gain:0.6,rev:0.3,room:'hall',voices:1,prio:0.6,on:[0.4,0.55],eraGain:[0,1,1],p:{vowel:'o',to:'a',scale:0.88}},
    hall:{inst:'choir_ooh',reg:'C3',gain:0.42,rev:0.45,room:'hall',voices:3,prio:0.55,spread:0.5,on:[0.55,0.72],eraGain:[0,0,1],nightGain:1.15}
  },
  sections:[
    {name:'ritual',bars:8,chords:'E5@2 F5 E5 E5@2 F5 D5',play:obsPlay({perc:OB_PERC(AT(8,3,'..........X.....',Z16))})},
    {name:'horde', bars:8,chords:'E5 F5 E5 G5 A5 G5 F5 B5',play:obsPlay({lead:{p:OB_RIFF,oct:1},perc:OB_PERC(AT(8,7,'x.x.x.x.x.x.x.x.',Z16))})},
    {name:'siege', bars:8,chords:'E5@2 C5 D5 E5@2 F5 B5',play:obsPlay({lead:{p:OB_RIFF,oct:1},arp:{p:['. . . . . . C . . . . . . . C .','. . . . . . C . . . C . . . . .']}})},
    {name:'chant', bars:8,chords:'E5@4 F5@2 E5@2',mix:{bass:0.7,drums:0.55,arp:0.5},
     play:{pad:{p:'chord'},bass:{p:['1:8 .:8','1:6 .:3 2:2 .:5']},arp:{p:['.:16','. . . . . . C . . . . . . . . .']},
       drums:[{kick:['x...............','x.......x.......']}],perc:[{taiko:['X...............','X.......x.x.....'],taiko_hi:[Z16,'............x.x.']}],
       choir:{p:['1:2 .:2 1:2 .:2 3:2 .:2 1:2 .:2','1:2 .:2 1:2 .:2 2:2 .:2 3:2 2:2']},hall:{p:'chord'}}},
    {name:'warcry',bars:8,chords:'E5 F5 G5 F5 E5 F5 B5@2',
     play:obsPlay({lead:{p:OB_RIFF,oct:1},arp:{p:['. . C . . . C . . . C . . . C .','. . C . . . C . C . . . C . C .']},
       drums:[OB_DRUMS[0],Object.assign({crash:AT(8,0,'x...............',Z16)},OB_DRUMS[1])],perc:OB_PERC(AT(8,7,'x.x.x.x.x.x.x.x.',Z16))})}
  ]
};

/* ============================================================================================================================ AURORA */
/* calm: airy pad over an F# pedal, bell arpeggios, glass tune   tension: + shuffled shaker, soft kick, wider bells   battle: shuffle kit, rim, ride, choir
   grid 8: one step = one eighth note; the percussion stems swing their off-beats (shuffle). Phrases are 5 bars (40 steps), the bridge is 7/8 (4 bars of 7).
   era I: pad, bells, tune   era II: + drums, choir (half)   era III: + choir, 88 BPM (era I: 80 BPM) */
const AU_ARP_A=['1 3 2 4 3 2 3 .','1 2 3 4 3 4 2 .','1 3 4 3 2 3 4 .'];
const AU_ARP_B=['1 2 3 4 3 2 4 3','1 3 2 4 3 4 5 3','2 3 4 5 4 3 2 3'];
const AU_ARP_C=['1 3 2 4 3 5 4 3','2 3 4 5 4 3 2 4','1 3 5 4 3 2 3 4'];
const AU_BASS=['B:8','B:4 .:4'];
const AU_DRUMS=(crash)=>[{kick:['x.......'],hat:['x.o.x.o.'],int:[0,0.6]},{kick:['x...x...','x.....x.'],rim:['....x...'],hat:['xoxoxoxo'],ride:['x.......','..x.....'],crash:crash||Z8,int:[0.6,1]}];
const AU_PERC={shaker:['x.x.x.x.'],tamb:AT(5,4,'....x.xx',Z8)};
function aurPlay(lead,arpA,arpB,crash){
  return{pad:{p:'chord'},bass:{p:AU_BASS},arp:[{p:arpA,int:[0,0.55]},{p:arpB,int:[0.55,1]}],lead:{p:lead},drums:AU_DRUMS(crash),perc:AU_PERC,choir:{p:'chord'}};
}
MUSIC_DATA.theme_aurora={
  tempo:84,tempoEra:[80,84,88],beats:4,grid:8,swing:0,key:'F#',mode:'lydian',loop:true,tail:4,gain:0.42,room:'air',dly:0.75,dlyFb:0.38,
  stems:{
    pad:{inst:'pad_air',reg:'C3',gain:0.62,rev:0.42,room:'air',voices:3,prio:1,spread:0.55,mix:[[0,1],[0.6,0.85],[1,0.62]],nightGain:1.05,nightOct:-1},
    bass:{inst:'bass_sub',reg:'C2',gain:0.8,rev:0.05,prio:1,mix:[[0,0.8],[0.5,1],[1,0.95]]},
    arp:{inst:'bell',reg:'C5',gain:0.5,rev:0.4,room:'air',dly:0.36,gate:0.9,prio:0.4,spread:0.85,swing:0.33,p:{ring:0.9,idx:2.4},mix:[[0,0.85],[0.6,1],[1,0.8]]},
    lead:{inst:'glass',reg:'C4',ref:'scale',gain:0.55,rev:0.4,room:'air',dly:0.3,prio:0.9,pan:-0.12,on:[0.15,0.35],p:{ring:1.2}},
    drums:{kind:'lanes',gain:0.55,rev:0.18,room:'plate',prio:0.8,swing:0.33,on:[0.3,0.46],kit:{rim:'snare_rim'}},
    perc:{kind:'lanes',gain:0.55,rev:0.2,room:'air',prio:0.5,swing:0.33,on:[0.2,0.36]},
    choir:{inst:'choir_ooh',reg:'C4',gain:0.45,rev:0.55,room:'air',voices:3,prio:0.6,spread:0.7,on:[0.55,0.75],eraGain:[0,0.55,1]}
  },
  sections:[
    {name:'dawn',   bars:5,chords:'F#maj7@2 G#add9/F# F#maj7 C#sus2add9/F#',play:aurPlay('3:3 5:3 6:2 5:3 3:3 2:2 3:2 5:2 6:4 5:4 3:2 2:2 1:8',AU_ARP_A,AU_ARP_B)},
    {name:'shimmer',bars:5,chords:'A#m7/F#@2 D#m9 G#add9 C#/F#',play:aurPlay('5:3 6:3 8:2 6:3 5:3 3:2 5:2 6:2 8:4 6:4 5:2 3:2 3:8',AU_ARP_B,AU_ARP_C)},
    {name:'bridge', bars:4,meter:[7,8],mix:{drums:0.6},chords:'D#m7@2 A#m7 G#add9/F#',
     play:{pad:{p:'chord'},bass:{p:['B:7','B:4 .:3']},arp:{p:['1 3 2 4 3 2 4','1 2 3 4 3 5 4','2 3 4 5 3 4 3','1 3 5 4 3 2 3']},lead:{p:'6:3 5:2 3:2 5:3 6:2 8:2 6:2 5:3 3:2 2:3 1:4'},
       drums:[{kick:['x.....x'],hat:['x.o.x.o'],int:[0,0.6]},{kick:['x..x..x'],rim:['..x..x.'],hat:['xoxoxox'],ride:['x......'],int:[0.6,1]}],
       perc:{shaker:['x.x.x.x'],tamb:AT(4,3,'..x.x.x',Z8.slice(1))},choir:{p:'chord'}}},
    {name:'return', bars:5,chords:'F#maj9@2 G#add9/F# A#m7/F# C#/F#',play:aurPlay('8:3 6:3 5:2 6:3 8:3 9:2 8:2 6:2 5:4 6:2 8:2 6:2 .:2 5:8',AU_ARP_A,AU_ARP_B)},
    {name:'bloom',  bars:5,chords:'F# G#add9/F# A#m7/F# D#m9 C#sus4',play:aurPlay('6:3 8:3 9:2 8:3 6:3 5:2 6:2 8:2 10:4 9:2 8:2 6:2 .:2 8:8',AU_ARP_B,AU_ARP_C,AT(5,0,'x.......',Z8))}
  ]
};
})();
