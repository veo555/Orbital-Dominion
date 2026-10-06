/* =========================================================================
   VOICE (stub) — character speech: TTS profiles + synthesized blips. Contract: docs/AUDIO_SPEC.md §5.
   ========================================================================= */
function speak(charId,text,opts){return{dur:Math.max(1.2,String(text||'').length/16)};}
function speakStop(){}
