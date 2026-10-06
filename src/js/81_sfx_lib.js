/* =========================================================================
   SFX LIBRARY (stub) — voice specs, cinematic sfx, offline render hooks. Contract: docs/AUDIO_SPEC.md.
   ========================================================================= */
function sfxUnit(type,ev,x,y,faction){}
function sfxBuilding(type,ev,x,y,faction){}
function cineSfx(name){}
function audioVoices(){return[];}
function audioRender(spec,seconds,sampleRate){return Promise.resolve(null);}
