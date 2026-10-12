#!/usr/bin/env node
/* EXPERT-ITERATION LEAGUE (league-2): AlphaGo Zero's self-play loop on top of the AlphaStar-style league of tools/league/run.js.
     node tools/league/expit.js [--out tests/out/expit] [--hours 2.6] [--workers 2] [--resume] [--fit-every 3] [--gate-pairs 16] [--seed 2]
   Main agent M = the Master configuration WITH the macro planner (41_ai_mcts.js), theta fixed (league-1 M@30), improved through
     its policy head phi and its value function V:
       1. self-play + PFSP games; M's training copies search with Dirichlet root noise and sample their macro-action from N^(1/tau)
          (tau = 1) and log every root decision (x(s), u_theta(s), legal mask, visit distribution pi)
       2. every --fit-every generations: phi <- argmin KL(pi || p_phi) (tools/league/expit_fit.js, replay window of the last 6
          generations), V <- retrained on all logged games (train_value.py)
       3. GATE: the candidate (new phi, new V) plays --gate-pairs mirrored pairs against the incumbent (no noise); it is promoted
          only with a score >= 55 % (AlphaGo Zero's evaluator) - otherwise the incumbent stays and the data keeps accumulating
   Kept from league-1: PFSP opponent choice f_hard(p) = (1-p)^2 over the pool, a main exploiter E (CMA-ES over theta vs M) and a league
   exploiter L (CMA-ES vs PFSP pool), graduation rules, frozen snapshots (every promoted M), v3 anchors and the v4 Master (no planner)
   anchor; Bradley-Terry ratings. Checkpoint after every generation (<out>/state.json); --resume continues. */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const pool = require('./pool.js'), { CMAES } = require('./cmaes.js'), { pfsp, bradleyTerry, mean, wilson } = require('./stats.js'), XF = require('./expit_fit.js');
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2), opt = { out: path.join(ROOT, 'tests', 'out', 'expit'), hours: 2.6, workers: 2, cap: 540, fitEvery: 3, gatePairs: 16, seed: 2, lamX: 6, window: 6 };
for (let i = 0; i < args.length; i++) { const a = args[i], v = () => args[++i];
  if (a === '--out') opt.out = path.resolve(v()); else if (a === '--hours') opt.hours = +v(); else if (a === '--workers') opt.workers = +v(); else if (a === '--resume') opt.resume = true;
  else if (a === '--fit-every') opt.fitEvery = +v(); else if (a === '--gate-pairs') opt.gatePairs = +v(); else if (a === '--seed') opt.seed = +v(); else if (a === '--cap') opt.cap = +v(); else if (a === '--max-gen') opt.maxGen = +v(); else if (a === '--smoke') opt.smoke = true; else if (a === '--margin') opt.margin = +v(); }
fs.mkdirSync(opt.out, { recursive: true });
const F = (n) => path.join(opt.out, n), log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); fs.appendFileSync(F('league.log'), line + '\n'); };
const S0 = require('./game.js').sim();
const P0 = JSON.parse(S0.__run('JSON.stringify(AI_PARAMS)'));
const THETA0 = P0.theta0, THETA_M = P0.tiers.master.theta, PLAN0 = Object.assign({ sims: 256, K: 4, slices: 8, c: 1.5, lam: 0.5, margin: 0.02 }, P0.tiers.master.plan || {}, opt.margin !== undefined ? { margin: opt.margin } : {});
const FAC = ['meridian', 'obsidian', 'aurora'];
const t2 = (theta) => ({ kind: 't2', tier: 'master', theta: theta.map(x => +x.toFixed(5)), cfg: { plan: { sims: 0 } } });   // theta-only agents (exploiters): no planner
const mSpec = (ver, train) => ({ kind: 't2', tier: 'master', theta: THETA_M, cfg: Object.assign({ plan: Object.assign({}, PLAN0, { phi: ver.phi || null, log: !!train, noise: !!train, tau: train ? 1 : 0 }) }, ver.vf ? { vf: ver.vf } : {}) });
const ANCHORS = [{ name: 'v3-easy', spec: { kind: 'v3', diff: 'easy' } }, { name: 'v3-normal', spec: { kind: 'v3', diff: 'normal' } }, { name: 'v3-hard', spec: { kind: 'v3', diff: 'hard' } },
  { name: 'v4-master', spec: t2(THETA_M) }];
