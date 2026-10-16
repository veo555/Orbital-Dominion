/* Tests of the macro planner (src/js/41_ai_mcts.js) and of expert iteration (tools/league/expit_fit.js). Headless, deterministic.
     node tests/sim/ai_mcts.js [--quick]
   1. PUCT on toy trees with a known optimum: a misleading prior must not stop the search from finding the best line; with a correct prior
      a small budget must concentrate on it. CONTROLS (rule 15): copies of 41_ai_mcts.js with the exploration term removed and with its
      sign flipped must each fail one of these checks.
   2. POLICY IMPROVEMENT on random toy MDPs: the visit distribution pi is better than the prior P (E_pi[Q*] > E_P[Q*]) and improves with
      the budget (AlphaGo Zero's "MCTS as a policy-improvement operator").
   3. ABSTRACT MODEL invariants: income integration, economy vs army trade-off, Lanchester symmetry, retreat rule, Dirichlet noise.
   4. ABSTRACT MODEL CALIBRATION against the real sim (2 real games): 60/120-s-ahead predictions beat persistence; CONTROL: a broken model
      (no income) does not.
   5. EXPERT ITERATION: the policy-head fit recovers a planted head (KL falls, agreement rises); the promotion gate (>= 55 % over >= 24 games).
   6. PLANNER IN THE AGENT: deterministic (same seed -> same decisions), state is plain data that survives snapshot/restore, time slicing
      bounds the work per think. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { sim, makeAgent } = require(path.join(__dirname, '..', '..', 'tools', 'league', 'game.js'));
const XF = require(path.join(__dirname, '..', '..', 'tools', 'league', 'expit_fit.js'));
const QUICK = process.argv.includes('--quick');
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FAIL  ') + m); if (!c) fails++; };
const SRC = path.join(__dirname, '..', '..', 'src', 'js');
function mutatedTree(file, edits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-mcts-mut-'));
  for (const f of fs.readdirSync(SRC)) if (/^(00|05|06|10|20|25|26|27|30|31|32|33|40|41|42|43|44|45|46)_/.test(f)) {
    let t = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (f === file) for (const [a, b] of edits) { if (!t.includes(a)) throw new Error('mutation anchor not found: ' + a.slice(0, 60)); t = t.replace(a, b); }
    fs.writeFileSync(path.join(dir, f), t);
  }
  return dir;
}
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------------------------------------------------------------- 1. PUCT on toy trees */
/* a tree as nested arrays: a number is a terminal value in [0,1]; an array is a node whose entries are its children */
function treeEnv(S, tree, prior) {
  const F64 = S.__run('Float64Array');
  return { na: 3, prior: (s) => { const p = new F64(3); const q = prior(s); for (let i = 0; i < 3; i++) p[i] = q[i]; return p; },
    step: (s, a) => s.node[a] === undefined ? { node: 0 } : { node: s.node[a], path: (s.path || '') + a },
    terminal: (s) => typeof s.node === 'number', value: (s) => typeof s.node === 'number' ? s.node : 0.5 };
}
/* misleading prior: the prior loves action 0, the optimum is 2 -> 1 (value 0.95) */
const TRAP = [[0.55, 0.45, 0.5], [0.4, 0.1, 0.2], [0.1, 0.95, 0.2]];
const LIAR = (s) => s.path === undefined ? [0.7, 0.25, 0.05] : [0.6, 0.3, 0.1];
/* a correct prior on a shallow tree where the best action is only slightly better: the prior must focus a small budget on it */
const NEEDLE = [0.62, 0.5, 0.48];
const TRUTH = () => [0.8, 0.1, 0.1];
function puctChecks(src, label) {
  const S = sim(src), search = S.__run('puctSearch'), res = {};
  { const env = treeEnv(S, TRAP, LIAR), r = search(env, { node: TRAP }, 800, 1.5, mulberry(1), 4); const N = Array.from(r.N);
    res.trap = N.indexOf(Math.max(...N)) === 2; res.trapN = N; }
  { const env = treeEnv(S, NEEDLE, TRUTH), r = search(env, { node: NEEDLE }, 40, 1.5, mulberry(2), 2); const N = Array.from(r.N);
    res.needle = N[0] / 40 > 0.5; res.needleN = N; }
  return res;
}
{
  const r = puctChecks(undefined, 'real');
  ok(r.trap, `PUCT finds the optimum under a misleading prior (prior 70 % on a 0.55 line; root visits ${r.trapN.join('/')} -> action 2, value 0.95)`);
  ok(r.needle, `PUCT focuses a 40-simulation budget on the best action when the prior is right (visits ${r.needleN.join('/')})`);
  const muts = [['exploration term removed', [['sc=q+c*P[a]*sq/(1+N[a])', 'sc=q']]], ['exploration sign flipped', [['sc=q+c*P[a]*sq/(1+N[a])', 'sc=q-c*P[a]*sq/(1+N[a])']]]];
  for (const [name, ed] of muts) {
    const d = mutatedTree('41_ai_mcts.js', ed);
    try { const m = puctChecks(d, name); ok(!(m.trap && m.needle), `CONTROL: PUCT with the ${name} fails a toy-tree check (trap ${m.trap ? 'pass' : 'FAIL'} ${m.trapN.join('/')}, needle ${m.needle ? 'pass' : 'FAIL'} ${m.needleN.join('/')})`); }
    finally { fs.rmSync(d, { recursive: true, force: true }); }
  }
}

