#!/usr/bin/env node
/* SAFE build-time minifier for Orbital Dominion (v5).  No dependencies.
 *
 *   node tools/minify.js js  <in.js>  [out.js]     minify JavaScript   (stdout when out is omitted)
 *   node tools/minify.js css <in.css> [out.css]    minify CSS
 *   require('./minify.js') -> { minifyJS, minifyCSS, tokenizeJS, sigTokens }
 *
 * What it does:  a real tokenizer (strings, template literals with nested ${ } expressions, regex literals vs division, numbers,
 * comments) removes comments and redundant whitespace / indentation.  What it deliberately does NOT do: rename or mangle ANY
 * identifier (window.__RTS hooks, tests and data tables keep working), reorder, fold or drop code.  The output has exactly the same
 * significant token stream as the input (tests/minify/minify_test.js asserts it on tricky inputs and on the whole game bundle).
 *
 * Newlines (ASI): a newline between two tokens is kept unless joining is provably safe.  It is joined only when
 *   - the previous token is one that can never end a statement/expression (an opening bracket, `;`, `{`, `,`, an operator, `=>`, `:`, `?`, ...)
 *     and is not one of the restricted productions, or
 *   - the next token can never start a statement/expression and so can never be the "offending token" of ASI (`)`, `]`, `}`, `,`, `;`, `:`, `?`, `.`,
 *     `=`, `=>`, `&&`, `||`, `*`, ... -- but NOT `(`, `[`, `` ` ``, `+`, `-`, `/`, `++`, `--`, `!`, `~`, which can continue or start a statement).
 *   `return\nx`, `a\n++b`, `}\n(function(){})()`, `x\n(y)` therefore keep their newline.
 * Regex vs division is decided from the previous significant token (after `)` `]` `}` an identifier or a literal: division; after
 * an operator, `(`, `,`, a keyword such as return/typeof/case...: regex).  The one construct this cannot see is `if(c) /re/.test(s)`
 * (a regex literal right after the `)` of an if/while/for head): the build asserts none exists (tests/minify/minify_test.js "ambiguity scan").
 */
'use strict';

const KW_REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const IDC = /[A-Za-z0-9_$\u0080-￿#\\]/;
const IDS = /[A-Za-z_$\u0080-￿#\\]/;
const NUM = /^(?:0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/;
const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];

function fail(src, i, msg) {
  const line = src.slice(0, i).split('\n').length;
  throw new Error('minify: ' + msg + ' at line ' + line);
}

/* tokenize src from i.  stopAtBrace: stop at the unmatched `}` (used for template ${ } expressions) and return {toks,end} with end = index of that `}` */
function scan(src, i, stopAtBrace) {
  const toks = [];
  let depth = 0, prev = null;   // prev: previous significant token
  const n = src.length;
  const push = (type, text, nl) => { const t = { type, text, nl: !!nl }; toks.push(t); if (type !== 'comment') prev = t; return t; };
  let pendingNl = false;
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.type === 'punct') return !(prev.text === ')' || prev.text === ']' || prev.text === '}' || prev.text === '++' || prev.text === '--');
    if (prev.type === 'ident') return KW_REGEX_AFTER.has(prev.text);
    return false;
  };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === ' ' || c === '﻿' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '\n' || c === ' ' || c === ' ') { pendingNl = true; i++; continue; }
    // comments
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2); if (e < 0) fail(src, i, 'unterminated comment');
      if (src.slice(i, e).indexOf('\n') >= 0) pendingNl = true;
      i = e + 2; continue;
    }
    const nl = pendingNl; pendingNl = false;
    // strings
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (src[j] === '\n') fail(src, i, 'newline in string'); j++; }
      if (j >= n) fail(src, i, 'unterminated string');
      push('str', src.slice(i, j + 1), nl); i = j + 1; continue;
    }
    // template literal (nested ${ } scanned with this same tokenizer so quotes / backticks / braces inside are handled)
    if (c === '`') {
      let j = i + 1;
      for (;;) {
        if (j >= n) fail(src, i, 'unterminated template');
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '`') { j++; break; }
        if (d === '$' && src[j + 1] === '{') { const r = scan(src, j + 2, true); j = r.end + 1; continue; }
        j++;
      }
      push('tmpl', src.slice(i, j), nl); i = j; continue;
    }
    // numbers
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const m = NUM.exec(src.slice(i, i + 80)); push('num', m[0], nl); i += m[0].length; continue;
    }
    // identifiers / keywords
    if (IDS.test(c)) {
      let j = i + 1; while (j < n && IDC.test(src[j])) j++;
      push('ident', src.slice(i, j), nl); i = j; continue;
    }
    // regex literal or division
    if (c === '/') {
      if (regexAllowed()) {
        let j = i + 1, cls = false;
        for (;;) {
          if (j >= n || src[j] === '\n') fail(src, i, 'unterminated regex');
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break;
          j++;
        }
        j++; while (j < n && /[A-Za-z]/.test(src[j])) j++;
        push('regex', src.slice(i, j), nl); i = j; continue;
      }
      if (src[i + 1] === '=') { push('punct', '/=', nl); i += 2; continue; }
      push('punct', '/', nl); i++; continue;
    }
    // punctuators
    if (c === '{') { depth++; push('punct', '{', nl); i++; continue; }
    if (c === '}') {
      if (stopAtBrace && depth === 0) return { toks, end: i };
      depth--; push('punct', '}', nl); i++; continue;
    }
    let p = null;
    for (const q of PUNCT) if (src.startsWith(q, i)) { p = q; break; }
    if (p === '?.' && src[i + 2] >= '0' && src[i + 2] <= '9') p = null;   // `a?.5:1` is a conditional
    if (p) { push('punct', p, nl); i += p.length; continue; }
    push('punct', c, nl); i++;
  }
  if (stopAtBrace) fail(src, i, 'unterminated template expression');
  return { toks, end: n };
}

