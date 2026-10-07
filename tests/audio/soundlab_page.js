/* =========================================================================
   tests/audio/soundlab_page.js — in-page helpers of tests/e2e/e2e_soundlab.py (window.SL). Pure measurement of the Sound Lab DOM; no assertions.
   ========================================================================= */
(function(){
'use strict';
const SL=window.SL={};
SL.root=()=>document.querySelector('#soundLab,[data-sound-lab]');
SL.vis=el=>{
  if(!el||!el.isConnected)return false;const r=el.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;
  for(let e=el;e&&e!==document.documentElement;e=e.parentElement){const cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden'||e.hidden)return false;}
  return true;
};
SL.accName=el=>{
  const lab=el.getAttribute('aria-labelledby');if(lab){const t=lab.split(/\s+/).map(i=>{const x=document.getElementById(i);return x?x.textContent.trim():'';}).join(' ').trim();if(t)return t;}
  const a=el.getAttribute('aria-label');if(a&&a.trim())return a.trim();
  if(el.labels&&el.labels.length){const t=Array.from(el.labels).map(l=>l.textContent.trim()).join(' ').trim();if(t)return t;}
  const ti=el.getAttribute('title');if(ti&&ti.trim())return ti.trim();
  const tx=(el.textContent||'').trim();if(tx)return tx;
  const alt=el.querySelector&&el.querySelector('img[alt]');return alt?alt.getAttribute('alt').trim():'';
};
SL.state=()=>{
  const r=SL.root();if(!r)return{exists:false};
  const bb=r.getBoundingClientRect();
  return{exists:true,visible:SL.vis(r),role:r.getAttribute('role'),label:SL.accName(r),w:bb.width,h:bb.height,vw:innerWidth,vh:innerHeight,overflowX:r.scrollWidth-r.clientWidth,docOverflowX:document.documentElement.scrollWidth-innerWidth};
};
SL.voiceIds=()=>Array.from((SL.root()||document).querySelectorAll('[data-voice]')).map(e=>e.dataset.voice);
SL.visibleVoiceIds=()=>Array.from((SL.root()||document).querySelectorAll('[data-voice]')).filter(SL.vis).map(e=>e.dataset.voice);
SL.groupOf=()=>{const o={};for(const e of(SL.root()||document).querySelectorAll('[data-voice]')){const g=e.closest('[data-group]');o[e.dataset.voice]=g?String(g.dataset.group).toLowerCase():null;}return o;};
SL.attr=(sel,attr)=>Array.from((SL.root()||document).querySelectorAll(sel)).map(e=>e.getAttribute(attr));
SL.has=sel=>!!(SL.root()||document).querySelector(sel);
SL.count=sel=>(SL.root()||document).querySelectorAll(sel).length;
const INTER='button,input,select,textarea,a[href],[role=button],[role=slider],[role=switch],[tabindex]:not([tabindex="-1"]),summary';
SL.interactive=()=>Array.from((SL.root()||document).querySelectorAll(INTER)).filter(SL.vis);
SL.small=(min)=>SL.interactive().map(e=>{const r=e.getBoundingClientRect();return{name:SL.accName(e).slice(0,30),tag:e.tagName.toLowerCase(),w:Math.round(r.width),h:Math.round(r.height)};}).filter(x=>x.w<min||x.h<min);
SL.nameless=()=>SL.interactive().filter(e=>!SL.accName(e)).map(e=>e.outerHTML.slice(0,80));
SL.meters=()=>Array.from((SL.root()||document).querySelectorAll('[data-meter]')).map(e=>e.textContent+'|'+(e.getAttribute('style')||'')+'|'+e.getAttribute('aria-valuenow')+'|'+e.value+'|'+Array.from(e.children).map(c=>c.getAttribute('style')||'').join(','));
SL.focus=()=>{const a=document.activeElement,r=SL.root();return{inside:!!(r&&a&&r.contains(a)),tag:a&&a.tagName,voice:a&&a.dataset&&a.dataset.voice||null,id:a&&a.id||null,outline:a?getComputedStyle(a).outlineStyle+' '+getComputedStyle(a).outlineWidth+' '+getComputedStyle(a).boxShadow:null};};
SL.scrollTo=id=>{const e=(SL.root()||document).querySelector('[data-voice="'+id+'"]');if(e)e.scrollIntoView({block:'center'});return!!e;};
SL.wl=(...fs)=>window.__WL.filter(e=>!fs.length||fs.indexOf(e.f)>=0).map(e=>({f:e.f,a:JSON.parse(JSON.stringify(e.a,(k,v)=>typeof v==='function'?'[fn]':v))}));
SL.clearWl=()=>{window.__WL.length=0;__RTS.AUD.reset(true);};
SL.played=()=>__RTS.AUD.counters.played;
})();
