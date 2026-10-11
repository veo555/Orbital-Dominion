#!/usr/bin/env node
/* Dead-code and size audit for src/js (v5).
 *
 *   node tools/deadcode.js            report: bytes per module (raw and minified) + top-level names that nothing references
 *   node tools/deadcode.js --json     machine-readable
 *   node tools/deadcode.js --sizes    only the size table
 *
 * Method: tools/minify.js's tokenizer (so comments and string contents are not counted as code) splits every module into tokens; the TOP-LEVEL
 * declarations (function / class / const / let / var, comma lists included) of each file are collected with their extent; every identifier
 * token anywhere in src/js is a reference to its name.  A name is DEAD when no identifier token outside its own declaration (and outside the
 * declarations of other dead names -- the fixpoint is computed) mentions it.  A dead name is shown with whether its text also occurs inside a
 * string literal (a dynamic lookup such as G['name'] or an inline handler), whether src/body.html or a test / tool mentions it, and whether it is
 * only kept alive by the window.__RTS export of 90_main.js.  The report is a worklist for a human: nothing is deleted automatically.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { tokenizeJS, minifyJS } = require('./minify.js');
const ROOT = path.resolve(__dirname, '..'), SRC = path.join(ROOT, 'src', 'js');

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
const text = {}, toks = {};
for (const f of files) { text[f] = fs.readFileSync(path.join(SRC, f), 'utf8'); toks[f] = tokenizeJS(text[f]); }

/* ---- sizes */
function sizes() {
  const rows = []; let tr = 0, tm = 0;
  for (const f of files) { const r = Buffer.byteLength(text[f]), m = Buffer.byteLength(minifyJS(text[f])); rows.push({ file: f, raw: r, min: m }); tr += r; tm += m; }
  rows.sort((a, b) => b.min - a.min);
  return { rows, raw: tr, min: tm };
}

/* ---- top-level declarations with extents (token index ranges) */
const DECL_KW = new Set(['function', 'class', 'const', 'let', 'var']);
function declarations(f) {
  const T = toks[f], out = [];
  let depth = 0;
  const open = '([{', close = ')]}';
  const endOfStatement = (i) => {   // index after the statement that starts at i (depth-aware, stops at ; or a newline before a new declaration keyword)
    let d = 0;
    for (let j = i; j < T.length; j++) {
      const t = T[j];
      if (t.type === 'punct') { if (open.includes(t.text)) d++; else if (close.includes(t.text)) { d--; if (d < 0) return j; } else if (t.text === ';' && d === 0) return j + 1; }
      if (d === 0 && j > i && t.nl && t.type === 'ident' && DECL_KW.has(t.text)) return j;
    }
    return T.length;
  };
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.type === 'punct') { if (open.includes(t.text)) depth++; else if (close.includes(t.text)) depth--; continue; }
    if (depth !== 0 || t.type !== 'ident' || !DECL_KW.has(t.text)) continue;
    if (t.text === 'function' || t.text === 'class') {
      let k = i + 1; if (T[k] && T[k].text === '*') k++;
      if (!T[k] || T[k].type !== 'ident') continue;
      // function expression statements at depth 0 are not declarations; a declaration starts a statement (previous token ; } { or nothing)
      const pv = T[i - 1]; if (pv && !(pv.type === 'punct' && (pv.text === ';' || pv.text === '}' || pv.text === '{')) && !t.nl) continue;
      let j = k + 1, d = 0, started = false;
      for (; j < T.length; j++) { const u = T[j]; if (u.type === 'punct') { if (u.text === '{') { d++; started = true; } else if (u.text === '}') { d--; if (started && d === 0) { j++; break; } } } }
      out.push({ name: T[k].text, file: f, kind: t.text, from: i, to: j, nameTok: k });
      i = j - 1; continue;
    }
    // const / let / var: one or more declarators separated by top-level commas
    const to = endOfStatement(i + 1);
    let j = i + 1, d = 0, expectName = true;
    for (; j < to; j++) {
      const u = T[j];
      if (u.type === 'punct') {
        if (open.includes(u.text)) { if (d === 0 && expectName && (u.text === '{' || u.text === '[')) { /* destructuring: names inside */ const names = []; let e = 0; for (let q = j; q < to; q++) { const w = T[q]; if (w.type === 'punct' && open.includes(w.text)) e++; else if (w.type === 'punct' && close.includes(w.text)) { e--; if (e === 0) { j = q; break; } } else if (w.type === 'ident' && e >= 1) names.push(q); } for (const q of names) out.push({ name: T[q].text, file: f, kind: t.text, from: i, to, nameTok: q, destructured: true }); expectName = false; continue; } d++; }
        else if (close.includes(u.text)) d--;
        else if (u.text === ',' && d === 0) expectName = true;
        continue;
      }
      if (u.type === 'ident' && d === 0 && expectName) { out.push({ name: u.text, file: f, kind: t.text, from: i, to, nameTok: j }); expectName = false; }
    }
    i = Math.max(i, to - 1);
  }
  return out;
}