/* ---------------------------------------------------------------- 2. policy improvement on random MDPs */
{
  const S = sim(), search = S.__run('puctSearch'), F64 = S.__run('Float64Array');
  const B = 4, D = 3, nT = QUICK ? 40 : 100; let better = 0, sumP = 0, sumPi = 0, sumPi2 = 0;
  for (let k = 0; k < nT; k++) {
    const r = mulberry(100 + k), leaves = {};
    const leaf = (p) => leaves[p] === undefined ? (leaves[p] = r()) : leaves[p];
    const qstar = (p, d) => d === D ? leaf(p) : Math.max(...[0, 1, 2, 3].map(a => qstar(p + a, d + 1)));
    const Q = [0, 1, 2, 3].map(a => qstar('' + a, 1));
    const noisy = (p, d) => { const z = [0, 1, 2, 3].map(a => (d + 1 === D ? leaf(p + a) : qstar(p + a, d + 1)) * 3 + 2.0 * (mulberry(7 + p.length * 31 + k)() - 0.5) + (a === 0 ? 0.6 : 0)); const m = Math.max(...z), e = z.map(x => Math.exp(x - m)), s = e.reduce((a, b) => a + b); return e.map(x => x / s); };
    const env = { na: B, prior: (s) => F64.from(noisy(s.p, s.d)), step: (s, a) => ({ p: s.p + a, d: s.d + 1 }), terminal: (s) => s.d >= D, value: (s) => leaf(s.p) };
    const P = noisy('', 0), root = search(env, { p: '', d: 0 }, 200, 1.5, mulberry(k), D), N = Array.from(root.N), tot = N.reduce((a, b) => a + b);
    const root2 = search(env, { p: '', d: 0 }, 30, 1.5, mulberry(k), D), N2 = Array.from(root2.N), tot2 = N2.reduce((a, b) => a + b);
    const eP = P.reduce((s, p, a) => s + p * Q[a], 0), ePi = N.reduce((s, n, a) => s + n / tot * Q[a], 0), ePi2 = N2.reduce((s, n, a) => s + n / tot2 * Q[a], 0);
    if (ePi >= eP - 1e-9) better++; sumP += eP; sumPi += ePi; sumPi2 += ePi2;
  }
  ok(better >= 0.9 * nT && sumPi > sumP, `policy improvement: E_pi[Q*] >= E_P[Q*] in ${better}/${nT} random MDPs (mean ${(sumP / nT).toFixed(3)} prior -> ${(sumPi2 / nT).toFixed(3)} with 30 simulations -> ${(sumPi / nT).toFixed(3)} with 200)`);
  ok(sumPi > sumPi2, 'policy improvement grows with the search budget (200 vs 30 simulations)');
}

