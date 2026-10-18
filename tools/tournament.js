#!/usr/bin/env node
/* One-command agent tournament: every ordered pair of tiers plays N replay-enabled games (sides and factions rotate); prints a Markdown report
   (score of each pair with a 95 % Wilson interval, Bradley-Terry Elo anchored at the lowest tier = 1000) and writes games.csv / report.md / report.json.
   Every game row carries its REPLAY CODE: paste it into "Watch agents" in the game (or `replayParse` in the sim) to see exactly that match.

     node tools/tournament.js                                   master hard normal, 4 games per ordered pair, 480 s cap  (~10 min)
     node tools/tournament.js --tiers hard,normal --games 6 --cap 420 --seed0 5000 --out tests/out/tournament
     node tools/tournament.js --quick                           2 tiers x 2 games x 240 s: a smoke run (about a minute)

   Draw rule at the cap = tools/league/game.js: material share > 0.6 wins, < 0.4 loses, else half a point.  Bot-vs-bot Elo is NOT human Elo, and a few
   games give wide intervals (24 games per pair is about +-0.2 on the score): read the intervals, not the point estimates. */
'use strict';
const fs = require('fs'), path = require('path');
const load = require(path.join(__dirname, '..', 'tests', 'sim', 'simlib3.js'));
const { wilson, eloOf, bradleyTerry } = require('./league/stats.js');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const QUICK = process.argv.includes('--quick');
const TIERS = String(arg('tiers', QUICK ? 'hard,normal' : 'master,hard,normal')).split(',');
const GAMES = +arg('games', QUICK ? 2 : 4), CAP = +arg('cap', QUICK ? 240 : 480), SEED0 = +arg('seed0', 1000);
const OUT = String(arg('out', path.join('tests', 'out', 'tournament')));
const FACT = ['meridian', 'obsidian', 'aurora'];
const S = load();
const rng = (seed) => { let s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
function score(t) { return S.__run(`(function(t){let s=0;const G0=G,T=G0.teams[t];
  for(const u of G0.units)if(!u.dead&&u.team===t){const d=u.def;s+=d.worker?50:(d.cost?d.cost.c+d.cost.e:0)*Math.max(0.2,u.hp/u.maxhp);}
  for(const b of G0.buildings)if(!b.dead&&b.team===t){const d=b.def;s+=(d.cost.c+d.cost.e)*(b.done?1:b.prog)*Math.max(0.3,b.hp/b.maxhp);}
  return s+0.3*(T.c+T.e)+200*(T.era-1);})(${t})`); }
function play(a, b, k, seed) {
  const f0 = FACT[k % 3], f1 = FACT[(k + 1 + (((k / 3) | 0) % 2)) % 3];
  S.sandbox.Math.random = rng(seed * 31 + 7);
  S.newGame({ replay: true, aiBoth: true, seed, faction: f0, enemy: f1, diff: a, diffs: [a, b], mapFx: true });
  const G = S.G; for (let i = 0; i < CAP * 30; i++) { S.step(); if (G.over) break; }
  let r, adj = false; const s0 = score(0), s1 = score(1), sh = s0 / Math.max(1, s0 + s1);
  if (G.over) r = G.over === 'victory' ? 1 : G.over === 'defeat' ? 0 : 0.5; else { adj = true; r = sh > 0.6 ? 1 : sh < 0.4 ? 0 : 0.5; }
  return { a, b, f0, f1, seed, r, adj, t: Math.round(G.time), share: +sh.toFixed(3), code: S.__run('replayCode()'), hash: S.__run('replayHash()') };
}
const rows = []; let n = 0; const total = TIERS.length * (TIERS.length - 1) * GAMES, t0 = Date.now();
for (const a of TIERS) for (const b of TIERS) { if (a === b) continue;
  for (let k = 0; k < GAMES; k++) { const g = play(a, b, k, SEED0 + n++); rows.push(g); process.stderr.write(`[${rows.length}/${total}] ${a} vs ${b} ${g.f0}/${g.f1} -> ${g.r}${g.adj ? ' (adjudicated)' : ''} ${g.code}\n`); } }
/* report */
const pairs = []; for (let i = 0; i < TIERS.length; i++) for (let j = i + 1; j < TIERS.length; j++) {
  const X = TIERS[i], Y = TIERS[j]; let k = 0, m = 0, adj = 0;
  for (const g of rows) { if (g.a === X && g.b === Y) { k += g.r; m++; adj += g.adj; } else if (g.a === Y && g.b === X) { k += 1 - g.r; m++; adj += g.adj; } }
  const ci = wilson(k, m); pairs.push({ X, Y, n: m, score: m ? k / m : 0.5, lo: ci[0], hi: ci[1], adjudicated: adj }); }
const bt = bradleyTerry(TIERS, rows.map(g => ({ a: g.a, b: g.b, s: g.r })), TIERS[TIERS.length - 1], 1000);
const pct = x => (100 * x).toFixed(1) + ' %';
let md = `# Tournament report\n\nTiers ${TIERS.join(', ')}; ${GAMES} games per ordered pair (sides and factions rotate), cap ${CAP} s, seeds from ${SEED0}; ${rows.length} games in ${((Date.now() - t0) / 60000).toFixed(1)} min.\n\n`;
md += '| pair | games | score of first | 95 % interval | adjudicated at cap |\n|---|---|---|---|---|\n';
for (const p of pairs) md += `| ${p.X} vs ${p.Y} | ${p.n} | ${pct(p.score)} | [${pct(p.lo)}, ${pct(p.hi)}] | ${p.adjudicated} |\n`;
md += '\n| tier | Bradley-Terry Elo (anchor: ' + TIERS[TIERS.length - 1] + ' = 1000) |\n|---|---|\n';
for (const t of TIERS) md += `| ${t} | ${Math.round(bt[t] !== undefined ? bt[t] : (bt.ratings && bt.ratings[t]) || 1000)} |\n`;
md += '\nA pair whose interval contains 50 % is **not separated** by these games. Bot-vs-bot Elo is not human Elo. Replay codes for every game are in games.csv.\n';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'games.csv'), 'tierA,tierB,factionA,factionB,seed,result_for_A,adjudicated,game_seconds,material_share_A,replay_code,final_state_hash\n' + rows.map(g => [g.a, g.b, g.f0, g.f1, g.seed, g.r, g.adj ? 1 : 0, g.t, g.share, g.code, g.hash].join(',')).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'report.md'), md); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ tiers: TIERS, games: GAMES, cap: CAP, seed0: SEED0, pairs, elo: bt, rows }, null, 1));
console.log(md); console.log('written to ' + OUT);