const decls = []; for (const f of files) decls.push(...declarations(f));
const byName = new Map(); for (const d of decls) { (byName.get(d.name) || byName.set(d.name, []).get(d.name)).push(d); }

/* ---- reference counting.  refs[name] = list of {file, idx}; a reference inside the extent of a declaration of a dead name is ignored (fixpoint) */
const refsOf = new Map();
for (const f of files) toks[f].forEach((t, idx) => { if (t.type === 'ident') { let a = refsOf.get(t.text); if (!a) refsOf.set(t.text, a = []); a.push({ f, idx }); } });
const strRefs = new Map();
for (const f of files) for (const t of toks[f]) if (t.type === 'str' || t.type === 'tmpl') for (const w of (t.text.match(/[A-Za-z_$][\w$]*/g) || [])) strRefs.set(w, (strRefs.get(w) || 0) + 1);
const bodyHtml = fs.readFileSync(path.join(ROOT, 'src', 'body.html'), 'utf8');
function readTree(dir, exts) { const o = []; if (!fs.existsSync(dir)) return o; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'out' && e.name !== 'baseline') o.push(...readTree(p, exts)); } else if (exts.some(x => e.name.endsWith(x))) o.push(p); } return o; }
const outside = readTree(path.join(ROOT, 'tests'), ['.js', '.py', '.mjs']).concat(readTree(path.join(ROOT, 'tools'), ['.js', '.py', '.sh'])).map(p => fs.readFileSync(p, 'utf8')).join('\n');

const dead = new Set();
const inDeadDecl = (r) => { for (const d of byName.get(r.name) || []) { /* unused */ } return false; };
let changed = true;
const declRanges = decls.map(d => ({ d, f: d.file }));
function isInside(r, d) { return r.f === d.file && r.idx >= d.from && r.idx < d.to; }
while (changed) {
  changed = false;
  for (const [name, ds] of byName) {
    if (dead.has(name)) continue;
    const refs = refsOf.get(name) || [];
    let live = false;
    for (const r of refs) {
      // the declaring identifier itself, or any mention inside one of this name's own declarations or inside a declaration of an already-dead name
      if (ds.some(d => isInside(r, d))) continue;
      if (decls.some(d => dead.has(d.name) && isInside(r, d))) continue;
      live = true; break;
    }
    if (!live) { dead.add(name); changed = true; }
  }
}

function report() {
  const S = sizes(), rows = [];
  for (const name of dead) {
    for (const d of byName.get(name)) {
      const a = toks[d.file][d.from], b = toks[d.file][Math.max(d.from, d.to - 1)];
      const bytes = d.destructured ? 0 : Buffer.byteLength(toks[d.file].slice(d.from, d.to).map(t => t.text).join(' '));
      const re = new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '(?![\\w$])');
      rows.push({ name, file: d.file, kind: d.kind, bytes, inStrings: strRefs.get(name) || 0, inBody: re.test(bodyHtml), inTestsTools: re.test(outside),
        exportedToTests: new RegExp('__RTS[\\s\\S]{0,40000}?(?<![\\w$])' + name + '(?![\\w$])').test(text['90_main.js'] || '') });
    }
  }
  rows.sort((x, y) => y.bytes - x.bytes);
  return { sizes: S, dead: rows };
}

if (require.main === module) {
  const R = report();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(R, null, 1)); process.exit(0); }
  const pad = (s, n) => String(s).padEnd(n), num = (n) => String(n).padStart(9);
  console.log(pad('module', 34) + num('raw') + num('minified') + '   share');
  for (const r of R.sizes.rows) console.log(pad(r.file, 34) + num(r.raw) + num(r.min) + '   ' + (100 * r.min / R.sizes.min).toFixed(1) + ' %');
  console.log(pad('TOTAL js', 34) + num(R.sizes.raw) + num(R.sizes.min));
  if (process.argv.includes('--sizes')) process.exit(0);
  console.log('\nDEAD top-level names (no identifier token references them outside their own / other dead declarations): ' + R.dead.length);
  console.log(pad('name', 30) + pad('file', 26) + pad('kind', 9) + num('bytes') + '  str  body tests export');
  for (const r of R.dead) console.log(pad(r.name, 30) + pad(r.file, 26) + pad(r.kind, 9) + num(r.bytes) + '  ' + pad(r.inStrings, 4) + pad(r.inBody ? 'Y' : '-', 5) + pad(r.inTestsTools ? 'Y' : '-', 6) + (r.exportedToTests ? 'Y' : '-'));
  console.log('\ntotal dead bytes (approx, tokens joined by single spaces): ' + R.dead.reduce((a, r) => a + r.bytes, 0));
}
module.exports = { report, sizes };
