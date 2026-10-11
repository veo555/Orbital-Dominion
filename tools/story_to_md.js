#!/usr/bin/env node
/* Story data -> script and campaign document (docs/story/SCRIPT.md).
     node tools/story_to_md.js                 # write docs/story/SCRIPT.md
     node tools/story_to_md.js --stdout        # print instead of writing
     node tools/story_to_md.js --out <file>    # write somewhere else
     node tools/story_to_md.js --check         # exit 1 when the document on disk is out of date
     node tools/story_to_md.js --story <file>  # render another story module, e.g. tests/fixtures/story_min.js (prints unless --out)
   The data is loaded exactly as tools/validate_story.js loads it (tests/sim/storylib.js: same files, same vocabulary).
   Deterministic: no clock, no randomness. The header carries a SHA-1 fingerprint of the source files, so a stale copy shows.
   Dispatch and radio text are printed verbatim, in order (headings are datelines). v4.0: there are no films any more, so there is no staging.
   Contract: docs/CAMPAIGN_SPEC.md, docs/DISPATCH_SPEC.md, src/js/43_vocab.js. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DEFAULT = path.join(ROOT, 'docs', 'story', 'SCRIPT.md');
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null; };

/* ---------------------------------------------------------------- load (same path as validate_story.js) */
const V = require(path.join(ROOT, 'tests', 'sim', 'storylib.js'))();
let STORY = V.STORY;
let inputs = V.files.map(f => ({ name: f, buf: fs.readFileSync(path.join(ROOT, 'src', 'js', f)) }));
let sourceLine = V.files.length + ' data files in src/js/ (00_core.js, 43_vocab.js, 44_story_*.js)';
const storyOpt = argOf('--story');
if (storyOpt) {
  const file = path.resolve(storyOpt);
  const m = require(file);
  STORY = typeof m === 'function' ? m() : m;
  inputs = [{ name: path.relative(ROOT, file), buf: fs.readFileSync(file) }];
  sourceLine = path.relative(ROOT, file) + ' (a story module; vocabulary from src/js/43_vocab.js)';
}
const FP = (() => {
  const h = crypto.createHash('sha1');
  for (const f of inputs) { h.update(f.name + '\n'); h.update(f.buf); }
  return h.digest('hex').slice(0, 12);
})();

