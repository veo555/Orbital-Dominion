/* A tiny process pool (child_process.fork) for headless games. At most `n` workers (default 3: the machine is shared).
     const P = pool(3); const results = await P.map(jobs);  P.close();
   A job is the argument object of playGame (game.js); a result is its return value plus {job}. Workers are long-lived and reuse one
   loaded simulation per source tree; every game pins its own Math.random stream, so results do not depend on scheduling. */
'use strict';
const cp = require('child_process'), path = require('path');
if (process.env.__LEAGUE_WORKER) {
  const { playGame } = require('./game.js');
  process.on('message', (m) => {
    let r; try { r = playGame(m.job); } catch (e) { r = { error: String(e && e.stack || e).slice(0, 400) }; }
    process.send({ id: m.id, r });
  });
} else {
  module.exports = function pool(n) {
    n = Math.max(1, Math.min(n || 3, 3));
    const W = [], waiting = new Map(); let nextId = 1, queue = [];
    const pump = (w) => { if (w.busy || !queue.length) return; const j = queue.shift(); w.busy = j.id; w.proc.send({ id: j.id, job: j.job }); };
    for (let i = 0; i < n; i++) {
      const proc = cp.fork(__filename, [], { env: Object.assign({}, process.env, { __LEAGUE_WORKER: '1' }), execArgv: ['--max-semi-space-size=64'] });
      const w = { proc, busy: 0 }; W.push(w);
      proc.on('message', (m) => { const cb = waiting.get(m.id); waiting.delete(m.id); w.busy = 0; pump(w); if (cb) cb(m.r); });
    }
    function run(job) { return new Promise((res) => { const id = nextId++; waiting.set(id, (r) => res(Object.assign(r || {}, { job }))); queue.push({ id, job }); for (const w of W) pump(w); }); }
    return { run, map: (jobs) => Promise.all(jobs.map(run)), close: () => { for (const w of W) w.proc.kill(); } };
  };
}
