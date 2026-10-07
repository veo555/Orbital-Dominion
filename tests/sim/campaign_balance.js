#!/usr/bin/env node
/* CAMPAIGN BALANCE GATE: structural-playability and sanity bounds for every mission, measured by playing it headlessly with the built-in AI on the PLAYER side
   (tools/mission_sim.js: newGame({campaign, aiBoth:true}), a different seeded Math.random stream per run, worker pool).
     node tests/sim/campaign_balance.js [missionId|id,id|all] [--runs N=3 (gate)] [--full (= 24 runs, CLAUDE.md rule 8)] [--story path] [--diff d] [--cap SECONDS]
                                         [--strict] [--json file] [--jobs N] [--no-det] [--det-cap S] [--optional trigId,..] [--verbose] [--require-missions]
   Exit code 1 when any mission has a FAIL (with --strict a WARN fails too). `--story <file>` checks a story object instead of src/js/44_story_*.js (tests/fixtures/story_min.js,
   tests/fixtures/campaign_controls.js); `SRC=<dir>` simulates another source tree (tests/out/campaign/mutate_tools.js uses both).
   RULES (thresholds in THRESHOLDS below; every rule has a control mission in tests/fixtures/campaign_controls.js that must trigger it):
     crash        FAIL  a run threw an exception
     errors       FAIL  G.camp.errors is not empty in some run (malformed data, unknown ids, unplaceable buildings ...)
     stalled      FAIL  >= 10 % of the runs have no result by the cap (default cap = 2 x par, 600..2400 s)
     playable     the AI completes the mission (victory) in >= 15 % of runs; below that: WARN "AI cannot judge: scripted human-only" when the mission still ends,
                  FAIL when it also stalls (probably unwinnable)
     trivial      FAIL  win rate > 97 % AND median win time < 40 % of par
     triggers     FAIL  a trigger that fired in none of the runs (unless `optional:true` on the trigger or --optional)
     waves        FAIL  a scripted spawn whose trigger is decided by the clock fired more than 5 s from its schedule (or not at all in runs that lasted past it); `schedule` = same for other triggers (WARN)
     spawns       FAIL  a spawn action created fewer units than it announced
     strikes      FAIL  a strike zone that did not fire within delay + 1.5 s;  WARN: it landed with nothing inside the circle
     unlocks      FAIL  an unlock whose restriction is still in force afterwards, or that unlocked something that was never locked (no effect);  WARN: lock of something already locked
     determinism  FAIL  run 0 replayed in a second process gives a different state hash
     primary-open WARN  victory while a primary objective was neither done nor true in the final state
   HONEST CAVEAT: the AI is a proxy for a human. It plays a plain skirmish and knows nothing of scripted objectives, so these are SANITY BOUNDS (is the mission broken?), not a
   difficulty guarantee. A mission flagged "AI cannot judge" is NOT verified playable by this gate: it needs a human playtest (docs/QA_CHECKLIST.md). The win-rate band of the
   design (55-85 % on normal, docs/CAMPAIGN_SPEC.md §6) is only reported (INFO), because with N runs the standard error of a win rate is ~0.5/sqrt(N) (0.10 at N=24). */
'use strict';
const path = require('path'), fs = require('fs');
const sim = require(path.join(__dirname, '..', '..', 'tools', 'mission_sim.js'));

const THRESHOLDS = { winMin: 0.15, trivialWin: 0.97, trivialTime: 0.40, stalledMax: 0.10, waveTol: 5, earlyTol: 0.5, band: [0.55, 0.85], bandMinRuns: 16, gateRuns: 3, fullRuns: 24 };
const ruleIds = ['crash', 'errors', 'stalled', 'playable', 'trivial', 'triggers', 'waves', 'schedule', 'spawns', 'strikes', 'unlocks', 'determinism', 'primary-open', 'par', 'band'];