/* ---------------------------------------------------------------- 3. abstract model invariants */
{
  const S = sim(), run = S.__run;
  const r = JSON.parse(run(`(()=>{const K=plK(),N=PS_N;const mk=()=>{const s=new Float64Array(PS_LEN);for(const o of[0,N]){s[o+PS_W]=16;s[o+PS_H]=1;s[o+PS_SIP]=1;s[o+PS_P]=2;s[o+PS_ERA]=1;s[o+PS_D]=0.187;s[o+PS_HP]=1.1;s[o+PS_ST]=1000;s[o+PS_WMX]=36;s[o+PS_A]=300;s[o+PS_C]=200;}s[PS_T]=120;return s;};
    const out={};
    {const s=mk();const c0=s[PS_C];plIncome(s,0,K,10);out.inc=(s[PS_C]-c0)/10;out.incExp=Math.min(16-Math.min(16*0.3,3),16)*1.6333*K.inc;}
    {const g=mk(),m=mk();for(let i=0;i<6;i++){plStep(g,PA_GROW,PA_GROW,K,20);plStep(m,PA_MASS,PA_GROW,K,20);}out.growW=g[PS_W];out.massW=m[PS_W];out.growA=g[PS_A];out.massA=m[PS_A];}
    {const s=mk();s[PS_LOC]=1;s[PS_TRV]=0;s[N+PS_LOC]=1;s[N+PS_TRV]=0;plFight(s,0,N,K,10,false);out.symA=s[PS_A];out.symB=s[N+PS_A];}
    {const s=mk();s[PS_A]=900;s[PS_A0]=900;s[N+PS_A]=300;s[PS_LOC]=1;s[PS_TRV]=0;for(let i=0;i<3;i++)plStep(s,PA_ATTACK,PA_DEFEND,K,20);out.bigWins=s[PS_A]>s[N+PS_A];out.defW=s[N+PS_W];}
    {const s=mk();s[PS_A]=200;s[PS_A0]=200;s[N+PS_A]=2000;s[PS_LOC]=1;s[PS_TRV]=0;plStep(s,PA_ATTACK,PA_GROW,K,20);out.retreats=s[PS_LOC]===0;}
    {const P=new Float64Array([0.5,0.2,0.1,0.1,0.05,0.05,0]);let st={rs:3};plDirichlet(P,0.3,0.25,()=>airand(st));let S=0;for(const x of P)S+=x;out.dirSum=S;out.dirZero=P[6];}
    {const s=mk();const m=plLegal(s,0);out.legalHarassNoFast=m[PA_HARASS];s[PS_FST]=0.8;s[PS_A]=600;out.legalHarassFast=plLegal(s,0)[PA_HARASS];}
    return JSON.stringify(out);})()`));
  ok(Math.abs(r.inc - r.incExp) < 1e-6, `model: crystal income of 16 workers on one base = ${r.inc.toFixed(2)}/s (IFD curve x calibrated factor)`);
  ok(r.growW > r.massW && r.massA > r.growA, `model: 'grow' builds more workers (${r.growW.toFixed(1)} vs ${r.massW.toFixed(1)}), 'mass' more army (${r.massA.toFixed(0)} vs ${r.growA.toFixed(0)}) over 120 s`);
  ok(Math.abs(r.symA - r.symB) < 1e-9 && r.symA < 300, `model: a symmetric field battle is symmetric (${r.symA.toFixed(2)} / ${r.symB.toFixed(2)} left of 300)`);
  ok(r.bigWins && r.defW < 16, `model: a 3:1 attack wins and raids the defender's workers (${r.defW.toFixed(1)} of 16 left)`);
  ok(r.retreats, 'model: a hopeless attack retreats (the real agent\'s retreat rule)');
  ok(Math.abs(r.dirSum - 1) < 1e-9 && r.dirZero === 0, `Dirichlet root noise keeps a distribution (sum ${r.dirSum.toFixed(12)}) and illegal actions at 0`);
  ok(r.legalHarassNoFast === 0 && r.legalHarassFast === 1, 'model: a raid is legal only with fast units (as in the real agent)');
}

