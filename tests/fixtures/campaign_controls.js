/* CONTROL missions for the mission simulator / balance gate (tools/mission_sim.js, tests/sim/campaign_balance.js, tools/mission_check.js).
   Each one is a tiny hand-built mission that is CORRECT or deliberately WRONG in exactly one way, so the gate can be proven to flag what it claims to flag
   (CLAUDE.md rule 15) and to stay quiet on a healthy mission. Seed 1101 (player hub tile (11,72), enemy hub (73,12)); the enemy AI is off, every mission ends by its own
   clock (<= 240 s of game time), so the whole set simulates in seconds.  Usage:
     const S = require('./campaign_controls.js')();     // {missions, dispatch, radio, expect}   — fresh deep objects each call; `expect` = what the gate must say about each id
     node tools/mission_sim.js all --story tests/fixtures/campaign_controls.js        node tests/sim/campaign_balance.js --story tests/fixtures/campaign_controls.js
   `expect[id]` = {fail:[rule ids that MUST be reported as FAIL], warn:[rule ids that MUST be WARN], clean:true when no FAIL/WARN may appear}. */
module.exports = function makeControls() {
  const ops = require('./campaign_ops.js')();
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const M = (id, over) => {
    const m = ops.base(id, Object.assign({
      setup: { foe: { ai: false }, start: { c: 600 } },
      stars: { par: 300 },
      objectives: [
        { id: 'p1', kind: 'primary', text: 'Hold out until relief arrives', when: null, done: ['time', '>=', 200], fail: null },
        { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }],
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1'], ['mood', 'tension']] }],
      win: ['obj', 'p1', 'done'], noDefaultWin: true, lose: null
    }, over || {}));
    m.title = 'Control ' + id;
    return m;
  };
  const missions = [
    /* healthy: clock-driven waves (on time), a friendly strike on the enemy hub, effective unlocks, an optional never-firing trigger, no errors, a non-trivial win time (200 s vs par 300 s) */
    M('ctl_clean', {
      setup: { foe: { ai: false }, start: { c: 600 }, restrict: { buildings: ['foundry'], maxEra: 1 } },
      triggers: [
        { id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1'], ['flag', 'go', true], ['mood', 'tension']] },
        { id: 'wave1', when: ['all', ['flag', 'go'], ['time', '>=', 41]], do: [['spawn', 'enemy', 'rifleman', 2, 'edge:N', { order: 'hold' }], ['radio', 'r2']] },
        { id: 'unlock1', when: ['after', 'go', 60], do: [['unlock', 'building', 'foundry'], ['unlock', 'era', 2]] },
        { id: 'wave2', when: ['time', '>=', 91], do: [['spawn', 'enemy', 'rifleman', 2, 'edge:E', { order: 'attack' }]] },
        { id: 'strike1', when: ['time', '>=', 100], do: [['strike', 73, 12, 5, 30, 3, 'alert', 'me']] },
        { id: 'late_hint', when: ['time', '>=', 120], delay: 10, do: [['radio', 'r2']] },
        { id: 'rare', optional: true, when: ['hero', 'dead'], do: [['radio', 'r2']] }]
    }),
    /* a data error at run time: the spawn names a unit that does not exist  ->  G.camp.errors */
    M('ctl_err', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'bad_spawn', when: ['time', '>=', 20], do: [['spawn', 'enemy', 'nope', 1, 'base']] }] }),
    /* a trigger that can never fire (and one that can't but is marked optional) */
    M('ctl_neverfire', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'ghost', when: ['time', '>=', 99999], do: [['radio', 'r2']] },
      { id: 'ghost_opt', optional: true, when: ['time', '>=', 99999], do: [['radio', 'r2']] }] }),
    /* an unlock of something that was never locked: it has no effect */
    M('ctl_noop_unlock', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'pointless', when: ['time', '>=', 30], do: [['unlock', 'building', 'garrison']] }] }),
    /* wins after 45 s, par 900: far too easy */
    M('ctl_trivial', { stars: { par: 900 }, objectives: [{ id: 'p1', kind: 'primary', text: 'Wait for the relief', when: null, done: ['time', '>=', 45], fail: null }, { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }] }),
    /* the win flag is never set and nothing can end the mission: unwinnable, never ends */
    M('ctl_impossible', { objectives: [{ id: 'p1', kind: 'primary', text: 'Do the impossible', when: null, done: ['flag', 'never'], fail: null }, { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }],
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'hint', when: ['time', '>=', 60], do: [['radio', 'r2']] }], win: ['flag', 'never'] }),
    /* needs four riflemen on a spot in the far south-east corner that a plain skirmish AI never visits; ends in defeat by the clock: "AI cannot judge: scripted human-only" */
    M('ctl_humanonly', { objectives: [{ id: 'p1', kind: 'primary', text: 'Escort four riflemen to the corner', when: null, done: ['unitsNear', 'me', 'rifleman', 76, 76, 3, '>=', 4], fail: null },
        { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }],
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'hint', when: ['time', '>=', 60], do: [['radio', 'r2']] }],
      win: ['obj', 'p1', 'done'], lose: ['time', '>=', 240] })
  ];
  const expect = {
    ctl_clean: { clean: true },
    ctl_err: { fail: ['errors'] },
    ctl_neverfire: { fail: ['triggers'] },
    ctl_noop_unlock: { fail: ['unlocks'] },
    ctl_trivial: { fail: ['trivial'] },
    ctl_impossible: { fail: ['stalled', 'playable'] },
    ctl_humanonly: { warn: ['playable'] }
  };
  return { missions, dispatch: clone(ops.story.dispatch), radio: clone(ops.story.radio), expect };
};
