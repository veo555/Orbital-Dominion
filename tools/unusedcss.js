#!/usr/bin/env node
/* Conservative unused-CSS finder (v5).
 *
 *   node tools/unusedcss.js            list style.css rules that cannot match anything
 *   node tools/unusedcss.js --json
 *
 * A class or id token of a selector is "possibly used" when the same word occurs ANYWHERE in src/body.html or src/js (as a whole word, in code,
 * strings or comments -- deliberately generous: classes are built from fragments like 'sl-'+x or classList.toggle(...)).  A selector (one entry
 * of a comma list) is dead when at least one of its class / id tokens is not possibly used; a rule is dead when all its selectors are dead.
 * Rules inside @media / @supports are inspected too; @keyframes names are reported when no `animation` value or JS string mentions them.
 * Nothing is changed: the output is a worklist, and every removal must be followed by the screenshot check (tools/shots.py) and tools/design_check.py.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
let hay = fs.readFileSync(path.join(ROOT, 'src', 'body.html'), 'utf8');
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'js'))) hay += '\n' + fs.readFileSync(path.join(ROOT, 'src', 'js', f), 'utf8');
const words = new Set(hay.match(/[A-Za-z_][\w-]*/g) || []);
// class attribute values built from fragments: also accept every prefix of a word that ends with '-' in the haystack ("sl-" + x)
const fragments = [...new Set(hay.match(/[A-Za-z][\w]*-(?=['"`+$])/g) || [])];
const used = (w) => words.has(w) || fragments.some(fr => w.startsWith(fr));

function strip(c) { return c.replace(/\/\*[\s\S]*?\*\//g, ''); }
const src = strip(css);
const rules = [];   // {sel, body, at}
(function walk(text, at) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i); if (open < 0) break;
    const head = text.slice(i, open).trim();
    let d = 1, j = open + 1;
    while (j < text.length && d > 0) { const c = text[j]; if (c === '"' || c === "'") { j++; while (j < text.length && text[j] !== c) { if (text[j] === '\\') j++; j++; } } else if (c === '{') d++; else if (c === '}') d--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, head);
    else if (head.startsWith('@keyframes') || head.startsWith('@-webkit-keyframes')) rules.push({ keyframes: head.split(/\s+/)[1], bytes: j - i, at });
    else if (head.startsWith('@')) { /* font-face, page ... */ }
    else rules.push({ sel: head, body, bytes: j - i, at });
    i = j;
  }
})(src, '');

const out = [];
for (const r of rules) {
  if (r.keyframes) { if (!words.has(r.keyframes)) out.push({ kind: 'keyframes', name: r.keyframes, bytes: r.bytes }); else if (!new RegExp('animation[^;{}]*\\b' + r.keyframes + '\\b').test(src) && !hay.includes(r.keyframes)) out.push({ kind: 'keyframes', name: r.keyframes, bytes: r.bytes }); continue; }
  const sels = r.sel.split(/,(?![^()]*\))/).map(s => s.trim()).filter(Boolean);
  let allDead = true; const why = [];
  for (const s of sels) {
    const toks = (s.replace(/\[[^\]]*\]/g, '').match(/[.#][A-Za-z_][\w-]*/g) || []).map(t => t.slice(1));
    const bad = toks.filter(t => !used(t));
    if (!bad.length) allDead = false; else why.push(...bad);
  }
  if (allDead && sels.length) out.push({ kind: 'rule', selector: r.sel.slice(0, 90), at: r.at, bytes: r.bytes, unused: [...new Set(why)] });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  for (const o of out) console.log((o.kind === 'rule' ? 'rule      ' : 'keyframes ') + String(o.bytes).padStart(6) + '  ' + (o.selector || o.name) + (o.unused ? '   <- unused: ' + o.unused.join(' ') : '') + (o.at ? '   [' + o.at.slice(0, 40) + ']' : ''));
  console.log('\n' + out.length + ' dead rules/keyframes, ' + out.reduce((a, o) => a + o.bytes, 0) + ' bytes of ' + css.length);
}
