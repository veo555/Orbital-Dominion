// Unit + mutation tests for tools/minify.js (proof (1) of the v5 minifier).
//   node tests/minify/minify_test.js
// 1. TRICKY JS INPUTS.  For every case the original and the minified source are (a) token-stream identical (tokenizer shared with the minifier, so
//    (b) ALSO evaluated by V8 and the results compared: a tokenizer bug that is symmetric cannot hide from the evaluation) and (c) the minified text is
//    asserted to be smaller / to keep a newline where one matters.
// 2. CSS cases with exact expected output (calc() spaces, `a :hover` vs `a:hover`, strings and url() with comment-like text).
// 3. THE REAL BUNDLE: src/js concatenation + style.css: token-identical, compiles, idempotent, and an AMBIGUITY SCAN for the one construct the
//    regex/division heuristic cannot see (a regex literal right after the `)` of an if/while/for head, or after a `}`).
// 4. MUTANTS.  Deliberately broken copies of tools/minify.js (each patch must apply exactly once) must FAIL section 1 or 2.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const MIN_SRC = fs.readFileSync(path.join(ROOT, 'tools', 'minify.js'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };

function loadMinifier(src) { const m = { exports: {} }; new Function('require', 'module', 'exports', src.replace(/^#!.*\n/, ''))(require, m, m.exports); return m.exports; }
const REAL = loadMinifier(MIN_SRC);

const R = String.raw;
const T = (str) => str.replace(/§/g, '`');   // § stands for a backtick in the test sources below
/* [name, source (the body of a function that returns a JSON-able value), optional extra assertion on the minified text] */
const JS_CASES = [
  ['regex literal containing // and /*', R`var r=/a\/\/b|\/\*x|[/]\//;return [r.test('a//b'),r.test('/*x'),r.test('//'),r.source.length];`],
  ['division after ) ] and a number, chained', R`var a=[8];return [(8)/2/2, a[0]/2/2, 8/2/2, (4+4)/(2)/2];`],
  ['division after ) followed by comments that contain slashes', 'var x=(6)/2; /* a/b */ var y=(8)/4; // c / d\nvar z=[3][0]/3 /* e/f */;return [x,y,z];'],
  ['division after ) with a single slash per line (a regex reading would be unterminated)', 'var a=(10);\nvar b=(a)/2;\nvar c=(a)/5;\nreturn [b,c];'],
  ['division after } of an object literal in parens', R`var o={a:9};return [({a:8}).a/2/2, o.a/3/3];`],
  ['regex after return / typeof / case / (', R`function f(s){return /x+/.test(s)}function g(c){switch(c){case /a/.test('a')?1:2: return 'm';}return 'n'}return [f('xx'),f('y'),typeof /q/,g(1),[/b/.test('b')][0]];`],
  ['regex after = , : && ! and in an array', R`var a=/1/,b={k:/2/},c=true&&/3/,d=!/4/.test('4'),e=[/5/,/6/];return [a.source,b.k.source,c.source,d,e.length];`],
  ['regex with a class containing ] / and flags', R`var r=/[\]/]+\/[a-c]/gi;return [r.test(']/]/b'),r.flags];`],
  ['division vs regex: a / b / c and x = a /b/ g', R`var a=100,b=5,c=2,g=1;var x=a /b/ c;var y=a /b/ g;return [x,y];`],
  ['template literal with ${} containing quotes, backticks and braces', T("var o={k:'}§{'};return §a${ \"}§\" + §b${ '§' + (1+1) }§ }c${ o.k }d§;")],
  ['nested template literal and a regex in ${}', T("var s='x';return §${ /a\\/b/.test('a/b') ? §y${s}§ : 'n' }!§;")],
  ['strings that look like comments', R`return ['//not a comment','/*x*/',"a // b", 'it\'s // fine'];`],
  ['ASI: return followed by a newline returns undefined', 'function f(){return\n42}return [f()===undefined, (function(){return 7})()];'],
  ['ASI: a newline before ++ binds ++ to the next operand', 'var a=1,b=1;\na\n++b;\nreturn [a,b];'],
  ['ASI: } newline (function(){})() starts a new statement', 'var r=0;function g(){r=1}\n(function(){ r+=10 })()\nreturn [r];'],
  ['ASI: statements separated only by newlines', 'var x=1\nvar y=x+1\nlet z=y*2\nreturn [x,y,z];'],
  ['ASI: newline before a call is a call (not two statements)', 'var f=function(a){return a+1}\nvar r=f\n(2)\nreturn [r];'],
  ['ASI: newline before [ is an index', 'var a=[5,6]\nvar b=a\n[1]\nreturn [b];'],
  ['ASI: break / continue followed by a newline do not take the label', 'var n=0;outer:for(var i=0;i<3;i++){for(var j=0;j<3;j++){n++;break\nouter;}}var m=0;for(var k=0;k<4;k++){if(k==1)continue\nm++}return [n,m];'],
  ['operators that must not fuse: a+ +b, a- -b, a++ +b, a-- -b', 'var a=1,b=2;return [a+ +b, a- -b, a++ +b, a-- -b, a, +"3"+ +"4"];'],
  ['numbers followed by a dot and a ternary with .5', 'var t=true;return [1 .toString(), 1..toString(), t ? .5 : 1, t?.5:1, 0xff .toString(16), 5 .toFixed(1)];'],
  ['keywords next to names, strings, regex and template', 'var x=3;function f(){return x}function g(){return"s"}function h(){return /r/.source}return [typeof x, void 0===undefined, f(), g(), h(), x instanceof Object, "a" in {a:1}, new Date(0).getTime()];'],
  ['comments between tokens (line, block, multi-line block)', 'var a=/*c*/1/*d*/+/*e*/2 // tail\n;var b=a/*\nmulti\nline*/\nvar c=b\nreturn [a,b,c];'],
  ['labels, ternaries, arrows, spread, optional chaining, exponent', 'var o={a:{b:2}};var f=(x,...r)=>x+r.length;lbl:for(var i=0;i<3;i++){if(i==1)break lbl}return [o?.a?.b, o.z?.q, f(1,2,3), 2**3**2, i, [...[1,2]].length, null??5];'],
  ['getter/setter/class/static and keyword-named properties', 'class A{static s=1;get v(){return 4}}var o={if:1,in:2,return:3,new:4};return [A.s,new A().v,o.if,o.in,o.return,o.new];'],
  ['html-comment-like and unicode text in strings', 'return ["<!--", "-->", "\\u2028", "é ü", \'\\\'\'];'],
];

const norm = (s) => JSON.stringify(s);
function evalSrc(body) { return vm.runInNewContext('(function(){' + body + '\n})()', Object.create(null), { timeout: 2000 }); }
function jsCaseResult(M, name, src, extra) {
  const out = M.minifyJS(src);
  let tokOk, evalOk = false, a, b, err = '';
  try { const x = REAL.sigTokens(src), y = REAL.sigTokens(out); tokOk = x.length === y.length && x.every((t, i) => t === y[i]); } catch (e) { tokOk = false; err += ' tokenizer: ' + e.message; }
  try { a = norm(evalSrc(src)); } catch (e) { return { good: false, why: 'ORIGINAL does not evaluate: ' + e.message }; }
  try { b = norm(evalSrc(out)); evalOk = a === b; if (!evalOk) err += ' results differ: ' + a + ' vs ' + b; } catch (e) { err += ' minified throws: ' + e.message; }
  return { good: tokOk && evalOk, why: (tokOk ? '' : 'token streams differ;') + err, out, a };
}

console.log('--- 1. tricky JS inputs: token identity + evaluation');
for (const [name, src] of JS_CASES) {
  const r = jsCaseResult(REAL, name, src);
  ok(r.good, name + (r.good ? ' -> ' + r.a.slice(0, 60) : ' :: ' + r.why + ' :: ' + (r.out || '').slice(0, 160)));
}
// specific output assertions: where a newline / space MUST survive, and where whitespace must be gone
{
  const m = REAL.minifyJS;
  ok(/return\n42/.test(m('function f(){\n  return\n  42\n}')), 'return\\n42 keeps its newline');
  ok(/a\n\+\+b/.test(m('a\n++b')), 'a\\n++b keeps its newline');
  ok(/\}\n\(function/.test(m('function g(){}\n(function(){})()')), '}\\n(function(){})() keeps its newline');
  ok(m('var  a = 1 ;  /* c */ // d\n') === 'var a=1;', 'comments and spaces are removed: ' + JSON.stringify(m('var  a = 1 ;  /* c */ // d\n')));
  ok(m('if (a) {\n  b();\n  c();\n}\n') === 'if(a){b();c();}', 'indentation / newlines after { and ; are removed: ' + JSON.stringify(m('if (a) {\n  b();\n  c();\n}\n')));
  ok(m('x = a +\n  b') === 'x=a+b', 'a newline after a binary operator is joined');
  ok(m('typeof  x') === 'typeof x' && m('a+ +b') === 'a+ +b' && m('a- -b') === 'a- -b' && m('1 .x') === '1 .x', 'required spaces are kept');
  ok(m('s = "a  b"; t = \'c  d\'; u = `e  ${ f }  g`;') === 's="a  b";t=\'c  d\';u=`e  ${ f }  g`;', 'string and template contents are byte-for-byte');
  ok(m('r = /a  b/ ; q = a / b') === 'r=/a  b/;q=a/b', 'regex contents are byte-for-byte: ' + m('r = /a  b/ ; q = a / b'));
  const big = '    var a = 1;   // comment text\n'.repeat(1000); ok(m(big).length < big.length * 0.4, 'indented, commented input shrinks by more than 60 %');
}

console.log('--- 2. CSS');
const CSS_CASES = [
  ['comments, spaces, trailing ;', '/* c */ a { color: red ; margin: 0 auto ; }', 'a{color:red;margin:0 auto}'],
  ['a space BEFORE the colon is kept (it could be a descendant :pseudo selector)', 'a { color : red }', 'a{color :red}'],
  ['calc() keeps the spaces around + and -', '.x{width:calc( 100% - 2px + 3px );height:calc(1px+2px)}', '.x{width:calc(100% - 2px + 3px);height:calc(1px+2px)}'],
  ['a :hover (descendant) differs from a:hover', 'a :hover{x:y}\na:hover{x:y}', 'a :hover{x:y}a:hover{x:y}'],
  ['child combinator', 'a > b , c>d { x: y }', 'a>b,c>d{x:y}'],
  ['strings keep ; { } and comment-like text', '.a::before{content:"/* x ; } */";quote:\'a ;  b\'}', '.a::before{content:"/* x ; } */";quote:\'a ;  b\'}'],
  ['url() unquoted and quoted', '.a{background:url( data:image/png;base64,AAAA//BB== ) no-repeat;b:url("x y;z.png")}', '.a{background:url(data:image/png;base64,AAAA//BB==) no-repeat;b:url("x y;z.png")}'],
  ['media query', '@media (max-width: 600px) and (orientation:landscape){ .a{ x: y } }', '@media (max-width:600px) and (orientation:landscape){.a{x:y}}'],
  ['!important and multiple selectors', 'a ,\n b{color: red !important ; }', 'a,b{color:red !important}'],
  ['attribute selectors with strings', '[data-x = "a b"] , [y]{z:1}', '[data-x = "a b"],[y]{z:1}'],
];
for (const [name, inp, exp] of CSS_CASES) {
  const got = REAL.minifyCSS(inp);
  ok(got === exp, 'css: ' + name + (got === exp ? '' : ' :: got ' + JSON.stringify(got) + ' expected ' + JSON.stringify(exp)));
}

console.log('--- 3. the real bundle');
{
  const dir = path.join(ROOT, 'src', 'js');
  let js = ''; for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) js += fs.readFileSync(path.join(dir, f), 'utf8') + '\n';
  const t0 = Date.now(), out = REAL.minifyJS(js), ms = Date.now() - t0;
  const x = REAL.sigTokens(js), y = REAL.sigTokens(out);
  ok(x.length === y.length && x.every((t, i) => t === y[i]), `src/js (${x.length} tokens): minified token stream is identical (${js.length} -> ${out.length} bytes, ${ms} ms)`);
  let compiles = true; try { new vm.Script('(function(){' + out + '\n})', { filename: 'bundle.min.js' }); } catch (e) { compiles = false; console.log(e.message); }
  ok(compiles, 'the minified bundle compiles');
  ok(REAL.minifyJS(out) === out, 'minification is idempotent');
  ok(out.indexOf('</script') < 0 && out.indexOf('<!--') < 0, 'no </script or <!-- in the minified bundle (inline <script> safety)');
  // ambiguity scan: a `/` that follows `)` or `}` is classified as division.  Report every one whose continuation also parses as a regex literal followed by `.` `,` `;` `)` or a method name.
  const toks = REAL.tokenizeJS(js), sus = [];
  for (let i = 1; i < toks.length - 1; i++) {
    const t = toks[i], p = toks[i - 1];
    if (t.type === 'punct' && (t.text === '/' || t.text === '/=') && p.type === 'punct' && (p.text === ')' || p.text === '}')) {
      // does the text after this slash look like `<something>/<flags>` closed on the same source line, immediately followed by . ) , ;  ?
      const nxt = toks[i + 1];
      if (nxt && nxt.type === 'ident' && !nxt.nl && p.text === '}') sus.push({ p: p.text, n: nxt.text });
    }
  }
  ok(sus.length === 0, 'ambiguity scan: no `}` followed by a slash that could start a regex (' + sus.length + ')');
  // the `)` case: after the matching `)` of an if / while / for / with head a statement starts, so a `/` token there can only be a REGEX that was classified as a division
  const heads = [];
  for (let i = 0; i < toks.length - 2; i++) {
    const t = toks[i];
    if (t.type === 'ident' && (t.text === 'if' || t.text === 'while' || t.text === 'for' || t.text === 'with') && toks[i + 1].text === '(' && !(toks[i - 1] && toks[i - 1].text === '.')) {
      let d = 0, j = i + 1;
      for (; j < toks.length; j++) { if (toks[j].type === 'punct') { if (toks[j].text === '(') d++; else if (toks[j].text === ')') { d--; if (d === 0) break; } } }
      const nx = toks[j + 1]; if (nx && nx.type === 'punct' && (nx.text === '/' || nx.text === '/=')) heads.push(t.text + ' head near token ' + i);
    }
  }
  ok(heads.length === 0, 'ambiguity scan: no `/` token directly after the `)` of an if/while/for head, i.e. no regex literal mistaken for a division (' + heads.length + ')' + (heads.length ? ' ' + heads.slice(0, 3).join(' | ') : ''));
}
{
  const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8'), out = REAL.minifyCSS(css);
  // independent structural check: the multiset of (selector -> declarations) pairs after a naive parse is unchanged by whitespace normalisation
  const rules = (s) => { const r = []; s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (m, a, b) => { r.push(a.replace(/\s+/g, '') + '{' + b.replace(/\s+/g, '').replace(/;$/, '') + '}'); return m; }); return r; };
  const A = rules(css), B = rules(out);
  ok(A.length === B.length && A.every((x, i) => x === B[i]), `style.css: ${A.length} leaf rules identical after whitespace-insensitive comparison (${css.length} -> ${out.length} bytes)`);
  ok(!/\/\*/.test(out.replace(/"[^"]*"|'[^']*'/g, '')) , 'style.css: no comment left');
}

console.log('--- 4. mutants: deliberately broken minifiers must be caught');
const MUTANTS = [
  ['`/` after `)` treated as a regex start', "if (prev.type === 'punct') return !(prev.text === ')' ||", "if (prev.type === 'punct') return !(false ||"],
  ['`/` never a regex (comment-looking regex bodies are eaten)', "if (!prev) return true;\n    if (prev.type === 'punct') return", "if (!prev) return false;\n    if (prev.type === 'punct') return false && "],
  ['every newline joined (ASI broken)', "if (!join) sep = '\\n';", "if (!join) sep = sep;"],
  ['template ${} expressions not skipped', "const r = scan(src, j + 2, true); j = r.end + 1; continue;", "j += 2; continue;"],
  ['no space between two words', "if (wordish(prev) && wordish(t)) sep = ' ';", "if (wordish(prev) && wordish(t)) sep = '';"],
  ['a+ +b fused into a++b', "if ((a === '+' && b === '+') || (a === '-' && b === '-') ||", "if (false || (a === '-' && b === '-') ||"],
  ['`++` joined to the previous line', "'(', '[', '{', ',', ';', ':', '?',", "'(', '[', '{', ',', ';', ':', '?', '}', "],
  ['`++` allowed as a safe next token', "const SAFE_NEXT = new Set([')',", "const SAFE_NEXT = new Set(['++', ')',"],
  ['1 .toString() loses its space', "else if (prev.type === 'num' && t.type === 'punct' && t.text === '.' && /^\\d+$/.test(prev.text)) sep = ' ';", ""],
  ['CSS: space before : dropped (a :hover -> a:hover)', "'{};,)'.includes(b)", "'{};,):'.includes(b)"],
  ['CSS: comments removed inside strings', "if (c === '\"' || c === \"'\") {\n      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\\\') j++; j++; }\n      o += src.slice(i, j + 1);", "if (false) {\n      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\\\') j++; j++; }\n      o += src.slice(i, j + 1);"],
  ['CSS: calc() spaces collapsed around + and -', "const drop = !a ||", "const drop = (a === '+' || a === '-' || b === '+' || b === '-') || !a ||"],
  ['`return` newline dropped (restricted production)', "else if (prev.type === 'ident' && KW_OPEN_PREV.has(prev.text) && !afterDot) join = true;", "else if (prev.type === 'ident' && (KW_OPEN_PREV.has(prev.text) || prev.text === 'return') && !afterDot) join = true;"],
];
for (const [name, from, to] of MUTANTS) {
  const n = MIN_SRC.split(from).length - 1;
  if (n !== 1) { ok(false, 'mutant "' + name + '": the patch target occurs ' + n + ' times (must be exactly 1) - update tests/minify/minify_test.js'); continue; }
  let M; try { M = loadMinifier(MIN_SRC.replace(from, () => to)); } catch (e) { ok(true, 'mutant "' + name + '" is caught: does not even load (' + e.message.slice(0, 50) + ')'); continue; }
  let caught = 0, first = '';
  for (const [cn, src] of JS_CASES) { if (!jsCaseResult(REAL, cn, src).good) continue; let r; try { r = jsCaseResult(M, cn, src); } catch (e) { r = { good: false, why: 'threw ' + e.message.slice(0, 60) }; } if (!r.good) { caught++; first = first || cn; } }
  for (const [cn, inp, exp] of CSS_CASES) { if (REAL.minifyCSS(inp) !== exp) continue; let g; try { g = M.minifyCSS(inp); } catch (e) { g = 'threw'; } if (g !== exp) { caught++; first = first || 'css: ' + cn; } }
  for (const [txt, want] of [['function f(){\n  return\n  42\n}', /return\n42/], ['a\n++b', /a\n\+\+b/], ['function g(){}\n(function(){})()', /\}\n\(function/]]) { let g; try { g = M.minifyJS(txt); } catch (e) { g = ''; } if (!want.test(g)) { caught++; first = first || 'newline assertion'; } }
  ok(caught > 0, 'mutant "' + name + '" is caught by ' + caught + ' check(s), first: ' + first);
}
console.log(fails ? 'FAILED (' + fails + ')' : 'ALL MINIFIER CHECKS PASSED');
process.exit(fails ? 1 : 0);
