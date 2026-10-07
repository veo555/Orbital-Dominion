/* DEFECTIVE missions for tools/mission_check.js (the static checker): each one is wrong in exactly one way (plus `ok_clean`, which must produce no finding at all), so every
   check can be shown to fire (CLAUDE.md rule 15). Seed 1101: player Hub tile (11,72), enemy Hub (73,12); tile (34,4) is deep rock (all tiles within 4 are blocked) and
   tile (3,5) is a sealed 4-tile pocket in the top-left corner (not connected to the base).  Usage:
     const S = require('./campaign_check_bad.js')();   // {missions, cine, radio, expect}
     node tools/mission_check.js all --story tests/fixtures/campaign_check_bad.js
   expect[id] = {error:[rule ids that MUST appear as ERROR], warn:[rule ids that MUST appear as WARN]}; ok_clean: {clean:true}. */
module.exports = function makeBad() {
  const ctl = require('./campaign_controls.js')(), clone = (o) => JSON.parse(JSON.stringify(o));
  const ops = require('./campaign_ops.js')();
  const M = (id, over) => {
    const m = ops.base(id, Object.assign({
      setup: { foe: { ai: false }, start: { c: 600 } }, stars: { par: 300 },
      objectives: [{ id: 'p1', kind: 'primary', text: 'Hold out until relief arrives', when: null, done: ['time', '>=', 200], fail: null }, { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }],
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }], win: ['obj', 'p1', 'done'], noDefaultWin: true, lose: null }, over || {}));
    m.title = 'Check ' + id; return m;
  };
  const long70 = 'Defend the colony against every wave of raiders until the relief fleet'.padEnd(70, '.'), mid55 = 'Defend the colony against raiders until the fleet arrives'.slice(0, 55);
  const missions = [
    M('ok_clean', {}),
    /* a scripted wave placed in deep rock */
    M('bad_spawn_rock', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'wave', when: ['time', '>=', 30], do: [['spawn', 'enemy', 'rifleman', 1, [34, 4]]] }] }),
    /* near conditions that can never be satisfied: a sealed pocket, deep rock */
    M('bad_near', { objectives: [{ id: 'p1', kind: 'primary', text: 'Reach the hidden pocket', when: null, done: ['heroNear', 3, 5, 1], fail: null },
      { id: 'b1', kind: 'bonus', text: 'Garrison the rock', when: null, done: ['unitsNear', 'me', 'rifleman', 34, 4, 2, '>=', 1], fail: null }], win: ['obj', 'p1', 'done'] }),
    /* names that do not exist */
    M('bad_names', { setup: { foe: { ai: false }, start: { c: 600, units: [{ type: 'wyvern', n: 2 }] }, restrict: { buildings: ['castle'], units: ['dragon'], maxEra: 4 } },
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'u', when: ['built', 'tower', '>=', 1], do: [['unlock', 'unit', 'nope']] }] }),
    /* primary objective and win need things that are locked for ever */
    M('bad_locked', { setup: { foe: { ai: false }, start: { c: 600 }, restrict: { units: ['titan'], maxEra: 1 } },
      objectives: [{ id: 'p1', kind: 'primary', text: 'Field a Titan', when: null, done: ['trained', 'titan', '>=', 1], fail: null }, { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }],
      win: ['era', 'me', '>=', 2] }),
    /* text lengths */
    M('bad_text', { objectives: [{ id: 'p1', kind: 'primary', text: long70, when: null, done: ['time', '>=', 200], fail: null }, { id: 'b1', kind: 'bonus', text: mid55, when: null, done: ['trained', 'rifleman', '>=', 2], fail: null },
      { id: 'b2', kind: 'bonus', text: mid55, when: null, done: ['trained', 'raptor', '>=', 2], fail: null }],
      triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r_long']] }] }),
    /* par earlier than the earliest scripted win */
    M('bad_par', { stars: { par: 100 }, win: ['time', '>=', 300], objectives: [{ id: 'p1', kind: 'primary', text: 'Hold out until relief arrives', when: null, done: ['time', '>=', 300], fail: null }, { id: 'b1', kind: 'bonus', text: 'Train two riflemen', when: null, done: ['trained', 'rifleman', '>=', 2], fail: null }] }),
    /* nothing can end it */
    M('bad_noend', { win: null, lose: null }),
    /* an extra start building on rock */
    M('bad_startbuilding', { setup: { foe: { ai: false }, start: { c: 600, buildings: [{ type: 'turret', tx: 34, ty: 4 }] } } }),
    /* an unlock that does nothing */
    M('bad_unlock_noop', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'pointless', when: ['time', '>=', 30], do: [['unlock', 'building', 'garrison']] }] }),
    /* a trigger that waits for a flag nobody sets */
    M('bad_flag', { triggers: [{ id: 'brief', when: ['time', '>=', 2], do: [['radio', 'r1']] }, { id: 'ghost', when: ['flag', 'nobody_sets_me'], do: [['radio', 'r2']] }] })
  ];
  const radio = Object.assign(clone(ctl.radio), { r_long: { who: 'idris', text: 'This radio line is far too long for the caption strip: '.padEnd(150, 'blah '), style: 'radio', dur: 4 } });
  const expect = {
    ok_clean: { clean: true },
    bad_spawn_rock: { error: ['spawn'] },
    bad_near: { error: ['near'] },
    bad_names: { error: ['names', 'runtime'] },
    bad_locked: { error: ['locked'] },
    bad_text: { error: ['text'], warn: ['text'] },
    bad_par: { error: ['par'] },
    bad_noend: { error: ['ends'] },
    bad_startbuilding: { error: ['runtime'] },
    bad_unlock_noop: { warn: ['unlocks'] },
    bad_flag: { warn: ['unreachable'] }
  };
  return { missions, cine: clone(ctl.cine), radio, expect };
};
