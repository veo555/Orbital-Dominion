/* =========================================================================
   tests/audio/ref_soundlab.js — a REFERENCE Sound Lab that follows the DOM contract of tests/e2e/e2e_soundlab.py.

   It is NOT shipped (the real lab is src/js/85_sound_lab.js). It exists so the Sound Lab gate has a positive control: the gate must PASS on a conforming lab and FAIL on every
   deliberately damaged copy of it (small touch targets, missing rows, nameless buttons, dead handlers, frozen meters ...). e2e_soundlab.py injects it with --ref, and uses it for
   the mutation controls whenever the real lab is not there yet.  Injected after the page has loaded; talks to the game only through window.__RTS (a test hook).
   ========================================================================= */
(function(){
'use strict';
const R=window.__RTS,A=R.AUD,$=(t,c,tx)=>{const e=document.createElement(t);if(c)e.className=c;if(tx!==undefined)e.textContent=tx;return e;};
const card=document.querySelector('#setMenu .card');if(!card||document.getElementById('soundLab'))return;
const entry=$('button','btn','Sound lab');entry.id='bSoundLab';entry.type='button';card.insertBefore(entry,card.querySelector('.row.end'));
const root=$('div','overlay dim hidden');root.id='soundLab';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Sound lab');root.dataset.soundLab='';
document.body.appendChild(root);
const st=$('style');st.textContent='#soundLab .card{max-height:calc(100vh - 24px);overflow:auto;width:min(960px,calc(100vw - 16px));padding:12px}#soundLab button,#soundLab select{min-height:44px;min-width:44px;font:inherit}'+
  '#soundLab input[type=range]{height:44px;width:100%}#soundLab .grid{display:flex;flex-wrap:wrap;gap:6px}#soundLab h3{margin:12px 0 6px}#soundLab .meter{height:14px;background:#0003;border-radius:4px;overflow:hidden;margin:4px 0}'+
  '#soundLab .meter i{display:block;height:100%;width:0;background:#6ad0ff}#soundLab button:focus-visible{outline:3px solid #ffd45a;outline-offset:1px}';
document.head.appendChild(st);
const c=$('div','card');root.appendChild(c);
const title=$('h2','ttl','Sound lab');c.appendChild(title);
let faction='meridian';
const FACS=['meridian','obsidian','aurora','wild'];
// ---- controls row: faction switch, stop, close
const bar=$('div','grid');bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Faction and playback');c.appendChild(bar);
const fbtn={};
for(const f of FACS){const b=$('button','btn',f[0].toUpperCase()+f.slice(1));b.type='button';b.dataset.faction=f;b.setAttribute('aria-pressed',String(f===faction));b.onclick=()=>{faction=f;for(const k in fbtn)fbtn[k].setAttribute('aria-pressed',String(k===f));filter();};fbtn[f]=b;bar.appendChild(b);}
const stop=$('button','btn','Stop all');stop.type='button';stop.dataset.lab='stop';stop.onclick=()=>{R.musicStop(0.2);};bar.appendChild(stop);
const close=$('button','btn','Close');close.type='button';close.dataset.lab='close';bar.appendChild(close);
// ---- meters
const mp=$('div','meter');mp.dataset.meter='peak';mp.setAttribute('role','meter');mp.setAttribute('aria-label','Peak level');mp.setAttribute('aria-valuemin','0');mp.setAttribute('aria-valuemax','1');mp.appendChild($('i'));
const mr=$('div','meter');mr.dataset.meter='rms';mr.setAttribute('role','meter');mr.setAttribute('aria-label','RMS level');mr.setAttribute('aria-valuemin','0');mr.setAttribute('aria-valuemax','1');mr.appendChild($('i'));
c.appendChild(mp);c.appendChild(mr);
let iv=null;
function pump(){const m=A.meter();mp.firstChild.style.width=Math.min(100,m.peak*100).toFixed(1)+'%';mr.firstChild.style.width=Math.min(100,m.rms*300).toFixed(1)+'%';mp.setAttribute('aria-valuenow',m.peak.toFixed(3));mr.setAttribute('aria-valuenow',m.rms.toFixed(3));}
// ---- voices, grouped
const UNITS=['hauler','rifleman','raptor','rocketeer','mender','howitzer','juggernaut','skiff','titan','freighter','bulwark','reaver','specter','crawler','spitter','brute'];
const groupOf=id=>{const s=id.split('.');if(s[0]==='ui'||s[0]==='global')return'UI';if(s[0]==='skill'||/^hero_/.test(s[0]))return'Heroes';return UNITS.indexOf(s[0])>=0?'Units':'Buildings';};
const sections={};const ids=A.voices();
for(const g of['Units','Buildings','Heroes','UI']){const h=$('h3',null,g);h.dataset.groupTitle=g;const box=$('div','grid');box.dataset.group=g;box.setAttribute('role','group');box.setAttribute('aria-label',g+' voices');c.appendChild(h);c.appendChild(box);sections[g]=box;}
const rows=[];
for(const id of ids){const b=$('button','btn',id);b.type='button';b.dataset.voice=id;b.setAttribute('aria-label','Play '+id);b.onclick=()=>A.play(id,{faction:id.split('.')[2]||null});sections[groupOf(id)].appendChild(b);rows.push(b);}
function filter(){for(const b of rows){const f=b.dataset.voice.split('.')[2];b.hidden=!!(f&&FACS.indexOf(f)>=0&&f!==faction);}}
filter();
// ---- music
const mh=$('h3',null,'Music');c.appendChild(mh);const mbox=$('div','grid');mbox.setAttribute('role','group');mbox.setAttribute('aria-label','Music cues');c.appendChild(mbox);
const playing={};
for(const id of Object.keys(R.MUSIC_CUES)){const b=$('button','btn',id);b.type='button';b.dataset.cue=id;b.setAttribute('aria-label','Play or stop cue '+id);b.setAttribute('aria-pressed','false');
  b.onclick=()=>{if(playing[id]){playing[id]=false;b.setAttribute('aria-pressed','false');R.musicStop(0.3);}else{for(const k in playing)playing[k]=false;playing[id]=true;b.setAttribute('aria-pressed','true');R.musicPlay(id,{fade:0.3});}};mbox.appendChild(b);
  if(id==='intro')for(let s=0;s<5;s++){const sb=$('button','btn','Intro '+'ABCDE'[s]);sb.type='button';sb.dataset.cue='intro';sb.dataset.section=String(s);sb.setAttribute('aria-label','Play intro section '+'ABCDE'[s]);sb.onclick=()=>R.musicPlay('intro',{section:s,fade:0.3});mbox.appendChild(sb);}}
const sl=$('input');sl.type='range';sl.min='0';sl.max='100';sl.value='50';sl.dataset.lab='intensity';sl.setAttribute('aria-label','Music intensity');sl.oninput=()=>R.musicScene({intensity:sl.value/100});
const lb=$('label',null,'Intensity ');lb.appendChild(sl);c.appendChild(lb);
// ---- open / close
let opener=null;
function open(){opener=document.activeElement;for(const o of document.querySelectorAll('.overlay'))o.classList.toggle('hidden',o!==root);if(!iv)iv=setInterval(pump,50);const f=root.querySelector('button:not([hidden])');if(f)f.focus();}
function shut(){R.musicStop(0.2);root.classList.add('hidden');document.getElementById('setMenu').classList.remove('hidden');if(iv){clearInterval(iv);iv=null;}if(entry.isConnected)entry.focus();}
entry.onclick=open;close.onclick=shut;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.classList.contains('hidden')){e.stopPropagation();shut();}},true);
})();
