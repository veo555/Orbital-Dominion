/* =========================================================================
   AUDIO — positional synthesized SFX, adaptive generative score, announcer voice
   ========================================================================= */
let AC=null,busSfx=null,busMusic=null,musicFx=null,muted=false;
function audioInit(){
  if(!AC){
    try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){AC=null;return;}
    busSfx=AC.createGain();busMusic=AC.createGain();const comp=AC.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
    busSfx.connect(comp);busMusic.connect(comp);comp.connect(AC.destination);
    // soft echo for the score
    musicFx=AC.createGain();const dl=AC.createDelay(1.5),fb=AC.createGain(),lp=AC.createBiquadFilter();dl.delayTime.value=0.42;fb.gain.value=0.38;lp.type='lowpass';lp.frequency.value=1800;
    musicFx.connect(dl);dl.connect(lp);lp.connect(fb);fb.connect(dl);lp.connect(busMusic);
    applyVolumes();startMusic();
  }
  if(AC&&AC.state==='suspended')AC.resume();
}
function applyVolumes(){if(!AC)return;busSfx.gain.value=muted?0:SET.sfx;busMusic.gain.value=muted?0:SET.music*0.55;}
function tone(f,d,type,v,slide,delay,pan){
  if(!AC||muted)return;const t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();let out=g;
  o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(25,f+slide),t+d);
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);
  if(pan&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=pan;g.connect(p);out=p;}
  out.connect(busSfx);o.start(t);o.stop(t+d+0.03);
}
let noiseBuf=null;
function noiseBurst(d,v,f0,pan,type){
  if(!AC||muted)return;
  if(!noiseBuf){const n=AC.sampleRate*1.5;noiseBuf=AC.createBuffer(1,n,AC.sampleRate);const ch=noiseBuf.getChannelData(0);for(let i=0;i<n;i++)ch[i]=Math.random()*2-1;}
  const s=AC.createBufferSource();s.buffer=noiseBuf;const fl=AC.createBiquadFilter();fl.type=type||'lowpass';fl.frequency.value=f0;
  const g=AC.createGain();g.gain.setValueAtTime(v,AC.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+d);
  s.connect(fl);fl.connect(g);let out=g;if(pan&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=pan;g.connect(p);out=p;}out.connect(busSfx);s.start(AC.currentTime,Math.random()*0.5,d+0.05);
}
const sfxLast={},SFXGAP={shoot:45,rocket:90,shell:150,bolt:50,acid:80,melee:70,boom:60,boomBig:120,click:30,ack:60,coin:60,err:200};
function sfx(name,x,y){
  if(!AC||muted||!G||ui.demo&&x===undefined)return;
  let pan=0,vol=1;
  if(x!==undefined){
    const cx=cam.x+VW/cam.z/2,cy=cam.y+VH/cam.z/2,hw=VW/cam.z/2+160,hh=VH/cam.z/2+160;
    if(Math.abs(x-cx)>hw||Math.abs(y-cy)>hh)return;
    pan=clamp((x-cx)/(VW/cam.z/2),-1,1)*0.8;vol=clamp(1.15-hyp(x-cx,y-cy)/(hw*1.3),0.25,1);
  }
  const now=performance.now();if(sfxLast[name]&&now-sfxLast[name]<(SFXGAP[name]||80))return;sfxLast[name]=now;
  const v=vol;
  switch(name){
    case'shoot':tone(560+Math.random()*90,0.06,'square',0.022*v,-320,0,pan);break;
    case'bolt':tone(780,0.07,'sawtooth',0.025*v,-450,0,pan);tone(1200,0.04,'sine',0.012*v,-600,0,pan);break;
    case'rocket':noiseBurst(0.22,0.07*v,1800,pan);tone(210,0.18,'sawtooth',0.03*v,-120,0,pan);break;
    case'shell':tone(95,0.32,'sawtooth',0.08*v,-50,0,pan);noiseBurst(0.28,0.09*v,700,pan);break;
    case'acid':tone(320,0.14,'sine',0.04*v,260,0,pan);noiseBurst(0.1,0.03*v,3200,pan,'highpass');break;
    case'melee':noiseBurst(0.07,0.07*v,2600,pan);tone(160,0.07,'square',0.025*v,-60,0,pan);break;
    case'boom':noiseBurst(0.42,0.17*v,1000,pan);tone(80,0.25,'sine',0.1*v,-35,0,pan);break;
    case'boomBig':noiseBurst(1.0,0.32*v,650,pan);tone(58,0.7,'sine',0.28*v,-30,0,pan);break;
    case'done':tone(520,0.12,'triangle',0.06);tone(780,0.2,'triangle',0.06,0,0.1);break;
    case'click':tone(900,0.035,'square',0.022);break;
    case'ack':tone(440+Math.random()*60,0.05,'triangle',0.035);tone(660,0.05,'triangle',0.03,0,0.05);break;
    case'err':tone(170,0.2,'square',0.05,-40);break;
    case'alert':tone(480,0.12,'square',0.05);tone(340,0.22,'square',0.05,0,0.14);break;
    case'place':tone(300,0.12,'triangle',0.06,240);noiseBurst(0.08,0.04,900);break;
    case'train':tone(620,0.09,'triangle',0.05,200);break;
    case'coin':tone(1320,0.08,'triangle',0.05,0,0,pan);tone(1760,0.18,'triangle',0.045,0,0.07,pan);break;
    case'level':for(let i=0;i<4;i++)tone(523*Math.pow(1.26,i),0.25,'triangle',0.06,0,i*0.08);break;
    case'era':for(let i=0;i<5;i++)tone(330*Math.pow(1.2599,i),0.5,'triangle',0.07,0,i*0.11);tone(660,1.0,'sine',0.05,0,0.5);break;
    case'win':tone(392,.2,'triangle',.08);tone(523,.2,'triangle',.08,0,.2);tone(784,.7,'triangle',.08,0,.4);tone(1047,.9,'triangle',.06,0,.6);break;
    case'lose':tone(300,.5,'sawtooth',.07,-150);tone(200,.9,'sawtooth',.07,-120,.4);break;
  }
}
/* ------------------------------ announcer ------------------------------ */
let voice=null,sayLast=0;const sayMap={};
function pickVoice(){try{const vs=speechSynthesis.getVoices();voice=vs.find(v=>/en[-_]US/i.test(v.lang)&&/Google|Samantha|Daniel|Alex/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null;}catch(e){}}
function say(txt){
  if(!SET.voice||muted||!AC||ui.demo||typeof speechSynthesis==='undefined')return;
  const now=performance.now();if(now-sayLast<2200||(sayMap[txt]&&now-sayMap[txt]<9000))return;sayLast=now;sayMap[txt]=now;
  try{if(!voice)pickVoice();const u=new SpeechSynthesisUtterance(txt);if(voice)u.voice=voice;u.rate=1.05;u.pitch=0.75;u.volume=clamp(SET.sfx*0.9,0,1);speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){}
}
/* --------------------------- generative score -------------------------- */
const CHORDS=[[-12,[0,3,7]],[-16,[0,4,7]],[-9,[0,4,7]],[-14,[0,4,7]]];
const SCALE=[0,2,3,5,7,8,10];
let musicTimer=null,mBeat=0,mNext=0,intensity=0;
function nf(semi){return 110*Math.pow(2,semi/12);}
function mnote(f,t,d,type,v,lpf){
  const o=AC.createOscillator(),g=AC.createGain(),fl=AC.createBiquadFilter();o.type=type;o.frequency.value=f;fl.type='lowpass';fl.frequency.value=lpf||1400;
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+Math.min(d*0.35,1.6));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.connect(fl);fl.connect(g);g.connect(busMusic);if(v<0.03)g.connect(musicFx);o.start(t);o.stop(t+d+0.05);
}
function mdrum(kind,t,v){
  if(kind==='kick'){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(40,t+0.18);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);o.connect(g);g.connect(busMusic);o.start(t);o.stop(t+0.25);}
  else{if(!noiseBuf)return;const s=AC.createBufferSource();s.buffer=noiseBuf;const fl=AC.createBiquadFilter(),g=AC.createGain();fl.type='highpass';fl.frequency.value=kind==='hat'?7000:1800;
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(0.0001,t+(kind==='hat'?0.05:0.14));s.connect(fl);fl.connect(g);g.connect(busMusic);s.start(t,Math.random(),0.2);}
}
function musicTick(){
  if(!AC||muted)return;
  const nowT=AC.currentTime;if(mNext<nowT)mNext=nowT+0.1;
  const target=G&&!ui.demo?(G.time-G.fightT<9?1:0):0.25;intensity+=(target-intensity)*0.08;
  const night=G?1-G.daylight:0,beat=60/(70+intensity*14);
  while(mNext<nowT+0.7){
    const t=mNext,bar=Math.floor(mBeat/4),step=mBeat%4,ch=CHORDS[bar%4],root=ch[0]+(night>0.5?-2:0);
    if(step===0&&(bar%2===0||true)){ // pad on every bar
      for(const iv of ch[1]){mnote(nf(root+iv+12),t,beat*4.4,'triangle',0.032,700+night*-200+intensity*500);mnote(nf(root+iv+12)*1.004,t,beat*4.4,'sine',0.026,900);}
      mnote(nf(root),t,beat*3.8,'sine',0.07,300);}
    if(step===2||(intensity>0.4&&step%2===0))mnote(nf(root),t,beat*0.9,'sine',0.05+intensity*0.03,260);
    const pArp=0.35+0.4*intensity-0.2*night;
    if(Math.random()<pArp&&(step%2===1||intensity>0.5)){const n=SCALE[(Math.floor(Math.random()*7))]+(Math.random()<.5?12:24)-12+(night>0.5?-5:0);mnote(nf(n+ch[0]+12),t,beat*1.4,'triangle',0.02,2200);}
    if(intensity>0.35){if(step===0||step===2)mdrum('kick',t,0.11*intensity);if(step%2===1)mdrum('hat',t,0.03*intensity);if(step===3&&intensity>0.7)mdrum('snare',t,0.05);}
    mNext+=beat;mBeat++;
  }
}
function startMusic(){if(musicTimer||!AC)return;mNext=AC.currentTime+0.2;musicTimer=setInterval(musicTick,140);}
function toggleMute(){muted=!muted;applyVolumes();if(muted&&typeof speechSynthesis!=='undefined')try{speechSynthesis.cancel();}catch(e){}return muted;}
