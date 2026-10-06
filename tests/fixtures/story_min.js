/* A minimal but fully VALID story (passes tools/validate_story.js with 0 errors). Generated, not authored: it exists so the engines
   (cinematics, campaign runtime, audio cues) can be tested before/independently of the real story, and so the validator can be
   mutation-tested. Usage: const S=require('./story_min.js')();  — returns a fresh deep object each call. */
module.exports=function makeMinStory(){
  const chars={},mk=(id,o)=>{chars[id]=Object.assign({id,name:o.name||id[0].toUpperCase()+id.slice(1)+' Test',short:o.short||id[0].toUpperCase()+id.slice(1),title:o.title||'Test character',
    side:'good',faction:'meridian',role:'ally',hero:null,bio:'A fixture character used to exercise the engines.',want:'To test.',flaw:'Is a fixture.',arc:'Passes the tests.',
    voice:{pitch:1,rate:1,timbre:'smooth',formant:.5,ttsPitch:1,ttsRate:1},
    look:{skin:'#c58c6a',hair:{style:'short',color:'#222222'},eyes:'#66ccff',armor:{style:'plate',col:'#3d8bff',trim:'#a6ceff'},mark:['none'],build:'lean',age:'adult',emblem:'faction'},
    motif:'hope',quote:'Fixture line.'},o);};
  const skins=['#c58c6a','#8d5524','#e0ac69','#f1c27d','#a0674b','#6b4630','#d9a679','#b88a6a','#e8c4a0','#7a5a44','#caa07a','#9b6b4d','#5c3a2a','#efc9a8'];
  const mkLook=i=>({skin:skins[i%skins.length],hair:{style:['short','long','shaved','crest','braid','hood','bald','bun','mane'][i%9],color:'#'+((i*2654435)%0xffffff).toString(16).padStart(6,'0')},eyes:'#'+((i*7919331)%0xffffff).toString(16).padStart(6,'0'),
    armor:{style:['plate','coat','robe','suit','rags','crown','hood'][i%7],col:'#'+((i*3571113)%0xffffff).toString(16).padStart(6,'0'),trim:'#'+((i*9973)%0xffffff).toString(16).padStart(6,'0')},mark:[['scar-l','tattoo','glow-eye','mask','visor','halo','cracks','none'][i%8]],build:['lean','broad','slight','massive'][i%4],age:['young','adult','old'][i%3],emblem:['faction','none','crown','sun'][i%4]});
  mk('idris',{name:'Idris Vale',short:'Idris',title:'Marshal',role:'hero',hero:'hero_idris',motif:'idris'});
  mk('kaz',{name:'Kaz Dren',short:'Kaz',title:'Warlord',role:'hero',hero:'hero_kaz',faction:'obsidian',motif:'kaz'});
  mk('lyra',{name:'Lyra Sen',short:'Lyra',title:'Seer',role:'hero',hero:'hero_lyra',faction:'aurora',motif:'lyra'});
  mk('pip',{name:'Pip Oro',short:'Pip',title:'Hauler pilot, a colony worker',role:'civilian',motif:'worker'});
  mk('vael',{name:'Vael Morrow',short:'Vael',title:'The Hollow King',role:'villain',side:'evil',faction:'obsidian',motif:'villain'});
  mk('sable',{name:'Sable Crane',short:'Sable',title:'Lieutenant',role:'lieutenant',side:'evil',faction:'obsidian',motif:'villain'});
  mk('grim',{name:'Grim Hask',short:'Grim',title:'Enforcer',role:'rival',side:'evil',faction:'obsidian',motif:'villain'});
  mk('ada',{name:'Ada Quill',short:'Ada',title:'Engineer',role:'mentor',motif:'colony'});
  mk('tov',{name:'Tov Marr',short:'Tov',title:'Quartermaster',role:'ally',motif:'colony'});
  mk('nell',{name:'Nell Ito',short:'Nell',title:'Medic',role:'ally',faction:'aurora',motif:'hope'});
  mk('oren',{name:'Oren Pike',short:'Oren',title:'Envoy',role:'ally',faction:'neutral',side:'gray',motif:'colony'});
  mk('mira',{name:'Mira Sol',short:'Mira',title:'Scout',role:'ally',faction:'aurora',motif:'lyra'});
  mk('narrator',{name:'Narrator',short:'Narrator',title:'Voice of the chronicle',role:'narrator',faction:'none',side:'gray',motif:'hope'});
  Object.keys(chars).forEach((id,i)=>{if(id!=='narrator')chars[id].look=mkLook(i+1);});
  const speakers=Object.keys(chars).filter(x=>x!=='narrator');
  const cine={};
  const bgs=[{k:'space',nebula:'blue'},{k:'planet',planet:'azure',rings:true},{k:'orbit',planet:'ember',limb:'bottom',station:true},{k:'surface',biome:'dust',time:'dusk',features:['hub','crystals']},{k:'base',faction:'meridian',time:'day',state:'calm'},
    {k:'bridge',faction:'meridian',alert:false,view:'space'},{k:'hall',style:'obsidian',light:'cold'},{k:'battlefield',biome:'ash',time:'dusk',intensity:.6,sides:['meridian','obsidian']},{k:'ruins',biome:'dust',time:'night'},{k:'array',state:'charging',planet:'violet'},{k:'void',tint:'#112244',glow:.5},{k:'map',focus:[.5,.5],marks:[{x:.3,y:.4,k:'friendly'},{x:.7,y:.6,k:'enemy'}],faction:'meridian'}];
  const film=(id,kind,total,music,whoList)=>{
    const n=Math.max(1,Math.round(total/6)),dur=total/n,scenes=[];
    for(let i=0;i<n;i++){const who=whoList[i%whoList.length],text=['The colony holds the line tonight.','Nothing here is as it seems.','We rebuild, and we remember.','The array wakes at dawn.'][i%4];
      scenes.push({id:'s'+(i+1),dur,bg:Object.assign({},bgs[(i+kind.length)%bgs.length]),cam:{from:{x:.5,y:.5,z:1,r:0},to:{x:.5,y:.5,z:1.15,r:0},ease:'inout'},
        actors:[{id:'a'+i,char:who,at:[.3,.62],h:.8,face:'r',expr:'talk',mode:'bust',t0:.2,t1:dur}],props:i%2?[{k:'ship',cls:'dropship',faction:'meridian',from:[-.1,.3],to:[.5,.4],scale:1,t0:0,t1:dur-1}]:[],
        fx:[{k:'stars',t0:0,t1:dur,a:.8}],lines:[{who,text,t:.5,dur:Math.max(2.5,text.length/19+.4),style:'normal',expr:'talk'}],sfx:[{t:.2,name:'whoosh'}],
        title:i===0&&(kind==='intro'||kind==='credits')?{text:'ORBITAL DOMINION',sub:'Fixture',t0:.3,t1:Math.min(dur,3)}:undefined,trans:{in:'fade',out:'cut',len:.5}});}
    cine[id]={id,kind,title:id,music,letterbox:true,seed:7,scenes};};
  film('intro','intro',70,'intro',['idris','vael','pip','lyra','kaz','sable']);
  const inter=['i1','i2','i3','i4','i5','i6','i7','i8'];inter.forEach((id,i)=>film(id,'interlude',24,['hope','mystery','tension','dread','march','tragedy','betrayal','dawn'][i],[speakers[i%speakers.length],speakers[(i+3)%speakers.length]]));
  film('ending','ending',90,'finale',['idris','kaz','lyra','vael','pip']);film('credits','credits',30,'credits',['narrator']);film('defeat','defeat',12,'tragedy',['idris']);
  const ms=[];const facs=['meridian','meridian','meridian','aurora','aurora','aurora','obsidian','obsidian','obsidian'],enm=['obsidian','obsidian','aurora','obsidian','obsidian','meridian','meridian','aurora','meridian'];
  for(let i=0;i<9;i++){const id='m0'+(i+1);film(id+'_brief','briefing',12,'tension',['idris','tov']);film(id+'_win','debrief',10,'hope',['idris']);
    const radioIds=[1,2,3,4].map(k=>'r'+(i+1)+k);
    const radio=chars;// placeholder to keep linter calm
    ms.push({id,act:Math.floor(i/3)+1,n:i+1,title:'Mission '+(i+1),subtitle:'Fixture',place:'p1',synopsis:'A fixture mission.',briefing:id+'_brief',debrief:id+'_win',defeat:null,after:i<8?inter[i]:'ending',
      setup:{faction:facs[i],enemy:enm[i],diff:'normal',seed:1100+i,start:{c:400,e:0,era:1,hero:'available',units:[{type:'rifleman',n:4}],buildings:[]},restrict:{buildings:['foundry'],units:['titan'],maxEra:2},foe:{ai:true,mods:{waveMult:1}},swarm:'off',daylight:'cycle'},
      objectives:[{id:'o1',kind:'primary',text:'Destroy all enemy structures',when:null,done:['structs','enemy','==',0],fail:null},{id:'o2',kind:'bonus',text:'Train 6 riflemen',when:null,done:['trained','rifleman','>=',6],fail:null}],
      triggers:[{id:'t1',once:true,when:['time','>=',5],do:[['radio',radioIds[0]],['flag','started',true]]},{id:'t2',once:true,when:['all',['flag','started'],['time','>=',60]],do:[['radio',radioIds[1]],['spawn','enemy','raptor',3,'edge:N',{order:'attack'}]]},
        {id:'t3',once:true,when:['count','unit','me','army','>=',8],do:[['radio',radioIds[2]],['obj','o2','show']]},{id:'t4',once:true,when:['era','me','>=',2],do:[['radio',radioIds[3]],['mood','battle'],['unlock','building','foundry']]}],
      win:['structs','enemy','==',0],lose:['hubs','me','==',0],stars:{par:900},unlocks:{next:i<8?'m0'+(i+2):null},hints:['Build Generators early.']});}
  const radio={};ms.forEach((m,i)=>[1,2,3,4].forEach(k=>{radio['r'+(i+1)+k]={who:speakers[(i+k)%speakers.length],text:'Fixture radio line '+k+' for mission '+(i+1)+'.',style:'radio',dur:3.5};}));
  const acts=[0,1,2].map(a=>({id:'act'+(a+1),title:'Act '+(a+1),summary:'Fixture act.',missions:ms.slice(a*3,a*3+3).map(m=>m.id)}));
  return{meta:{title:'Fixture',tagline:'t',version:1,rating:'PG-13',logline:'l'},world:{places:[{id:'p1',name:'Fixture Ridge',desc:'d'}],factions:{},glossary:[]},characters:chars,acts,missions:ms,cine,radio,barks:{}};
};
