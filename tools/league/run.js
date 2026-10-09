#!/usr/bin/env node
/* THE LEAGUE — AlphaStar-style population training of the T2 opponent's parameter vector theta, scaled down to a laptop.
     node tools/league/run.js [--out tests/out/league] [--hours 2.5] [--max-gen 999] [--resume] [--seed 1] [--workers 3]
   Population (Vinyals et al. 2019, "Grandmaster level in StarCraft II using multi-agent reinforcement learning", Nature 575):
     M  main agent        CMA-ES over theta; each candidate plays (a) self-play against the current mean of M and (b) an opponent drawn by
                          prioritised fictitious self-play, PFSP f_hard(p)=(1-p)^2, from the whole league (snapshots, exploiters, v3 anchors)
     E  main exploiter    CMA-ES trained only against the current M mean; graduates into the pool (and resets to theta0) when it beats M
                          > 70 % over its last 6 rating games or after 8 generations
     L  league exploiter  CMA-ES against a PFSP opponent from the pool; graduates when > 70 % against the pool, then resets with p = 0.25
     pool                 frozen snapshots of M every 3 generations, graduated exploiters, and the legacy v3 AI (easy/normal/hard) as anchors
   Variance reduction: every candidate of one optimiser in one generation faces the same opponents on the same seeds (common random
   numbers), every seed is played twice with sides and factions swapped (mirrored), and the fitness adds a material-share term.
   The value function V(s) is trained from the logged features (tools/league/train_value.py) after generation `--vf-at` and re-trained every
   `--vf-every` generations; later games run with it. Everything is checkpointed to <out>/state.json after every generation;
   features go to <out>/feats.jsonl, one line per game to <out>/games.jsonl. Raw logs are not committed (docs/AI_LEAGUE_RESULTS.md summarises). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const pool = require('./pool.js'), { CMAES } = require('./cmaes.js'), { pfsp, bradleyTerry, mean } = require('./stats.js');
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2), opt = { out: path.join(ROOT, 'tests', 'out', 'league'), hours: 2.5, maxGen: 999, seed: 1, workers: 3, cap: 480, vfAt: 4, vfEvery: 5, lamM: 10, lamX: 6 };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = () => args[++i];
  if (a === '--out') opt.out = path.resolve(v()); else if (a === '--hours') opt.hours = +v(); else if (a === '--max-gen') opt.maxGen = +v(); else if (a === '--resume') opt.resume = true;
  else if (a === '--seed') opt.seed = +v(); else if (a === '--workers') opt.workers = +v(); else if (a === '--cap') opt.cap = +v(); else if (a === '--vf-at') opt.vfAt = +v(); else if (a === '--vf-every') opt.vfEvery = +v();
  else if (a === '--lam') opt.lamM = +v();
}
fs.mkdirSync(opt.out, { recursive: true });
const F = (n) => path.join(opt.out, n), log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); fs.appendFileSync(F('league.log'), line + '\n'); };
const S0 = require('./game.js').sim();
const THETA0 = JSON.parse(S0.__run('JSON.stringify(AI_PARAMS.theta0)')), N = THETA0.length;
const FAC = ['meridian', 'obsidian', 'aurora'];
const ANCHORS = [{ name: 'v3-easy', spec: { kind: 'v3', diff: 'easy' } }, { name: 'v3-normal', spec: { kind: 'v3', diff: 'normal' } }, { name: 'v3-hard', spec: { kind: 'v3', diff: 'hard' } }];
const t2 = (theta) => ({ kind: 't2', tier: 'master', theta: theta.map(x => +x.toFixed(5)) });
function rngFrom(st) { return () => { st.r = (st.r + 0x6D2B79F5) >>> 0; let t = st.r; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let S;
if (opt.resume && fs.existsSync(F('state.json'))) {
  S = JSON.parse(fs.readFileSync(F('state.json'), 'utf8'));
  S.M.es = CMAES.fromJSON(S.M.es); S.E.es = CMAES.fromJSON(S.E.es); S.L.es = CMAES.fromJSON(S.L.es);
  log(`resumed at generation ${S.gen} (${S.games.length} rated games, ${S.pool.length} pool members)`);
} else {
  S = { gen: 0, seed: opt.seed, r: opt.seed * 977 + 1, t0: Date.now(), elapsed: 0, vf: null, vfGen: -1, gid: 0,
    M: { es: new CMAES({ x0: THETA0, sigma0: 0.12, lambda: opt.lamM, seed: opt.seed * 11 + 1 }) },
    E: { es: new CMAES({ x0: THETA0, sigma0: 0.18, lambda: opt.lamX, seed: opt.seed * 13 + 2 }), born: 0, id: 0, hist: [] },
    L: { es: new CMAES({ x0: THETA0, sigma0: 0.18, lambda: opt.lamX, seed: opt.seed * 17 + 3 }), born: 0, id: 0, hist: [] },
    pool: ANCHORS.map(a => Object.assign({ born: 0 }, a)).concat([{ name: 'M@0', spec: t2(THETA0), born: 0 }]),
    wr: {}, games: [], hist: [] };
  for (const f of ['feats.jsonl', 'games.jsonl', 'league.log']) if (fs.existsSync(F(f))) fs.unlinkSync(F(f));
  log(`new league: theta dim ${N}, lambda M ${opt.lamM} / exploiters ${opt.lamX}, cap ${opt.cap}s, budget ${opt.hours} h, ${opt.workers} workers`);
}
const R = rngFrom(S);
/* win-rate memory for PFSP: learner -> opponent -> last 24 scores */
function wrAdd(l, o, s) { const k = S.wr[l] || (S.wr[l] = {}); const a = k[o] || (k[o] = []); a.push(s); if (a.length > 24) a.shift(); }
function wrGet(l, o) { const a = (S.wr[l] || {})[o] || []; return (a.reduce((x, y) => x + y, 0) + 1) / (a.length + 2); }     // Laplace-smoothed
function pick(learner, cands, mode) { const w = pfsp(cands.map(c => wrGet(learner, c.name)), mode || 'hard', 2); let x = R(), i = 0; for (; i < w.length - 1; i++) { x -= w[i]; if (x <= 0) break; } return cands[i]; }
function pair(seed) { const a = FAC[(seed * 7) % 3], b = FAC[(seed * 7 + 1 + (seed % 2)) % 3]; return [a, b]; }
/* a mirrored pairing of A vs B on one seed = two jobs */
function mirrored(A, B, seed, meta) { const [fa, fb] = pair(seed); return [
  { seed, f0: fa, f1: fb, a0: A, a1: B, cap: opt.cap, vf: S.vf, log: true, meta: Object.assign({ side: 0 }, meta) },
  { seed, f0: fb, f1: fa, a0: B, a1: A, cap: opt.cap, vf: S.vf, log: true, meta: Object.assign({ side: 1 }, meta) }]; }
