/* =========================================================================
   CINEMATIC PLAYER (stub). Contract: docs/CINEMATIC_SPEC.md §3. The stub completes instantly so callers can be written and tested now.
   ========================================================================= */
function cineInit(){}
function cineActive(){return false;}
function cineStop(){}
function cineDuration(id){const c=STORY.cine[id];return c?c.scenes.reduce((a,s)=>a+s.dur,0):0;}
function cinePlay(id,opts){opts=opts||{};if(opts.onEnd)setTimeout(opts.onEnd,0);return{stop(){},skip(){},pause(){},resume(){},t(){return 0;},done:Promise.resolve()};}
function cineFrame(id,t,canvas,opts){}
function cineExport(id,opts){return Promise.resolve(null);}
function cineGallery(){return Object.keys(STORY.cine).map(id=>({id,title:STORY.cine[id].title,kind:STORY.cine[id].kind,len:cineDuration(id),seen:false}));}