function tokenizeJS(src) { return scan(src, 0, false).toks; }
/* the significant token stream: what must be identical before and after minification */
function sigTokens(src) { return tokenizeJS(src).map(t => t.text); }

// previous tokens after which a newline can never matter (the statement cannot end there)
const OPEN_PREV = new Set(['(', '[', '{', ',', ';', ':', '?', '=', '=>', '+', '-', '*', '/', '%', '<', '>', '&', '|', '^', '!', '~', '&&', '||', '??', '==', '!=', '===', '!==', '<=', '>=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '>>>', '<<=', '>>=', '>>>=', '**', '**=', '&&=', '||=', '??=', '...', '?.', '.']);
const KW_OPEN_PREV = new Set(['else', 'do', 'try', 'finally', 'typeof', 'void', 'delete', 'new', 'in', 'instanceof', 'of', 'case', 'extends']);
// next tokens that can never start a statement or an expression, so ASI never has to put a `;` before them
const SAFE_NEXT = new Set([')', ']', '}', ',', ';', ':', '?', '.', '?.', '=', '=>', '&&', '||', '??', '*', '%', '<', '>', '==', '!=', '===', '!==', '<=', '>=', '&', '|', '^', '<<', '>>', '>>>', '**',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '**=', '&&=', '||=', '??=']);

function wordish(t) { return t.type === 'ident' || t.type === 'num'; }
function startsWordChar(t) { return t.type === 'ident' || t.type === 'num' || (t.type === 'punct' && t.text === '.' ); }

function minifyJS(src) {
  const toks = tokenizeJS(src);
  const out = [];
  let prev = null, pp = null;
  for (const t of toks) {
    if (prev) {
      let sep = '';
      // a separator is needed where two tokens would otherwise fuse into one (or change meaning)
      if (wordish(prev) && wordish(t)) sep = ' ';
      else if (prev.type === 'num' && t.type === 'punct' && t.text === '.' && /^\d+$/.test(prev.text)) sep = ' ';        // 1 .toString()
      else if (prev.type === 'punct' && prev.text === '?' && t.type === 'num' && t.text[0] === '.') sep = ' ';            // a ? .5 : 1  must not become ?.
      else if (prev.type === 'punct' && t.type === 'punct') {
        const a = prev.text[prev.text.length - 1], b = t.text[0];
        if ((a === '+' && b === '+') || (a === '-' && b === '-') || (a === '/' && (b === '/' || b === '*'))) sep = ' ';   // a+ +b  a- -b  a/ /re/
      } else if (prev.type === 'punct' && prev.text === '/' && t.type === 'regex') sep = ' ';
      else if (prev.type === 'regex' && t.type === 'ident') sep = ' ';                                                    // /x/ in y: the flags must not swallow `in`
      if (t.nl) {
        // a newline is only dropped when provably harmless (see the header)
        const afterDot = pp && pp.type === 'punct' && (pp.text === '.' || pp.text === '?.');
        let join = false;
        if (prev.type === 'punct' && OPEN_PREV.has(prev.text)) join = true;
        else if (prev.type === 'ident' && KW_OPEN_PREV.has(prev.text) && !afterDot) join = true;
        else if (t.type === 'punct' && SAFE_NEXT.has(t.text)) join = true;
        if (!join) sep = '\n';
      }
      if (sep) out.push(sep);
    }
    out.push(t.text);
    pp = prev; prev = t;
  }
  return out.join('');
}

/* ---------------------------------------------------------------- CSS */
function minifyCSS(src) {
  // pass 1: copy while dropping comments; strings and url(...) bodies are kept verbatim
  let o = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) fail(src, i, 'unterminated CSS comment'); i = e + 2; o += ' '; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      o += src.slice(i, j + 1); i = j + 1; continue;
    }
    if ((c === 'u' || c === 'U') && /^url\(/i.test(src.slice(i, i + 4))) {
      let j = i + 4; while (src[j] === ' ') j++;
      if (src[j] === '"' || src[j] === "'") { o += src.slice(i, j); i = j; continue; }   // quoted: the string branch handles it
      const e = src.indexOf(')', j); if (e < 0) fail(src, i, 'unterminated url()');
      o += 'url(' + src.slice(j, e).trim() + ')'; i = e + 1; continue;
    }
    o += c; i++;
  }
  // pass 2: collapse whitespace outside strings / url(), drop the spaces that are never significant, and the `;` before `}`
  let r = '', k = 0, par = 0; const m = o.length;
  while (k < m) {
    const c = o[k];
    if (c === '"' || c === "'") { let j = k + 1; while (j < m && o[j] !== c) { if (o[j] === '\\') j++; j++; } r += o.slice(k, j + 1); k = j + 1; continue; }
    if ((c === 'u' || c === 'U') && /^url\(/i.test(o.slice(k, k + 4)) && o[k + 4] !== '"' && o[k + 4] !== "'") { const e = o.indexOf(')', k); r += o.slice(k, e + 1); k = e + 1; continue; }
    if (/\s/.test(c)) {
      let j = k; while (j < m && /\s/.test(o[j])) j++;
      const a = r[r.length - 1], b = o[j];
      // never significant: at the edges, around { } ; , and after `:` or `(`, before `)`, and around the child combinator `>` outside parentheses
      const drop = !a || !b || '{};,:('.includes(a) || '{};,)'.includes(b) || (par === 0 && (a === '>' || b === '>'));
      if (!drop) r += ' ';
      k = j; continue;
    }
    if (c === '(') par++; else if (c === ')') par = Math.max(0, par - 1);
    if (c === '}' && r[r.length - 1] === ';') r = r.slice(0, -1);
    r += c; k++;
  }
  return r.trim();
}

module.exports = { minifyJS, minifyCSS, tokenizeJS, sigTokens };

if (require.main === module) {
  const [kind, inp, outp] = process.argv.slice(2);
  if (!kind || !inp) { console.error('usage: node tools/minify.js js|css <in> [out]'); process.exit(2); }
  const src = require('fs').readFileSync(inp === '-' ? 0 : inp, 'utf8');   // '-' = stdin
  const res = kind === 'css' ? minifyCSS(src) : minifyJS(src);
  if (outp) require('fs').writeFileSync(outp, res); else process.stdout.write(res);
}