const scoreOf = (r) => { const s = r.job.meta.side === 0 ? r.r0 : 1 - r.r0, sh = r.job.meta.side === 0 ? r.share0 : 1 - r.share0; return { s, sh }; };

async function generation(P) {
  const g = ++S.gen, base = 100000 + g * 100, jobs = [];
  const Mmean = { name: 'M@' + g, spec: t2(S.M.es.m) }, Emean = { name: 'E' + S.E.id + '@' + g, spec: t2(S.E.es.m) }, Lmean = { name: 'L' + S.L.id + '@' + g, spec: t2(S.L.es.m) };
  // --- main agent: self-play vs its mean + PFSP opponent from the league (incl. the current exploiters)
  const XM = S.M.es.ask(), oppM = pick('M', S.pool.concat([Emean, Lmean]), 'hard');
  XM.forEach((x, i) => { jobs.push(...mirrored(t2(x), Mmean.spec, base + 1, { opt: 'M', i, opp: 'self', A: 'M@' + g, B: 'M@' + g }));
    jobs.push(...mirrored(t2(x), oppM.spec, base + 2, { opt: 'M', i, opp: oppM.name, A: 'M@' + g, B: oppM.name })); });
  // --- main exploiter: only against the current main agent
  const XE = S.E.es.ask();
  XE.forEach((x, i) => jobs.push(...mirrored(t2(x), Mmean.spec, base + 3, { opt: 'E', i, opp: Mmean.name, A: 'E' + S.E.id + '@' + g, B: 'M@' + g })));
  // --- league exploiter: PFSP over the frozen pool
  const XL = S.L.es.ask(), oppL = pick('L', S.pool, 'hard');
  XL.forEach((x, i) => jobs.push(...mirrored(t2(x), oppL.spec, base + 4, { opt: 'L', i, opp: oppL.name, A: 'L' + S.L.id + '@' + g, B: oppL.name })));
  // --- rating games of the means (for Bradley-Terry, PFSP statistics and graduation)
  const rOpp = S.pool[Math.floor(R() * S.pool.length)];
  jobs.push(...mirrored(Mmean.spec, rOpp.spec, base + 5, { opt: 'R', opp: rOpp.name, A: 'M@' + g, B: rOpp.name, who: 'M' }));
  jobs.push(...mirrored(Mmean.spec, ANCHORS[2].spec, base + 6, { opt: 'R', opp: 'v3-hard', A: 'M@' + g, B: 'v3-hard', who: 'M' }));
  jobs.push(...mirrored(Emean.spec, Mmean.spec, base + 7, { opt: 'R', opp: Mmean.name, A: Emean.name, B: 'M@' + g, who: 'E' }));
  const oppL2 = S.pool[Math.floor(R() * S.pool.length)];
  jobs.push(...mirrored(Lmean.spec, oppL2.spec, base + 8, { opt: 'R', opp: oppL2.name, A: Lmean.name, B: oppL2.name, who: 'L' }));
  const t0 = Date.now(), res = await P.map(jobs);
  // --- book-keeping
  const fit = { M: new Array(XM.length).fill(0).map(() => []), E: new Array(XE.length).fill(0).map(() => []), L: new Array(XL.length).fill(0).map(() => []) };
  let errs = 0; const fl = [], gl = [];
  for (const r of res) {
    if (r.error) { errs++; log('GAME ERROR ' + r.error.slice(0, 300)); continue; }
    const m = r.job.meta, { s, sh } = scoreOf(r), gid = ++S.gid;
    gl.push(JSON.stringify({ gid, gen: g, opt: m.opt, A: m.A, B: m.B, side: m.side, seed: r.job.seed, f0: r.job.f0, f1: r.job.f1, s, sh: +sh.toFixed(3), t: r.t, adj: r.adjudicated, vf: !!S.vf }));
    for (const x of r.feats || []) { const y = x.team === 0 ? r.r0 : 1 - r.r0; fl.push(JSON.stringify({ gid, gen: g, team: x.team, t: +x.t.toFixed(1), y, f: x.f.map(v => +v.toFixed(4)), p: x.p.map(v => +v.toFixed(4)) })); }
    if (m.opt !== 'R') fit[m.opt][m.i].push(s + 0.25 * (sh - 0.5));
    if (m.opt === 'M' && m.opp !== 'self') wrAdd('M', m.opp, s);
    if (m.opt === 'L') wrAdd('L', m.opp, s);
    if (m.opt === 'R') { if (m.who === 'M') wrAdd('M', m.opp, s); if (m.who === 'E') S.E.hist.push(s); if (m.who === 'L') { S.L.hist.push(s); wrAdd('L', m.opp, s); } }
    if (m.A !== m.B) S.games.push({ a: m.A, b: m.B, s });
  }
  fs.appendFileSync(F('feats.jsonl'), fl.length ? fl.join('\n') + '\n' : ''); fs.appendFileSync(F('games.jsonl'), gl.length ? gl.join('\n') + '\n' : '');
  const tellES = (es, X, fs_) => es.tell(X, fs_.map(a => a.length ? -mean(a) : 0));
  tellES(S.M.es, XM, fit.M); tellES(S.E.es, XE, fit.E); tellES(S.L.es, XL, fit.L);
  const fm = fit.M.map(a => mean(a)), fe = fit.E.map(a => mean(a)), flg = fit.L.map(a => mean(a));
  // --- pool updates: snapshots and graduation
  if (g % 3 === 0) { S.pool.push({ name: 'M@' + g, spec: t2(S.M.es.m), born: g }); log(`snapshot M@${g} -> pool`); }
  const eRate = S.E.hist.slice(-6), lRate = S.L.hist.slice(-6);
  if ((eRate.length >= 6 && mean(eRate) > 0.7) || g - S.E.born >= 8) {
    S.pool.push({ name: 'E' + S.E.id + '@' + g, spec: t2(S.E.es.m), born: g, exploiter: 'main', vsM: mean(eRate) });
    log(`main exploiter E${S.E.id} graduates (rate vs M over last ${eRate.length}: ${mean(eRate).toFixed(2)}) and resets to theta0`);
    S.E = { es: new CMAES({ x0: THETA0, sigma0: 0.18, lambda: opt.lamX, seed: S.seed * 13 + 2 + g }), born: g, id: S.E.id + 1, hist: [] };
  }
  if ((lRate.length >= 6 && mean(lRate) > 0.7) || g - S.L.born >= 10) {
    S.pool.push({ name: 'L' + S.L.id + '@' + g, spec: t2(S.L.es.m), born: g, exploiter: 'league', vsPool: mean(lRate) });
    const reset = R() < 0.25 || g - S.L.born >= 10;
    log(`league exploiter L${S.L.id} graduates (rate ${mean(lRate).toFixed(2)}); ${reset ? 'reset to theta0' : 'continues'}`);
    S.L = reset ? { es: new CMAES({ x0: THETA0, sigma0: 0.18, lambda: opt.lamX, seed: S.seed * 17 + 3 + g }), born: g, id: S.L.id + 1, hist: [] } : Object.assign(S.L, { id: S.L.id + 1, hist: [], born: g });
  }
  // --- value function: (re)train from the logged features
  if (g >= opt.vfAt && (S.vfGen < 0 || g - S.vfGen >= opt.vfEvery)) {
    try {
      const out = cp.execFileSync('python3', [path.join(__dirname, 'train_value.py'), F('feats.jsonl'), '--out', F('vf.json'), '--quiet'], { encoding: 'utf8', timeout: 600000 });
      S.vf = JSON.parse(fs.readFileSync(F('vf.json'), 'utf8')).model; S.vfGen = g; log('value function trained: ' + out.trim().split('\n').slice(-1)[0]);
    } catch (e) { log('value training failed: ' + String(e.message).slice(0, 200)); }
  }
  const elo = bradleyTerry([...new Set(S.games.flatMap(x => [x.a, x.b]))], S.games, 'v3-hard', 1000);
  const hrow = { gen: g, wall: Math.round((Date.now() - t0) / 1000), games: res.length, errs, fitM: { best: Math.max(...fm), mean: mean(fm) }, fitE: Math.max(...fe), fitL: Math.max(...flg), sigmaM: S.M.es.sigma, oppM: oppM.name, oppL: oppL.name, eloM: elo['M@' + g], eloE: elo[Emean.name], eloL: elo[Lmean.name], vf: !!S.vf, pool: S.pool.length, mean: S.M.es.m.map(v => +v.toFixed(4)) };
  S.hist.push(hrow);
  log(`gen ${g}: ${res.length} games (${errs} errors) in ${hrow.wall}s  fitM best ${hrow.fitM.best.toFixed(3)} mean ${hrow.fitM.mean.toFixed(3)} sigma ${S.M.es.sigma.toFixed(3)}  fitE ${hrow.fitE.toFixed(3)} fitL ${hrow.fitL.toFixed(3)}  vs ${oppM.name}/${oppL.name}  Elo(BT, v3-hard=1000) M ${hrow.eloM} E ${hrow.eloE} L ${hrow.eloL}`);
}
function save() {
  S.elapsed = (S.elapsed || 0); const st = Object.assign({}, S, { M: Object.assign({}, S.M, { es: S.M.es.toJSON() }), E: Object.assign({}, S.E, { es: S.E.es.toJSON() }), L: Object.assign({}, S.L, { es: S.L.es.toJSON() }) });
  fs.writeFileSync(F('state.json.tmp'), JSON.stringify(st)); fs.renameSync(F('state.json.tmp'), F('state.json'));
}
(async () => {
  const P = pool(opt.workers), start = Date.now(), budget = opt.hours * 3600e3 - (S.elapsed || 0);
  let last = start;
  while (S.gen < opt.maxGen) {
    const g0 = Date.now();
    await generation(P);
    S.elapsed = (S.elapsed || 0) + (Date.now() - last); last = Date.now();
    save();
    const per = Date.now() - g0;
    if (Date.now() - start + per > budget) { log(`time budget reached after generation ${S.gen}`); break; }
  }
  P.close();
  const names = [...new Set(S.games.flatMap(x => [x.a, x.b]))], elo = bradleyTerry(names, S.games, 'v3-hard', 1000);
  fs.writeFileSync(F('summary.json'), JSON.stringify({ gens: S.gen, elapsedMin: Math.round(S.elapsed / 60000), finalMean: S.M.es.m, sigma: S.M.es.sigma, pool: S.pool.map(p => ({ name: p.name, born: p.born, exploiter: p.exploiter || null })), elo, hist: S.hist, vfGen: S.vfGen }, null, 1));
  log('done: ' + S.gen + ' generations; summary.json written');
})();
