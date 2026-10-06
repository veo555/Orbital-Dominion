/* =========================================================================
   CAMPAIGN RUNTIME — headless-safe (no DOM, no audio, no wall clock, no Math.random). Contract: docs/CAMPAIGN_SPEC.md.
   Hooks already called from the sim: campaignInit (end of newGame), campaignStep (once per tick), campaignEnd (endGame),
   campLocked (reqBuild/reqUnit/queueEra), campNoDefaultEnd (building-death victory/defeat rule).
   ========================================================================= */
function campaignInit(m,opts){G.camp={m,flags:{},flagT:{},obj:{},fired:{},t:0,events:[],result:null};}
function campaignStep(dt){}
function campaignEnd(res){}
function campLocked(team,kind,id){return null;}
function campNoDefaultEnd(team){return false;}