function rngFrom(st) { return () => { st.r = (st.r + 0x6D2B79F5) >>> 0; let t = st.r; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let S;
if (opt.resume && fs.existsSync(F('state.json'))) {
  S = JSON.parse(fs.readFileSync(F('state.json'), 'utf8')); S.E.es = CMAES.fromJSON(S.E.es); S.L.es = CMAES.fromJSON(S.L.es);
  log(`resumed at generation ${S.gen} (incumbent ${S.inc.name}, ${S.games.length} rated games)`);
} else {
  S = { gen: 0, r: opt.seed * 977 + 5, elapsed: 0, gid: 0, inc: { name: 'M0', phi: null, vf: null, born: 0 }, versions: [], gates: [], fits: [],
    E: { es: new CMAES({ x0: THETA_M, sigma0: 0.15, lambda: opt.lamX, seed: opt.seed * 13 + 2 }), born: 0, id: 0, hist: [] },
    L: { es: new CMAES({ x0: THETA_M, sigma0: 0.15, lambda: opt.lamX, seed: opt.seed * 17 + 3 }), born: 0, id: 0, hist: [] },
    pool: ANCHORS.map(a => Object.assign({ born: 0 }, a)), wr: {}, games: [], hist: [] };
  for (const f of ['feats.jsonl', 'games.jsonl', 'plog.jsonl', 'league.log']) if (fs.existsSync(F(f))) fs.unlinkSync(F(f));
  log(`new expert-iteration league: planner ${JSON.stringify(PLAN0)}, cap ${opt.cap}s, budget ${opt.hours} h, ${opt.workers} workers`);
}
const R = rngFrom(S);
function wrAdd(l, o, s) { const k = S.wr[l] || (S.wr[l] = {}); const a = k[o] || (k[o] = []); a.push(s); if (a.length > 24) a.shift(); }
function wrGet(l, o) { const a = (S.wr[l] || {})[o] || []; return (a.reduce((x, y) => x + y, 0) + 1) / (a.length + 2); }
function pick(learner, cands) { const w = pfsp(cands.map(c => wrGet(learner, c.name)), 'hard', 2); let x = R(), i = 0; for (; i < w.length - 1; i++) { x -= w[i]; if (x <= 0) break; } return cands[i]; }
function pair(seed) { return [FAC[(seed * 7) % 3], FAC[(seed * 7 + 1 + (seed % 2)) % 3]]; }
function mirrored(A, B, seed, meta, logIt) { const [fa, fb] = pair(seed); return [
  { seed, f0: fa, f1: fb, a0: A, a1: B, cap: opt.cap, log: !!logIt, meta: Object.assign({ side: 0 }, meta) },
  { seed, f0: fb, f1: fa, a0: B, a1: A, cap: opt.cap, log: !!logIt, meta: Object.assign({ side: 1 }, meta) }]; }
const scoreOf = (r) => ({ s: r.job.meta.side === 0 ? r.r0 : 1 - r.r0, sh: r.job.meta.side === 0 ? r.share0 : 1 - r.share0 });
function record(res, g) {
  const fl = [], gl = [], pl = []; let errs = 0;
  for (const r of res) {
    if (r.error) { errs++; log('GAME ERROR ' + r.error.slice(0, 300)); continue; }
    const m = r.job.meta, { s, sh } = scoreOf(r), gid = ++S.gid;
    gl.push(JSON.stringify({ gid, gen: g, opt: m.opt, A: m.A, B: m.B, side: m.side, seed: r.job.seed, s, sh: +sh.toFixed(3), t: r.t, adj: r.adjudicated, plst: r.plst }));
    for (const x of r.feats || []) { const y = x.team === 0 ? r.r0 : 1 - r.r0; fl.push(JSON.stringify({ gid, gen: g, team: x.team, t: +x.t.toFixed(1), y, f: x.f.map(v => +v.toFixed(4)), p: x.p.map(v => +v.toFixed(4)) })); }
    if (r.plog) for (let t = 0; t < 2; t++) if (r.plog[t]) for (const d of r.plog[t]) pl.push(JSON.stringify(Object.assign({ gid, gen: g }, d)));
    if (m.A !== m.B) S.games.push({ a: m.A, b: m.B, s });
  }
  if (fl.length) fs.appendFileSync(F('feats.jsonl'), fl.join('\n') + '\n'); if (gl.length) fs.appendFileSync(F('games.jsonl'), gl.join('\n') + '\n'); if (pl.length) fs.appendFileSync(F('plog.jsonl'), pl.join('\n') + '\n');
  return errs;
}
async function generation(P) {
  const g = ++S.gen, base = 300000 + g * 100, jobs = [], inc = S.inc, Mtr = mSpec(inc, true), Mev = mSpec(inc, false);
  for (let k = 0; k < 3; k++) jobs.push(...mirrored(Mtr, Mtr, base + k, { opt: 'M', opp: 'self', A: inc.name, B: inc.name }, true));
  const opp = pick('M', S.pool.concat([{ name: 'E' + S.E.id, spec: t2(S.E.es.m) }, { name: 'L' + S.L.id, spec: t2(S.L.es.m) }]));
  for (let k = 0; k < 3; k++) jobs.push(...mirrored(Mtr, opp.spec, base + 10 + k, { opt: 'M', opp: opp.name, A: inc.name, B: opp.name }, true));
  const XE = S.E.es.ask(); XE.forEach((x, i) => jobs.push(...mirrored(t2(x), Mev, base + 20, { opt: 'E', i, opp: inc.name, A: 'E' + S.E.id + '@' + g, B: inc.name })));
  const oppL = pick('L', S.pool), XL = S.L.es.ask(); XL.forEach((x, i) => jobs.push(...mirrored(t2(x), oppL.spec, base + 30, { opt: 'L', i, opp: oppL.name, A: 'L' + S.L.id + '@' + g, B: oppL.name })));
  jobs.push(...mirrored(Mev, ANCHORS[2].spec, base + 40, { opt: 'R', opp: 'v3-hard', A: inc.name, B: 'v3-hard', who: 'M' }));
  jobs.push(...mirrored(Mev, ANCHORS[3].spec, base + 41, { opt: 'R', opp: 'v4-master', A: inc.name, B: 'v4-master', who: 'M' }));
  jobs.push(...mirrored(t2(S.E.es.m), Mev, base + 42, { opt: 'R', opp: inc.name, A: 'E' + S.E.id, B: inc.name, who: 'E' }));
  if (opt.smoke) jobs.splice(4, jobs.length - 8);                         // --smoke: a handful of games per generation (tooling check)
  const t0 = Date.now(), res = await P.map(jobs), errs = record(res, g);
  const fit = { E: XE.map(() => []), L: XL.map(() => []) };
  for (const r of res) { if (r.error) continue; const m = r.job.meta, { s, sh } = scoreOf(r);
    if (m.opt === 'E' || m.opt === 'L') { fit[m.opt][m.i].push(s + 0.25 * (sh - 0.5)); if (m.opt === 'L') wrAdd('L', m.opp, s); }
    if (m.opt === 'M' && m.opp !== 'self') wrAdd('M', m.opp, s);
    if (m.opt === 'R') { if (m.who === 'M') wrAdd('M', m.opp, s); if (m.who === 'E') S.E.hist.push(s); } }
  S.E.es.tell(XE, fit.E.map(a => a.length ? -mean(a) : 0)); S.L.es.tell(XL, fit.L.map(a => a.length ? -mean(a) : 0));
  const eRate = S.E.hist.slice(-4), lRate = fit.L.map(a => mean(a));
  if ((eRate.length >= 4 && mean(eRate) > 0.7) || g - S.E.born >= 8) { S.pool.push({ name: 'E' + S.E.id + '@' + g, spec: t2(S.E.es.m), born: g, exploiter: 'main', vsM: mean(eRate) });
    log(`main exploiter E${S.E.id} graduates (vs M ${mean(eRate).toFixed(2)}); reset`); S.E = { es: new CMAES({ x0: THETA_M, sigma0: 0.15, lambda: opt.lamX, seed: opt.seed * 13 + 2 + g }), born: g, id: S.E.id + 1, hist: [] }; }
  if (Math.max(...lRate) > 0.85 || g - S.L.born >= 8) { S.pool.push({ name: 'L' + S.L.id + '@' + g, spec: t2(S.L.es.m), born: g, exploiter: 'league' });
    log(`league exploiter L${S.L.id} graduates; reset`); S.L = { es: new CMAES({ x0: THETA_M, sigma0: 0.15, lambda: opt.lamX, seed: opt.seed * 17 + 3 + g }), born: g, id: S.L.id + 1, hist: [] }; }
  const Ms = res.filter(r => !r.error && r.job.meta.opt === 'R' && r.job.meta.who === 'M').map(r => scoreOf(r).s);
  const devs = res.filter(r => !r.error && r.plst).map(r => r.plst.filter(Boolean)).flat(), dev = devs.reduce((a, x) => a + x.dev, 0) / Math.max(1, devs.reduce((a, x) => a + x.n, 0));
  const row = { gen: g, wall: Math.round((Date.now() - t0) / 1000), games: res.length, errs, inc: inc.name, opp: opp.name, oppL: oppL.name, ratingM: mean(Ms), devRate: +dev.toFixed(3), fitE: Math.max(...fit.E.map(mean)), fitL: Math.max(...lRate) };
  S.hist.push(row);
  log(`gen ${g}: ${res.length} games (${errs} err) ${row.wall}s | M=${inc.name} vs ${opp.name}; rating games ${(100 * row.ratingM).toFixed(0)}% | search overrides ${(100 * dev).toFixed(1)}% of decisions | E best ${row.fitE.toFixed(2)} L best ${row.fitL.toFixed(2)}`);
  if (g % opt.fitEvery === 0) await improve(P, g);
}
function readJsonl(f, filter) { if (!fs.existsSync(F(f))) return []; const out = []; for (const l of fs.readFileSync(F(f), 'utf8').split('\n')) { if (!l) continue; const o = JSON.parse(l); if (!filter || filter(o)) out.push(o); } return out; }
async function improve(P, g) {
  // 1. policy head: fit phi to the search's visit distributions (replay window), held-out by game id
  const D = readJsonl('plog.jsonl', o => o.gen > g - opt.window), tr = D.filter(o => o.gid % 5 !== 0), te = D.filter(o => o.gid % 5 === 0);
  const fh = XF.fitHead(tr, { phi0: S.inc.phi, l2: 1e-3, iters: 300 });
  const fitRow = { gen: g, n: D.length, klTrainBefore: +fh.before.toFixed(4), klTrainAfter: +fh.after.toFixed(4), klTestTheta: +XF.klLoss(te, null).toFixed(4), klTestInc: +XF.klLoss(te, S.inc.phi).toFixed(4), klTestNew: +XF.klLoss(te, fh.phi).toFixed(4),
    agreeTheta: +XF.agreement(te, null).toFixed(3), agreeNew: +XF.agreement(te, fh.phi).toFixed(3) };
  // 2. value function on every logged game
  let vf = S.inc.vf, vrep = null;
  try { const out = cp.execFileSync('python3', [path.join(__dirname, 'train_value.py'), F('feats.jsonl'), '--out', F('vf_g' + g + '.json'), '--quiet'], { encoding: 'utf8', timeout: 900000 });
    const j = JSON.parse(fs.readFileSync(F('vf_g' + g + '.json'), 'utf8')); vf = j.model; vrep = out.trim().split('\n').slice(-1)[0]; } catch (e) { log('value training failed: ' + String(e.message).slice(0, 200)); }
  fitRow.vf = vrep; S.fits.push(fitRow);
  log(`fit at gen ${g}: ${D.length} decisions; KL(pi||p) held-out: theta-only ${fitRow.klTestTheta}, incumbent ${fitRow.klTestInc}, new head ${fitRow.klTestNew}; top-1 agreement ${fitRow.agreeTheta} -> ${fitRow.agreeNew} | V: ${vrep}`);
  // 3. gate: candidate vs incumbent, no exploration noise, fresh seeds
  const cand = { name: 'M' + (S.versions.length + 1) + '@' + g, phi: fh.phi, vf, born: g }, jobs = [];
  for (let k = 0; k < opt.gatePairs; k++) jobs.push(...mirrored(mSpec(cand, false), mSpec(S.inc, false), 500000 + g * 100 + k, { opt: 'G', A: cand.name, B: S.inc.name }, true));
  const res = await P.map(jobs); record(res, g);
  let k = 0, n = 0; for (const r of res) { if (r.error) continue; k += scoreOf(r).s; n++; }
  const ok = XF.gate(k, n, { thr: 0.55, nMin: 24 }), ci = wilson(k, n);
  S.gates.push({ gen: g, cand: cand.name, inc: S.inc.name, score: +(k / n).toFixed(4), n, ci: ci.map(x => +x.toFixed(3)), promoted: ok });
  log(`GATE ${cand.name} vs ${S.inc.name}: ${(100 * k / n).toFixed(1)}% of ${n} [${(100 * ci[0]).toFixed(0)}, ${(100 * ci[1]).toFixed(0)}] -> ${ok ? 'PROMOTED' : 'rejected'}`);
  if (ok) { S.versions.push(S.inc); S.pool.push({ name: S.inc.name, spec: mSpec(S.inc, false), born: g }); S.inc = cand; fs.writeFileSync(F('incumbent.json'), JSON.stringify(cand)); }
}
function save() { const st = Object.assign({}, S, { E: Object.assign({}, S.E, { es: S.E.es.toJSON() }), L: Object.assign({}, S.L, { es: S.L.es.toJSON() }) }); fs.writeFileSync(F('state.json.tmp'), JSON.stringify(st)); fs.renameSync(F('state.json.tmp'), F('state.json')); }
(async () => {
  const P = pool(opt.workers), start = Date.now(), budget = opt.hours * 3600e3 - (S.elapsed || 0); let last = start;
  while (!opt.maxGen || S.gen < opt.maxGen) {
    const g0 = Date.now(); await generation(P); S.elapsed = (S.elapsed || 0) + (Date.now() - last); last = Date.now(); save();
    if (Date.now() - start + (Date.now() - g0) > budget) { log(`time budget reached after generation ${S.gen}`); break; }
  }
  P.close();
  const names = [...new Set(S.games.flatMap(x => [x.a, x.b]))], elo = bradleyTerry(names, S.games, 'v3-hard', 1000);
  fs.writeFileSync(F('summary.json'), JSON.stringify({ gens: S.gen, elapsedMin: Math.round(S.elapsed / 60000), incumbent: S.inc, gates: S.gates, fits: S.fits, elo, hist: S.hist, pool: S.pool.map(p => p.name) }, null, 1));
  log('done: ' + S.gen + ' generations; BT Elo ' + JSON.stringify(elo));
})();
