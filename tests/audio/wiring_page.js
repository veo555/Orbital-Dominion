/* =========================================================================
   tests/audio/wiring_page.js — the in-page half of tests/e2e/e2e_audio_wiring.py.
   Runs inside an INSTRUMENTED copy of the build (the Python half patches the copy, never the source):
     window.__WL   every call of musicPlay / musicStop / musicScene / musicStinger / musicDuck / musicMood / speak / speakStop:  {f, a:[args], t}
     window.__EV   (s)=>eval(s): reads any name inside the game's closure (kill, castSkill, setOrder, campDo, ...)
     __RTS.AUD.log every call of sfx / sfxUnit / sfxBuilding / cineSfx (engine ring buffer): {name, voice, who, faction, x, y, r}
   Each scenario drives the REAL game code (the match loop, the command functions, the campaign runtime, the dispatch card), then reports what reached the audio functions.
   Scenarios never assert; they return plain observations and the Python half judges them (so the same observations can be judged on a deliberately mis-wired build).
   ========================================================================= */
(function(){
'use strict';
const R=window.__RTS,A=R.AUD,EV=window.__EV;
const OW=window.OW={};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tick=n=>{for(let i=0;i<n;i++)R.step();};
const safe=v=>{try{return JSON.parse(JSON.stringify(v,(k,x)=>typeof x==='function'?'[fn]':x));}catch(e){return String(v);}};
const clear=()=>{A.reset(true);window.__WL.length=0;};
const sfxLog=()=>A.log.map(l=>({name:l.name,voice:l.voice,who:l.who,faction:l.faction,r:l.r}));
const wl=(...fs)=>window.__WL.filter(e=>!fs.length||fs.indexOf(e.f)>=0).map(e=>({f:e.f,a:safe(e.a),t:Math.round(e.t)}));
const G=()=>R.G,T=()=>R.TILE;
const FIRE=['shoot','bolt','rocket','shell','acid','melee','fire'];
OW.have=n=>{try{return EV('typeof '+n)==='function';}catch(e){return false;}};

/* free ground away from everything that could shoot (bases, towers, creeps, the AI's units) so that only the scenario's own units make sounds */
let arenaPts=null,arenaIdx=0;
function arena(){
  if(!arenaPts){
    const g=G(),solids=[].concat(g.buildings.map(b=>[b.x,b.y]),(g.neutrals||[]).map(n=>[n.x,n.y]),g.units.filter(u=>u.team!==0).map(u=>[u.x,u.y])),pts=[];
    for(let y=300;y<R.WH-300;y+=140)for(let x=300;x<R.WW-300;x+=140){
      const tx=Math.floor(x/T()),ty=Math.floor(y/T());if(g.blocked[ty*R.MW+tx]||g.blocked[ty*R.MW+tx+1]||g.blocked[(ty+1)*R.MW+tx]||g.blocked[(ty+1)*R.MW+tx+1])continue;
      let far=true;for(const s of solids)if(Math.hypot(s[0]-x,s[1]-y)<420){far=false;break;}
      if(far&&pts.every(p=>Math.hypot(p[0]-x,p[1]-y)>350))pts.push([x,y]);
    }
    arenaPts=pts;arenaIdx=0;
  }
  return arenaPts.length?arenaPts[arenaIdx++%arenaPts.length]:null;
}
const reset=()=>{arenaPts=null;arenaIdx=0;};
const entryOf=pred=>{const l=sfxLog().filter(pred);return l.length?l[0]:null;};
function cleanup(...es){for(const e of es){try{if(e&&!e.dead)EV('kill')(e,undefined);}catch(x){}}tick(2);}

/* ------------------------------------------------------------------ simulation events -> sfx(name,x,y,who) */
OW.fire=async function(type,team){
  const p=arena();if(!p)return{type,team,error:'no free arena'};
  const d=R.UDEF[type],dist=Math.max(18,Math.min(120,d.range*0.5)),tx=Math.floor((p[0]+dist)/T()),ty=Math.floor(p[1]/T()),tteam=team===0?1:0;
  const a=R.addUnit(type,team,p[0],p[1]),b=R.addBuilding('depot',tteam,tx,ty,true);
  b.hp=b.maxhp=99999;EV('setOrder')(a,{t:'attack',target:b});clear();
  let e=null;for(let i=0;i<20&&!e;i++){tick(8);e=entryOf(l=>FIRE.indexOf(l.name)>=0);}
  const fac=team===2?'wild':G().teams[team].faction;cleanup(a,b);
  return{type,team,faction:fac,entry:e};
};
OW.die=async function(kind,type,team){
  const p=arena();if(!p)return{kind,type,error:'no free arena'};
  const e=kind==='building'?R.addBuilding(type,team,Math.floor(p[0]/T()),Math.floor(p[1]/T()),true):R.addUnit(type,team,p[0],p[1]);
  clear();EV('kill')(e,team===0?1:0);tick(1);
  const en=entryOf(l=>l.name==='boom'||l.name==='boomBig'||l.name==='die');
  return{kind,type,team,faction:team===2?'wild':G().teams[team].faction,entry:en};
};
OW.ready=async function(){
  const g=G(),hub=g.buildings.find(b=>b.team===0&&b.type==='hub'&&b.done);if(!hub)return{error:'no hub'};
  g.teams[0].c=g.teams[0].e=9999;hub.queue.length=0;
  const ok=R.queueUnit(hub,'hauler');if(!ok)return{error:'queueUnit refused'};
  const q=hub.queue[hub.queue.length-1];q.t=q.total;clear();tick(4);
  return{type:'hauler',faction:g.teams[0].faction,entry:entryOf(l=>l.name==='done'),all:sfxLog().map(l=>l.name)};
};
OW.buildingDone=async function(){
  const p=arena();if(!p)return{error:'no free arena'};
  const b=R.addBuilding('depot',0,Math.floor(p[0]/T()),Math.floor(p[1]/T()),false);b.prog=1;clear();tick(3);
  return{type:'depot',faction:G().teams[0].faction,entry:entryOf(l=>l.name==='done'),all:sfxLog().map(l=>l.name)};
};
OW.place=async function(){
  const g=G(),hub=g.buildings.find(b=>b.team===0&&b.type==='hub'&&b.done),w=g.units.find(u=>u.team===0&&u.def.worker&&!u.dead);if(!hub||!w)return{error:'no hub/worker'};
  g.teams[0].c=g.teams[0].e=9999;let spot=null;
  for(let r=4;r<12&&!spot;r++)for(let dx=-r;dx<=r&&!spot;dx++)for(const dy of[-r,r]){const tx=Math.floor(hub.x/T())+dx,ty=Math.floor(hub.y/T())+dy;if(R.canPlace(0,'depot',tx,ty,true)){spot=[tx,ty];break;}}
  if(!spot)return{error:'no valid build site near the hub'};
  w.x=(spot[0]+0.5)*T()-30;w.y=(spot[1]+0.5)*T();clear();
  if(!R.orderBuild(w,'depot',spot[0],spot[1]))return{error:'orderBuild refused'};
  let e=null;for(let i=0;i<40&&!e;i++){tick(10);e=entryOf(l=>l.name==='place');}
  return{type:'depot',faction:g.teams[0].faction,entry:e};
};
OW.selectAck=async function(){
  const p=arena();if(!p)return{error:'no free arena'};
  const u=R.addUnit('rifleman',0,p[0],p[1]);R.ui.demo=false;clear();
  // the select chirp belongs to the UI selection paths (clickSelect / boxSelect / group recall ... call selSfx(), which queues sfx('select',..,unit) one task later so the tap itself stays short),
  // not to setSel(): drive the real click-select path and wait one task
  R.clickSelect(u.x,u.y,false,performance.now(),false,u);await sleep(60);
  const sel=entryOf(l=>l.name==='select');clear();R.contextCommand(u.x+90,u.y+10,false);
  const ack=entryOf(l=>l.name==='ack');
  const w=R.addUnit('hauler',0,p[0]+40,p[1]);R.setSel([w]);clear();R.contextCommand(w.x+90,w.y+10,false);const ack2=entryOf(l=>l.name==='ack');
  R.setSel([]);cleanup(u,w);
  return{faction:G().teams[0].faction,select:sel,ack,ackWorker:ack2};
};
OW.skills=async function(){
  const out=[];
  for(const[hero,ids]of[['hero_idris',['barrage','orbital']],['hero_kaz',['shock','rampage']],['hero_lyra',['veil','sing']]]){
    for(let k=0;k<2;k++){
      const p=arena();if(!p){out.push({hero,id:ids[k],error:'no free arena'});continue;}
      const u=R.addUnit(hero,0,p[0],p[1]),H=G().teams[0].hero;H.sk=[1,1,1];u.mana=999;u.cds=[0,0,0];clear();
      let r=false;try{r=EV('castSkill')(u,k+1,u.x+60,u.y);}catch(e){out.push({hero,id:ids[k],error:String(e)});}
      out.push({hero,id:ids[k],cast:r,log:sfxLog().map(l=>({name:l.name,voice:l.voice,who:l.who}))});cleanup(u);
    }
  }
  return out;
};
/* ------------------------------------------------------------------ global / UI sounds through real code paths */
OW.globals=async function(){
  const g=G(),o={};
  // err: a command that is refused for lack of resources goes through msg()
  const hub=g.buildings.find(b=>b.team===0&&b.type==='hub'&&b.done);g.teams[0].c=0;hub.queue.length=0;clear();R.queueUnit(hub,'rifleman');o.err=sfxLog().some(l=>l.name==='err');
  g.teams[0].c=g.teams[0].e=9999;clear();R.queueUnit(hub,'hauler');o.train=sfxLog().some(l=>l.name==='train');hub.queue.length=0;
  // click: a real panel button (the Swarm panel's tab) through the real mousedown handler
  R.togglePanel('swarm');await sleep(200);
  const tab=document.querySelector('[data-act="tab:ro"]');clear();
  if(tab){tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));await sleep(100);}
  o.click={found:!!tab,names:sfxLog().map(l=>l.name)};
  if(R.ui.panel)R.togglePanel('swarm');await sleep(100);
  // alert: an enemy hits a player's building
  const b=g.buildings.find(x=>x.team===0&&x.done),en=R.addUnit('rifleman',1,b.x+60,b.y);g.lastAlertT=-99;clear();
  try{EV('damageEnt')(b,3,1,en);}catch(e){o.alertError=String(e);}
  o.alert=sfxLog().some(l=>l.name==='alert');cleanup(en);
  // level: the hero gains a level
  const h=R.addUnit(g.teams[0].faction==='obsidian'?'hero_kaz':g.teams[0].faction==='aurora'?'hero_lyra':'hero_idris',0,b.x+90,b.y+90);clear();
  try{EV('giveXP')(0,h.x,h.y,100000);}catch(e){o.levelError=String(e);}
  o.level=sfxLog().some(l=>l.name==='level');cleanup(h);g.teams[0].hero.alive=false;
  return o;
};
/* ------------------------------------------------------------------ music: what the match loop tells musicScene, and the stingers */
OW.musicScene=async function(){
  const g=G(),o={};
  const last=()=>{const l=wl('musicScene');return l.length?l[l.length-1].a[0]:null;};
  const settle=async()=>{await sleep(900);};
  g.paused=true;clear();await settle();o.calm=last();o.calls=wl('musicScene').length;
  g.teams[0].era=2;await settle();o.era2=last();
  g.teams[0].era=1;
  // fight: real combat keeps G.fightT fresh
  const p=arena();
  if(p){const a=R.addUnit('rifleman',0,p[0],p[1]),b=R.addBuilding('depot',1,Math.floor((p[0]+60)/T()),Math.floor(p[1]/T()),true);b.hp=b.maxhp=99999;EV('setOrder')(a,{t:'attack',target:b});
    for(let i=0;i<8;i++){tick(20);await sleep(120);}o.fight=last();o.fightT=g.time-g.fightT;cleanup(a,b);}
  // the director keeps the intensity at >= 0.5 for 20 game seconds after the base was attacked (G.alertT; the 'globals' scenario just did that), so calm the alert too
  g.fightT=-999;g.alertT=-999;await settle();await settle();o.afterFight=last();
  g.time=180;tick(3);await settle();o.night=last();o.daylight=g.daylight;
  g.time=0;R.ui.pings.length=0;tick(3);   // the clock was wound back: pings born at t=180 would have a negative age (and a negative arc radius in the renderer)
  R.ui.pings.length=0;
  return o;
};
OW.stingers=async function(kind){
  const o={};clear();
  if(kind==='victory'||kind==='defeat'){R.endGame(kind);await sleep(500);}
  else if(kind==='era'){const g=G(),b=g.buildings.find(x=>x.team===0&&x.type==='hub'&&x.done);b.queue.length=0;g.teams[0].c=g.teams[0].e=9999;b.queue.push({k:'era',to:g.teams[0].era+1,t:0,total:1});b.queue[0].t=1;tick(3);await sleep(400);}
  else if(kind==='alarm'){const g=G(),b=g.buildings.find(x=>x.team===0&&x.done),en=R.addUnit('rifleman',1,b.x+60,b.y);// (the director rate-limits sting_alarm to one per 25 game seconds; the Python half starts a fresh match for this scenario because the 'globals' scenario already raised one)
    g.lastAlertT=-99;try{EV('damageEnt')(b,3,1,en);}catch(e){}await sleep(500);cleanup(en);}
  else if(kind==='hero'){const g=G(),b=g.buildings.find(x=>x.team===0&&x.type==='forum'&&x.done)||g.buildings.find(x=>x.team===0&&x.done);g.teams[0].c=g.teams[0].e=9999;
    const q={k:'hero',t:0,total:1,revive:false};b.queue.push(q);g.teams[0].hero.reviving=true;q.t=1;tick(3);await sleep(400);}
  o.calls=wl('musicStinger','musicPlay').map(e=>({f:e.f,cue:e.a[0]}));
  return o;
};
OW.title=async function(){
  clear();try{R.toMenu();}catch(e){}await sleep(900);
  return{calls:wl('musicPlay','musicScene','musicStinger').map(e=>({f:e.f,cue:e.a[0]&&(e.a[0].cue||e.a[0])}))};
};
/* ------------------------------------------------------------------ campaign: a mission's mood / radio actions reach music and speech */
OW.campaign=async function(fx){
  const o={};
  Object.assign(R.STORY.characters,fx.characters||{});Object.assign(R.STORY.radio||(R.STORY.radio={}),fx.radio||{});
  const m=(fx.missions||[])[0];if(!m)return{error:'fixture has no mission'};
  const rid=Object.keys(fx.radio||{})[0],rl=(fx.radio||{})[rid];
  try{R.newGame({campaign:m,autoResume:true});R.G.paused=true;}catch(e){return{error:'newGame({campaign}) threw '+e};}
  await sleep(300);clear();
  try{EV('campDo')(['mood','tension']);}catch(e){o.moodError=String(e);}
  await sleep(500);o.mood=wl('musicMood','musicScene','musicPlay').map(e=>({f:e.f,a:e.a}));
  clear();
  try{EV('campDo')(['radio',rid]);}catch(e){o.radioError=String(e);}
  await sleep(700);o.radio=wl('speak').map(e=>({who:e.a[0],text:e.a[1],opts:e.a[2]}));o.radioExpect={who:rl&&rl.who,text:rl&&rl.text,style:rl&&rl.style};
  // a strike's warning goes through sfx
  clear();try{EV('campDo')(['strike',20,20,3,10,2,'alert']);}catch(e){o.strikeError=String(e);}o.strike=sfxLog().map(l=>l.name);
  return o;
};
/* ------------------------------------------------------------------ dispatch card (v4.0: replaces the cinematic player) */
OW.dispatch=async function(fx,id){
  const d=(fx.dispatch||{})[id];if(!d)return{error:'no dispatch '+id};
  Object.assign(R.STORY.characters,fx.characters||{});Object.assign(R.STORY.dispatch,fx.dispatch||{});
  clear();const t0=performance.now();
  R.campDispatch(id);
  await sleep(700);const mid=wl().map(e=>({f:e.f,a:e.a,dt:e.t-Math.round(t0)}));
  R.dpFinish('skip');await sleep(300);
  const all=wl().map(e=>({f:e.f,a:e.a,dt:e.t-Math.round(t0)}));
  return{id,mood:d.mood,mid,all};
};
OW.reset=reset;
})();
