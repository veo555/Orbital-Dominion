#!/usr/bin/env node
/* Summarise a league checkpoint: node tools/league/summarize.js [dir=tests/out/league]  -> prints tables, writes <dir>/summary.json */
'use strict';
const fs = require('fs'), path = require('path'), { bradleyTerry, mean } = require('./stats.js');
const dir = process.argv[2] || path.join(__dirname, '..', '..', 'tests', 'out', 'league');
const S = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
const names = [...new Set(S.games.flatMap(x => [x.a, x.b]))], elo = bradleyTerry(names, S.games, 'v3-hard', 1000);
const games = fs.readFileSync(path.join(dir, 'games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
console.log(`generations ${S.gen}, elapsed ${Math.round((S.elapsed || 0) / 60000)} min, games ${games.length}, adjudicated ${(100 * mean(games.map(g => g.adj ? 1 : 0))).toFixed(0)}%, mean length ${mean(games.map(g => g.t)).toFixed(0)} s, value function trained at gen ${S.vfGen}`);
console.log('gen | fitM best | fitM mean | sigmaM | fitE | fitL | M opp (PFSP) | BT Elo M@g');
for (const h of S.hist) console.log(`${h.gen} | ${h.fitM.best.toFixed(3)} | ${h.fitM.mean.toFixed(3)} | ${h.sigmaM.toFixed(3)} | ${h.fitE.toFixed(3)} | ${h.fitL.toFixed(3)} | ${h.oppM} | ${elo['M@' + h.gen]}`);
// rating games of M means vs v3-hard per block of 5 generations
const rv = games.filter(g => g.opt === 'R' && g.B === 'v3-hard'), blocks = {};
for (const g of rv) { const b = Math.floor((g.gen - 1) / 5); (blocks[b] || (blocks[b] = [])).push(g.s); }
console.log('M mean vs v3-hard (rating games): ' + Object.entries(blocks).map(([b, a]) => `gens ${b * 5 + 1}-${b * 5 + 5}: ${(100 * mean(a)).toFixed(0)}% of ${a.length}`).join('; '));
console.log('pool: ' + S.pool.map(p => p.name + (p.exploiter ? '(' + p.exploiter + ')' : '')).join(', '));
const pe = Object.entries(elo).filter(([k]) => S.pool.some(p => p.name === k)).sort((a, b) => b[1] - a[1]);
console.log('BT Elo of pool members (v3-hard = 1000): ' + pe.map(([k, v]) => k + ' ' + v).join(', '));
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ gens: S.gen, elapsedMin: Math.round((S.elapsed || 0) / 60000), finalMean: S.M.es.m, sigma: S.M.es.sigma, pool: S.pool.map(p => ({ name: p.name, born: p.born, exploiter: p.exploiter || null, theta: p.spec.theta || null })), elo, hist: S.hist, vfGen: S.vfGen, nGames: games.length }, null, 1));
