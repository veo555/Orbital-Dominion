/* Contact-sheet fixture for the SPACE BACKGROUNDS (src/js/64_cine_bg_space.js): every parameter combination of space / planet / orbit / array / void / map that the vocabulary allows,
   one scene per variant, so a reviewer can look at all of them. Not a story: it only exists to be rendered by tools/cine_contact.py and by tests/e2e/e2e_cine.py.
     python3 tools/cine_contact.py --fixture tests/fixtures/cine_bg_space.js --cine bgspace_planets_rings --per-scene --no-trans --no-labels --cols 3 --out tests/out/cine/bg_space_planets_rings.png
   Film ids: bgspace_planets_plain, bgspace_planets_rings (6 planets x 3 phases each), bgspace_planets_sizes (size 0.3..2.5, moons 0..3, no atmosphere), bgspace_nebulae (6 kinds x 3 densities),
   bgspace_orbit (6 planets x 4 limbs), bgspace_array (4 states x 6 planets), bgspace_void, bgspace_map (every mark kind, factions, focus positions, odd data).
   Usage: const {characters,cine}=require('./cine_bg_space.js')(); */
module.exports=function makeBgSpace(){
  const PL=['azure','ember','verdant','ice','ashen','violet'],NB=['blue','red','teal','violet','gold','none'],LIMB=['bottom','left','right','top'],ST=['dormant','charging','firing','broken'],FAC=['meridian','obsidian','aurora','neutral'];
  const cine={};let n=0;
  const sc=(bg,extra)=>Object.assign({id:'s'+(++n),dur:2.4,bg,cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1,r:0},ease:'lin'},actors:[],props:[],fx:[],lines:[],sfx:[],trans:{in:'cut',out:'cut',len:.3}},extra||{});
  const film=(id,scenes)=>{n=0;scenes.forEach((s,i)=>{s.id='s'+(i+1);});cine[id]={id,kind:'interlude',title:id,music:'intro',letterbox:true,seed:11,scenes};};
  const PH=[.15,.5,.95];
  film('bgspace_planets_plain',PL.flatMap((p,i)=>PH.map((ph,j)=>sc({k:'planet',planet:p,rings:false,phase:ph,size:1,moons:j===1?2:0,atmosphere:true,nebula:NB[(i+j)%6]}))));
  film('bgspace_planets_rings',PL.flatMap((p,i)=>PH.map((ph,j)=>sc({k:'planet',planet:p,rings:true,phase:ph,size:[1,1.15,.85][j],moons:j===2?1:0,atmosphere:true,nebula:NB[(i*2+j)%6]}))));
  film('bgspace_planets_sizes',[.3,.5,.8,1.2,1.8,2.5].map((size,i)=>sc({k:'planet',planet:PL[i],rings:i%2===0,phase:.62,size,moons:i%4,atmosphere:i!==3,nebula:'none'}))
    .concat([0,1].map(ph=>sc({k:'planet',planet:'azure',rings:false,phase:ph,size:1,moons:3,atmosphere:true,nebula:'blue'})),[sc({k:'planet'})]));
  film('bgspace_nebulae',NB.flatMap((nb,i)=>[.15,.5,1].map((d,j)=>sc({k:'space',nebula:nb,density:d,drift:[0,.6,-.6][j]}))));
  film('bgspace_orbit',PL.flatMap((p,i)=>LIMB.map((l,j)=>sc({k:'orbit',planet:p,limb:l,station:(i+j)%2===0,ships:(i*3+j*2)%7,glow:[.1,.5,.8,1][(i+j)%4]}))));
  film('bgspace_array',ST.flatMap((s,i)=>PL.map((p,j)=>sc({k:'array',state:s,planet:p}))));
  film('bgspace_void',['#112244','#441122','#224411','#000000','#2a1a5a','#5a4a1a','#ffffff','#14343a','#3a1a14','#0a0a0a','#fff','#abc'].map((t,i)=>sc({k:'void',tint:t,glow:[0,.2,.4,.6,.8,1][i%6]})));
  const M=(x,y,k)=>({x,y,k});
  film('bgspace_map',[
    sc({k:'map',focus:[.5,.5],marks:[],faction:'neutral'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.35,.45,'friendly')],faction:'meridian'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.65,.45,'enemy')],faction:'obsidian'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.5,.45,'objective')],faction:'aurora'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.5,.45,'danger')],faction:'neutral'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.3,.62,'friendly'),M(.7,.55,'enemy'),M(.5,.3,'objective'),M(.52,.7,'danger')],faction:'meridian'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.3,.62,'friendly'),M(.7,.55,'enemy'),M(.5,.3,'objective'),M(.52,.7,'danger')],faction:'obsidian'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.3,.62,'friendly'),M(.7,.55,'enemy'),M(.5,.3,'objective'),M(.52,.7,'danger')],faction:'aurora'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.3,.62,'friendly'),M(.7,.55,'enemy'),M(.5,.3,'objective'),M(.52,.7,'danger')],faction:'neutral'}),
    sc({k:'map',focus:[.08,.1],marks:[M(.2,.2,'friendly'),M(.35,.35,'friendly'),M(.6,.3,'objective')],faction:'meridian'}),
    sc({k:'map',focus:[.92,.9],marks:[M(.8,.8,'enemy'),M(.9,.55,'enemy'),M(.65,.7,'danger'),M(.45,.8,'friendly')],faction:'obsidian'}),
    sc({k:'map',focus:[.5,.12],marks:Array.from({length:14},(_,i)=>M(.08+.84*((i*37)%100)/100,.12+.76*((i*53)%100)/100,['friendly','enemy','objective','danger'][i%4])),faction:'aurora'}),
    sc({k:'map',focus:[2,-1],marks:[M(-.2,1.2,'friendly'),M(1.1,.5,'enemy'),M(.5,.5,'banana'),{x:'a',y:null,k:'friendly'},null,M(.5,.5)],faction:'nonsense'}),
    sc({k:'map'}),
    sc({k:'map',focus:[.5,.5],marks:[M(.25,.5,'friendly'),M(.75,.5,'enemy')],faction:'meridian'},{cam:{from:{x:.5,y:.5,z:.6,r:.25},to:{x:.5,y:.5,z:.6,r:.25},ease:'lin'}}),
    sc({k:'map',focus:[.5,.5],marks:[M(.25,.5,'friendly'),M(.75,.5,'objective')],faction:'aurora'},{cam:{from:{x:.3,y:.3,z:2.4,r:0},to:{x:.3,y:.3,z:2.4,r:0},ease:'lin'}})
  ]);
  /* every kind under a strong camera (zoom-out + roll shows the bleed margin: the bake must cover S.fill) */
  const cam={from:{x:.5,y:.5,z:.62,r:.28},to:{x:.5,y:.5,z:.62,r:.28},ease:'lin'};
  film('bgspace_bleed',[{k:'space',nebula:'blue',density:.6},{k:'space',nebula:'gold',density:.6},{k:'planet',planet:'azure',rings:true,size:1.4,nebula:'violet'},{k:'orbit',planet:'ember',limb:'left',station:true,ships:3,glow:.8},
    {k:'orbit',planet:'ice',limb:'top',station:false,ships:2,glow:.6},{k:'array',state:'firing',planet:'azure'},{k:'void',tint:'#224488',glow:.7},{k:'map',marks:[M(.3,.4,'friendly'),M(.7,.6,'enemy')],faction:'meridian'}].map(bg=>sc(bg,{cam})));
  return{characters:{},cine};
};