/* ---------------------------------------------------------------- 4. calibration against the real sim */
{
  const cal = path.join(__dirname, '..', '..', 'tools', 'league', 'calib_model.js');
  const out = path.join(os.tmpdir(), 'od-calib-' + process.pid + '.json');
  const cp = require('child_process');
  const txt = cp.execFileSync(process.execPath, [cal, '--games', QUICK ? '2' : '4', '--seed0', '43001', '--cap', '480', '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000 });
  const m = txt.match(/current constants, all games: (\{.*\})/); const R = JSON.parse(m[1]);
  for (const h of ['60', '120']) ok(R[h].loss < R[h].lossBase && R[h].W < R[h].W_base && R[h].ST < R[h].ST_base, `calibration ${h} s ahead (real games, fresh seeds): normalised error ${R[h].loss} < persistence ${R[h].lossBase}; workers ${R[h].W} vs ${R[h].W_base}, structures ${R[h].ST} vs ${R[h].ST_base}, share ${R[h].share} vs ${R[h].share_base}`);
  // CONTROL: the same check on a vacuous model (a step that changes nothing = persistence) must fail
  const d = mutatedTree('41_ai_mcts.js', [['function plStep(s,a0,a1,K,dt){', 'function plStep(s,a0,a1,K,dt){return;']]);
  try { const t2 = cp.execFileSync(process.execPath, [cal, '--load', out], { encoding: 'utf8', env: Object.assign({}, process.env, { OD_SRC: d }), stdio: ['ignore', 'pipe', 'ignore'] });
    const R2 = JSON.parse(t2.match(/current constants, all games: (\{.*\})/)[1]);
    ok(!(R2['120'].loss < R2['120'].lossBase && R2['120'].W < R2['120'].W_base && R2['120'].ST < R2['120'].ST_base), `CONTROL: a model that predicts no change fails the calibration check (120 s: ${R2['120'].loss} vs persistence ${R2['120'].lossBase})`); }
  finally { fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(out, { force: true }); }
}

/* ---------------------------------------------------------------- 5. expert iteration: head fit and gate */
{
  const r = mulberry(5), planted = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => (r() - 0.5) * 1.2)), samples = [];
  for (let i = 0; i < 1500; i++) {
    const x = [1].concat(Array.from({ length: 11 }, () => (r() - 0.5) * 2)), u = Array.from({ length: 7 }, () => (r() - 0.5) * 2), m = [1, 1, 1, 1, r() < 0.7 ? 1 : 0, 1, r() < 0.5 ? 1 : 0];
    const pi = Array.from(XF.probs(u, x, m, planted, new Float64Array(7)));
    samples.push({ x, u, m, pi });
  }
  const tr = samples.slice(0, 1200), te = samples.slice(1200), f = XF.fitHead(tr, { iters: 400, l2: 1e-5 });
  const k0 = XF.klLoss(te, null), k1 = XF.klLoss(te, f.phi), a0 = XF.agreement(te, null), a1 = XF.agreement(te, f.phi);
  ok(k1 < 0.1 * k0 && a1 > a0 && a1 > 0.9, `policy-head fit recovers a planted head: held-out KL(pi||p) ${k0.toFixed(4)} -> ${k1.toFixed(4)}, top-1 agreement ${(100 * a0).toFixed(0)} % -> ${(100 * a1).toFixed(0)} %`);
  ok(XF.gate(14, 24) && !XF.gate(13, 24) && !XF.gate(20, 22) && XF.gate(18, 32), 'gate: promote iff >= 24 games and score >= 55 % (14/24 yes, 13/24 no, 20/22 too few games, 18/32 yes)');
}

/* ---------------------------------------------------------------- 6. planner inside the agent */
{
  const spec = { kind: 't2', tier: 'master', cfg: { plan: { sims: 128, K: 4, slices: 4, c: 1.5, lam: 0.5, margin: 0.03 } } };
  const runOnce = (snapAt) => { const S = sim(); let st = 77; S.sandbox.Math.random = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    S.newGame({ seed: 36, faction: 'obsidian', enemy: 'aurora', diff: 'normal', aiBoth: true }); S.G.ais[0] = makeAgent(S, spec, 0); S.G.ais[1] = makeAgent(S, { kind: 't2', tier: 'hard' }, 1);
    let snap = null, stSave = 0, plA = null; for (let i = 0; i < (QUICK ? 200 : 300) * 30; i++) { S.step(); if (i === snapAt) { snap = S.gameSnapshot(); stSave = st; plA = JSON.stringify(S.G.ais[0].pl); } }
    return { S, pl: JSON.stringify(S.G.ais[0].pl), n: S.G.ais[0].pl.n, snap, stSave, plA, setSt: (v) => { st = v; } }; };
  const a = runOnce(-1), b = runOnce(3000);
  ok(a.n > 20 && a.pl === b.pl, `planner: ${a.n} decisions, identical planner state in two runs with the same seed (deterministic, no Math.random / wall clock)`);
  const plain = JSON.parse(a.pl); ok(Array.isArray(plain.root) && Array.isArray(plain.N) && typeof plain.rs === 'number', 'planner state is plain JSON data (root state, visit counts, rng state)');
  // snapshot at tick 3000 -> restore -> continue: same planner state at the end as the uninterrupted run
  b.setSt(b.stSave); b.S.gameRestore(b.snap);
  ok(JSON.stringify(b.S.G.ais[0].pl) === b.plA, 'save: the planner state restores exactly');
  for (let i = 3001; i < (QUICK ? 200 : 300) * 30; i++) b.S.step();
  ok(JSON.stringify(b.S.G.ais[0].pl) === a.pl, 'save: after restore the planner makes the same decisions as without the round trip');
  const src = fs.readFileSync(path.join(SRC, '41_ai_mcts.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/Math\.random|Date\.|performance\.now/.test(src), '41_ai_mcts.js uses no Math.random, Date or performance.now');
}
console.log(fails ? `\n${fails} PLANNER CHECK(S) FAILED` : '\nALL PLANNER CHECKS PASSED'); process.exit(fails ? 1 : 0);