/* a = one aggregate from mission_sim.aggregate()  ->  [{level:'FAIL'|'WARN'|'INFO', rule, msg}]   (pure: unit-testable with synthetic aggregates) */
function evaluate(a, T) {
  T = Object.assign({}, THRESHOLDS, T || {});
  const out = [], add = (level, rule, msg) => out.push({ level, rule, msg });
  const pc = (x) => Math.round(x * 100) + '%', n = a.runs;
  if (!n) { add('FAIL', 'crash', 'no runs were recorded'); return out; }
  for (const c of a.crashes) add('FAIL', 'crash', 'exception in ' + c.runs + ' run(s): ' + c.msg);
  if (a.errors.length) add('FAIL', 'errors', 'G.camp.errors in ' + Math.max.apply(null, a.errors.map(e => e.runs)) + '/' + n + ' runs: ' + a.errors.slice(0, 3).map(e => e.msg).join(' ; ') + (a.errors.length > 3 ? ' ; (+' + (a.errors.length - 3) + ' more)' : ''));
  const stalledFail = a.rate.stalled >= T.stalledMax - 1e-9;
  if (stalledFail) add('FAIL', 'stalled', pc(a.rate.stalled) + ' of the runs (' + a.count.stalled + '/' + n + ') have no result after ' + a.cap + ' s (limit ' + pc(T.stalledMax) + ')');
  if (a.rate.win < T.winMin - 1e-9 && !a.count.crash) {
    const prim = a.objectives.filter(o => o.kind === 'primary'), part = prim.map(o => o.id + ' ' + pc(o.fracEff === undefined ? o.frac : o.fracEff)).join(', ');
    const facts = 'AI win ' + pc(a.rate.win) + ' (' + a.count.win + '/' + n + '), defeat ' + pc(a.rate.defeat) + ', stalled ' + pc(a.rate.stalled) + '; primaries done: ' + (part || 'none');
    if (stalledFail) add('FAIL', 'playable', 'the AI never completes the mission and it does not end either: probably unwinnable (' + facts + ')');
    else add('WARN', 'playable', 'AI cannot judge: scripted human-only (' + facts + '). Not verified playable by this gate: needs a human playtest');
  }
  if (!a.par) add('WARN', 'par', 'mission has no stars.par: the 3-star speed bonus cannot be earned and "trivial" cannot be judged');
  else if (a.rate.win > T.trivialWin + 1e-9 && a.tWin.median !== null && a.tWin.median < T.trivialTime * a.par - 1e-9)
    add('FAIL', 'trivial', 'win rate ' + pc(a.rate.win) + ' and median win time ' + Math.round(a.tWin.median) + ' s = ' + Math.round(a.tWin.median / a.par * 100) + '% of par ' + a.par + ' s (limit ' + pc(T.trivialTime) + ')');
  /* triggers: fired at least once (unless optional) */
  const never = a.triggers.filter(t => !t.runs && !t.optional);
  if (never.length) add('FAIL', 'triggers', 'never fired in ' + n + ' run(s): ' + never.map(t => t.id).join(', ') + ' (mark `optional:true` if it is meant for branches the AI does not take)');
  /* scheduled (clock-driven) triggers: on time. Spawn triggers are the "scripted waves". */
  for (const t of a.triggers) {
    if (t.expected === null || t.optional && !t.runs) continue;
    const bad = [];
    if (t.lateMax !== null && t.lateMax > T.waveTol + 1e-9) bad.push('fired up to ' + t.lateMax + ' s late');
    if (t.lateMin !== null && t.lateMin < -T.earlyTol) bad.push('fired ' + (-t.lateMin) + ' s EARLY');
    if (t.missing > 0) bad.push('did not fire in ' + t.missing + '/' + t.eligible + ' runs that lasted past it');
    if (t.everyDev !== null && t.everyDev > T.waveTol + 1e-9) bad.push('repeat interval off by ' + t.everyDev + ' s');
    if (bad.length) add(t.spawn ? 'FAIL' : 'WARN', t.spawn ? 'waves' : 'schedule', (t.spawn ? 'scripted wave ' : 'trigger ') + t.id + ' (scheduled at ' + t.expected + ' s, tolerance ' + T.waveTol + ' s): ' + bad.join('; '));
  }
  if (a.spawns.short.length) add('FAIL', 'spawns', a.spawns.short.length + ' scripted spawn(s) created fewer units than announced, e.g. ' + a.spawns.short.slice(0, 2).map(s => s.n + ' ' + s.utype + ' at ' + s.t + ' s -> ' + s.made).join(', '));
  if (a.strikes.missed.length) add('FAIL', 'strikes', a.strikes.missed.length + ' of ' + a.strikes.seen + ' strike(s) did not land (zone ' + (a.strikes.missed[0].zone ? 'did not fire in time' : 'was never created') + '), e.g. at tile (' + a.strikes.missed[0].tx + ',' + a.strikes.missed[0].ty + ') t=' + a.strikes.missed[0].t + ' s');
  if (a.strikes.empty) add('WARN', 'strikes', a.strikes.empty + ' of ' + a.strikes.seen + ' strike(s) had nothing of the target side inside the circle when they were launched');
  if (a.unlocks.bad.length) add('FAIL', 'unlocks', a.unlocks.bad.length + ' unlock/lock action(s) did not take effect: ' + a.unlocks.bad.slice(0, 2).map(u => u.kind + ' ' + u.id + ' claimed ' + u.claimed + ' but is ' + u.actual).join(', '));
  const noopU = a.unlocks.noop.filter(u => !u.locked), noopL = a.unlocks.noop.filter(u => u.locked);
  if (noopU.length) add('FAIL', 'unlocks', 'unlock of something that was never locked (no effect): ' + [...new Set(noopU.map(u => u.kind + ' ' + u.id))].join(', ') + ' (add it to setup.restrict, or drop the action)');
  if (noopL.length) add('WARN', 'unlocks', 'lock of something already locked (no effect): ' + [...new Set(noopL.map(u => u.kind + ' ' + u.id))].join(', '));
  if (a.determinism.ok === false) add('FAIL', 'determinism', 'run 0 replayed in a second process differs: ' + a.determinism.detail);
  else if (a.determinism.ok === null) add('INFO', 'determinism', 'not checked (' + a.determinism.detail + ')');
  if (a.primaryOpenOnWin) add('WARN', 'primary-open', a.primaryOpenOnWin + ' victory(ies) with a primary objective that was neither done nor true in the final state');
  const stale = a.objectives.filter(o => o.staleDone);
  if (stale.length) add('INFO', 'primary-open', 'objective(s) ' + stale.map(o => o.id).join(', ') + ' were true at the end of some runs but never recorded as done (a victory by the default "all enemy structures destroyed" rule ends the game before the 5 Hz objective pass: the debrief shows them open and the bonus star can be lost)');
  if (n >= T.bandMinRuns && a.diff === 'normal' && (a.rate.win < T.band[0] || a.rate.win > T.band[1])) add('INFO', 'band', 'AI win rate ' + pc(a.rate.win) + ' (CI ' + pc(a.winCI[0]) + '-' + pc(a.winCI[1]) + ') is outside the design band ' + pc(T.band[0]) + '-' + pc(T.band[1]) + ' (a human is expected to do better than the AI)');
  return out;
}
const verdictOf = (f) => f.some(x => x.level === 'FAIL') ? 'FAIL' : f.some(x => x.level === 'WARN') ? 'WARN' : 'PASS';

