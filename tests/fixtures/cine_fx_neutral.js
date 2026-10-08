/* Cinematic FX PROOF fixture: every fx kind, every transition and the title card, each over a NEUTRAL background (a flat, dim blue-grey 'void' with
   no faction, no time of day and no camera move), so that an effect can be judged on its own.  Generated, not authored.
   Usage (the scratch build is always passed through OD_URL, never the shared dist/):
     python3 tools/cine_contact.py --fixture tests/fixtures/cine_fx_neutral.js --cine fx_rain --times 0.6,1.4,2.2 --no-trans --out tests/out/cine/fx_rain.png
     python3 tools/cine_contact.py --fixture tests/fixtures/cine_fx_neutral.js --cine 'trans_*' --times 2.5,2.9,3.3 --out tests/out/cine/trans_wipe.png
   Film ids:  fx_<kind> (every CINE_FX kind: one 6 s scene, the effect spans the scene; one-shots carry their own t0/t1)
              fx_stack (every ambient fx at once: the budget test)   trans_<kind> (every CINE_TRANS kind: A -> B (in + out) -> C)
              title_card (two titles on neutral)   title_long (a long title that must wrap or shrink) */
const path=require('path');
module.exports=function makeNeutralFx(){
  const V=require(path.join(__dirname,'..','sim','storylib.js'))();
  const NEUTRAL={k:'void',tint:'#1c2432',glow:.12};
  const cam0={from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1,r:0},ease:'lin'};
  const cine={};
  let sid=0;
  const sc=(dur,o)=>Object.assign({id:'s'+(++sid),dur,bg:NEUTRAL,cam:cam0,actors:[],props:[],fx:[],lines:[],sfx:[],trans:{in:'cut',out:'cut',len:.3}},o);
  const film=(id,scenes,extra)=>{scenes.forEach((s,i)=>{s.id='s'+(i+1);});cine[id]=Object.assign({id,kind:'interlude',title:id,music:'intro',letterbox:true,seed:7,scenes},extra||{});return cine[id];};

  /* one parameter set per kind: anchors and windows chosen so that each effect is clearly visible in a 6 s scene */
  const FX={
    stars:{t0:0,t1:6},
    dust:{t0:0,t1:6,x:.5,y:.45},
    embers:{t0:0,t1:6},
    rain:{t0:0,t1:6,dir:.22},
    snow:{t0:0,t1:6},
    lightning:{t0:0,t1:6},
    beam:{t0:.4,t1:4.6,x:.45,y:.04,to:[.55,.86]},
    explosion:{t0:.3,t1:3.3,x:.5,y:.68},
    flare:{t0:.2,t1:5.8,x:.22,y:.32},
    rings:{t0:0,t1:6,x:.5,y:.62},
    scan:{t0:0,t1:6},
    glitch:{t0:0,t1:6},
    shake:{t0:0,t1:6,a:1},
    vignette:{t0:0,t1:6,a:.9},
    heat:{t0:0,t1:6},
    pulse:{t0:0,t1:6,x:.5,y:.5},
    sparks:{t0:.3,t1:3,x:.5,y:.6},
    smoke:{t0:0,t1:6,x:.5,y:.8},
    comets:{t0:0,t1:6}
  };
  for(const k of V.CINE_FX){
    const e=Object.assign({k,a:1},FX[k]||{});
    if(!FX[k])throw new Error('cine_fx_neutral: no parameters for fx '+k);
    film('fx_'+k,[sc(6,{fx:[e]})]);
  }
  /* every ambient fx at once: the per-frame budget (a real scene can stack several) */
  film('fx_stack',[sc(6,{fx:[{k:'stars',t0:0,t1:6,a:1},{k:'dust',t0:0,t1:6,a:.8,x:.5,y:.4},{k:'embers',t0:0,t1:6,a:.9},{k:'smoke',t0:0,t1:6,x:.3,y:.82},
    {k:'heat',t0:0,t1:6,a:.8},{k:'flare',t0:0,t1:6,x:.78,y:.26,a:.7},{k:'pulse',t0:0,t1:6,x:.6,y:.6,a:.6},{k:'vignette',t0:0,t1:6,a:.7}]})]);
  /* transitions: scene A (cut out), B (in and out with the kind under test), C (cut in) */
  for(const k of V.CINE_TRANS){
    film('trans_'+k,[
      sc(2.4,{bg:{k:'void',tint:'#2a5a9a',glow:.9},trans:{in:'cut',out:'cut',len:1}}),
      sc(2.4,{bg:{k:'void',tint:'#9a3a2a',glow:.9},trans:{in:k,out:k,len:1}}),
      sc(2.4,{bg:{k:'void',tint:'#2a9a5a',glow:.9},trans:{in:'cut',out:'cut',len:1}})
    ]);
  }
  /* title cards over the neutral background: a long and a short title, one with a subtitle and one without */
  film('title_card',[
    sc(5,{title:{text:'ORBITAL DOMINION',sub:'The Ashen Crown',t0:.4,t1:4.6}}),
    sc(4,{title:{text:'LANDFALL',t0:.3,t1:3.4}})
  ],{kind:'intro'});
  film('title_long',[
    sc(5,{title:{text:'THE LONG NIGHT OF SEN CROSSING',sub:'Chapter Three: Where the Hauler Stopped',t0:.4,t1:4.6}}),
    sc(4,{title:{text:'ORBITAL DOMINION OF THE ASHEN CROWN AND ITS LAST MEN',t0:.3,t1:3.4}})
  ],{kind:'intro'});
  /* colour grade proofs: the same planet under each faction's grade (the engine derives G from the faction, the time of day and the cue),
     plus the tragedy cue (desaturated) and a bridge interior at night */
  const PLANET={k:'planet',planet:'azure',rings:true,phase:.6,size:1.1,moons:1,atmosphere:true,nebula:'blue'};
  for(const f of['meridian','obsidian','aurora'])film('grade_'+f,[sc(4,{bg:Object.assign({faction:f},PLANET),fx:[]})]);
  film('grade_none',[sc(4,{bg:PLANET})]);
  film('grade_tragedy',[sc(4,{bg:PLANET,music:{cue:'tragedy'}})],{music:'tragedy'});
  film('grade_bridge_night',[sc(4,{bg:{k:'bridge',faction:'aurora',alert:false,view:'planet',time:'night'}})]);
  return{characters:{},cine};
};
