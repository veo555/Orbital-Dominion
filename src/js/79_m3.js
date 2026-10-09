/* =========================================================================
   79_M3 — Material 3 helpers (UI only): window size classes and the touch ripple.
   html.wc-compact (< 600 px wide), wc-medium (600-839), wc-expanded (>= 840): the Material 3 window size classes, orthogonal to the game's own
   `compact` / `portrait` / `touch` classes (those describe the HUD, these describe the available width).
   The ripple is a pure CSS animation (style.css section 12) started from the pointer-down position; it never changes what a click does.
   ========================================================================= */
function m3WindowClass(){
  const w=window.innerWidth,c=w<600?'compact':w<840?'medium':'expanded',r=document.documentElement;
  for(const k of['compact','medium','expanded'])r.classList.toggle('wc-'+k,k===c);
  return c;
}
function m3Init(){
  m3WindowClass();window.addEventListener('resize',m3WindowClass);
  document.addEventListener('pointerdown',e=>{
    if(typeof SET!=='undefined'&&SET.rm)return;
    const b=e.target&&e.target.closest?e.target.closest('.btn,.tier'):null;if(!b||b.disabled)return;
    const r=b.getBoundingClientRect();b.style.setProperty('--rx',(e.clientX-r.left)+'px');b.style.setProperty('--ry',(e.clientY-r.top)+'px');
    b.classList.remove('rip');void b.offsetWidth;b.classList.add('rip');
  },{passive:true,capture:true});
  document.addEventListener('animationend',e=>{if(e.animationName==='mdRipple')e.target.classList.remove('rip');},true);
}