/* ---------------------------------------------------------------------------------- report */
const P = (x) => Math.round(x * 100) + '%', S = (x) => x === null || x === undefined ? '-' : Math.round(x) + 's';
const pad = (s, w, r) => { s = String(s); return s.length >= w ? s : (r ? ' '.repeat(w - s.length) + s : s + ' '.repeat(w - s.length)); };
function table(rows) {
  const head = ['mission', 'runs', 'win', 'CI95', 'defeat', 'stall', 'win time med [p10-p90]', 'par', 'stars 0/1/2/3', 'triggers', 'det', 'verdict'];
  const W = [18, 4, 5, 8, 6, 5, 22, 5, 13, 8, 4, 7];
  const lines = [head.map((h, i) => pad(h, W[i])).join(' ')];
  lines.push(W.map(w => '-'.repeat(w)).join(' '));
  for (const r of rows) {
    const a = r.agg, nreq = a.triggers.filter(t => !t.optional), nfired = nreq.filter(t => t.runs).length;
    const cells = [a.id, a.runs, P(a.rate.win), P(a.winCI[0]) + '-' + P(a.winCI[1]), P(a.rate.defeat), P(a.rate.stalled),
      a.tWin.median === null ? '-' : S(a.tWin.median) + ' [' + S(a.tWin.p10) + '-' + S(a.tWin.p90) + ']', S(a.par), a.stars.join('/'), nfired + '/' + nreq.length,
      a.determinism.ok === true ? 'ok' : a.determinism.ok === false ? 'DIFF' : '-', r.verdict];
    lines.push(cells.map((c, i) => pad(c, W[i])).join(' '));
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------------------------- main */
async function main() {
  const o = sim.parseArgs(process.argv.slice(2));
  if (o.help || o.unknown) { console.error((o.unknown ? 'unknown option ' + o.unknown.join(' ') + '\n' : '') + 'usage: node tests/sim/campaign_balance.js [missionId|id,id|all] [--runs N=' + THRESHOLDS.gateRuns + ' | --full (=' + THRESHOLDS.fullRuns + ')] [--story path] [--diff d] [--cap S] [--strict] [--json file] [--jobs N] [--no-det] [--det-cap S] [--optional ids] [--verbose] [--require-missions]'); process.exit(o.help ? 0 : 2); }
  if (!o.runs) o.runs = THRESHOLDS.gateRuns;
  const S0 = sim.loadStoryData(o.story), sel = sim.selectMissions(S0, o._.filter(x => !x.startsWith('--')));
  if (!S0.missions.length) { console.log('campaign_balance: ' + (o.story || 'STORY') + ' has no missions yet: nothing to check' + (o.requireMissions ? ' (--require-missions)' : '')); process.exit(o.requireMissions ? 1 : 0); }
  if (sel.bad && sel.bad.length) { console.error('unknown mission id(s): ' + sel.bad.join(', ') + '   (have: ' + sel.all.join(', ') + ')'); process.exit(2); }
  o.storyPath = o.story ? path.resolve(o.story) : null;
  const t0 = Date.now(); let done = 0;
  o.onResult = (rec, d, tot) => { done = d; if (process.stderr.isTTY && !o.quiet) process.stderr.write('\r' + d + '/' + tot + ' runs   '); };
  const res = await sim.simulate(S0, sel.ids, o);
  if (process.stderr.isTTY && !o.quiet) process.stderr.write('\r' + ' '.repeat(20) + '\r');
  const rows = res.missions.map(agg => { const findings = evaluate(agg); return { agg, findings, verdict: verdictOf(findings) }; });
  if (o.verbose) for (const r of rows) console.log(sim.formatMission(r.agg) + '\n');
  console.log('Campaign balance gate: ' + rows.length + ' mission(s) x ' + o.runs + ' run(s), the built-in AI plays the player side' + (o.diff ? ' at ' + o.diff : ' at each mission\'s difficulty') + ' (' + (o.story || 'src/js/44_story_*.js') + ')\n');
  console.log(table(rows) + '\n');
  let nf = 0, nw = 0;
  for (const r of rows) {
    for (const f of r.findings) { if (f.level === 'FAIL') nf++; else if (f.level === 'WARN') nw++; console.log('  ' + pad(f.level, 4) + ' ' + pad(r.agg.id, 18) + ' ' + pad(f.rule, 12) + ' ' + f.msg); }
  }
  const nPass = rows.filter(r => r.verdict === 'PASS').length, failed = rows.filter(r => r.verdict === 'FAIL').length, warned = rows.filter(r => r.verdict === 'WARN').length;
  console.log('\n' + nPass + ' PASS, ' + warned + ' WARN, ' + failed + ' FAIL   (' + Math.round((Date.now() - t0) / 100) / 10 + ' s wall, ' + res.perf.jobs + ' workers, ' + res.perf.ticksPerSecPerWorker + ' ticks/s/worker, ' + res.perf.ticks + ' ticks)');
  if (o.runs < THRESHOLDS.fullRuns) console.log('NOTE: ' + o.runs + ' runs per mission is a smoke gate: a win rate has a standard error of ~' + (0.5 / Math.sqrt(o.runs)).toFixed(2) + '. Use --full (' + THRESHOLDS.fullRuns + ' runs, SE ~0.10) before judging balance (CLAUDE.md rule 8).');
  console.log('The AI is a proxy for a human: these are sanity bounds, not a difficulty guarantee. A mission flagged "AI cannot judge" still needs a human playtest.');
  if (o.json) { fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true }); fs.writeFileSync(o.json, JSON.stringify({ tool: 'campaign_balance', thresholds: THRESHOLDS, args: { runs: o.runs, story: o.story || null, diff: o.diff || null, cap: o.cap || null }, perf: res.perf,
    missions: rows.map(r => ({ id: r.agg.id, verdict: r.verdict, findings: r.findings, agg: r.agg })) }, null, 1)); }
  process.exit(failed || (o.strict && warned) ? 1 : 0);
}
if (require.main === module) main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
module.exports = { THRESHOLDS, ruleIds, evaluate, verdictOf, table, main };