/* ---------------------------------------------------------------- formatting helpers */
const pad2 = n => (n < 10 ? '0' : '') + n;
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const esc = s => String(s == null ? '' : s).replace(/([\\`*_[\]|<>])/g, '\\$1');
const code = s => '`' + String(s == null ? '' : s).replace(/`/g, "'") + '`';
const plain = t => String(t).replace(/\\(.)/g, '$1').replace(/[`*]/g, '');
const slug = t => plain(t).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const artFor = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const words = s => String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean).length;
const sumBy = (xs, f) => xs.reduce((t, x) => t + f(x), 0);
const listJoin = xs => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const tc = t => { const k = Math.max(0, Math.round(num(t, 0) * 10)); const m = Math.floor(k / 600), r = k - m * 600; return m + ':' + pad2(Math.floor(r / 10)) + '.' + (r % 10); };
const sec = d => num(d, 0).toFixed(1) + ' s';
const mss = s => { const k = Math.round(num(s, 0)); return Math.floor(k / 60) + ':' + pad2(k % 60); };
const clock = s => mss(Math.floor(num(s, 0)));
const NUMW = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };
const counted = (k, one, many) => k + ' ' + (k === 1 ? one : many);

/* hex colour -> a plain English colour word (deterministic HSL bands) */
function colourWord(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return '';
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) { h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); if (h < 0) h += 360; }
  if (l < 0.08) return 'black';
  if (l > 0.93) return 'white';
  if (s < 0.15) return l < 0.4 ? 'charcoal' : l > 0.7 ? 'pale grey' : 'grey';
  const hue = h < 12 || h >= 345 ? 'red' : h < 30 ? 'orange' : h < 50 ? 'amber' : h < 68 ? 'yellow' : h < 165 ? 'green'
    : h < 190 ? 'teal' : h < 205 ? 'cyan' : h < 250 ? 'blue' : h < 290 ? 'violet' : 'magenta';
  if (l > 0.8) return 'pale ' + hue;
  if (l < 0.3) return 'deep ' + hue;
  return hue;
}

/* ---------------------------------------------------------------- vocabulary names */
const UDEF = V.UDEF || {}, BDEF = V.BDEF || {}, TECH = V.TECH || {}, FACTIONS = V.FACTIONS || {};
const MUSIC = V.MUSIC_CUES || {};
const KIND_LABEL = { intro: 'Prologue dispatch', briefing: 'Briefing dispatch', debrief: 'Debrief dispatch', interlude: 'Interlude dispatch', ending: 'Ending dispatch', credits: 'Credits', defeat: 'Defeat dispatch' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const DISP = STORY.dispatch || {};
const CH = STORY.characters || {};
const RADIO = STORY.radio || {};
const MISSIONS = STORY.missions || [];
const ACTS = STORY.acts || [];
const PLACES = (STORY.world && STORY.world.places) || [];

const plural = w => (/man$/.test(w) ? w.slice(0, -3) + 'men' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's');
function noun(table, id) {
  const name = esc((table[id] && table[id].name) || String(id == null ? '?' : id));
  return { s: name, p: /^hero_/.test(String(id)) ? name : plural(name) };
}
const facName = f => esc((FACTIONS[f] && FACTIONS[f].name) || cap(String(f || '')));
const facAdj = f => esc(cap(String(f || '')));
const placeName = id => { const p = PLACES.find(x => x.id === id); return p ? p.name : (id || ''); };
const EDGE_NAME = { N: 'north', E: 'east', S: 'south', W: 'west' };
const HERO_POLICY = { none: 'no hero (locked for this mission)', available: 'the hero can be trained at the Hub', start: 'the hero stands at the Hub from the start' };
const MARK_SAY = { 'scar-l': 'left-cheek scar', tattoo: 'tattoo', 'glow-eye': 'glowing eye', mask: 'mask', visor: 'visor', halo: 'halo', cracks: 'cracked plating' };
const EXPR_WORD = { smile: 'smiling', smirk: 'smirking', laugh: 'laughing', shock: 'shocked', angry: 'angry', sad: 'sad', scared: 'scared',
  cold: 'cold', weary: 'weary', determined: 'determined' };
/* ---------------------------------------------------------------- people */
const charOf = id => (id && CH[id]) || null;
const narratorKey = Object.keys(CH).find(k => CH[k] && CH[k].role === 'narrator') || null;
function spk(who) {
  if (who === 'narrator') return { key: narratorKey || 'narrator', name: 'NARRATOR', c: narratorKey ? CH[narratorKey] : null, vo: true };
  const c = charOf(who);
  return { key: who, name: esc(String((c && (c.short || c.name)) || who || '?')).toUpperCase(), c, vo: false };
}
const isStatus = c => !!(c && /rule-based/i.test(c.title || ''));
const resolveWho = who => (who === 'narrator' ? narratorKey : who);

/* ---------------------------------------------------------------- conditions and actions in words */
const CMP_WORD = { '<': 'fewer than', '<=': 'at most', '==': 'exactly', '>=': 'at least', '>': 'more than', '!=': 'not' };
const TIME_WORD = { '>=': 'reaches', '>': 'passes', '<': 'is still before', '<=': 'is still at or before', '==': 'is exactly', '!=': 'is not' };
const OBJ_STATE = { active: 'is showing', done: 'is complete', failed: 'has failed' };
const who = side => (side === 'me' ? 'you' : 'the enemy');
const secsWithClock = x => (num(x, 0) >= 60 ? `${num(x, 0)} s (${clock(x)})` : `${num(x, 0)} s`);
function countSay(subj, cmp, n, sing, plur, o) {
  const have = subj === 'you' ? 'have' : 'has';
  const pre = o && o.pre ? o.pre + ' ' : '';
  const post = o && o.post ? ' ' + o.post : '';
  if (cmp === '==' && n === 0) return `${subj} ${have} ${pre}no ${plur}${post}`;
  return `${subj} ${have} ${pre}${CMP_WORD[cmp] || cmp} ${n} ${n === 1 ? sing : plur}${post}`;
}
const unitKind = t => (t === '*' ? { s: 'unit', p: 'units' } : t === 'army' ? { s: 'armed unit', p: 'armed units' }
  : t === 'worker' ? { s: 'worker', p: 'workers' } : noun(UDEF, t));
function condSay(c, ctx) {
  if (!Array.isArray(c) || typeof c[0] !== 'string') return '(no condition)';
  const op = c[0], a = c.slice(1);
  const sub = x => (Array.isArray(x) && ['all', 'any', 'not'].includes(x[0]) ? '(' + condSay(x, ctx) + ')' : condSay(x, ctx));
  switch (op) {
    case 'all': return a.length ? a.map(sub).join(' and ') : 'always';
    case 'any': return a.length ? a.map(sub).join(' or ') : 'never';
    case 'not': return 'not ' + sub(a[0]);
    case 'time': return `the mission clock ${TIME_WORD[a[0]] || a[0]} ${secsWithClock(a[1])}`;
    case 'flag': return `the flag ${code(a[0])} is set`;
    case 'after': return `${num(a[1], 0)} s after the flag ${code(a[0])} is set`;
    case 'count': {
      const subj = who(a[1]);
      if (a[0] === 'unit') { const k = unitKind(a[2]); return countSay(subj, a[3], a[4], k.s, k.p, { post: 'alive' }); }
      const b = a[2] === '*' ? { s: 'building', p: 'buildings' } : noun(BDEF, a[2]);
      return countSay(subj, a[3], a[4], b.s, b.p, { post: 'standing' });
    }
    case 'res': return a[0] === 'e' ? countSay('you', a[1], a[2], 'ether', 'ether') : countSay('you', a[1], a[2], 'crystal', 'crystals');
    case 'era': {
      const s = who(a[0]);
      if (a[1] === '>=') return `${s} ${s === 'you' ? 'have' : 'has'} reached Era ${a[2]}`;
      return `${s === 'you' ? 'your' : "the enemy's"} era is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    }
    case 'supply': return `${who(a[0]) === 'you' ? 'your' : "the enemy's"} supply used is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    case 'hero':
      if (a[0] === 'alive') return 'your hero is alive';
      if (a[0] === 'dead') return 'your hero has fallen and is not alive';
      return `your hero's level is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    case 'heroNear': return `your hero is within ${a[2]} tiles of (${a[0]}, ${a[1]})`;
    case 'kills': return countSay(who(a[0]), a[1], a[2], 'unit, building or creep', 'units, buildings and creeps', { pre: 'destroyed' });
    case 'lost': return countSay(who(a[0]), a[1], a[2], 'unit or building', 'units and buildings', { pre: 'lost' });
    case 'structs': return countSay(who(a[0]), a[1], a[2], 'building', 'buildings', { post: 'standing' });
    case 'hubs': { const h = noun(BDEF, 'hub'); return countSay(who(a[0]), a[1], a[2], 'working ' + h.s, 'working ' + h.p); }
    case 'camps': return countSay('you', a[0], a[1], 'creep camp', 'creep camps', { pre: 'cleared' });
    case 'unitsNear': {
      const k = unitKind(a[1]);
      return countSay(who(a[0]), a[5], a[6], k.s, k.p, { post: `within ${a[4]} tiles of (${a[2]}, ${a[3]})` });
    }
    case 'built': { const b = noun(BDEF, a[0]); return countSay('you', a[1], a[2], b.s, b.p, { pre: 'completed', post: '(in total)' }); }
    case 'trained': { const u = noun(UDEF, a[0]); return countSay('you', a[1], a[2], u.s, u.p, { pre: 'trained', post: '(in total)' }); }
    case 'researched': return `you have researched ${esc((TECH[a[0]] && TECH[a[0]].name) || a[0])}`;
    case 'mined': return a[0] === 'e' ? countSay('you', a[1], a[2], 'ether', 'ether', { pre: 'mined', post: '(in total)' })
      : countSay('you', a[1], a[2], 'crystal', 'crystals', { pre: 'mined', post: '(in total)' });
    case 'trade': return `freighter trade has earned ${CMP_WORD[a[0]] || a[0]} ${a[1]} crystals`;
    case 'obj': return `the objective ${objQuote(a[0], ctx)} ${OBJ_STATE[a[1]] || a[1]}`;
    case 'wave': return countSay('the enemy', a[0], a[1], 'attack wave', 'attack waves', { pre: 'launched' });
    default: return `[unknown condition ${esc(op)}]`;
  }
}
const objQuote = (id, ctx) => (ctx && ctx.objText && ctx.objText[id] ? '“' + esc(ctx.objText[id]) + '”' : code(id));
const AIMOD = {
  waveMult: v => `wave size ×${v}`, intervalMult: v => `wave interval ×${v}`, firstWave: v => `first wave at ${v} s`,
  hero: v => `hero ${v ? 'on' : 'off'}`, air: v => `air units ${v ? 'on' : 'off'}`
};
function actSay(a, ctx) {
  if (!Array.isArray(a) || typeof a[0] !== 'string') return '(no action)';
  const op = a[0], b = a.slice(1);
  switch (op) {
    case 'radio': return `play radio line ${code(b[0])}`;
    case 'dispatch': return `show the dispatch card ${code(b[0])} (the game waits for it)`;
    case 'obj': return (b[1] === 'show' ? 'show ' : b[1] === 'done' ? 'complete ' : 'fail ') + objQuote(b[0], ctx);
    case 'flag': return `${b[1] ? 'set' : 'clear'} the flag ${code(b[0])}`;
    case 'spawn': {
      const side = b[0], u = noun(UDEF, b[1]), n = num(b[2], 1), w = b[3], opts = b[4] || {};
      const count = n === 1 ? `1 ${u.s}` : `${n} ${u.p}`;
      const sideW = side === 'me' ? 'your' : 'enemy';
      const place = w === 'base' ? `at the ${side === 'me' ? 'your' : 'enemy'} Command Hub`
        : Array.isArray(w) ? `near tile (${w[0]}, ${w[1]})`
          : /^edge:/.test(String(w)) ? `along the ${EDGE_NAME[String(w).slice(5)] || '?'} edge` : esc(w);
      const ord = { attack: ', ordered to attack', hold: ', holding position' }[opts.order] || '';
      return `spawn ${sideW} ${count} ${place}${ord}`;
    }
    case 'give': return `grant ${b[1]} ${b[0] === 'e' ? 'ether' : 'crystals'}`;
    case 'take': return `take ${b[1]} ${b[0] === 'e' ? 'ether' : 'crystals'}`;
    case 'reveal': return `reveal the ground around (${b[0]}, ${b[1]}), radius ${b[2]} tiles${b[3] ? ', for ' + b[3] + ' s' : ''}`;
    case 'ping': return `mark (${b[0]}, ${b[1]}) on the map as ${esc(b[2])}`;
    case 'aimod': return 'retune the enemy: ' + Object.entries(b[0] || {}).map(([k, v]) => (AIMOD[k] ? AIMOD[k](v) : `${k} ${v}`)).join(', ');
    case 'strike': return `${b[6] === 'me' ? 'your' : 'an enemy'} orbital strike on (${b[0]}, ${b[1]}), radius ${b[2]} tiles, ${b[3]} damage after ${b[4]} s${b[5] ? ' (warning sound: ' + esc(b[5]) + ')' : ''}`;
    case 'mood': return `change the music to ${esc(b[0])}`;
    case 'win': return 'end the mission in victory';
    case 'lose': return `end the mission in defeat (${esc(b[0])})`;
    case 'unlock': case 'lock': {
      const w = b[0] === 'building' ? noun(BDEF, b[1]).s : b[0] === 'unit' ? noun(UDEF, b[1]).s : `Era ${b[1]}`;
      return `${op} ${w}`;
    }
    case 'herolevel': return `raise your hero to level ${b[0]}`;
    case 'heal': return `heal ${b[0] === 'me' ? 'your' : 'enemy'} units and buildings within ${b[3]} tiles of (${b[1]}, ${b[2]})`;
    default: return `[unknown action ${esc(op)}]`;
  }
}
function repeatSay(t) {
  const every = num(t.every, 0);
  const once = t.once !== undefined ? !!t.once : !every;
  if (once) return 'once';
  if (every) return `at most every ${every} s while its condition holds`;
  return 'every time its condition holds';
}

/* ---------------------------------------------------------------- dispatches */
function lineCue(ln) {
  const st = ln.style || 'normal', sp = spk(ln.who), bits = [];
  if (st === 'narration' || sp.vo) bits.push('V.O.');
  else if (st === 'radio') bits.push('over radio');
  else if (st === 'thought') bits.push('thinking');
  else if (st === 'whisper') bits.push('whispering');
  else if (st === 'shout') bits.push('shouting');
  if (st !== 'narration' && ln.expr && ln.expr !== 'neutral' && ln.expr !== 'talk') bits.push(EXPR_WORD[ln.expr] || ln.expr);
  if (isStatus(sp.c) && st === 'normal') bits.push('status line');
  return `**${sp.name}**` + (bits.length ? ' *(' + bits.join(', ') + ')*' : '');
}
function musicWord(cue) {
  const m = MUSIC[cue];
  return esc(cue) + (m ? ` (${m.loop ? 'loops' : 'plays once'}, nominal ${m.len} s)` : ' (not in MUSIC_CUES)');
}
function dispatchStats(id) {
  const c = DISP[id], ls = (Array.isArray(c.lines) ? c.lines : []).filter(l => l.style !== 'heading');
  return { lines: ls.length, words: sumBy(ls, l => words(l.text)) };
}
/* a whole dispatch: every line in order, verbatim; `level` is the heading depth, `flow` says when it is shown */
function dispatchDoc(id, level, flow) {
  const c = DISP[id], out = [], st = dispatchStats(id);
  out.push('#'.repeat(level) + ' ' + `${KIND_LABEL[c.kind] || esc(c.kind)} — "${esc(c.title)}" ${code(id)}`);
  if (flow) out.push(esc(flow));
  out.push('*' + [counted(st.lines, 'line', 'lines') + ', ' + st.words + ' words', c.mood ? 'mood: ' + musicWord(c.mood) : null].filter(Boolean).join(' · ') + '*');
  for (const ln of Array.isArray(c.lines) ? c.lines : []) {
    if (ln.style === 'heading') out.push('**' + esc(ln.text) + '**');
    else { out.push(lineCue(ln)); out.push(esc(ln.text)); }
  }
  return out;
}

/* ---------------------------------------------------------------- dispatch placement in the campaign flow */
const HEADS = [];
const H = (level, text) => { HEADS.push({ level, text }); return '#'.repeat(level) + ' ' + text; };
const filmIds = Object.keys(DISP);
const kindOf = id => (DISP[id] ? DISP[id].kind : null);
const docOrder = [], placed = {};
const addDispatch = (id, slot, mission) => { if (!id || !DISP[id] || placed[id]) return; placed[id] = { slot, mission }; docOrder.push(id); };
filmIds.filter(id => kindOf(id) === 'intro').forEach(id => addDispatch(id, 'opening', null));
for (const m of MISSIONS) {
  addDispatch(m.briefing, 'briefing', m);
  addDispatch(m.debrief, 'debrief', m);
  if (m.after && kindOf(m.after) !== 'ending') addDispatch(m.after, 'after', m);
  addDispatch(m.defeat, 'defeat', m);
}
filmIds.filter(id => kindOf(id) === 'ending').forEach(id => addDispatch(id, 'ending', null));
filmIds.filter(id => kindOf(id) === 'credits').forEach(id => addDispatch(id, 'credits', null));
const unplaced = filmIds.filter(id => !placed[id]);
function flowNote(id) {
  const p = placed[id];
  if (!p) return 'Not reached by the campaign flow.';
  switch (p.slot) {
    case 'opening': return 'Shown before Mission 1 when a new campaign starts (also from the campaign menu: Read prologue).';
    case 'briefing': return `Shown before Mission ${p.mission.n}.`;
    case 'debrief': return `Shown after victory in Mission ${p.mission.n}.`;
    case 'after': return `Shown after the debrief of Mission ${p.mission.n}.`;
    case 'defeat': return `Shown when Mission ${p.mission.n} is lost.`;
    case 'ending': return 'Shown after the final debrief.';
    case 'credits': return 'Shown after the ending.';
    default: return '';
  }
}

/* ---------------------------------------------------------------- appearances (cast table and statistics) */
const appear = {};
const ap = id => (appear[id] = appear[id] || { first: null, lines: 0, words: 0, radio: 0, radioWords: 0 });
for (const id of docOrder.concat(unplaced)) {
  for (const ln of DISP[id].lines || []) {
    if (ln.style === 'heading') continue;
    const k = resolveWho(ln.who);
    if (!k) continue;
    const x = ap(k); x.lines++; x.words += words(ln.text); if (!x.first) x.first = id;
  }
}
for (const id of Object.keys(RADIO)) {
  const r = RADIO[id], k = resolveWho(r.who);
  if (!k) continue;
  const x = ap(k); x.radio++; x.radioWords += words(r.text);
}

/* ---------------------------------------------------------------- the cast */
function lookSay(c) {
  const l = c.look || {}, bits = [];
  if (l.armor) bits.push(`${colourWord(l.armor.col) || 'grey'} ${esc(l.armor.style)} armor${colourWord(l.armor.trim) ? ' with ' + colourWord(l.armor.trim) + ' trim' : ''}`);
  if (l.hair) bits.push(l.hair.style === 'bald' ? 'bald' : `${esc(l.hair.style)} hair${colourWord(l.hair.color) ? ' (' + colourWord(l.hair.color) + ')' : ''}`);
  if (l.build) bits.push(`${esc(l.build)} build`);
  if (l.age) bits.push(esc(l.age));
  const marks = (l.mark || []).filter(m => m !== 'none').map(m => MARK_SAY[m] || esc(m));
  if (marks.length) bits.push(listJoin(marks));
  if (l.emblem && l.emblem !== 'none') bits.push(`${esc(l.emblem)} emblem`);
  const s = bits.join('; ');
  return s ? cap(s) + '.' : 'Not specified.';
}
function screenSay(id) {
  const x = ap(id);
  if (!x.first) return x.radio ? `no dispatch lines; ${x.radio} radio ${x.radio === 1 ? 'line' : 'lines'}` : 'in no dispatch and not on the radio';
  return `first in ${esc(DISP[x.first].title)} ${code(x.first)}; ${counted(x.lines, 'dispatch line', 'dispatch lines')} (${x.words} words), ${counted(x.radio, 'radio line', 'radio lines')}`;
}
function personEntry(id) {
  const c = CH[id], out = [];
  out.push(H(4, `${esc(c.name)} — ${esc(c.short)}`));
  const fac = c.faction === 'none' ? 'no faction' : c.faction === 'neutral' ? 'unaligned' : facName(c.faction);
  out.push(`*${esc(c.title)}*`);
  out.push([`${esc(c.role)}${c.hero ? ' (plays ' + code(c.hero) + ')' : ''}`, fac, esc(c.side) + ' side', 'leitmotif ' + code(c.motif)].join(' · '));
  out.push(esc(c.bio));
  out.push([
    `- **Wants:** ${esc(c.want)}`,
    `- **Flaw:** ${esc(c.flaw)}`,
    `- **Arc:** ${esc(c.arc)}`,
    `- **Look:** ${lookSay(c)}`,
    `- **Signature line:** “${esc(c.quote)}”`,
    `- **Appears:** ${screenSay(id)}.`,
    c.role === 'narrator' ? '- **Speaks as:** NARRATOR (V.O.) in cues, the narrator tag used by the dispatch and radio data.' : null
  ].filter(Boolean).join('\n'));
  return out;
}
function castParas() {
  const out = [], ids = Object.keys(CH);
  const groups = [['good', 'Allies and heroes (side: good)'], ['gray', 'Gray (side: gray)'], ['evil', 'Antagonists (side: evil)']];
  for (const [side, label] of groups) {
    const g = ids.filter(id => CH[id].side === side);
    if (!g.length) continue;
    out.push(H(3, label));
    for (const id of g) out.push(...personEntry(id));
  }
  const rest = ids.filter(id => !['good', 'gray', 'evil'].includes(CH[id].side));
  if (rest.length) { out.push(H(3, 'Other')); for (const id of rest) out.push(...personEntry(id)); }
  return out;
}

/* ---------------------------------------------------------------- missions */
function unitList(list) {
  return (list || []).length ? (list || []).map(u => `${u.n} ${u.n === 1 ? noun(UDEF, u.type).s : noun(UDEF, u.type).p}`).join(', ') : 'no units';
}
function bldList(list) {
  return (list || []).length ? (list || []).map(b => `${noun(BDEF, b.type).s} at (${b.tx}, ${b.ty})`).join(', ') : 'no buildings';
}
function settingRows(m, ctx) {
  const s = m.setup || {}, st = s.start || {}, rs = s.restrict || {}, fo = s.foe || {}, fst = fo.start || {}, mods = fo.mods || {};
  const rows = [];
  rows.push(['Place', `${esc(ctx.place || m.place || '?')}; map seed ${s.seed} (${V.MW} × ${V.MH} tiles)`]);
  rows.push(['Sides', `You: ${facName(s.faction)}, ${esc(s.diff || 'normal')} difficulty. Enemy: ${facName(s.enemy)}.`]);
  rows.push(['You start with', `${num(st.c, 0)} crystals, ${num(st.e, 0)} ether, Era ${num(st.era, 1)}; ${unitList(st.units)}; ${bldList(st.buildings)}; ${HERO_POLICY[st.hero] || 'hero: ' + esc(st.hero)}${st.supplyBonus ? '; supply bonus ' + st.supplyBonus : ''}`]);
  const locked = [...(rs.buildings || []).map(b => noun(BDEF, b).p), ...(rs.units || []).map(u => noun(UDEF, u).p)];
  if (rs.maxEra) locked.push(`Era ${rs.maxEra + 1} and later`);
  rows.push(['Locked at the start', locked.length ? listJoin(locked) : 'nothing']);
  const modTxt = Object.entries(mods).map(([k, v]) => ({
    waveMult: `wave size ×${v}`, intervalMult: `wave interval ×${v}`, firstWave: `first wave at ${v} s`, hero: `hero ${v ? 'on' : 'off'}`, air: `air units ${v ? 'on' : 'off'}`
  }[k] || `${esc(k)} ${v}`));
  const enemyStart = (fst.c != null || fst.e != null || (fst.units || []).length || (fst.buildings || []).length)
    ? `; starts with ${num(fst.c, 0)} crystals, ${num(fst.e, 0)} ether, Era ${num(fst.era, 1)}, ${unitList(fst.units)}` : '';
  rows.push(['Enemy AI', `${fo.ai === false ? 'off (fully scripted)' : 'on'}${enemyStart}${modTxt.length ? '; tuning: ' + listJoin(modTxt) : ''}`]);
  rows.push(['Daylight and swarm', `daylight ${esc(s.daylight || 'cycle')}; swarm layer (rule-based Overseer) ${esc(s.swarm)}`]);
  rows.push(['Default victory rule', m.noDefaultWin ? 'off; the mission sets its own victory' : 'on: destroy every enemy building']);
  rows.push(['Default defeat rule', m.noDefaultLose ? 'off' : 'on: every building of yours lost, or no Command Hub and no army left']);
  const par = num(m.stars && m.stars.par, 0);
  rows.push(['Stars', `1 for victory; 2 with every bonus objective complete; 3 for victory within ${par} s (${clock(par)})`]);
  return rows;
}
function table(head, rows) {
  const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
  for (const r of rows) lines.push('| ' + r.map(c => String(c).replace(/\n/g, ' ')).join(' | ') + ' |');
  return lines.join('\n');
}
function objectiveBullet(o, ctx) {
  const kind = { primary: 'Primary', bonus: 'Bonus', hidden: 'Hidden' }[o.kind] || esc(o.kind);
  const shown = o.kind === 'hidden' ? 'hidden until it is complete' : o.when ? 'shown once ' + condSay(o.when, ctx) : 'shown from the start';
  const done = o.done ? 'complete when ' + condSay(o.done, ctx) : 'no completion condition';
  const fail = o.fail ? ` Fails when ${condSay(o.fail, ctx)}.` : '';
  return `- **${kind}:** ${esc(o.text)} *(${shown})*. ${cap(done)}.${fail}`;
}
function radioQual(r) {
  const bits = ['over radio'];
  if (r.style === 'whisper') bits.push('whispering');
  if (r.style === 'shout') bits.push('shouting');
  if (isStatus(spk(r.who).c)) bits.push('status line');
  return bits.join(', ');
}
function triggerBlock(m, ctx) {
  const items = [];
  (m.triggers || []).forEach((t, i) => {
    const delay = num(t.delay, 0) > 0 ? `, ${t.delay} s after its condition holds` : '';
    const opt = t.optional ? ' (marked optional)' : '';
    let head = `${i + 1}. ${code(t.id)} — ${repeatSay(t)}${delay}${opt}, when ${condSay(t.when, ctx)}.`;
    const sub = [];
    for (const a of t.do || []) {
      if (a[0] !== 'radio') continue;
      const r = RADIO[a[1]];
      sub.push(r ? `   - Radio ${code(a[1])}: **${spk(r.who).name}** *(${radioQual(r)}, ${sec(r.dur)})* — “${esc(r.text)}”`
        : `   - Radio ${code(a[1])}: *(missing line)*`);
    }
    const others = (t.do || []).filter(a => a[0] !== 'radio').map(a => actSay(a, ctx));
    if (others.length) sub.push(`   - Also: ${others.join('; ')}.`);
    items.push(head + (sub.length ? '\n' + sub.join('\n') : ''));
  });
  return items.join('\n');
}
function missionParas(m) {
  const out = [], pl = placeName(m.place), ctx = { place: pl, objText: {} };
  for (const o of m.objectives || []) ctx.objText[o.id] = o.text;
  out.push(H(3, `Mission ${m.n} — ${esc(m.title)}`));
  out.push(`*${esc(m.subtitle)}*`);
  out.push(esc(m.synopsis));
  if (m.n === 1) out.push('*A new campaign shows the prologue dispatch first (see Opening).*');
  if (m.briefing && DISP[m.briefing]) out.push(...dispatchDoc(m.briefing, 4, flowNote(m.briefing), pl));
  out.push(H(4, 'The mission'));
  out.push(table(['Setting', 'Detail'], settingRows(m, ctx)));
  out.push('**Objectives**\n' + ((m.objectives || []).map(o => objectiveBullet(o, ctx)).join('\n') || '- none'));
  out.push('**Triggers, radio and events, in trigger order**\n' + (triggerBlock(m, ctx) || '- none'));
  const endB = [];
  endB.push(`- **Victory when** ${m.win ? condSay(m.win, ctx) : 'no victory condition'}.`);
  endB.push(`- **Defeat when** ${m.lose ? condSay(m.lose, ctx) : 'no defeat condition'}.`);
  if ((m.objectives || []).some(o => o.kind === 'primary' && o.fail)) endB.push('- A primary objective that fails also ends the mission in defeat.');
  out.push('**Ending the mission**\n' + endB.join('\n'));
  if ((m.hints || []).length) out.push('**Hints on the briefing card**\n' + m.hints.map(h => '- ' + esc(h)).join('\n'));
  if (m.debrief && DISP[m.debrief]) out.push(...dispatchDoc(m.debrief, 4, flowNote(m.debrief), pl));
  if (m.after && DISP[m.after] && kindOf(m.after) !== 'ending') out.push(...dispatchDoc(m.after, 4, flowNote(m.after), pl));
  else if (m.after) out.push(`*Afterwards: the ending (see The ending).*`);
  else out.push('*No dispatch follows this mission.*');
  if (m.defeat && DISP[m.defeat]) {
    if (placed[m.defeat] && placed[m.defeat].mission === m) out.push(...dispatchDoc(m.defeat, 4, flowNote(m.defeat), pl));
    else out.push(`*If the mission is lost, the defeat dispatch ${code(m.defeat)} is shown (shown under Mission ${placed[m.defeat] && placed[m.defeat].mission ? placed[m.defeat].mission.n : '?'}).*`);
  } else out.push('*If the mission is lost, the generic retry screen appears (no dispatch).*');
  return out;
}

/* ---------------------------------------------------------------- statistics and data notes */
function computeStats() {
  const S = { films: 0, filmLines: 0, filmWords: 0, filmChars: 0, radioLines: 0, radioWords: 0, radioChars: 0, byKind: {} };
  for (const id of filmIds) {
    const c = DISP[id];
    S.films++;
    const k = S.byKind[c.kind] = S.byKind[c.kind] || { films: 0, lines: 0 };
    k.films++;
    for (const ln of c.lines || []) {
      if (ln.style === 'heading') continue;
      S.filmLines++; k.lines++; S.filmWords += words(ln.text); S.filmChars += String(ln.text || '').length;
    }
  }
  for (const id of Object.keys(RADIO)) { const r = RADIO[id]; S.radioLines++; S.radioWords += words(r.text); S.radioChars += String(r.text || '').length; }
  S.words = S.filmWords + S.radioWords;
  S.chars = S.filmChars + S.radioChars;
  S.lines = S.filmLines + S.radioLines;
  S.objectives = { primary: 0, bonus: 0, hidden: 0 };
  S.triggers = 0; S.actionOps = {}; S.radioUsed = {};
  for (const m of MISSIONS) {
    for (const o of m.objectives || []) S.objectives[o.kind] = (S.objectives[o.kind] || 0) + 1;
    for (const t of m.triggers || []) {
      S.triggers++;
      for (const a of t.do || []) {
        S.actionOps[a[0]] = (S.actionOps[a[0]] || 0) + 1;
        if (a[0] === 'radio') S.radioUsed[a[1]] = (S.radioUsed[a[1]] || 0) + 1;
      }
    }
  }
  S.objTotal = S.objectives.primary + S.objectives.bonus + S.objectives.hidden;
  const sides = { good: 0, gray: 0, evil: 0, other: 0 };
  for (const id of Object.keys(CH)) sides[['good', 'gray', 'evil'].includes(CH[id].side) ? CH[id].side : 'other']++;
  S.sides = sides;
  return S;
}
function dataNotes(S) {
  const out = [];
  const optional = [];
  for (const m of MISSIONS) for (const t of m.triggers || []) if (t.optional) optional.push(t.id);
  const runtimeSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', '45_campaign.js'), 'utf8');
  const reads = /\.optional\b/.test(runtimeSrc);
  const unusedRadio = Object.keys(RADIO).filter(id => !S.radioUsed[id]);
  const reusedRadio = Object.keys(S.radioUsed).filter(id => S.radioUsed[id] > 1);
  const offFlow = unplaced;
  const absent = Object.keys(CH).filter(id => CH[id].role !== 'narrator' && !ap(id).first && !ap(id).radio);
  const list = xs => (xs.length ? xs.map(x => code(x)).join(', ') : 'none');
  out.push(`- **Triggers marked \`optional\`:** ${optional.length ? list(optional) : 'none'}. ${reads ? 'The campaign runtime reads this flag.' : 'The campaign runtime (src/js/45_campaign.js) does not read this flag yet, so it changes nothing in play.'}`);
  out.push(`- **Radio lines no trigger plays:** ${list(unusedRadio)}.`);
  out.push(`- **Radio lines played by more than one trigger (each play repeats the line):** ${list(reusedRadio)}.`);
  out.push(`- **Dispatches not reached by the campaign flow:** ${list(offFlow)}.`);
  out.push(`- **Characters in no dispatch and not on the radio:** ${list(absent)}.`);
  return out;
}

/* ---------------------------------------------------------------- assemble the document */
const body = [];
const S = computeStats();

body.push(H(2, 'Dramatis personae'));
body.push('Each entry gives the character brief as recorded in the story data, with the look notes for casting and the first place the character appears on screen.');
body.push(...castParas());

body.push(H(2, 'Opening'));
for (const id of docOrder.filter(x => placed[x] && placed[x].slot === 'opening')) body.push(...dispatchDoc(id, 3, flowNote(id), null));

ACTS.forEach((a, i) => {
  body.push(H(2, `Act ${ROMAN[i] || i + 1} — ${esc(a.title)}`));
  body.push(esc(a.summary));
  for (const id of a.missions || []) {
    const m = MISSIONS.find(x => x.id === id);
    body.push(m ? missionParas(m).join('\n\n') : `*Mission ${code(id)} is missing from the data.*`);
  }
});

body.push(H(2, 'The ending'));
const endIds = docOrder.filter(x => placed[x] && placed[x].slot === 'ending');
if (!endIds.length) body.push('*No ending dispatch is defined.*');
for (const id of endIds) body.push(...dispatchDoc(id, 3, flowNote(id), null));

body.push(H(2, 'Credits'));
const creditIds = docOrder.filter(x => placed[x] && placed[x].slot === 'credits');
if (!creditIds.length) body.push('*No credits dispatch is defined.*');
for (const id of creditIds) body.push(...dispatchDoc(id, 3, flowNote(id), null));

/* appendices: reference material only, after the credits */
body.push(H(2, 'Appendix A — Dispatch index'));
body.push('Every dispatch in the order it appears above, with its line and word counts (headings are not counted).');
{
  const rows = [];
  for (const id of docOrder.concat(unplaced)) {
    const c = DISP[id], st = dispatchStats(id);
    rows.push([`${esc(c.title)} ${code(id)}`, KIND_LABEL[c.kind] || esc(c.kind), st.lines, st.words, c.mood ? esc(c.mood) : '—']);
  }
  body.push(table(['Dispatch', 'Kind', 'Lines', 'Words', 'Mood'], rows));
}

body.push(H(2, 'Appendix B — Statistics'));
{
  const rows = [
    ['Dispatches (text cards)', `${S.films}`],
    ['Dialogue lines in dispatches', `${S.filmLines}`],
    ['Radio lines (in-mission)', `${S.radioLines}`],
    ['Spoken lines, all', `${S.lines}`],
    ['Words spoken (dispatches and radio)', `${S.words} (dispatches ${S.filmWords}, radio ${S.radioWords}); counted as tools/validate_story.js --stats counts them`],
    ['Characters of dialogue (letters, spaces, punctuation)', `${S.chars} (dispatches ${S.filmChars}, radio ${S.radioChars})`],
    ['Cast', `${Object.keys(CH).length} characters: ${S.sides.good} good, ${S.sides.gray} gray, ${S.sides.evil} evil${S.sides.other ? ', ' + S.sides.other + ' other' : ''}`],
    ['Missions and acts', `${MISSIONS.length} missions in ${ACTS.length} acts`],
    ['Objectives', `${S.objTotal}: ${S.objectives.primary} primary, ${S.objectives.bonus} bonus, ${S.objectives.hidden} hidden`],
    ['Triggers', `${S.triggers}, with actions: ${Object.entries(S.actionOps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`]
  ];
  body.push(table(['Measure', 'Value'], rows));
  body.push('**Lines by kind**');
  const kr = Object.keys(S.byKind).sort().map(k => [KIND_LABEL[k] || k, S.byKind[k].films, S.byKind[k].lines]);
  body.push(table(['Kind', 'Dispatches', 'Lines'], kr));
}

body.push(H(2, 'Appendix C — Data notes'));
body.push('Checks run on the data at generation time. None of them changes the script; each names something a designer may want to look at.');
body.push(dataNotes(S).join('\n'));

const TITLE = [];
TITLE.push(`# ${esc(STORY.meta && STORY.meta.title)}`);
TITLE.push(`*${esc(STORY.meta && STORY.meta.tagline)}*`);
TITLE.push(`> ${esc(STORY.meta && STORY.meta.logline)}`);
TITLE.push(`**Campaign script:** every dispatch (the text cards that replace the v3 films), the mission book with its radio log, and the statistics. Version ${num(STORY.meta && STORY.meta.version, 1)}, rated ${esc(STORY.meta && STORY.meta.rating)}.`);
TITLE.push(`Generated by ${code('tools/story_to_md.js')} from ${sourceLine}, fingerprint ${code(FP)}. Do not edit this file by hand: change the story source and run ${code('node tools/story_to_md.js')}.`);
const glance = [
  `- **Dispatches:** ${S.films} text cards (prologue, 9 briefings, 9 debriefs, interludes, defeats, ending, credits).`,
  `- **Spoken lines:** ${S.lines} (${S.filmLines} in dispatches, ${S.radioLines} on the radio) and ${S.words} words.`,
  `- **Missions:** ${MISSIONS.length} in ${ACTS.length} acts, with ${S.objTotal} objectives and ${S.triggers} triggers.`,
  `- **Cast:** ${Object.keys(CH).length} characters: ${S.sides.good} good, ${S.sides.gray} gray, ${S.sides.evil} evil.`
];
const gRows = [];
ACTS.forEach((a, ai) => (a.missions || []).forEach(id => {
  const m = MISSIONS.find(x => x.id === id);
  if (!m) return;
  const rtOf = fid => (fid && DISP[fid] ? dispatchStats(fid).lines + ' lines' : '—');
  const after = !m.after ? '—' : kindOf(m.after) === 'ending' ? 'the ending' : `${code(m.after)} ${rtOf(m.after)}`;
  gRows.push([ROMAN[ai] || ai + 1, m.n, esc(m.title), esc(placeName(m.place)), `${facAdj(m.setup.faction)} vs ${facAdj(m.setup.enemy)}`,
    rtOf(m.briefing), rtOf(m.debrief), after]);
}));
const glanceTable = table(['Act', 'No.', 'Mission', 'Place', 'You vs. enemy', 'Briefing', 'Debrief', 'Afterwards'], gRows);

const bodyText = body.join('\n\n');
HEADS.unshift({ level: 2, text: 'At a glance' });
const tocLines = HEADS.filter(h => h.level === 2 || h.level === 3)
  .map(h => (h.level === 3 ? '  - ' : '- ') + '[' + plain(h.text) + '](#' + slug(h.text) + ')');
const head = [
  TITLE.join('\n\n'),
  '## At a glance\n\n' + glance.join('\n') + '\n\n' + glanceTable,
  '**Contents**\n\n' + tocLines.join('\n'),
  '**How to read the script.** Each dispatch is printed as a transcript: a bold line is a dateline (chapter card), then speaker and text in order. ' +
    'Dialogue is printed exactly as the data has it. Nothing is staged: there is no picture, timing or camera any more.'
].join('\n\n');
let DOC = head + '\n\n' + bodyText + '\n';
DOC = DOC.replace(/\n{3,}/g, '\n\n');

/* ---------------------------------------------------------------- output */
const outOpt = argOf('--out');
const target = outOpt ? path.resolve(outOpt) : OUT_DEFAULT;
const shown = p => (p.startsWith(ROOT + path.sep) ? path.relative(ROOT, p) : p);
if (argv.includes('--check')) {
  let disk = null;
  try { disk = fs.readFileSync(target, 'utf8'); } catch (e) { disk = null; }
  if (disk === DOC) { console.log('up to date: ' + shown(target)); process.exit(0); }
  console.error((disk === null ? 'missing: ' : 'out of date: ') + shown(target) + ' (run node tools/story_to_md.js)');
  process.exit(1);
}
if (argv.includes('--stdout') || (storyOpt && !outOpt)) {
  process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e; });   // quiet when piped into head
  process.stdout.write(DOC);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, DOC);
  console.log('wrote ' + shown(target) + ' (' + DOC.split('\n').length + ' lines, ' + Buffer.byteLength(DOC) + ' bytes, fingerprint ' + FP + ')');
}
