/* Cinematic SHOWCASE fixture — films that exercise every background kind (several parameter variants), every prop kind/variant, every fx kind, every expression on every
   character, every actor mode, every transition, camera moves, line styles and the title card. Generated, not authored: it exists so the art agents can render each
   painter in context (python3 tools/cine_contact.py --fixture showcase --cine showcase_bg_orbit ...) and so the engine tests have data for every vocabulary id.
   Usage: const {characters,cine}=require('./cine_showcase.js')();   — returns a fresh deep object each call.
   Film ids:  showcase_bg_<kind> (12)   showcase_props   showcase_props_moving   showcase_fx_<kind> (19)   showcase_expr_<char> (13)   showcase_modes   showcase_trans
              showcase_cam   showcase_title   showcase_subs   showcase_all (one scene from everything)   showcase_mini (2 s, for the export test) */
const path=require('path');
module.exports=function makeShowcase(){
  const V=require(path.join(__dirname,'..','sim','storylib.js'))();
  const base=require(path.join(__dirname,'story_min.js'))();
  const characters=base.characters,chIds=Object.keys(characters),cine={};
  const speakers=chIds.filter(x=>x!=='narrator');
  const BG=V.CINE_BG,EXPR=V.CINE_EXPR,FX=V.CINE_FX,PROPS=V.CINE_PROPS,TRANS=V.CINE_TRANS,MODES=V.CINE_ACTOR_MODES,STYLES=V.LINE_STYLES;
  let sid=0;
  const sc=(dur,o)=>Object.assign({id:'s'+(++sid),dur,cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1.08,r:0},ease:'inout'},actors:[],props:[],fx:[],lines:[],sfx:[],trans:{in:'fade',out:'cut',len:.35}},o);
  const film=(id,scenes,extra)=>{if(id!=='showcase_all')scenes.forEach((s,i)=>{s.id='s'+(i+1);});cine[id]=Object.assign({id,kind:'interlude',title:id,music:'intro',letterbox:true,seed:7,scenes},extra||{});return cine[id];};
  const actor=(char,at,h,expr,o)=>Object.assign({id:'a_'+char,char,at,h,face:at[0]>.5?'l':'r',expr:expr||'neutral',mode:'bust',t0:0},o||{});
  const grid=(n,cols,x0,x1,y0,y1)=>Array.from({length:n},(_,i)=>{const r=Math.floor(i/cols),c=i%cols,rows=Math.ceil(n/cols),cc=Math.min(cols,n-r*cols);return[x0+(x1-x0)*(cc===1?.5:c/(cc-1)),rows===1?(y0+y1)/2:y0+(y1-y0)*r/(rows-1)];});
  const FAC=['meridian','obsidian','aurora'];

  /* ------------------------------ backgrounds: every kind, several variants ------------------------------ */
  const nb=BG.space.nebula,pl=BG.planet.planet,bio=BG.surface.biome,tod=BG.surface.time;
  const variants={
    space:[...nb.map((n,i)=>({k:'space',nebula:n,density:[.5,.7,.4,.9,.6,.5][i],drift:[0,.5,-.5,0,1,0][i]})),{k:'space',nebula:'blue',density:.1,drift:0},{k:'space',nebula:'violet',density:1,drift:-.8}],
    planet:[...pl.map((p,i)=>({k:'planet',planet:p,rings:i%2===0,phase:[.62,.3,.9,.5,.15,.75][i],size:[1,.7,1.4,1,1.8,.9][i],moons:i%4,atmosphere:i!==3,nebula:nb[i%6]})),{k:'planet',planet:'azure',size:.35,moons:3,nebula:'none',rings:true,phase:1}],
    orbit:[{k:'orbit',planet:'azure',limb:'bottom',station:true,ships:3,glow:.5},{k:'orbit',planet:'ember',limb:'left',station:false,ships:5,glow:.8},{k:'orbit',planet:'verdant',limb:'right',station:true,ships:0,glow:.3},
      {k:'orbit',planet:'ice',limb:'top',station:false,ships:2,glow:.6},{k:'orbit',planet:'violet',limb:'bottom',station:true,ships:6,glow:1},{k:'orbit',planet:'ashen',limb:'bottom',station:false,ships:0,glow:0}],
    surface:[{k:'surface',biome:'dust',time:'day',features:['hub','generators']},{k:'surface',biome:'crystal',time:'dusk',features:['crystals','geyser']},{k:'surface',biome:'ash',time:'night',features:['wreck','towers']},
      {k:'surface',biome:'green',time:'dawn',features:['dunes','banners']},{k:'surface',biome:'ice',time:'day',features:['cliffs','banners','tents']},{k:'surface',biome:'dust',time:'night',features:['hub','tents','banners','crystals']}],
    base:[{k:'base',faction:'meridian',time:'day',state:'calm'},{k:'base',faction:'meridian',time:'dusk',state:'siege'},{k:'base',faction:'obsidian',time:'night',state:'ruined'},{k:'base',faction:'obsidian',time:'dawn',state:'calm'},
      {k:'base',faction:'aurora',time:'day',state:'celebration'},{k:'base',faction:'aurora',time:'dusk',state:'calm'},{k:'base',faction:'obsidian',time:'day',state:'siege'},{k:'base',faction:'meridian',time:'night',state:'celebration'}],
    bridge:[{k:'bridge',faction:'meridian',alert:false,view:'space'},{k:'bridge',faction:'meridian',alert:true,view:'planet'},{k:'bridge',faction:'obsidian',alert:false,view:'none'},{k:'bridge',faction:'aurora',alert:false,view:'array'},
      {k:'bridge',faction:'neutral',alert:false,view:'planet'},{k:'bridge',faction:'obsidian',alert:true,view:'space'}],
    hall:[{k:'hall',style:'meridian',light:'cold'},{k:'hall',style:'meridian',light:'warm'},{k:'hall',style:'obsidian',light:'cold'},{k:'hall',style:'obsidian',light:'blood'},{k:'hall',style:'aurora',light:'warm'},{k:'hall',style:'forbidden',light:'blood'},{k:'hall',style:'forbidden',light:'cold'},{k:'hall',style:'aurora',light:'cold'}],
    battlefield:[{k:'battlefield',biome:'dust',time:'day',intensity:.2,sides:['meridian','obsidian']},{k:'battlefield',biome:'ash',time:'dusk',intensity:.6,sides:['obsidian','meridian']},{k:'battlefield',biome:'crystal',time:'night',intensity:.9,sides:['aurora','obsidian']},
      {k:'battlefield',biome:'green',time:'dawn',intensity:.5,sides:['meridian','aurora']},{k:'battlefield',biome:'ice',time:'day',intensity:1,sides:['obsidian','meridian']},{k:'battlefield',biome:'dust',time:'dusk',intensity:0,sides:['aurora','meridian']}],
    ruins:[...bio.map((b,i)=>({k:'ruins',biome:b,time:tod[i%4]})),{k:'ruins',biome:'ash',time:'night'}],
    array:[{k:'array',state:'dormant',planet:'azure'},{k:'array',state:'charging',planet:'ember'},{k:'array',state:'firing',planet:'violet'},{k:'array',state:'broken',planet:'ashen'},{k:'array',state:'firing',planet:'azure'},{k:'array',state:'charging',planet:'ice'}],
    void:[{k:'void',tint:'#112244',glow:.5},{k:'void',tint:'#441122',glow:.9},{k:'void',tint:'#224411',glow:.2},{k:'void',tint:'#000000',glow:0},{k:'void',tint:'#2a1a5a',glow:1},{k:'void',tint:'#5a4a1a',glow:.6}],
    map:[{k:'map',focus:[.5,.5],marks:[{x:.3,y:.4,k:'friendly'},{x:.7,y:.6,k:'enemy'}],faction:'meridian'},{k:'map',focus:[.3,.3],marks:[{x:.25,y:.3,k:'objective'},{x:.6,y:.5,k:'danger'},{x:.4,y:.7,k:'friendly'}],faction:'obsidian'},
      {k:'map',focus:[.7,.6],marks:[{x:.7,y:.6,k:'objective'},{x:.2,y:.2,k:'enemy'},{x:.8,y:.3,k:'enemy'},{x:.5,y:.8,k:'friendly'}],faction:'aurora'},{k:'map',focus:[.5,.5],marks:[],faction:'neutral'}]
  };
  for(const k of Object.keys(BG)){
    const list=variants[k];if(!list)throw new Error('showcase: no variants for bg '+k);
    film('showcase_bg_'+k,list.map((bg,i)=>sc(2.6,{bg,cam:{from:{x:.46,y:.5,z:1,r:0},to:{x:.54,y:.5,z:1.12,r:0},ease:'inout'},
      actors:i%2?[actor(speakers[(i*3)%speakers.length],[i%4===1?.28:.72,.64],.74,'determined')]:[]})));
  }

  /* ------------------------------ props: every kind and variant ------------------------------ */
  const P=[],ps=(bg,props,extra)=>P.push(sc(3,Object.assign({bg,props},extra||{})));
  const ships=[];for(const cls of PROPS.ship.cls)for(const f of FAC)ships.push({k:'ship',cls,faction:f});
  const orb={k:'orbit',planet:'azure',limb:'bottom',station:false,ships:0,glow:.4};
  [ships.slice(0,8),ships.slice(8)].forEach(list=>ps(orb,list.map((s,i)=>Object.assign({},s,{at:grid(list.length,4,.16,.84,.34,.7)[i],scale:.85,rot:i%3===1?.12:0}))));
  const units=V.UNIT_TYPES.map((t,i)=>({k:'unit',type:t,faction:FAC[i%3]}));
  const surf={k:'surface',biome:'dust',time:'day',features:[]};
  for(let i=0;i<units.length;i+=7){const list=units.slice(i,i+7);ps(surf,list.map((u,j)=>Object.assign({},u,{at:grid(list.length,4,.14,.86,.46,.78)[j],scale:.7,rot:j*.3})));}
  const blds=V.BUILDING_TYPES.map((t,i)=>({k:'building',type:t,faction:FAC[i%3]}));
  for(let i=0;i<blds.length;i+=6){const list=blds.slice(i,i+6);ps({k:'surface',biome:'ash',time:'dusk',features:[]},list.map((b,j)=>Object.assign({},b,{at:grid(list.length,3,.2,.8,.38,.74)[j],scale:.95})));}
  ps({k:'space',nebula:'teal',density:.4,drift:0},pl.map((p,i)=>({k:'planet',planet:p,at:grid(6,3,.2,.8,.3,.72)[i],scale:.75+.1*(i%3)})));
  ps({k:'void',tint:'#0e1a38',glow:.35},[{k:'moon',at:[.12,.5],scale:.8},{k:'station',at:[.31,.5],scale:1},{k:'beacon',at:[.5,.5],scale:1},{k:'crystal',at:[.69,.5],scale:1},{k:'array',at:[.88,.5],scale:1.1},
    {k:'beacon',at:[.4,.82],scale:.5,col:'#5aa9ff'},{k:'crystal',at:[.6,.82],scale:.5,col:'#ff7a5a'}]);
  ps({k:'hall',style:'meridian',light:'warm'},[...FAC.map((f,i)=>({k:'banner',faction:f,at:[.2+i*.3,.46],scale:1.5})),{k:'crowd',faction:'meridian',at:[.5,.88],scale:2.2}]);
  ps({k:'void',tint:'#05222a',glow:.3},PROPS.holo.shape.map((s,i)=>({k:'holo',shape:s,at:grid(7,4,.14,.86,.36,.7)[i],scale:.8,col:i%2?'#7ae8ff':undefined})));
  ps({k:'battlefield',biome:'dust',time:'dusk',intensity:.4,sides:['meridian','obsidian']},FAC.map((f,i)=>({k:'crowd',faction:f,at:[.2+i*.3,.7],scale:1.7})));
  film('showcase_props',P,{kind:'interlude'});
  film('showcase_props_moving',[
    sc(4,{bg:{k:'orbit',planet:'ember',limb:'bottom',station:true,ships:1,glow:.6},props:[{k:'ship',cls:'dropship',faction:'meridian',from:[-.15,.3],to:[.7,.5],scale:1,rot:.1,t0:0,t1:3.6,ease:'inout'},{k:'ship',cls:'frigate',faction:'obsidian',from:[1.15,.2],to:[.2,.4],scale:1.2,t0:.4,t1:3.8,ease:'out'},{k:'ship',cls:'shuttle',faction:'aurora',from:[.5,1.1],to:[.5,.1],scale:.6,t0:0,t1:4,ease:'in'}]}),
    sc(4,{bg:{k:'surface',biome:'green',time:'day',features:['hub']},props:[{k:'unit',type:'rifleman',faction:'meridian',from:[.1,.78],to:[.6,.78],scale:1.1,t0:0,t1:4,ease:'lin'},{k:'unit',type:'juggernaut',faction:'obsidian',from:[.95,.66],to:[.5,.66],scale:1.4,rot:3.14,t0:0,t1:4,ease:'lin'},{k:'building',type:'hub',faction:'aurora',at:[.78,.5],scale:1.6,z:-1}]}),
    sc(4,{bg:{k:'space',nebula:'violet',density:.6,drift:0},props:[{k:'planet',planet:'violet',from:[.3,.5],to:[.4,.5],scale:2.4,t0:0,t1:4,z:-1},{k:'ship',cls:'carrier',faction:'meridian',from:[-.2,.7],to:[1.2,.6],scale:1.6,t0:0,t1:4},{k:'beacon',at:[.8,.8],scale:1,z:1},{k:'crystal',from:[.1,.95],to:[.1,.85],scale:1.2,z:1,t0:0,t1:4}]})
  ],{kind:'interlude'});

  /* ------------------------------ fx: every kind, two variants each ------------------------------ */
  const fxBg={stars:{k:'space',nebula:'blue',density:.4,drift:0},dust:{k:'surface',biome:'dust',time:'dusk',features:['hub']},embers:{k:'battlefield',biome:'ash',time:'dusk',intensity:.8,sides:['obsidian','meridian']},
    rain:{k:'surface',biome:'green',time:'night',features:['towers']},snow:{k:'surface',biome:'ice',time:'day',features:['cliffs']},lightning:{k:'surface',biome:'ash',time:'night',features:['wreck']},
    beam:{k:'orbit',planet:'azure',limb:'bottom',station:true,ships:2,glow:.5},explosion:{k:'battlefield',biome:'dust',time:'day',intensity:.6,sides:['meridian','obsidian']},flare:{k:'space',nebula:'teal',density:.5,drift:0},
    rings:{k:'void',tint:'#102a4a',glow:.5},scan:{k:'bridge',faction:'aurora',alert:false,view:'planet'},glitch:{k:'bridge',faction:'obsidian',alert:true,view:'space'},shake:{k:'battlefield',biome:'crystal',time:'dusk',intensity:.9,sides:['aurora','obsidian']},
    vignette:{k:'hall',style:'forbidden',light:'blood'},heat:{k:'surface',biome:'dust',time:'day',features:['dunes','wreck']},pulse:{k:'void',tint:'#1a1244',glow:.6},sparks:{k:'ruins',biome:'ash',time:'night'},
    smoke:{k:'ruins',biome:'dust',time:'dusk'},comets:{k:'space',nebula:'violet',density:.3,drift:0}};
  for(const k of FX){
    const b=fxBg[k];if(!b)throw new Error('showcase: no fx backdrop for '+k);
    film('showcase_fx_'+k,[
      sc(4,{bg:b,fx:[{k,t0:0,t1:4,a:1,x:.62,y:.45}],actors:[actor('idris',[.28,.66],.74,'determined')],cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1.06,r:0},ease:'lin'}}),
      sc(4,{bg:b,fx:[{k,t0:.4,t1:3.6,a:.55,x:.35,y:.35,col:'#ff9a4a',to:[.8,.7]},{k:'shake',t0:1.6,t1:2.4,a:.5}],actors:[actor('vael',[.72,.66],.74,'cold')]})
    ]);
  }

  /* ------------------------------ expressions: every expression on every character ------------------------------ */
  const exprBg=['hall','bridge','void','hall','void'];
  for(const ch of chIds){
    const ci=chIds.indexOf(ch);
    film('showcase_expr_'+ch,EXPR.map((ex,i)=>sc(1.9,{bg:ci%2?{k:'hall',style:FAC[ci%3],light:'cold'}:{k:'void',tint:'#142040',glow:.4},cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1.06,r:0},ease:'lin'},
      actors:[actor(ch,[.5,.62],.9,ex,{face:i%3===1?'l':'r'})],lines:ex==='talk'?[{who:ch,text:'Listen closely, because I will only say this once.',t:.1,dur:1.7,style:'normal',expr:'talk'}]:[]})));
  }

  /* ------------------------------ actor modes, sizes, facing, movement, several actors ------------------------------ */
  film('showcase_modes',[
    sc(3,{bg:{k:'hall',style:'meridian',light:'cold'},actors:[actor('idris',[.3,.62],.85,'determined',{mode:'bust'}),actor('kaz',[.7,.62],.85,'angry',{mode:'bust',face:'l'})]}),
    sc(3,{bg:{k:'orbit',planet:'ember',limb:'bottom',station:false,ships:2,glow:.7},actors:[actor('vael',[.3,.62],.9,'cold',{mode:'silhouette'}),actor('sable',[.72,.6],.8,'smirk',{mode:'silhouette',face:'l'})]}),
    sc(3,{bg:{k:'hall',style:'forbidden',light:'blood'},actors:[actor('vael',[.5,.58],1,'cold',{mode:'shadow'})],fx:[{k:'vignette',t0:0,t1:3,a:.6}]}),
    sc(3,{bg:{k:'bridge',faction:'aurora',alert:false,view:'planet'},actors:[actor('sable',[.35,.62],.8,'neutral',{mode:'hologram'}),actor('lyra',[.72,.62],.8,'talk',{mode:'hologram',face:'l'})],fx:[{k:'scan',t0:0,t1:3,a:.6}],lines:[{who:'lyra',text:'The signal is still coming through.',t:.5,dur:2.2,style:'radio',expr:'talk'}]}),
    sc(3,{bg:{k:'void',tint:'#142040',glow:.5},actors:[actor('pip',[.2,.7],.4,'smile'),actor('ada',[.4,.66],.6,'neutral'),actor('tov',[.62,.62],.8,'weary',{face:'l'}),actor('nell',[.86,.58],1.05,'sad',{face:'l'})]}),
    sc(3,{bg:{k:'surface',biome:'dust',time:'dusk',features:['hub']},actors:[actor('mira',[.2,.64],.8,'neutral',{move:{to:[.75,.64],ease:'inout'},face:'r'}),actor('oren',[.85,.64],.8,'scared',{move:{to:[.45,.7],ease:'out'},face:'l',t0:.8})]})
  ]);

  /* ------------------------------ transitions: every kind in and out ------------------------------ */
  const tb=[{k:'space',nebula:'blue',density:.5,drift:0},{k:'surface',biome:'dust',time:'day',features:['hub']},{k:'hall',style:'obsidian',light:'blood'},{k:'orbit',planet:'ember',limb:'bottom',station:true,ships:3,glow:.6},{k:'bridge',faction:'meridian',alert:false,view:'space'},{k:'void',tint:'#2a1a5a',glow:.7}];
  film('showcase_trans',Array.from({length:14},(_,i)=>sc(2.4,{bg:tb[i%tb.length],actors:[actor(speakers[i%speakers.length],[i%2?.7:.3,.64],.8,'neutral')],trans:{in:TRANS[i%6],out:TRANS[(i+3)%6],len:.7}})));

  /* ------------------------------ camera moves ------------------------------ */
  const cp=(x,y,z,r)=>({x,y,z,r});
  film('showcase_cam',[
    {c:{from:cp(.25,.5,1.3,0),to:cp(.75,.5,1.3,0),ease:'inout'}},{c:{from:cp(.5,.5,1,0),to:cp(.5,.5,2,0),ease:'in'}},{c:{from:cp(.5,.5,1.8,0),to:cp(.5,.5,.8,0),ease:'out'}},{c:{from:cp(.5,.5,1.1,-.2),to:cp(.5,.5,1.1,.2),ease:'lin'}},
    {c:{from:cp(.3,.7,1,.05),to:cp(.7,.3,1.5,-.1),ease:'inout'}},{c:{from:cp(.5,.5,3,0),to:cp(.5,.5,2.6,0),ease:'lin'}},{c:{from:cp(.5,.5,.6,0),to:cp(.5,.5,.5,0),ease:'lin'}}
  ].map((m,i)=>sc(3,{bg:variants.orbit[i%6],cam:m.c,actors:[actor('idris',[.3,.64],.8,'neutral'),actor('kaz',[.7,.64],.8,'neutral',{face:'l'})],props:[{k:'ship',cls:'frigate',faction:'meridian',at:[.5,.3],scale:.8}],fx:i===4?[{k:'shake',t0:1,t1:2,a:.8}]:[]})));

  /* ------------------------------ title card ------------------------------ */
  film('showcase_title',[
    sc(4.4,{bg:{k:'planet',planet:'azure',rings:true,phase:.6,size:1.2,moons:1,atmosphere:true,nebula:'blue'},title:{text:'ORBITAL DOMINION',sub:'The Ashen Crown',t0:.4,t1:4}}),
    sc(3.4,{bg:{k:'void',tint:'#112244',glow:.5},title:{text:'LANDFALL',t0:.3,t1:3.1}})
  ],{kind:'intro'});

  /* ------------------------------ every line style ------------------------------ */
  film('showcase_subs',[
    sc(3.4,{bg:{k:'hall',style:'meridian',light:'cold'},actors:[actor('idris',[.5,.62],.85,'determined')],lines:[{who:'idris',text:'We hold the line until the last hauler is clear.',t:.2,dur:3,style:'normal',expr:'determined'}]}),
    sc(3.4,{bg:{k:'bridge',faction:'obsidian',alert:true,view:'space'},actors:[actor('kaz',[.5,.62],.85,'angry')],lines:[{who:'kaz',text:'Burn it all down!',t:.2,dur:2.2,style:'shout',expr:'angry'}]}),
    sc(3.4,{bg:{k:'hall',style:'forbidden',light:'blood'},actors:[actor('vael',[.5,.62],.9,'cold',{mode:'shadow'})],lines:[{who:'vael',text:'You hear nothing, until it is already over.',t:.2,dur:3,style:'whisper',expr:'cold'}]}),
    sc(3.4,{bg:{k:'space',nebula:'teal',density:.4,drift:0},lines:[{who:'lyra',text:'Colony, this is Sen. Do you copy? Say again, over.',t:.2,dur:3,style:'radio'}],actors:[]}),
    sc(3.4,{bg:{k:'ruins',biome:'dust',time:'dusk'},lines:[{who:'narrator',text:'Nothing remained of the old garrison but wind and iron.',t:.2,dur:3,style:'narration'}]}),
    sc(3.4,{bg:{k:'surface',biome:'ash',time:'night',features:['wreck']},actors:[actor('pip',[.4,.64],.8,'weary')],lines:[{who:'pip',text:'Maybe I was never meant to come back.',t:.2,dur:3,style:'thought',expr:'weary'}]})
  ]);

  /* ------------------------------ a 2 s film for the export test ------------------------------ */
  film('showcase_mini',[sc(2,{bg:{k:'void',tint:'#18305a',glow:.6},actors:[actor('idris',[.5,.62],.8,'talk')],lines:[{who:'idris',text:'Export test.',t:.2,dur:1.6,style:'normal',expr:'talk'}],trans:{in:'cut',out:'cut',len:.3}})],{kind:'briefing'});

  /* ------------------------------ one scene from everything ------------------------------ */
  const all=[];let n=0;
  const take=(id,i)=>{const s=JSON.parse(JSON.stringify(cine[id].scenes[i||0]));s.id='all'+(++n)+'_'+id.replace('showcase_','');all.push(s);};
  Object.keys(BG).forEach(k=>take('showcase_bg_'+k,0));
  take('showcase_props',0);take('showcase_props',2);take('showcase_props',5);take('showcase_props_moving',0);
  FX.forEach(k=>take('showcase_fx_'+k,0));
  ['idris','vael','pip','narrator'].forEach(c=>take('showcase_expr_'+c,1));
  take('showcase_modes',1);take('showcase_modes',3);take('showcase_trans',1);take('showcase_trans',3);take('showcase_cam',1);take('showcase_cam',3);take('showcase_title',0);take('showcase_subs',3);take('showcase_subs',1);
  film('showcase_all',all,{kind:'interlude'});

  return{characters,cine};
};
